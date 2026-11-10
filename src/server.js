// Servidor da plataforma do CCO: API REST + arquivos da interface + atualização ao vivo (SSE).
// Sem dependências externas: usa só módulos do Node (http, sqlite, crypto).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  abrirBanco, transacao, deLinha, inserir, atualizar, lerCadastros, gravarCadastros,
} from './db.js';
import {
  novoId, senhaAleatoria, hashSenha, confereSenha, criarSessao, usuarioDaSessao, encerrarSessao,
  limparSessoesVencidas, lerCookie, cookieSessao, bloqueado, registrarFalha, limparFalhas,
} from './auth.js';
import {
  CADASTROS_PADRAO, PAPEIS, CAMPOS_RETORNO, limparOcorrencia, limparCamera, validarOcorrencia,
  validarCamera, validarCadastros, textoHistorico,
} from './regras.js';
import { fazerBackup, pastasBackup } from './backup.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTA = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const BANCO = path.resolve(RAIZ, process.env.DB_PATH || 'data/cco.db');
const PASTA_ANEXOS = path.resolve(RAIZ, process.env.ANEXOS_DIR || 'data/anexos');
const COOKIE_SEGURO = process.env.COOKIE_SECURE === 'true';
const PUBLICO = path.join(RAIZ, 'public');
const MAX_ANEXO = 10 * 1024 * 1024;
const TIPOS_IMAGEM = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

export const db = abrirBanco(BANCO);
fs.mkdirSync(PASTA_ANEXOS, { recursive: true });

/* ---------- utilidades HTTP ---------- */
class ErroHttp extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const falha = (status, msg) => { throw new ErroHttp(status, msg); };

function json(res, status, corpo, extras = {}) {
  const b = JSON.stringify(corpo);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extras });
  res.end(b);
}

function lerCorpo(req, limite) {
  return new Promise((ok, erro) => {
    const partes = []; let total = 0;
    req.on('data', c => {
      total += c.length;
      if (total > limite) { erro(new ErroHttp(413, 'Arquivo ou envio grande demais.')); req.destroy(); return; }
      partes.push(c);
    });
    req.on('end', () => ok(Buffer.concat(partes)));
    req.on('error', erro);
  });
}
async function lerJson(req) {
  if (!(req.headers['content-type'] || '').includes('application/json')) falha(415, 'Envie JSON.');
  const b = await lerCorpo(req, 1024 * 1024);
  try { return JSON.parse(b.toString('utf8') || '{}'); } catch { falha(400, 'JSON inválido.'); }
}

/* ---------- atualização ao vivo (Server-Sent Events) ---------- */
const clientesSse = new Set();
function avisar(tipo) {
  const msg = `event: mudou\ndata: ${JSON.stringify({ tipo, em: Date.now() })}\n\n`;
  for (const res of clientesSse) res.write(msg);
}
setInterval(() => { for (const res of clientesSse) res.write(': ping\n\n'); }, 25e3).unref();

/* ---------- permissões ---------- */
const pode = (u, acao) => !!(u && PAPEIS[u.papel] && PAPEIS[u.papel][acao]);
const vePosto = (u, posto) => u.papel !== 'gerente' || u.postos.includes(posto);
function exigir(u, acao) { if (!pode(u, acao)) falha(403, 'Seu perfil não tem permissão para isso.'); }
const publicoUsuario = u => ({ id: u.id, login: u.login, nome: u.nome, papel: u.papel, postos: u.postos, permissoes: PAPEIS[u.papel] });

/* ---------- rotas ---------- */
const rotas = [];
const rota = (metodo, padrao, fn, publica = false) => rotas.push({ metodo, padrao, fn, publica });

