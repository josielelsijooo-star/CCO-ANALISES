// Importa cadastros, ocorrências e câmeras de um arquivo JSON (por padrão data/seed.json,
// gerado a partir da planilha Registro_de_Ocorrencias-CCO.xlsx).
// Uso:  npm run importar                 (só importa se o banco estiver vazio)
//       npm run importar -- --substituir (apaga ocorrências e câmeras e importa de novo)
//       npm run importar -- outro.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirBanco, transacao, inserir, gravarCadastros } from '../src/db.js';
import { validarCadastros } from '../src/regras.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const substituir = args.includes('--substituir');
const arquivo = path.resolve(RAIZ, args.find(a => !a.startsWith('--')) || 'data/seed.json');
const db = abrirBanco(path.resolve(RAIZ, process.env.DB_PATH || 'data/cco.db'));

if (!fs.existsSync(arquivo)) { console.error(`Arquivo não encontrado: ${arquivo}`); process.exit(1); }
const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
const jaTem = db.prepare('SELECT (SELECT COUNT(*) FROM ocorrencias) + (SELECT COUNT(*) FROM cameras) AS c').get().c;
if (jaTem && !substituir) {
  console.log(`O banco já tem ${jaTem} registros. Nada foi importado. Use --substituir para apagar e importar de novo.`);
  process.exit(0);
}

const historicoInicial = (r, txt) => (r.historico && r.historico.length ? r.historico : [{ em: new Date().toISOString(), por: null, txt }]);
transacao(db, () => {
  if (substituir) { db.exec('DELETE FROM ocorrencias; DELETE FROM cameras;'); }
  if (dados.config) {
    const { erros, cadastros } = validarCadastros(dados.config);
    if (erros.length) throw new Error('Cadastros inválidos: ' + erros.join(' '));
    gravarCadastros(db, cadastros, null);
  }
  for (const o of dados.ocorrencias || []) {
    inserir(db, 'ocorrencias', `oc-${String(o.n).padStart(3, '0')}`, { ...o, historico: historicoInicial(o, 'Importada da planilha') });
  }
  for (const c of dados.cameras || []) {
    inserir(db, 'cameras', `cam-${String(c.n).padStart(3, '0')}`, { ...c, historico: historicoInicial(c, 'Importada da planilha') });
  }
});
console.log(`Importado: ${(dados.ocorrencias || []).length} ocorrências, ${(dados.cameras || []).length} câmeras${dados.config ? ' e os cadastros' : ''}.`);
