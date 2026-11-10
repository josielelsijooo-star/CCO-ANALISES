// Regras de negócio do CCO usadas pelo servidor (validação e histórico).
// Os cálculos de exibição (duração, faixa, prazo, situação) ficam em public/js/app.js.

export const GRAVIDADES = ['Alta', 'Média', 'Baixa'];

export const CADASTROS_PADRAO = {
  postos: [], tipos: [], tecnicos: [], operadores: [],
  gravidades: [
    { nome: 'Alta', criterio: '', prazo: 1 },
    { nome: 'Média', criterio: '', prazo: 3 },
    { nome: 'Baixa', criterio: '', prazo: 5 },
  ],
  status: ['Aberto', 'Encaminhado', 'Aguardando retorno', 'Em tratamento', 'Resolvido', 'Encerrado sem ação'],
  frentes: ['Ao vivo', 'Análise do dia anterior', 'Monitoramento do dia'],
  camStatus: ['Aberto', 'Agendado', 'Em andamento', 'Aguardando peça', 'Resolvido', 'Cancelado'],
  camProblemas: ['Sem sinal', 'Imagem embaçada', 'Ângulo de visão inadequado', 'Travamento de imagem',
    'Lentidão no carregamento', 'Imagem tremendo', 'Imagem em preto e branco', 'Obstrução da imagem', 'Outro'],
};

// O que cada perfil pode fazer.
export const PAPEIS = {
  admin:    { nome: 'Administrador', registra: true,  edita: true,  retorno: true,  exclui: true,  cadastros: true },
  operador: { nome: 'Operador do CCO', registra: true, edita: true, retorno: true,  exclui: false, cadastros: false },
  gerente:  { nome: 'Gerente de posto', registra: false, edita: false, retorno: true, exclui: false, cadastros: false },
  leitura:  { nome: 'Somente leitura', registra: false, edita: false, retorno: false, exclui: false, cadastros: false },
};
// Campos que o gerente pode alterar numa ocorrência do próprio posto.
export const CAMPOS_RETORNO = ['status', 'dataSolucao', 'retorno'];

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{2}:\d{2}$/;
const LIM = { descricao: 4000, encaminhamento: 2000, retorno: 4000, detalhe: 2000, solucao: 2000 };

function texto(v, max = 200) { return String(v ?? '').trim().slice(0, max); }

export function limparOcorrencia(v) {
  const o = {};
  for (const k of ['data', 'hIni', 'hFim', 'dataFim', 'posto', 'camera', 'tipo', 'gravidade', 'frente', 'descricao',
    'dataAnalise', 'horaAnalise', 'encaminhamento', 'status', 'dataSolucao', 'retorno', 'registradoPor']) {
    if (k in v) o[k] = texto(v[k], LIM[k] || 200);
  }
  if ('anexos' in v) o.anexos = Array.isArray(v.anexos) ? v.anexos.map(x => texto(x, 40)).filter(Boolean).slice(0, 10) : [];
  return o;
}

export function limparCamera(v) {
  const o = {};
  for (const k of ['data', 'posto', 'tecnico', 'camera', 'gravador', 'problema', 'detalhe', 'gravidade', 'status',
    'dataExecucao', 'solucao', 'registradoPor']) {
    if (k in v) o[k] = texto(v[k], LIM[k] || 200);
  }
  return o;
}

export function validarOcorrencia(o, cad) {
  const e = [];
  for (const [k, nome] of [['data', 'data do evento'], ['hIni', 'hora inicial'], ['posto', 'posto'], ['tipo', 'tipo'],
    ['gravidade', 'gravidade'], ['descricao', 'descrição'], ['status', 'status']]) if (!o[k]) e.push(`Informe ${nome}.`);
  for (const k of ['data', 'dataFim', 'dataAnalise', 'dataSolucao']) if (o[k] && !DATA.test(o[k])) e.push(`Data inválida em ${k}.`);
  for (const k of ['hIni', 'hFim', 'horaAnalise']) if (o[k] && !HORA.test(o[k])) e.push(`Hora inválida em ${k}.`);
  if (o.gravidade && !GRAVIDADES.includes(o.gravidade)) e.push('Gravidade inválida.');
  if (o.status && !cad.status.includes(o.status)) e.push('Status inválido.');
  if (o.dataFim && o.data && o.dataFim < o.data) e.push('A data final não pode ser antes da data do evento.');
  if (o.dataSolucao && o.data && o.dataSolucao < o.data) e.push('A solução não pode ser antes do evento.');
  return e;
}