rota('POST', /^\/api\/login$/, async (req, res) => {
  const { login, senha } = await lerJson(req);
  const chave = `${req.socket.remoteAddress}|${String(login || '').toLowerCase()}`;
  if (bloqueado(chave)) falha(429, 'Muitas tentativas. Aguarde um minuto e tente de novo.');
  const u = db.prepare('SELECT * FROM usuarios WHERE login = ?').get(String(login || '').trim());
  if (!u || !u.ativo || !confereSenha(senha || '', u.senha_hash)) { registrarFalha(chave); falha(401, 'Login ou senha incorretos.'); }
  limparFalhas(chave);
  const s = criarSessao(db, u.id);
  json(res, 200, { usuario: publicoUsuario({ ...u, postos: JSON.parse(u.postos) }) }, { 'Set-Cookie': cookieSessao(s.token, s.maxAge, COOKIE_SEGURO) });
}, true);

rota('POST', /^\/api\/logout$/, async (req, res) => {
  encerrarSessao(db, lerCookie(req, 'cco_sessao'));
  json(res, 200, { ok: true }, { 'Set-Cookie': cookieSessao('', 0, COOKIE_SEGURO) });
}, true);

rota('GET', /^\/api\/me$/, async (req, res, u) => json(res, 200, { usuario: publicoUsuario(u) }));

rota('PUT', /^\/api\/me\/senha$/, async (req, res, u) => {
  const { atual, nova } = await lerJson(req);
  const linha = db.prepare('SELECT senha_hash FROM usuarios WHERE id = ?').get(u.id);
  if (!confereSenha(atual || '', linha.senha_hash)) falha(400, 'A senha atual não confere.');
  if (String(nova || '').length < 8) falha(400, 'A nova senha precisa ter pelo menos 8 caracteres.');
  db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(hashSenha(nova), u.id);
  json(res, 200, { ok: true });
});

rota('GET', /^\/api\/estado$/, async (req, res, u) => {
  const cad = lerCadastros(db, CADASTROS_PADRAO);
  const ocorrencias = db.prepare('SELECT * FROM ocorrencias ORDER BY data DESC, h_ini DESC').all()
    .map(l => deLinha('ocorrencias', l)).filter(o => vePosto(u, o.posto));
  const cameras = db.prepare('SELECT * FROM cameras ORDER BY data DESC, n DESC').all()
    .map(l => deLinha('cameras', l)).filter(c => vePosto(u, c.posto));
  json(res, 200, { cadastros: cad, ocorrencias, cameras, agora: new Date().toISOString() });
});

rota('GET', /^\/api\/eventos$/, async (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 5000\n\n');
  clientesSse.add(res);
  req.on('close', () => clientesSse.delete(res));
});

/* ocorrências e câmeras compartilham o mesmo fluxo */
// Próximo número. Conta também os que estão na lixeira, para um registro restaurado voltar com o número dele.
const proximoN = tabela => db.prepare(`SELECT MAX(COALESCE((SELECT MAX(n) FROM ${tabela}), 0),
  COALESCE((SELECT MAX(n) FROM lixeira WHERE tabela = ?), 0)) + 1 AS n`).get(tabela).n;

function criarRegistro(tabela, u, entrada) {
  const cad = lerCadastros(db, CADASTROS_PADRAO);
  const dados = tabela === 'ocorrencias' ? limparOcorrencia(entrada) : limparCamera(entrada);
  const erros = tabela === 'ocorrencias' ? validarOcorrencia(dados, cad) : validarCamera(dados, cad);
  if (erros.length) falha(400, erros.join(' '));
  if (dados.anexos) conferirAnexos(dados.anexos);
  const agora = new Date().toISOString();
  return transacao(db, () => {
    const n = proximoN(tabela);
    const id = novoId(tabela === 'ocorrencias' ? 'oc-' : 'cam-');
    const txt = tabela === 'ocorrencias' ? 'Ocorrência registrada' : 'Defeito registrado';
    inserir(db, tabela, id, { ...dados, n, historico: [{ em: agora, por: u.id, porNome: u.nome, txt }],
      criadoPor: u.id, criadoEm: agora, atualizadoPor: u.id, atualizadoEm: agora });
    return deLinha(tabela, db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(id));
  });
}

