// Backup do banco e dos prints anexados.
// O banco é copiado com VACUUM INTO, que gera uma cópia íntegra mesmo com o servidor rodando.
// Fica um arquivo por dia (cco-AAAA-MM-DD.db), atualizado a cada execução; os mais antigos que
// BACKUP_DIAS são apagados. Os prints são copiados uma vez só, porque não mudam depois de enviados.
import fs from 'node:fs';
import path from 'node:path';

const pad = n => String(n).padStart(2, '0');
export const dataLocal = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const ARQ_BACKUP = /^cco-\d{4}-\d{2}-\d{2}\.db$/;

// Pastas de destino: BACKUP_DIR (padrão data/backups) e, se configurada, BACKUP_COPIA
// (por exemplo uma pasta de rede, um pendrive ou o OneDrive).
export function pastasBackup(raiz) {
  return [process.env.BACKUP_DIR || 'data/backups', process.env.BACKUP_COPIA]
    .filter(Boolean).map(p => path.resolve(raiz, p));
}

export function fazerBackup(db, { pasta, pastaAnexos, dias = 30 }) {
  fs.mkdirSync(pasta, { recursive: true });
  const arquivo = path.join(pasta, `cco-${dataLocal()}.db`);
  const tmp = `${arquivo}.tmp`;
  fs.rmSync(tmp, { force: true });
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  fs.renameSync(tmp, arquivo);

  let prints = 0;
  if (pastaAnexos && fs.existsSync(pastaAnexos)) {
    const destino = path.join(pasta, 'anexos');
    fs.mkdirSync(destino, { recursive: true });
    for (const f of fs.readdirSync(pastaAnexos)) {
      if (fs.existsSync(path.join(destino, f))) continue;
      fs.copyFileSync(path.join(pastaAnexos, f), path.join(destino, f));
      prints++;
    }
  }

  // Guarda os `dias` backups mais recentes (conta arquivos, não o calendário: se o PC ficar
  // desligado uma semana, os backups antigos não somem por isso).
  const velhos = listarBackups(pasta).slice(Math.max(1, dias));
  for (const b of velhos) fs.rmSync(b.arquivo, { force: true });
  return { arquivo, prints, apagados: velhos.length };
}

// Backups de uma pasta, do mais novo para o mais antigo.
export function listarBackups(pasta) {
  if (!fs.existsSync(pasta)) return [];
  return fs.readdirSync(pasta).filter(f => ARQ_BACKUP.test(f)).sort().reverse().map(f => {
    const arquivo = path.join(pasta, f);
    const st = fs.statSync(arquivo);
    return { data: f.slice(4, 14), arquivo, tamanho: st.size, atualizado: st.mtime };
  });
}