export function validarCamera(c, cad) {
  const e = [];
  for (const [k, nome] of [['data', 'data do levantamento'], ['posto', 'posto'], ['camera', 'câmera'],
    ['problema', 'problema'], ['gravidade', 'gravidade'], ['status', 'status']]) if (!c[k]) e.push(`Informe ${nome}.`);
  for (const k of ['data', 'dataExecucao']) if (c[k] && !DATA.test(c[k])) e.push(`Data inválida em ${k}.`);
  if (c.gravidade && !GRAVIDADES.includes(c.gravidade)) e.push('Gravidade inválida.');
  if (c.status && !cad.camStatus.includes(c.status)) e.push('Status inválido.');
  if (c.dataExecucao && c.data && c.dataExecucao < c.data) e.push('A execução não pode ser antes do levantamento.');
  return e;
}

export function validarCadastros(c) {
  const e = [];
  const lista = v => Array.isArray(v) ? v.map(x => texto(x, 120)).filter(Boolean) : [];
  const out = {
    postos: (Array.isArray(c.postos) ? c.postos : []).map(p => ({ nome: texto(p.nome, 120), gerente: texto(p.gerente, 120) })).filter(p => p.nome),
    tipos: (Array.isArray(c.tipos) ? c.tipos : []).map(t => ({ nome: texto(t.nome, 120), criterio: texto(t.criterio, 600) })).filter(t => t.nome),
    gravidades: GRAVIDADES.map(g => {
      const x = (Array.isArray(c.gravidades) ? c.gravidades : []).find(y => y && y.nome === g) || {};
      const prazo = Math.max(0, Math.min(90, parseInt(x.prazo, 10) || 0));
      return { nome: g, criterio: texto(x.criterio, 600), prazo };
    }),
    operadores: lista(c.operadores), tecnicos: lista(c.tecnicos),
    frentes: lista(c.frentes), camProblemas: lista(c.camProblemas),
    status: CADASTROS_PADRAO.status, camStatus: CADASTROS_PADRAO.camStatus,
  };
  const dup = a => a.find((v, i) => a.indexOf(v) !== i);
  const d1 = dup(out.postos.map(p => p.nome)), d2 = dup(out.tipos.map(t => t.nome));
  if (d1) e.push(`Posto repetido: ${d1}.`);
  if (d2) e.push(`Tipo repetido: ${d2}.`);
  if (!out.frentes.length) e.push('Cadastre ao menos uma frente.');
  return { erros: e, cadastros: out };
}

const ROTULO = {
  data: 'data', hIni: 'hora inicial', hFim: 'hora final', dataFim: 'data final', posto: 'posto', camera: 'câmera',
  tipo: 'tipo', gravidade: 'gravidade', frente: 'frente', descricao: 'descrição', encaminhamento: 'encaminhamento',
  dataAnalise: 'data da análise', horaAnalise: 'hora da análise', registradoPor: 'registrado por', tecnico: 'técnico',
  gravador: 'gravador', problema: 'problema', detalhe: 'detalhe', solucao: 'solução',
};
const fmtD = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '';

// Texto do histórico a partir da diferença entre a versão antiga e a nova.
export function textoHistorico(antigo, novo, tipo) {
  const out = [];
  if (antigo.status !== novo.status) out.push(`Status: ${antigo.status || '–'} → ${novo.status}`);
  if (tipo === 'ocorrencias') {
    if (!antigo.retorno && novo.retorno) out.push('Retorno do gerente registrado');
    else if ((antigo.retorno || '') !== (novo.retorno || '')) out.push('Retorno alterado');
    if ((antigo.dataSolucao || '') !== (novo.dataSolucao || '') && novo.dataSolucao) out.push('Data da solução: ' + fmtD(novo.dataSolucao));
    if ((antigo.anexos || []).join() !== (novo.anexos || []).join()) out.push(`Prints: ${(novo.anexos || []).length}`);
  } else if ((antigo.dataExecucao || '') !== (novo.dataExecucao || '') && novo.dataExecucao) {
    out.push('Executada em ' + fmtD(novo.dataExecucao));
  }
  const chaves = tipo === 'ocorrencias'
    ? ['data', 'hIni', 'hFim', 'dataFim', 'posto', 'camera', 'tipo', 'gravidade', 'frente', 'descricao', 'encaminhamento', 'dataAnalise', 'horaAnalise', 'registradoPor']
    : ['data', 'posto', 'camera', 'gravador', 'problema', 'detalhe', 'gravidade', 'tecnico', 'solucao', 'registradoPor'];
  const mudou = chaves.filter(k => (antigo[k] || '') !== (novo[k] || ''));
  if (mudou.length) out.push('Editado: ' + mudou.map(k => ROTULO[k]).join(', '));
  return out.join(' · ');
}
