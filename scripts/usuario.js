// Cria um usuário ou redefine a senha de um existente pelo terminal.
// Uso:  npm run usuario -- --login leila --nome "Leila" --papel operador
//       npm run usuario -- --login geova --nome "Geová" --papel gerente --postos "Mirian 15 Campos de Julio"
//       npm run usuario -- --login admin --redefinir
// Perfis: admin, operador, gerente, leitura. Sem --senha, uma senha temporária é gerada e mostrada.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirBanco } from '../src/db.js';
import { hashSenha, novoId, senhaAleatoria } from '../src/auth.js';
import { PAPEIS } from '../src/regras.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = abrirBanco(path.resolve(RAIZ, process.env.DB_PATH || 'data/cco.db'));
const a = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const k = argv[i].slice(2), prox = argv[i + 1];
  if (prox === undefined || prox.startsWith('--')) a[k] = true; else { a[k] = prox; i++; }
}
const login = String(a.login || '').trim().toLowerCase();
if (!login) { console.error('Informe --login.'); process.exit(1); }
const existente = db.prepare('SELECT * FROM usuarios WHERE login = ?').get(login);
const senha = typeof a.senha === 'string' ? a.senha : senhaAleatoria();

if (existente) {
  if (!a.redefinir) { console.error(`O usuário "${login}" já existe. Use --redefinir para trocar a senha.`); process.exit(1); }
  db.prepare('UPDATE usuarios SET senha_hash = ?, ativo = 1 WHERE id = ?').run(hashSenha(senha), existente.id);
  db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(existente.id);
  console.log(`Senha de "${login}" redefinida: ${senha}`);
} else {
  const papel = a.papel || 'operador';
  if (!PAPEIS[papel]) { console.error(`Perfil inválido. Use: ${Object.keys(PAPEIS).join(', ')}`); process.exit(1); }
  const postos = typeof a.postos === 'string' ? a.postos.split(';').map(s => s.trim()).filter(Boolean) : [];
  if (papel === 'gerente' && !postos.length) { console.error('Gerente precisa de --postos "Nome do posto" (separe vários com ;).'); process.exit(1); }
  db.prepare('INSERT INTO usuarios (id, login, nome, papel, postos, senha_hash, ativo, criado_em) VALUES (?, ?, ?, ?, ?, ?, 1, ?)')
    .run(novoId('u-'), login, String(a.nome || login), papel, JSON.stringify(postos), hashSenha(senha), new Date().toISOString());
  console.log(`Usuário "${login}" (${PAPEIS[papel].nome}) criado. Senha: ${senha}`);
}