function alterarRegistro(tabela, u, id, entrada) {
  const antigo = deLinha(tabela, db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(id));
  if (!antigo || !vePosto(u, antigo.posto)) falha(404, 'Registro não encontrado.');
  let dados = tabela === 'ocorrencias' ? limparOcorrencia(entrada) : limparCamera(entrada);
  if (!pode(u, 'edita')) {
    if (tabela !== 'ocorrencias' || !pode(u, 'retorno')) falha(403, 'Seu perfil não pode alterar este registro.');
    dados = Object.fromEntries(Object.entries(dados).filter(([k]) => CAMPOS_RETORNO.includes(k)));
  }
  const novo = { ...antigo, ...dados };
  const cad = lerCadastros(db, CADASTROS_PADRAO);
  const erros = tabela === 'ocorrencias' ? validarOcorrencia(novo, cad) : validarCamera(novo, cad);
  if (erros.length) falha(400, erros.join(' '));
  if (dados.anexos) conferirAnexos(dados.anexos);
  const txt = textoHistorico(antigo, novo, tabela);
  if (!txt) return antigo;
  const agora = new Date().toISOString();
  novo.historico = [...(antigo.historico || []), { em: agora, por: u.id, porNome: u.nome, txt }].slice(-100);
  novo.atualizadoPor = u.id; novo.atualizadoEm = agora;
  const { id: _i, n: _n, criadoPor: _c, criadoEm: _e, ...gravar } = novo;
  atualizar(db, tabela, id, gravar);
  return deLinha(tabela, db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(id));
}

function conferirAnexos(ids) {
  const existe = db.prepare('SELECT 1 FROM anexos WHERE id = ?');
  for (const a of ids) if (!existe.get(a)) falha(400, 'Um dos anexos não foi encontrado. Envie a imagem de novo.');
}

