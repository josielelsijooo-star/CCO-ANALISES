// Banco de dados SQLite (embutido no Node, sem instalar nada).
// As migrações rodam sozinhas ao iniciar: para mudar o esquema, acrescente
// um novo item no fim de MIGRACOES (nunca edite um que já rodou).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const MIGRACOES = [
  `CREATE TABLE usuarios (
     id          TEXT PRIMARY KEY,
     login       TEXT NOT NULL UNIQUE COLLATE NOCASE,
     nome        TEXT NOT NULL,
     papel       TEXT NOT NULL CHECK (papel IN ('admin','operador','gerente','leitura')),
     postos      TEXT NOT NULL DEFAULT '[]',
     senha_hash  TEXT NOT NULL,
     ativo       INTEGER NOT NULL DEFAULT 1,
     criado_em   TEXT NOT NULL
   );
   CREATE TABLE sessoes (
     token       TEXT PRIMARY KEY,
     usuario_id  TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
     expira_em   TEXT NOT NULL
   );
   CREATE INDEX ix_sessoes_usuario ON sessoes(usuario_id);
   CREATE TABLE cadastros (
     id              INTEGER PRIMARY KEY CHECK (id = 1),
     dados           TEXT NOT NULL,
     atualizado_em   TEXT,
     atualizado_por  TEXT
   );
   CREATE TABLE ocorrencias (
     id              TEXT PRIMARY KEY,
     n               INTEGER NOT NULL UNIQUE,
     data            TEXT NOT NULL,
     h_ini           TEXT,
     h_fim           TEXT,
     data_fim        TEXT,
     posto           TEXT NOT NULL,
     camera          TEXT,
     tipo            TEXT NOT NULL,
     gravidade       TEXT NOT NULL,
     frente          TEXT,
     descricao       TEXT NOT NULL,
     data_analise    TEXT,
     hora_analise    TEXT,
     encaminhamento  TEXT,
     status          TEXT NOT NULL,
     data_solucao    TEXT,
     retorno         TEXT,
     registrado_por  TEXT,
     anexos          TEXT NOT NULL DEFAULT '[]',
     historico       TEXT NOT NULL DEFAULT '[]',
     criado_por      TEXT,
     criado_em       TEXT,
     atualizado_por  TEXT,
     atualizado_em   TEXT
   );
   CREATE INDEX ix_oc_data ON ocorrencias(data);
   CREATE INDEX ix_oc_posto ON ocorrencias(posto);
   CREATE TABLE cameras (
     id              TEXT PRIMARY KEY,
     n               INTEGER NOT NULL UNIQUE,
     data            TEXT NOT NULL,
     posto           TEXT NOT NULL,
     tecnico         TEXT,
     camera          TEXT NOT NULL,
     gravador        TEXT,
     problema        TEXT NOT NULL,
     detalhe         TEXT,
     gravidade       TEXT NOT NULL,
     status          TEXT NOT NULL,
     data_execucao   TEXT,
     solucao         TEXT,
     registrado_por  TEXT,
     historico       TEXT NOT NULL DEFAULT '[]',
     criado_por      TEXT,
     criado_em       TEXT,
     atualizado_por  TEXT,
     atualizado_em   TEXT
   );
   CREATE INDEX ix_cam_posto ON cameras(posto);
   CREATE TABLE anexos (
     id           TEXT PRIMARY KEY,
     tipo         TEXT NOT NULL,
     tamanho      INTEGER NOT NULL,
     arquivo      TEXT NOT NULL,
     enviado_por  TEXT,
     enviado_em   TEXT NOT NULL
   );`,
  // Lixeira: ocorrências e câmeras excluídas ficam guardadas aqui (linha inteira em JSON) e podem ser restauradas.
  `CREATE TABLE lixeira (
     id                 TEXT PRIMARY KEY,
     tabela             TEXT NOT NULL CHECK (tabela IN ('ocorrencias','cameras')),
     registro_id        TEXT NOT NULL,
     n                  INTEGER,
     posto              TEXT,
     resumo             TEXT,
     dados              TEXT NOT NULL,
     excluido_por       TEXT,
     excluido_por_nome  TEXT,
     excluido_em        TEXT NOT NULL
   );
   CREATE INDEX ix_lixeira_em ON lixeira(excluido_em);`,
];

