// Backup e restauração pelo terminal. O servidor já faz backup sozinho a cada hora;
// use isto para fazer um na hora (antes de algo arriscado) ou para voltar a um backup.
//   npm run backup                           faz um backup agora
//   npm run backup -- listar                 mostra os backups guardados
//   npm run backup -- restaurar 2026-11-10   volta o banco para o backup desse dia
//                                            (pare o servidor antes: npm run servico:parar)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { abrirBanco } from '../src/db.js';
import { dataLocal, fazerBackup, listarBackups, pastasBackup } from '../src/backup.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BANCO = path.resolve(RAIZ, process.env.DB_PATH || 'data/cco.db');
const ANEXOS = path.resolve(RAIZ, process.env.ANEXOS_DIR || 'data/anexos');
const PORTA = Number(process.env.PORT || 3000);
const PASTA = pastasBackup(RAIZ)[0];
const [acao, dataAlvo] = process.argv.slice(2);
const mb = n => `${(n / 1024 / 1024).toFixed(1)} MB`;
const contar = arq => {
  const d = new DatabaseSync(arq, { readOnly: true });
  try { return d.prepare('SELECT (SELECT COUNT(*) FROM ocorrencias) AS o, (SELECT COUNT(*) FROM cameras) AS c').get(); }
  finally { d.close(); }
};

if (!acao) {
  const db = abrirBanco(BANCO);
  for (const pasta of pastasBackup(RAIZ)) {
    const r = fazerBackup(db, { pasta, pastaAnexos: ANEXOS, dias: Number(process.env.BACKUP_DIAS || 30) });
    console.log(`Backup feito: ${r.arquivo}${r.prints ? ` (+${r.prints} prints)` : ''}`);
  }
} else if (acao === 'listar') {
  const lista = listarBackups(PASTA);
  if (!lista.length) console.log(`Nenhum backup em ${PASTA}.`);
  for (const b of lista) {
    const n = contar(b.arquivo);
    console.log(`${b.data}   ${mb(b.tamanho).padStart(8)}   ${n.o} ocorrências, ${n.c} câmeras   (atualizado ${b.atualizado.toLocaleString('pt-BR')})`);
  }
} else if (acao === 'restaurar') {
  const alvo = listarBackups(PASTA).find(b => b.data === dataAlvo);
  if (!alvo) {
    console.error(`Não achei o backup "${dataAlvo || ''}". Os disponíveis são:`);
    for (const b of listarBackups(PASTA)) console.error('  ' + b.data);
    process.exit(1);
  }
  const rodando = await fetch(`http://127.0.0.1:${PORTA}/login.html`, { signal: AbortSignal.timeout(2000) }).then(() => true, () => false);
  if (rodando) {
    console.error('O servidor está rodando. Pare antes com:  npm run servico:parar   (ou feche o npm start)');
    process.exit(1);
  }
  // Antes de trocar, guarda o banco atual, para dar para voltar atrás se a restauração for engano.
  const h = new Date(), pad = n => String(n).padStart(2, '0');
  const seguranca = path.join(PASTA, `antes-de-restaurar-${dataLocal(h)}-${pad(h.getHours())}h${pad(h.getMinutes())}.db`);
  if (fs.existsSync(BANCO)) {
    const atual = new DatabaseSync(BANCO);
    atual.exec(`VACUUM INTO '${seguranca.replace(/'/g, "''")}'`);
    atual.close();
  }
  for (const f of [BANCO, `${BANCO}-wal`, `${BANCO}-shm`]) fs.rmSync(f, { force: true });
  fs.copyFileSync(alvo.arquivo, BANCO);
  const n = contar(BANCO);
  console.log(`Banco restaurado do backup de ${alvo.data}: ${n.o} ocorrências, ${n.c} câmeras.`);
  if (fs.existsSync(seguranca)) console.log(`O banco de antes ficou guardado em ${seguranca}`);
  console.log('Agora suba o servidor:  npm run servico:iniciar');
} else {
  console.error('Uso: npm run backup  |  npm run backup -- listar  |  npm run backup -- restaurar AAAA-MM-DD');
  process.exit(1);
}