for (const tabela of ['ocorrencias', 'cameras']) {
  rota('POST', new RegExp(`^/api/${tabela}$`), async (req, res, u) => {
    exigir(u, 'registra');
    const r = criarRegistro(tabela, u, await lerJson(req));
    avisar(tabela); json(res, 201, r);
  });
  rota('PUT', new RegExp(`^/api/${tabela}/([\\w-]+)$`), async (req, res, u, m) => {
    const r = alterarRegistro(tabela, u, m[1], await lerJson(req));
    avisar(tabela); json(res, 200, r);
  });
  // Excluir não apaga de vez: move a linha inteira para a lixeira, de onde dá para restaurar.
  rota('DELETE', new RegExp(`^/api/${tabela}/([\\w-]+)$`), async (req, res, u, m) => {
    exigir(u, 'exclui');
    const linha = db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(m[1]);
    if (!linha) falha(404, 'Registro não encontrado.');
    const lixeiraId = novoId('lx-');
    const resumo = (tabela === 'ocorrencias' ? [linha.tipo, linha.descricao] : [linha.camera, linha.problema]).filter(Boolean).join(' · ');
    transacao(db, () => {
      db.prepare(`INSERT INTO lixeira (id, tabela, registro_id, n, posto, resumo, dados, excluido_por, excluido_por_nome, excluido_em)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(lixeiraId, tabela, linha.id, linha.n, linha.posto, resumo.slice(0, 300), JSON.stringify(linha), u.id, u.nome, new Date().toISOString());
      db.prepare(`DELETE FROM ${tabela} WHERE id = ?`).run(linha.id);
    });
    avisar(tabela); json(res, 200, { ok: true, lixeira: lixeiraId });
  });
}

/* lixeira (quem pode excluir pode ver e restaurar) */
rota('GET', /^\/api\/lixeira$/, async (req, res, u) => {
  exigir(u, 'exclui');
  const itens = db.prepare('SELECT * FROM lixeira ORDER BY excluido_em DESC LIMIT 500').all().map(x => ({
    id: x.id, tabela: x.tabela, n: x.n, posto: x.posto || '', resumo: x.resumo || '',
    data: JSON.parse(x.dados).data || '', excluidoPor: x.excluido_por_nome || '', excluidoEm: x.excluido_em,
  }));
  json(res, 200, itens);
});

rota('POST', /^\/api\/lixeira\/([\w-]+)\/restaurar$/, async (req, res, u, m) => {
  exigir(u, 'exclui');
  const item = db.prepare('SELECT * FROM lixeira WHERE id = ?').get(m[1]);
  if (!item) falha(404, 'Esse registro já foi restaurado ou não está mais na lixeira.');
  const t = item.tabela, oc = t === 'ocorrencias';
  const registro = transacao(db, () => {
    const linha = JSON.parse(item.dados);
    if (db.prepare(`SELECT 1 FROM ${t} WHERE id = ?`).get(linha.id)) linha.id = novoId(oc ? 'oc-' : 'cam-');
    let aviso = '';
    if (db.prepare(`SELECT 1 FROM ${t} WHERE n = ?`).get(linha.n)) {
      const n = proximoN(t);
      aviso = ` (o nº ${linha.n} já estava em uso; voltou como nº ${n})`;
      linha.n = n;
    }
    const agora = new Date().toISOString();
    const hist = JSON.parse(linha.historico || '[]');
    hist.push(
      { em: item.excluido_em, por: item.excluido_por, porNome: item.excluido_por_nome, txt: oc ? 'Ocorrência excluída' : 'Defeito excluído' },
      { em: agora, por: u.id, porNome: u.nome, txt: (oc ? 'Restaurada da lixeira' : 'Restaurado da lixeira') + aviso },
    );
    linha.historico = JSON.stringify(hist.slice(-100));
    linha.atualizado_por = u.id; linha.atualizado_em = agora;
    const existentes = new Set(db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name));
    const cols = Object.keys(linha).filter(c => existentes.has(c));
    db.prepare(`INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map(c => linha[c]));
    db.prepare('DELETE FROM lixeira WHERE id = ?').run(item.id);
    return deLinha(t, db.prepare(`SELECT * FROM ${t} WHERE id = ?`).get(linha.id));
  });
  avisar(t); json(res, 200, { tabela: t, registro });
});

rota('PUT', /^\/api\/cadastros$/, async (req, res, u) => {
  exigir(u, 'cadastros');
  const { erros, cadastros } = validarCadastros(await lerJson(req));
  if (erros.length) falha(400, erros.join(' '));
  gravarCadastros(db, cadastros, u.id);
  avisar('cadastros'); json(res, 200, cadastros);
});

/* anexos (prints da câmera) */
rota('POST', /^\/api\/anexos$/, async (req, res, u) => {
  if (!pode(u, 'registra') && !pode(u, 'edita')) falha(403, 'Seu perfil não pode anexar imagens.');
  const tipo = (req.headers['content-type'] || '').split(';')[0].trim();
  const ext = TIPOS_IMAGEM[tipo];
  if (!ext) falha(415, 'Só imagens PNG, JPG, WEBP ou GIF.');
  const corpo = await lerCorpo(req, MAX_ANEXO);
  if (!corpo.length) falha(400, 'Arquivo vazio.');
  const id = novoId('ax-');
  const arquivo = `${id}.${ext}`;
  fs.writeFileSync(path.join(PASTA_ANEXOS, arquivo), corpo);
  db.prepare('INSERT INTO anexos (id, tipo, tamanho, arquivo, enviado_por, enviado_em) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, tipo, corpo.length, arquivo, u.id, new Date().toISOString());
  json(res, 201, { id });
});

rota('GET', /^\/api\/anexos\/([\w-]+)$/, async (req, res, u, m) => {
  const a = db.prepare('SELECT * FROM anexos WHERE id = ?').get(m[1]);
  if (!a) falha(404, 'Anexo não encontrado.');
  const arq = path.join(PASTA_ANEXOS, a.arquivo);
  if (!fs.existsSync(arq)) falha(404, 'O arquivo deste anexo não foi encontrado.');
  res.writeHead(200, { 'Content-Type': a.tipo, 'Content-Length': a.tamanho, 'Cache-Control': 'private, max-age=86400' });
  fs.createReadStream(arq).on('error', () => res.destroy()).pipe(res);
});

/* usuários (somente administrador) */
const listarUsuarios = () => db.prepare('SELECT id, login, nome, papel, postos, ativo, criado_em FROM usuarios ORDER BY nome').all()
  .map(x => ({ id: x.id, login: x.login, nome: x.nome, papel: x.papel, postos: JSON.parse(x.postos), ativo: !!x.ativo, criadoEm: x.criado_em }));

function dadosUsuario(e, parcial) {
  const o = {};
  if (!parcial || 'nome' in e) { o.nome = String(e.nome || '').trim().slice(0, 120); if (!o.nome) falha(400, 'Informe o nome.'); }
  if (!parcial || 'papel' in e) { o.papel = e.papel; if (!PAPEIS[o.papel]) falha(400, 'Perfil inválido.'); }
  if (!parcial || 'postos' in e) o.postos = Array.isArray(e.postos) ? e.postos.map(p => String(p).slice(0, 120)) : [];
  if ('ativo' in e) o.ativo = e.ativo ? 1 : 0;
  return o;
}

rota('GET', /^\/api\/usuarios$/, async (req, res, u) => { exigir(u, 'cadastros'); json(res, 200, listarUsuarios()); });

rota('POST', /^\/api\/usuarios$/, async (req, res, u) => {
  exigir(u, 'cadastros');
  const e = await lerJson(req);
  const login = String(e.login || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(login)) falha(400, 'Login deve ter de 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado.');
  if (db.prepare('SELECT 1 FROM usuarios WHERE login = ?').get(login)) falha(409, 'Já existe um usuário com esse login.');
  const d = dadosUsuario(e, false);
  if (d.papel === 'gerente' && !d.postos.length) falha(400, 'Escolha ao menos um posto para o gerente.');
  const senha = e.senha && String(e.senha).length >= 8 ? String(e.senha) : senhaAleatoria();
  db.prepare('INSERT INTO usuarios (id, login, nome, papel, postos, senha_hash, ativo, criado_em) VALUES (?, ?, ?, ?, ?, ?, 1, ?)')
    .run(novoId('u-'), login, d.nome, d.papel, JSON.stringify(d.postos), hashSenha(senha), new Date().toISOString());
  json(res, 201, { usuarios: listarUsuarios(), senhaTemporaria: e.senha ? null : senha });
});

rota('PUT', /^\/api\/usuarios\/([\w-]+)$/, async (req, res, u, m) => {
  exigir(u, 'cadastros');
  const alvo = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(m[1]);
  if (!alvo) falha(404, 'Usuário não encontrado.');
  const e = await lerJson(req);
  const d = dadosUsuario(e, true);
  const final = { papel: d.papel ?? alvo.papel, ativo: d.ativo ?? alvo.ativo, postos: d.postos ?? JSON.parse(alvo.postos) };
  if (alvo.papel === 'admin' && (final.papel !== 'admin' || !final.ativo)) {
    const outros = db.prepare("SELECT COUNT(*) AS c FROM usuarios WHERE papel = 'admin' AND ativo = 1 AND id <> ?").get(alvo.id).c;
    if (!outros) falha(400, 'Mantenha pelo menos um administrador ativo.');
  }
  if (final.papel === 'gerente' && !final.postos.length) falha(400, 'Escolha ao menos um posto para o gerente.');
  let senhaTemporaria = null;
  transacao(db, () => {
    db.prepare('UPDATE usuarios SET nome = ?, papel = ?, postos = ?, ativo = ? WHERE id = ?')
      .run(d.nome ?? alvo.nome, final.papel, JSON.stringify(final.postos), final.ativo, alvo.id);
    if (e.redefinirSenha) {
      senhaTemporaria = senhaAleatoria();
      db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(hashSenha(senhaTemporaria), alvo.id);
    }
    if (!final.ativo || e.redefinirSenha) db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(alvo.id);
  });
  json(res, 200, { usuarios: listarUsuarios(), senhaTemporaria });
});

/* ---------- arquivos da interface ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
function servirArquivo(req, res, u) {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  if (p === '/index.html' && !u) { res.writeHead(302, { Location: '/login.html' }); res.end(); return; }
  const arq = path.normalize(path.join(PUBLICO, p));
  if (!arq.startsWith(PUBLICO + path.sep) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); res.end('Não encontrado'); return; }
  const ext = path.extname(arq);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300' });
  fs.createReadStream(arq).on('error', () => res.destroy()).pipe(res);
}

/* ---------- servidor ---------- */
export const servidor = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  try {
    const url = new URL(req.url, 'http://x');
    const u = usuarioDaSessao(db, lerCookie(req, 'cco_sessao'));
    if (!url.pathname.startsWith('/api/')) return servirArquivo(req, res, u);
    if (req.method !== 'GET' && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) falha(403, 'Origem não permitida.');
    for (const r of rotas) {
      if (r.metodo !== req.method) continue;
      const m = url.pathname.match(r.padrao);
      if (!m) continue;
      if (!r.publica && !u) falha(401, 'Sua sessão expirou. Entre de novo.');
      return await r.fn(req, res, u, m);
    }
    falha(404, 'Rota não encontrada.');
  } catch (e) {
    if (!(e instanceof ErroHttp)) console.error(e);
    if (res.headersSent) { res.end(); return; }
    json(res, e.status || 500, { erro: e instanceof ErroHttp ? e.message : 'Erro interno no servidor.' });
  }
});