export function abrirBanco(arquivo) {
  if (arquivo !== ':memory:') fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const db = new DatabaseSync(arquivo);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrar(db);
  return db;
}

function migrar(db) {
  db.exec('CREATE TABLE IF NOT EXISTS _migracoes (versao INTEGER PRIMARY KEY, aplicada_em TEXT NOT NULL)');
  const atual = db.prepare('SELECT COALESCE(MAX(versao), 0) AS v FROM _migracoes').get().v;
  MIGRACOES.slice(atual).forEach((sql, i) => {
    transacao(db, () => {
      db.exec(sql);
      db.prepare('INSERT INTO _migracoes (versao, aplicada_em) VALUES (?, ?)').run(atual + i + 1, new Date().toISOString());
    });
  });
}

export function transacao(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

// Campos de cada tabela: nome no JSON da API -> coluna no banco.
export const CAMPOS = {
  ocorrencias: {
    data: 'data', hIni: 'h_ini', hFim: 'h_fim', dataFim: 'data_fim', posto: 'posto', camera: 'camera',
    tipo: 'tipo', gravidade: 'gravidade', frente: 'frente', descricao: 'descricao',
    dataAnalise: 'data_analise', horaAnalise: 'hora_analise', encaminhamento: 'encaminhamento',
    status: 'status', dataSolucao: 'data_solucao', retorno: 'retorno', registradoPor: 'registrado_por',
  },
  cameras: {
    data: 'data', posto: 'posto', tecnico: 'tecnico', camera: 'camera', gravador: 'gravador',
    problema: 'problema', detalhe: 'detalhe', gravidade: 'gravidade', status: 'status',
    dataExecucao: 'data_execucao', solucao: 'solucao', registradoPor: 'registrado_por',
  },
};
const META = {
  n: 'n', historico: 'historico', anexos: 'anexos', criadoPor: 'criado_por', criadoEm: 'criado_em',
  atualizadoPor: 'atualizado_por', atualizadoEm: 'atualizado_em',
};
const JSON_COLS = new Set(['historico', 'anexos']);

export function deLinha(tabela, linha) {
  if (!linha) return null;
  const o = { id: linha.id };
  for (const [k, c] of Object.entries({ ...CAMPOS[tabela], ...META })) {
    if (!(c in linha)) continue;
    const v = linha[c];
    o[k] = JSON_COLS.has(c) ? JSON.parse(v || '[]') : (v == null ? '' : v);
  }
  return o;
}

export function paraLinha(tabela, obj) {
  const linha = {};
  for (const [k, c] of Object.entries({ ...CAMPOS[tabela], ...META })) {
    if (tabela === 'cameras' && c === 'anexos') continue;
    if (!(k in obj)) continue;
    const v = obj[k];
    linha[c] = JSON_COLS.has(c) ? JSON.stringify(v || []) : (v === '' || v == null ? null : v);
  }
  return linha;
}

export function inserir(db, tabela, id, obj) {
  const linha = { id, ...paraLinha(tabela, obj) };
  const cols = Object.keys(linha);
  db.prepare(`INSERT INTO ${tabela} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...Object.values(linha));
}

export function atualizar(db, tabela, id, obj) {
  const linha = paraLinha(tabela, obj);
  const cols = Object.keys(linha);
  db.prepare(`UPDATE ${tabela} SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`).run(...Object.values(linha), id);
}

export function lerCadastros(db, padrao) {
  const r = db.prepare('SELECT dados FROM cadastros WHERE id = 1').get();
  return Object.assign({}, padrao, r ? JSON.parse(r.dados) : {});
}

export function gravarCadastros(db, dados, usuarioId) {
  db.prepare(`INSERT INTO cadastros (id, dados, atualizado_em, atualizado_por) VALUES (1, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET dados = excluded.dados, atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por`)
    .run(JSON.stringify(dados), new Date().toISOString(), usuarioId || null);
}
