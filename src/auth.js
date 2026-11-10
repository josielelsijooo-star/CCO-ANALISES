// Senhas (scrypt), sessões em banco e cookie de sessão.
import crypto from 'node:crypto';

const SCRYPT = { N: 16384, r: 8, p: 1 };
const DURACAO_SESSAO_H = 12; // um turno

export const novoId = (prefixo = '') => prefixo + crypto.randomBytes(9).toString('base64url');
export const senhaAleatoria = () => crypto.randomBytes(9).toString('base64url');

export function hashSenha(senha) {
  const sal = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(senha), sal, 64, SCRYPT);
  return `scrypt$${sal.toString('base64')}$${h.toString('base64')}`;
}

export function confereSenha(senha, armazenado) {
  const [alg, sal, h] = String(armazenado || '').split('$');
  if (alg !== 'scrypt' || !sal || !h) return false;
  const ref = Buffer.from(h, 'base64');
  const calc = crypto.scryptSync(String(senha), Buffer.from(sal, 'base64'), ref.length, SCRYPT);
  return crypto.timingSafeEqual(ref, calc);
}

export function criarSessao(db, usuarioId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expira = new Date(Date.now() + DURACAO_SESSAO_H * 3600e3).toISOString();
  db.prepare('INSERT INTO sessoes (token, usuario_id, expira_em) VALUES (?, ?, ?)').run(token, usuarioId, expira);
  return { token, maxAge: DURACAO_SESSAO_H * 3600 };
}

export function usuarioDaSessao(db, token) {
  if (!token) return null;
  const u = db.prepare(`SELECT u.id, u.login, u.nome, u.papel, u.postos, u.ativo, s.expira_em
                          FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token = ?`).get(token);
  if (!u || !u.ativo || u.expira_em < new Date().toISOString()) return null;
  return { id: u.id, login: u.login, nome: u.nome, papel: u.papel, postos: JSON.parse(u.postos || '[]') };
}

export function encerrarSessao(db, token) {
  if (token) db.prepare('DELETE FROM sessoes WHERE token = ?').run(token);
}

export function limparSessoesVencidas(db) {
  db.prepare('DELETE FROM sessoes WHERE expira_em < ?').run(new Date().toISOString());
}

export function lerCookie(req, nome) {
  const c = req.headers.cookie || '';
  for (const parte of c.split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nome) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return null;
}

export function cookieSessao(token, maxAge, seguro) {
  return `cco_sessao=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${seguro ? '; Secure' : ''}`;
}

// Limite simples de tentativas de login (por IP + login), em memória.
const tentativas = new Map();
export function bloqueado(chave) {
  const t = tentativas.get(chave);
  return t && t.ate > Date.now();
}
export function registrarFalha(chave) {
  const t = tentativas.get(chave) || { falhas: 0, ate: 0 };
  t.falhas += 1;
  if (t.falhas >= 5) { t.ate = Date.now() + 60e3; t.falhas = 0; }
  tentativas.set(chave, t);
}
export function limparFalhas(chave) { tentativas.delete(chave); }