function primeiroAcesso() {
  const c = db.prepare('SELECT COUNT(*) AS c FROM usuarios').get().c;
  if (c) return;
  const senha = senhaAleatoria();
  db.prepare('INSERT INTO usuarios (id, login, nome, papel, postos, senha_hash, ativo, criado_em) VALUES (?, ?, ?, ?, ?, ?, 1, ?)')
    .run(novoId('u-'), 'admin', 'Administrador', 'admin', '[]', hashSenha(senha), new Date().toISOString());
  console.log('\n  Primeiro acesso: usuário "admin" criado com a senha  ' + senha);
  console.log('  Entre com ele, troque a senha e cadastre a equipe em Cadastros > Usuários.\n');
}

/* backup automático: ao subir e depois a cada hora (um arquivo por dia, atualizado) */
const BACKUP_DIAS = Number(process.env.BACKUP_DIAS || 30);
function backupAgora() {
  for (const pasta of pastasBackup(RAIZ)) {
    try { fazerBackup(db, { pasta, pastaAnexos: PASTA_ANEXOS, dias: BACKUP_DIAS }); }
    catch (e) { console.error(`  [${new Date().toLocaleString('pt-BR')}] Falha no backup em ${pasta}: ${e.message}`); }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Rodando pelo serviço (scripts/servico.js): se o supervisor for encerrado, o servidor sai junto.
  if (process.send) process.on('disconnect', () => process.exit(0));
  primeiroAcesso();
  limparSessoesVencidas(db);
  setInterval(() => limparSessoesVencidas(db), 3600e3).unref();
  servidor.on('error', e => {
    if (e.code === 'EADDRINUSE') console.error(`  A porta ${PORTA} já está em uso: o CCO provavelmente já está rodando (veja npm run servico:status).`);
    else console.error(e);
    process.exit(1);
  });
  servidor.listen(PORTA, HOST, () => {
    console.log(`  CCO Mirian rodando em http://localhost:${PORTA}`);
    console.log(`  Banco de dados: ${path.relative(RAIZ, BANCO)}`);
    backupAgora();
    setInterval(backupAgora, 3600e3).unref();
    console.log(`  Backup a cada hora em: ${pastasBackup(RAIZ).map(p => (p.startsWith(RAIZ + path.sep) ? path.relative(RAIZ, p) : p)).join(' e ')} (guarda ${BACKUP_DIAS} dias)`);
  });
}
