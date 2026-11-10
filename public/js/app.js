(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const pd = s => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => iso(new Date());
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return iso(d); };
const diffDays = (a, b) => Math.round((pd(b) - pd(a)) / 864e5);
const fmtD = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '–';
const fmtDs = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '–';
const fmtDH = s => { const d = new Date(s); return isNaN(d) ? '' : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const toMin = h => (h && /^\d{1,2}:\d{2}/.test(h)) ? (+h.split(':')[0]) * 60 + (+h.split(':')[1]) : null;
const fmtDur = m => m == null ? '–' : `${Math.floor(m / 60)}:${pad(m % 60)}`;
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
const nf = n => Number(n).toLocaleString('pt-BR');
const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const mesLabel = ym => `${MESES[+ym.slice(5, 7) - 1]} de ${ym.slice(0, 4)}`;
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

const GRAVS = ['Alta', 'Média', 'Baixa'];
const GCLS = { 'Alta': 'ga', 'Média': 'gm', 'Baixa': 'gb' };
const DOW = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const FAIXAS = ['Madrugada', 'Manhã', 'Tarde', 'Noite'];
const CONCL = new Set(['Resolvido', 'Encerrado sem ação']);
const CAM_CONCL = new Set(['Resolvido', 'Cancelado']);
const STATUS_CHIP = { 'Aberto': 'crit', 'Encaminhado': 'info', 'Aguardando retorno': 'warn', 'Em tratamento': 'info', 'Resolvido': 'ok', 'Encerrado sem ação': '', 'Agendado': 'info', 'Em andamento': 'info', 'Aguardando peça': 'warn', 'Cancelado': '' };
const PRAZO_CHIP = { 'No prazo': 'info', 'Atrasada': 'crit', 'Concluída': 'ok', 'Concluída fora': 'warn' };
const DEF_CFG = {
  postos: [], tipos: [], tecnicos: [], operadores: [],
  gravidades: [{ nome: 'Alta', criterio: '', prazo: 1 }, { nome: 'Média', criterio: '', prazo: 3 }, { nome: 'Baixa', criterio: '', prazo: 5 }],
  status: ['Aberto', 'Encaminhado', 'Aguardando retorno', 'Em tratamento', 'Resolvido', 'Encerrado sem ação'],
  frentes: ['Ao vivo', 'Análise do dia anterior', 'Monitoramento do dia'],
  camStatus: ['Aberto', 'Agendado', 'Em andamento', 'Aguardando peça', 'Resolvido', 'Cancelado'],
  camProblemas: ['Sem sinal', 'Imagem embaçada', 'Ângulo de visão inadequado', 'Travamento de imagem', 'Lentidão no carregamento', 'Imagem tremendo', 'Imagem em preto e branco', 'Obstrução da imagem', 'Outro'],
};
const LBL = { data: 'data do evento', hIni: 'hora inicial', hFim: 'hora final', dataFim: 'data final', posto: 'posto', camera: 'câmera', tipo: 'tipo', gravidade: 'gravidade', frente: 'frente', descricao: 'descrição', encaminhamento: 'encaminhamento', dataAnalise: 'data da análise', horaAnalise: 'hora da análise', registradoPor: 'registrado por', tecnico: 'técnico', gravador: 'gravador', problema: 'problema', detalhe: 'detalhe', dataExecucao: 'data da execução', solucao: 'solução' };

const S = {
  cfg: DEF_CFG, ocsRaw: [], camsRaw: [], D: [], C: [], ver: 0,
  loaded: { ocs: false, cams: false, cfg: false }, confirmed: false, stale: false,
  me: null, perm: {}, canAdmin: false, readOnly: true, noDb: false, usuarios: null, uEdit: null, senhaTmp: null,
  pf: { per: 'tudo', de: '', ate: '', posto: '', tipo: '', grav: '', frente: '' },
  of: { q: '', per: 'tudo', de: '', ate: '', posto: '', tipo: '', grav: '', status: '', prazo: '' }, ocLimit: 100,
  cf: { q: '', posto: '', status: 'abertos', problema: '' },
  rf: { posto: '', mes: '' },
  built: {}, cadDraft: null, cadDirty: false, dr: null, lixeira: null,
};

/* ---------- regras de cálculo (as mesmas da planilha) ---------- */
const gravPrazo = g => { const x = S.cfg.gravidades.find(v => v.nome === g); return x ? +x.prazo || 0 : null; };
const gerenteDe = p => (S.cfg.postos.find(x => x.nome === p) || {}).gerente || '';
function deriveOc(o) {
  const x = Object.assign({}, o);
  const d0 = pd(o.data);
  x.dow = d0 ? (d0.getDay() + 6) % 7 : null;
  const hi = toMin(o.hIni), hf = toMin(o.hFim);
  x.hour = hi == null ? null : Math.floor(hi / 60);
  x.faixa = x.hour == null ? '' : FAIXAS[Math.floor(x.hour / 6)];
  if (hi != null && hf != null) {
    if (o.dataFim && o.dataFim !== o.data) { const m = diffDays(o.data, o.dataFim) * 1440 + hf - hi; x.dur = m >= 0 ? m : null; }
    else x.dur = (hf - hi + 1440) % 1440;
  } else x.dur = null;
  const base = o.dataAnalise || o.data;
  const pz = gravPrazo(o.gravidade);
  x.prazo = base && pz != null ? addDays(base, pz) : '';
  x.concl = CONCL.has(o.status);
  x.dias = base ? diffDays(base, o.dataSolucao || today()) : null;
  x.situacao = x.concl ? ((o.dataSolucao && x.prazo && o.dataSolucao > x.prazo) ? 'Concluída fora' : 'Concluída')
    : (!x.prazo ? '' : (today() > x.prazo ? 'Atrasada' : 'No prazo'));
  x.gerente = gerenteDe(o.posto);
  x.temRetorno = !!((o.retorno || '').trim() || o.dataSolucao);
  x.sortKey = (o.data || '') + ' ' + (o.hIni || '');
  return x;
}
function deriveCam(c) {
  const x = Object.assign({}, c);
  const pz = gravPrazo(c.gravidade);
  x.prazo = c.data && pz != null ? addDays(c.data, pz) : '';
  x.concl = CAM_CONCL.has(c.status);
  x.dias = c.data ? diffDays(c.data, c.dataExecucao || today()) : null;
  x.situacao = x.concl ? ((c.dataExecucao && x.prazo && c.dataExecucao > x.prazo) ? 'Concluída fora' : 'Concluída')
    : (!x.prazo ? '' : (today() > x.prazo ? 'Atrasada' : 'No prazo'));
  return x;
}
function recompute() {
  S.D = S.ocsRaw.map(deriveOc).sort((a, b) => b.sortKey.localeCompare(a.sortKey) || (b.n || 0) - (a.n || 0));
  S.C = S.camsRaw.map(deriveCam).sort((a, b) => (b.data || '').localeCompare(a.data || '') || (b.n || 0) - (a.n || 0));
  S.ver++;
}
function range(per, de, ate) {
  const t = today();
  switch (per) {
    case 'hoje': return [t, t];
    case '7d': return [addDays(t, -6), t];
    case '30d': return [addDays(t, -29), t];
    case 'mes': return [t.slice(0, 8) + '01', t];
    case 'mesant': { const d = pd(t); return [iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), iso(new Date(d.getFullYear(), d.getMonth(), 0))]; }
    case 'custom': return [de || '0000-01-01', ate || '9999-12-31'];
    default: return ['0000-01-01', '9999-12-31'];
  }
}
const PERIODOS = [['tudo', 'Todo o histórico'], ['hoje', 'Hoje'], ['7d', 'Últimos 7 dias'], ['30d', 'Últimos 30 dias'], ['mes', 'Mês atual'], ['mesant', 'Mês anterior'], ['custom', 'Personalizado']];
const listOf = (cfgList, values) => { const s = new Set(cfgList); values.forEach(v => v && s.add(v)); return Array.from(s); };
const postosList = () => (S.me && S.me.papel === 'gerente') ? S.me.postos.slice()
  : listOf(S.cfg.postos.map(p => p.nome), S.D.map(o => o.posto).concat(S.C.map(c => c.posto)));
const tiposList = () => listOf(S.cfg.tipos.map(t => t.nome), S.D.map(o => o.tipo));

/* ---------- peças de interface ---------- */
const opts = (list, sel, empty) => (empty != null ? `<option value="">${esc(empty)}</option>` : '') + list.map(v => { const [val, lab] = Array.isArray(v) ? v : [v, v]; return `<option value="${esc(val)}"${val === sel ? ' selected' : ''}>${esc(lab)}</option>`; }).join('');
const fsel = (id, label, list, sel, empty, extra = '') => `<label class="fld"><span>${esc(label)}</span><select class="inp${empty != null && sel ? ' f-active' : ''}" id="${id}" ${extra}>${opts(list, sel, empty)}</select></label>`;
const gtag = g => g ? `<span class="gtag"><i class="sw ${GCLS[g] || ''}"></i>${esc(g)}</span>` : '<span class="muted">–</span>';
const chip = (txt, map) => txt ? `<span class="chip ${map[txt] || ''}">${esc(txt)}</span>` : '<span class="muted">–</span>';
const legendGrav = () => `<div class="legend">${GRAVS.map(g => `<span><i class="sw ${GCLS[g]}"></i>${g}</span>`).join('')}</div>`;
function countBy(arr, fn) { const m = new Map(); arr.forEach(x => { const k = fn(x); m.set(k, (m.get(k) || 0) + 1); }); return m; }
function gravRows(keys, items, keyFn, extraFn) {
  return keys.map(k => {
    const its = items.filter(o => keyFn(o) === k);
    const segs = GRAVS.map(g => ({ k: g, v: its.filter(o => o.gravidade === g).length, cls: GCLS[g] }));
    return { key: k, label: k, total: its.length, segs, tip: extraFn ? extraFn(its, k) : '' };
  });
}
function hbars(rows, go) {
  const max = Math.max(1, ...rows.map(r => r.total));
  return `<div class="hb">${rows.map(r => `<div class="hb-row${r.total ? '' : ' zero'}">
    <button type="button" class="hb-label" data-go="${esc(go || '')}" data-val="${esc(r.key)}" title="${esc(r.label)}">${esc(r.label)}</button>
    <div class="hb-track"><div class="hb-fill" style="width:${(r.total / max * 100).toFixed(2)}%">${r.segs.filter(s => s.v > 0).map(s => `<span class="seg ${s.cls}" style="flex:${s.v} 1 0" data-tip="${esc(`${r.label}\n${s.k}: ${s.v}${r.tip ? '\n' + r.tip : ''}`)}"></span>`).join('')}</div></div>
    <div class="hb-val">${r.total}</div></div>`).join('')}</div>`;
}

/* ---------- painel ---------- */
function filtOcs(f) {
  const [a, b] = range(f.per, f.de, f.ate);
  return S.D.filter(o => (o.data || '') >= a && (o.data || '') <= b && (!f.posto || o.posto === f.posto) && (!f.tipo || o.tipo === f.tipo) && (!f.grav || o.gravidade === f.grav) && (!f.frente || o.frente === f.frente));
}
function ctlPainel() {
  const f = S.pf;
  $('#pf').innerHTML = fsel('pf-per', 'Período', PERIODOS, f.per, null)
    + `<label class="fld" ${f.per === 'custom' ? '' : 'hidden'}><span>De</span><input class="inp" type="date" id="pf-de" value="${esc(f.de)}"></label>`
    + `<label class="fld" ${f.per === 'custom' ? '' : 'hidden'}><span>Até</span><input class="inp" type="date" id="pf-ate" value="${esc(f.ate)}"></label>`
    + fsel('pf-posto', 'Posto', postosList(), f.posto, 'Todos')
    + fsel('pf-tipo', 'Tipo de ocorrência', tiposList(), f.tipo, 'Todos')
    + fsel('pf-grav', 'Gravidade', GRAVS, f.grav, 'Todas')
    + fsel('pf-frente', 'Frente', S.cfg.frentes, f.frente, 'Todas')
    + `<span class="showing" id="pf-show"></span>`;
}
function rPainel() {
  const all = filtOcs(S.pf);
  const [a, b] = range(S.pf.per, S.pf.de, S.pf.ate);
  const lab = S.pf.per === 'tudo' ? 'todo o histórico' : (a === b ? fmtD(a) : `${fmtD(a)} a ${fmtD(b)}`);
  $('#pf-show').textContent = `${nf(all.length)} ocorrência${all.length === 1 ? '' : 's'} · ${lab}`;
  const body = $('#p-body');
  if (!S.D.length) { body.innerHTML = emptyState('ocs'); return; }
  const open = all.filter(o => !o.concl), late = all.filter(o => o.situacao === 'Atrasada');
  const done = all.filter(o => o.concl && o.dataSolucao);
  const avg = done.length ? (done.reduce((s, o) => s + (o.dias || 0), 0) / done.length) : null;
  const onTime = done.filter(o => o.situacao === 'Concluída').length;
  const ret = all.filter(o => o.temRetorno).length;
  const camOpen = S.C.filter(c => !c.concl && (!S.pf.posto || c.posto === S.pf.posto));
  const g = Object.fromEntries(GRAVS.map(x => [x, all.filter(o => o.gravidade === x).length]));
  let h = `<div class="kpis">
    <div class="kpi"><span class="k">Ocorrências</span><span class="v">${nf(all.length)}</span><span class="gsplit">${GRAVS.map(x => `<span><i class="sw ${GCLS[x]}"></i>${g[x]} ${x.toLowerCase()}</span>`).join('')}</span></div>
    <div class="kpi"><span class="k">Pendências em aberto</span><span class="v">${nf(open.length)}</span><span class="s">sem solução registrada</span></div>
    <div class="kpi${late.length ? ' alert' : ''}"><span class="k">Atrasadas</span><span class="v">${nf(late.length)}</span><span class="s">passaram do prazo da gravidade</span></div>
    <div class="kpi${all.length && !ret ? ' alert' : ''}"><span class="k">Com retorno do gerente</span><span class="v">${pct(ret, all.length)}%</span><span class="s">${nf(ret)} de ${nf(all.length)}</span></div>
    <div class="kpi"><span class="k">Tempo médio de solução</span><span class="v">${avg == null ? '–' : avg.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</span><span class="s">${avg == null ? 'nenhuma solução registrada' : 'dias, da análise à solução'}</span></div>
    <div class="kpi"><span class="k">Resolvidas no prazo</span><span class="v">${done.length ? pct(onTime, done.length) + '%' : '–'}</span><span class="s">${done.length ? `${onTime} de ${done.length} concluídas` : 'sem conclusões no período'}</span></div>
    <div class="kpi link${camOpen.length ? '' : ''}" data-href="#cameras" tabindex="0" role="link"><span class="k">Câmeras com defeito</span><span class="v">${nf(camOpen.length)}</span><span class="s">${camOpen.filter(c => c.situacao === 'Atrasada').length} com manutenção atrasada</span></div>
  </div>`;
  if (all.length) {
    const ins = [];
    const tc = Array.from(countBy(all, o => o.tipo)).sort((x, y) => y[1] - x[1]);
    if (tc.length >= 2) ins.push(`<b>${esc(tc[0][0])}</b> e <b>${esc(tc[1][0])}</b> somam ${pct(tc[0][1] + tc[1][1], all.length)}% das ocorrências.`);
    if (!ret) ins.push(`Nenhuma das ${nf(all.length)} ocorrências tem retorno do gerente ou data de solução. Registre o retorno na ocorrência para fechar o ciclo.`);
    else if (open.length) ins.push(`${nf(open.length)} ocorrências seguem sem solução registrada; ${nf(late.length)} delas já passaram do prazo.`);
    const pc = Array.from(countBy(all, o => o.posto)).sort((x, y) => y[1] - x[1]);
    if (pc.length > 2 && !S.pf.posto) ins.push(`O posto com mais registros é <b>${esc(pc[0][0])}</b>, com ${pc[0][1]} (${pct(pc[0][1], all.length)}%).`);
    if (ins.length) h += `<div class="insight"><span class="ic" aria-hidden="true">!</span><ul>${ins.map(x => `<li>${x}</li>`).join('')}</ul></div>`;
  }
  if (!all.length) { body.innerHTML = h + `<div class="card empty"><h3>Nada neste filtro</h3><p>Nenhuma ocorrência no período e filtros escolhidos.</p></div>`; return; }

  const topTipo = its => { const c = Array.from(countBy(its, o => o.tipo)).sort((x, y) => y[1] - x[1])[0]; return c ? `Tipo mais frequente: ${c[0]}` : ''; };
  const tipoRows = gravRows(tiposList(), all, o => o.tipo, its => `Em aberto: ${its.filter(o => !o.concl).length}`).filter(r => r.total || S.cfg.tipos.some(t => t.nome === r.key)).sort((x, y) => y.total - x.total);
  const postoRows = gravRows(postosList(), all, o => o.posto, its => `Em aberto: ${its.filter(o => !o.concl).length} · Atrasadas: ${its.filter(o => o.situacao === 'Atrasada').length}\n${topTipo(its)}`).sort((x, y) => y.total - x.total);
  const stc = countBy(all, o => o.status), prc = countBy(all, o => o.situacao), frc = countBy(all, o => o.frente);
  const PRZ = [['Atrasada', 'st-crit'], ['No prazo', 'st-info'], ['Concluída fora', 'st-warn'], ['Concluída', 'st-ok']];
  h += `<div class="grid2">
    <div class="card"><div class="card-h"><h3>Por tipo de ocorrência</h3>${legendGrav()}</div>${hbars(tipoRows, 'tipo')}</div>
    <div class="card"><div class="card-h"><h3>Situação</h3><span class="sub">status e prazo</span></div>
      <div class="lbl">Prazo</div>
      <div class="stack1">${PRZ.filter(([k]) => prc.get(k)).map(([k, c]) => `<span class="${c}" style="flex:${prc.get(k)} 1 0" data-tip="${esc(k + ': ' + prc.get(k))}"></span>`).join('')}</div>
      <table class="mini">${PRZ.map(([k, c]) => `<tr><td>${chip(k, PRAZO_CHIP)}</td><td>${prc.get(k) || 0}</td></tr>`).join('')}</table>
      <div class="lbl" style="margin-top:16px">Status</div>
      <table class="mini">${listOf(S.cfg.status, all.map(o => o.status)).map(k => `<tr><td>${chip(k, STATUS_CHIP)}</td><td>${stc.get(k) || 0}</td></tr>`).join('')}</table>
    </div>
  </div>
  <div class="grid2">
    <div class="card"><div class="card-h"><h3>Por posto</h3>${legendGrav()}</div>${hbars(postoRows, 'posto')}</div>
    <div class="card"><div class="card-h"><h3>Por frente</h3><span class="sub">como a ocorrência foi vista</span></div>
      ${hbars(listOf(S.cfg.frentes, all.map(o => o.frente)).map(k => ({ key: k, label: k, total: frc.get(k) || 0, segs: [{ k: 'Ocorrências', v: frc.get(k) || 0, cls: 'one' }] })).sort((x, y) => y.total - x.total), 'frente')}
      <div class="lbl" style="margin-top:18px">Faixa horária do evento</div>
      <table class="mini">${FAIXAS.map((fx, i) => { const n = all.filter(o => o.faixa === fx).length; return `<tr><td>${fx} <span class="muted">${pad(i * 6)}h–${pad(i * 6 + 6)}h</span></td><td>${n} <span class="muted" style="font-weight:400">· ${pct(n, all.length)}%</span></td></tr>`; }).join('')}</table>
    </div>
  </div>
  <div class="card"><div class="card-h"><h3>Quando acontece</h3><span class="sub">dia da semana × hora inicial do evento</span></div>${heatmap(all)}</div>
  <div class="card"><div class="card-h"><h3>Evolução diária</h3>${legendGrav()}</div>${daily(all, a, b)}</div>`;
  body.innerHTML = h;
}
function heatmap(items) {
  const m = Array.from({ length: 7 }, () => Array(24).fill(0));
  items.forEach(o => { if (o.dow != null && o.hour != null) m[o.dow][o.hour]++; });
  const max = Math.max(1, ...m.flat());
  const step = v => v === 0 ? 0 : Math.max(1, Math.ceil(v / max * 5));
  let h = `<div class="hm-scroll"><div class="hm"><span></span>${FAIXAS.map(f => `<span class="band">${f}</span>`).join('')}<span></span>`;
  for (let i = 0; i < 24; i++) h += `<span class="hl">${i % 3 === 0 ? pad(i) : ''}</span>`;
  m.forEach((row, d) => { h += `<span class="dl">${DOW[d]}</span>` + row.map((v, hr) => `<span class="c" style="background:var(--h${step(v)})" data-tip="${esc(`${DOW[d]}, ${pad(hr)}h–${pad(hr + 1)}h\n${v} ocorrência${v === 1 ? '' : 's'}`)}"></span>`).join(''); });
  h += `</div></div><div class="hm-leg">Menos ${[0, 1, 2, 3, 4, 5].map(i => `<i style="background:var(--h${i})"></i>`).join('')} Mais <span style="margin-left:8px">máximo de ${max} na mesma hora</span></div>`;
  return h;
}
function daily(items, a, b) {
  const ds = items.map(o => o.data).filter(Boolean).sort();
  let start = a > '0001' ? a : ds[0], end = b < '9000' ? b : today();
  if (end > today()) end = today();
  if (!start || start > end) start = end;
  if (diffDays(start, end) > 89) start = addDays(end, -89);
  const days = []; for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  const by = new Map(); items.forEach(o => { if (!by.has(o.data)) by.set(o.data, []); by.get(o.data).push(o); });
  const max = Math.max(1, ...days.map(d => (by.get(d) || []).length));
  const stp = max <= 5 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : 10;
  const top = Math.ceil(max / stp) * stp;
  let gl = ''; for (let v = 0; v <= top; v += stp) gl += `<div class="gl${v === 0 ? ' base' : ''}" style="bottom:${v / top * 100}%"><span>${v}</span></div>`;
  const every = days.length > 60 ? 14 : days.length > 20 ? 7 : days.length > 10 ? 2 : 1;
  const t = today();
  return `<div class="cols">${gl}<div class="bars">${days.map(d => {
    const its = by.get(d) || [];
    const c = GRAVS.map(g => [g, its.filter(o => o.gravidade === g).length]);
    const tip = `${DOW[(pd(d).getDay() + 6) % 7]} ${fmtDs(d)}: ${its.length}` + (its.length ? '\n' + c.filter(x => x[1]).map(x => `${x[0]} ${x[1]}`).join(' · ') : '');
    return `<div class="col${d === t ? ' today' : ''}" data-tip="${esc(tip)}">${c.filter(x => x[1]).map(x => `<span class="${GCLS[x[0]]}" style="height:calc(${x[1] / top * 100}% - 2px)"></span>`).join('')}</div>`;
  }).join('')}</div></div><div class="xl">${days.map((d, i) => `<span>${i % every === 0 ? fmtDs(d) : ''}</span>`).join('')}</div>`;
}

/* ---------- ocorrências ---------- */
function ctlOcs() {
  const f = S.of;
  $('#of').innerHTML = `<label class="fld grow"><span>Buscar</span><input class="inp${f.q ? ' f-active' : ''}" id="of-q" type="search" placeholder="Descrição, câmera, nº, retorno…" value="${esc(f.q)}"></label>`
    + fsel('of-per', 'Período', PERIODOS, f.per, null)
    + `<label class="fld" ${f.per === 'custom' ? '' : 'hidden'}><span>De</span><input class="inp" type="date" id="of-de" value="${esc(f.de)}"></label>`
    + `<label class="fld" ${f.per === 'custom' ? '' : 'hidden'}><span>Até</span><input class="inp" type="date" id="of-ate" value="${esc(f.ate)}"></label>`
    + fsel('of-posto', 'Posto', postosList(), f.posto, 'Todos')
    + fsel('of-tipo', 'Tipo', tiposList(), f.tipo, 'Todos')
    + fsel('of-grav', 'Gravidade', GRAVS, f.grav, 'Todas')
    + fsel('of-status', 'Status', [['pend', 'Pendentes (não concluídas)']].concat(S.cfg.status), f.status, 'Todos')
    + fsel('of-prazo', 'Prazo', ['No prazo', 'Atrasada', 'Concluída', 'Concluída fora'], f.prazo, 'Todos')
    + `<button class="btn ghost sm" type="button" id="of-clear">Limpar filtros</button>`;
}
function filtOcList() {
  const f = S.of, q = norm(f.q).trim();
  const [a, b] = range(f.per, f.de, f.ate);
  return S.D.filter(o => (o.data || '') >= a && (o.data || '') <= b
    && (!f.posto || o.posto === f.posto) && (!f.tipo || o.tipo === f.tipo) && (!f.grav || o.gravidade === f.grav)
    && (!f.status || (f.status === 'pend' ? !o.concl : o.status === f.status)) && (!f.prazo || o.situacao === f.prazo)
    && (!q || norm([o.n, o.descricao, o.posto, o.tipo, o.camera, o.retorno, o.encaminhamento, o.registradoPor, o.gerente].join(' ')).includes(q)));
}
function rOcs() {
  const body = $('#o-body');
  $('#btn-csv').hidden = !S.D.length;
  if (!S.D.length) { body.innerHTML = emptyState('ocs'); return; }
  const list = filtOcList();
  const shown = list.slice(0, S.ocLimit);
  if (!list.length) { body.innerHTML = `<div class="card empty"><h3>Nenhuma ocorrência encontrada</h3><p>Ajuste a busca ou limpe os filtros.</p></div>`; return; }
  body.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nº</th><th>Evento</th><th>Posto</th><th>Tipo e descrição</th><th>Gravidade</th><th>Duração</th><th>Status</th><th>Prazo</th><th>Gerente</th></tr></thead><tbody>
    ${shown.map(o => `<tr tabindex="0" data-oc="${esc(o.id)}">
      <td class="mono">${esc(o.n || '')}</td>
      <td class="mono" style="white-space:nowrap">${fmtD(o.data)} ${esc(o.hIni || '')}<div class="muted" style="font-family:var(--font-ui);font-size:12.5px">${o.dow != null ? DOW[o.dow] : ''} · ${esc(o.faixa || '')}</div></td>
      <td style="white-space:nowrap">${esc(o.posto)}${o.camera ? `<div class="muted" style="font-size:12.5px">${esc(o.camera)}</div>` : ''}</td>
      <td><div>${esc(o.tipo)}${(o.anexos || []).length ? `<span class="clip" title="Anexos">▣ ${o.anexos.length}</span>` : ''}</div><div class="desc">${esc(o.descricao)}</div></td>
      <td>${gtag(o.gravidade)}</td>
      <td class="mono">${fmtDur(o.dur)}</td>
      <td>${chip(o.status, STATUS_CHIP)}${o.temRetorno ? '<div class="muted" style="font-size:12px;margin-top:3px">com retorno</div>' : ''}</td>
      <td>${chip(o.situacao, PRAZO_CHIP)}<div class="muted" style="font-size:12px;margin-top:3px;white-space:nowrap">${o.concl ? (o.dataSolucao ? 'em ' + fmtDs(o.dataSolucao) : '') : `${o.dias ?? '–'} dia${o.dias === 1 ? '' : 's'} em aberto`}</div></td>
      <td>${esc(o.gerente || '–')}</td></tr>`).join('')}
  </tbody></table></div>
  <div class="tfoot" style="margin-top:10px"><span>Mostrando ${nf(shown.length)} de ${nf(list.length)} ocorrência${list.length === 1 ? '' : 's'}</span>${list.length > shown.length ? '<button class="btn sm" type="button" id="of-more">Mostrar mais 100</button>' : ''}</div>`;
}

/* ---------- câmeras ---------- */
function ctlCams() {
  const f = S.cf;
  $('#cf').innerHTML = `<label class="fld grow"><span>Buscar</span><input class="inp${f.q ? ' f-active' : ''}" id="cf-q" type="search" placeholder="Câmera, canal, detalhe, solução…" value="${esc(f.q)}"></label>`
    + fsel('cf-posto', 'Posto', postosList(), f.posto, 'Todos')
    + fsel('cf-status', 'Status', [['abertos', 'Em aberto'], ['atrasados', 'Atrasados']].concat(S.cfg.camStatus), f.status, 'Todos')
    + fsel('cf-problema', 'Problema', listOf(S.cfg.camProblemas, S.C.map(c => c.problema)), f.problema, 'Todos');
}
function rCams() {
  const body = $('#c-body');
  $('#btn-newcam').hidden = !S.perm.registra || S.noDb;
  if (!S.C.length) { body.innerHTML = emptyState('cams'); return; }
  const f = S.cf, q = norm(f.q).trim();
  const base = S.C.filter(c => !f.posto || c.posto === f.posto);
  const list = base.filter(c => (!f.status || (f.status === 'abertos' ? !c.concl : f.status === 'atrasados' ? c.situacao === 'Atrasada' : c.status === f.status))
    && (!f.problema || c.problema === f.problema) && (!q || norm([c.n, c.camera, c.gravador, c.problema, c.detalhe, c.solucao, c.tecnico].join(' ')).includes(q)));
  const open = base.filter(c => !c.concl);
  const late = open.filter(c => c.situacao === 'Atrasada');
  const res30 = base.filter(c => c.status === 'Resolvido' && c.dataExecucao && c.dataExecucao >= addDays(today(), -29));
  const postoRows = gravRows(postosList(), open, c => c.posto, its => `Atrasadas: ${its.filter(c => c.situacao === 'Atrasada').length}`).filter(r => r.total).sort((x, y) => y.total - x.total);
  const probRows = gravRows(listOf(S.cfg.camProblemas, open.map(c => c.problema)), open, c => c.problema).filter(r => r.total).sort((x, y) => y.total - x.total);
  body.innerHTML = `<div class="kpis">
    <div class="kpi"><span class="k">Defeitos em aberto</span><span class="v">${open.length}</span><span class="gsplit">${GRAVS.map(x => `<span><i class="sw ${GCLS[x]}"></i>${open.filter(c => c.gravidade === x).length} ${x.toLowerCase()}</span>`).join('')}</span></div>
    <div class="kpi${late.length ? ' alert' : ''}"><span class="k">Manutenção atrasada</span><span class="v">${late.length}</span><span class="s">${open.length ? pct(late.length, open.length) + '% dos abertos' : 'nenhum aberto'}</span></div>
    <div class="kpi"><span class="k">Resolvidos em 30 dias</span><span class="v">${res30.length}</span><span class="s">pela data da execução</span></div>
    <div class="kpi"><span class="k">Postos com defeito</span><span class="v">${new Set(open.map(c => c.posto)).size}</span><span class="s">de ${postosList().length} postos</span></div>
  </div>
  ${open.length ? `<div class="grid2"><div class="card"><div class="card-h"><h3>Em aberto por posto</h3>${legendGrav()}</div>${hbars(postoRows, 'cposto')}</div>
  <div class="card"><div class="card-h"><h3>Em aberto por problema</h3></div>${hbars(probRows, 'cproblema')}</div></div>` : ''}
  ${list.length ? `<div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nº</th><th>Levantamento</th><th>Posto</th><th>Câmera / canal</th><th>Problema</th><th>Gravidade</th><th>Status</th><th>Prazo</th><th>Técnico</th><th>Solução</th></tr></thead><tbody>
    ${list.map(c => `<tr tabindex="0" data-cam="${esc(c.id)}"><td class="mono">${esc(c.n || '')}</td><td class="mono">${fmtD(c.data)}</td>
      <td style="white-space:nowrap">${esc(c.posto)}</td><td>${esc(c.camera)}${c.gravador ? `<div class="muted" style="font-size:12.5px">${esc(c.gravador)}</div>` : ''}</td>
      <td>${esc(c.problema)}${c.detalhe ? `<div class="desc">${esc(c.detalhe)}</div>` : ''}</td><td>${gtag(c.gravidade)}</td><td>${chip(c.status, STATUS_CHIP)}</td>
      <td>${chip(c.situacao, PRAZO_CHIP)}<div class="muted" style="font-size:12px;margin-top:3px;white-space:nowrap">${c.concl ? (c.dataExecucao ? 'em ' + fmtDs(c.dataExecucao) : '') : `${c.dias ?? '–'} dias em aberto`}</div></td>
      <td>${esc(c.tecnico || '–')}</td><td><div class="desc" style="max-width:28ch">${esc(c.solucao || '–')}</div></td></tr>`).join('')}
  </tbody></table></div><div class="tfoot" style="margin-top:10px"><span>${list.length} registro${list.length === 1 ? '' : 's'}</span></div></div>`
    : `<div class="card empty"><h3>Nenhum registro neste filtro</h3><p>${f.status === 'abertos' ? 'Nenhuma câmera com defeito em aberto.' : 'Ajuste os filtros.'}</p></div>`}`;
}

/* ---------- relatório ---------- */
function monthsList() { const s = new Set(S.D.map(o => (o.data || '').slice(0, 7)).filter(Boolean)); s.add(today().slice(0, 7)); return Array.from(s).sort().reverse(); }
function ctlRel() {
  const f = S.rf, ms = monthsList();
  if (!f.mes || !ms.includes(f.mes)) f.mes = ms.find(m => S.D.some(o => (o.data || '').startsWith(m))) || ms[0];
  const ps = postosList();
  if (!f.posto || !ps.includes(f.posto)) { const c = Array.from(countBy(S.D.filter(o => (o.data || '').startsWith(f.mes)), o => o.posto)).sort((x, y) => y[1] - x[1])[0]; f.posto = c ? c[0] : ps[0] || ''; }
  $('#rf').innerHTML = fsel('rf-posto', 'Posto', ps, f.posto, null) + fsel('rf-mes', 'Mês', ms.map(m => [m, mesLabel(m)]), f.mes, null) + `<span class="showing" id="rf-show"></span>`;
}
function repData() {
  const f = S.rf; const a = f.mes + '-01'; const end = iso(new Date(+f.mes.slice(0, 4), +f.mes.slice(5, 7), 0));
  const ocs = S.D.filter(o => o.posto === f.posto && o.data >= a && o.data <= end).sort((x, y) => x.sortKey.localeCompare(y.sortKey));
  const cams = S.C.filter(c => c.posto === f.posto && c.data <= end && ((c.data >= a) || !c.concl || (c.dataExecucao && c.dataExecucao >= a)));
  return { a, end, ocs, cams, gerente: gerenteDe(f.posto) };
}
function repInner(r, forFile) {
  const f = S.rf;
  const open = r.ocs.filter(o => !o.concl).length, late = r.ocs.filter(o => o.situacao === 'Atrasada').length;
  const tc = Array.from(countBy(r.ocs, o => o.tipo)).sort((x, y) => y[1] - x[1]);
  const kp = (k, v) => `<div class="kpi"><span class="k">${k}</span><span class="v">${v}</span></div>`;
  const tipoTable = `<table class="mini">${tc.map(([t, n]) => `<tr><td>${esc(t)} <span class="muted">· ${GRAVS.map(g => `${r.ocs.filter(o => o.tipo === t && o.gravidade === g).length} ${g.toLowerCase()}`).join(', ')}</span></td><td>${n} <span class="muted" style="font-weight:400">· ${pct(n, r.ocs.length)}%</span></td></tr>`).join('')}</table>`;
  return `<div class="rep-h"><div><div class="lbl">Relatório de ocorrências · CCO</div><h2>${esc(f.posto)}</h2><div class="muted">${mesLabel(f.mes)} · ${fmtD(r.a)} a ${fmtD(r.end)}</div></div>
    <div class="who">Gerente responsável<br><b>${esc(r.gerente || '–')}</b><br><span class="muted">Emitido em ${fmtD(today())}</span></div></div>
    <div class="kpis">${kp('Ocorrências', r.ocs.length)}${GRAVS.map(g => kp('Gravidade ' + g.toLowerCase(), r.ocs.filter(o => o.gravidade === g).length)).join('')}${kp('Em aberto', open)}${kp('Atrasadas', late)}${kp('Resolvidas ou encerradas', r.ocs.length - open)}</div>
    ${r.ocs.length ? `<div><h3>Ocorrências por tipo</h3>${forFile ? tipoTable : hbars(gravRows(tc.map(x => x[0]), r.ocs, o => o.tipo), '')}</div>` : ''}
    <div><h3>Descrição das ocorrências</h3>${r.ocs.length ? r.ocs.map(o => `<div class="rep-oc">
      <div class="when">Nº ${esc(o.n || '')}<br>${fmtD(o.data)} ${esc(o.hIni || '')}${o.hFim ? '–' + esc(o.hFim) : ''}<br>Duração ${fmtDur(o.dur)}</div>
      <div><div class="tline">${esc(o.tipo)} ${gtag(o.gravidade)} ${chip(o.status, STATUS_CHIP)}</div>
        <p>${esc(o.descricao)}</p>
        ${o.encaminhamento ? `<p class="ret"><b>Encaminhamento:</b> ${esc(o.encaminhamento)}</p>` : ''}
        <p class="ret"><b>Retorno:</b> ${o.retorno ? esc(o.retorno) + (o.dataSolucao ? ` (${fmtD(o.dataSolucao)})` : '') : 'ainda não registrado'}</p></div></div>`).join('') : '<p class="muted">Nenhuma ocorrência no mês.</p>'}</div>
    <div><h3>Câmeras com defeito no período</h3>${r.cams.length ? `<table class="mini">${r.cams.map(c => `<tr><td><b>${esc(c.camera)}</b> ${c.gravador ? `<span class="muted">${esc(c.gravador)}</span>` : ''} · ${esc(c.problema)} · ${esc(c.status)}${c.solucao ? ` <span class="muted">· ${esc(c.solucao)}</span>` : ''}</td><td>${fmtD(c.data)}</td></tr>`).join('')}</table>` : '<p class="muted">Nenhum defeito de câmera registrado.</p>'}</div>`;
}
function rRel() {
  const body = $('#r-body');
  $('#btn-rep').hidden = !S.D.length;
  if (!S.D.length) { body.innerHTML = emptyState('ocs'); return; }
  const r = repData();
  $('#rf-show').textContent = `${r.ocs.length} ocorrência${r.ocs.length === 1 ? '' : 's'} no mês`;
  body.innerHTML = `<div class="rep">${repInner(r, false)}</div>`;
}

/* ---------- cadastros ---------- */
const cloneCfg = c => JSON.parse(JSON.stringify(Object.assign({}, DEF_CFG, c)));
function rCad() {
  if (!S.cadDirty || !S.cadDraft) S.cadDraft = cloneCfg(S.cfg);
  const c = S.cadDraft, ro = !S.canAdmin || S.noDb;
  const dis = ro ? 'disabled' : '';
  $('#btn-cad').hidden = ro;
  const listBox = (key, title, hint) => `<div class="card"><div class="card-h"><h3>${title}</h3><span class="sub">${hint}</span></div>
    <textarea class="inp" data-list="${key}" ${dis} rows="${Math.max(4, c[key].length + 1)}" style="width:100%">${esc(c[key].join('\n'))}</textarea></div>`;
  rUsers(); rLixeira();
  $('#k-body').innerHTML =`${ro ? `<div class="insight" style="margin-bottom:16px"><span class="ic" aria-hidden="true">i</span><div>${S.noDb ? 'Os cadastros aparecem quando o servidor do CCO responder.' : 'Só administradores alteram os cadastros. Você está vendo em modo leitura.'}</div></div>` : ''}
  <div class="cad-grid">
    <div class="card"><div class="card-h"><h3>Postos e gerentes</h3><span class="sub">o gerente é preenchido sozinho na ocorrência</span></div>
      <div class="rows" id="k-postos">${c.postos.map((p, i) => `<div class="rowi"><input class="inp" data-k="postos.${i}.nome" value="${esc(p.nome)}" aria-label="Posto" ${dis}><input class="inp" data-k="postos.${i}.gerente" value="${esc(p.gerente)}" aria-label="Gerente" ${dis}>${ro ? '<span></span>' : `<button class="x" type="button" data-rm="postos.${i}" aria-label="Remover posto">✕</button>`}</div>`).join('')}</div>
      ${ro ? '' : '<button class="btn sm" type="button" data-add="postos" style="margin-top:10px">Adicionar posto</button>'}
      <p class="hint">Renomear um posto não altera as ocorrências já registradas com o nome antigo.</p></div>
    <div class="card"><div class="card-h"><h3>Gravidade e prazos</h3><span class="sub">prazo conta a partir da análise</span></div>
      <div class="rows">${c.gravidades.map((g, i) => `<div class="rowi g"><span class="gtag" style="padding-top:8px"><i class="sw ${GCLS[g.nome] || ''}"></i>${esc(g.nome)}</span><textarea class="inp" data-k="gravidades.${i}.criterio" aria-label="Critério ${esc(g.nome)}" ${dis}>${esc(g.criterio)}</textarea><label class="fld"><input class="inp" type="number" min="0" max="90" data-k="gravidades.${i}.prazo" value="${esc(g.prazo)}" aria-label="Prazo em dias" ${dis}></label></div>`).join('')}</div>
      <p class="hint">Último campo: prazo para solução, em dias.</p></div>
    <div class="card" style="grid-column:1/-1"><div class="card-h"><h3>Tipos de ocorrência</h3><span class="sub">o critério aparece como dica no formulário</span></div>
      <div class="rows">${c.tipos.map((t, i) => `<div class="rowi t"><input class="inp" data-k="tipos.${i}.nome" value="${esc(t.nome)}" aria-label="Tipo" ${dis}><textarea class="inp" data-k="tipos.${i}.criterio" aria-label="Critério" ${dis}>${esc(t.criterio)}</textarea>${ro ? '<span></span>' : `<button class="x" type="button" data-rm="tipos.${i}" aria-label="Remover tipo">✕</button>`}</div>`).join('')}</div>
      ${ro ? '' : '<button class="btn sm" type="button" data-add="tipos" style="margin-top:10px">Adicionar tipo</button>'}</div>
    ${listBox('operadores', 'Operadores do CCO', 'quem preenche · um por linha')}
    ${listBox('tecnicos', 'Técnicos', 'manutenção de câmeras · um por linha')}
    ${listBox('frentes', 'Frentes', 'como a ocorrência foi vista · uma por linha')}
    ${listBox('camProblemas', 'Problemas de câmera', 'um por linha')}
    <div class="card" style="grid-column:1/-1"><div class="card-h"><h3>Status</h3><span class="sub">fixos, porque definem quando a ocorrência conta como concluída</span></div>
      <p style="margin:0">Ocorrências: ${c.status.map(s => chip(s, STATUS_CHIP)).join(' ')}</p>
      <p style="margin:8px 0 0">Câmeras: ${c.camStatus.map(s => chip(s, STATUS_CHIP)).join(' ')}</p>
      <p class="hint">Contam como concluídas: Resolvido e Encerrado sem ação (ocorrências); Resolvido e Cancelado (câmeras). Faixas horárias: madrugada 0h–6h, manhã 6h–12h, tarde 12h–18h, noite 18h–24h.</p></div>
  </div>`;
  marcarPendente();
}
/* Cadastros com alterações não salvas: aviso ao lado de "Salvar cadastros", ponto na aba,
   "Sair" pede confirmação e o navegador pergunta antes de fechar ou recarregar a página. */
function cadPendente() {
  if (!S.cadDraft || !S.canAdmin || S.noDb) return false;
  const chaves = ['postos', 'tipos', 'gravidades', 'operadores', 'tecnicos', 'frentes', 'camProblemas'];
  const f = c => JSON.stringify(chaves.map(k => (k === 'postos' || k === 'tipos') ? (c[k] || []).filter(x => x.nome) : c[k]));
  return f(S.cadDraft) !== f(S.cfg);
}
function marcarPendente() {
  S.cadPend = cadPendente();
  $('#cad-pend').hidden = !S.cadPend;
  const aba = $('nav.tabs a[href="#cadastros"]'); if (aba) aba.classList.toggle('pend', S.cadPend);
}
window.addEventListener('beforeunload', e => { if (S.cadPend) { e.preventDefault(); e.returnValue = ''; } });
/* ---------- usuários (administrador) ---------- */
const PAPEL_NOME = { admin: 'Administrador', operador: 'Operador do CCO', gerente: 'Gerente de posto', leitura: 'Somente leitura' };
async function carregarUsuarios() {
  try { S.usuarios = await api('GET', '/api/usuarios'); } catch (e) { S.usuarios = []; }
  rUsers(true);
}
function rUsers(force) {
  const box = $('#u-body'); if (!box) return;
  if (!force && S.uEdit && $('#u-save')) return;
  if (!S.canAdmin) { box.innerHTML = ''; return; }
  if (!S.usuarios) { box.innerHTML = '<div class="card" style="margin-top:16px"><p class="muted">Carregando usuários…</p></div>'; carregarUsuarios(); return; }
  const ed = S.uEdit === 'novo' ? { login: '', nome: '', papel: 'operador', postos: [], ativo: true } : (S.usuarios.find(u => u.id === S.uEdit) || null);
  const form = ed ? `<div class="u-form">
      <div class="fld"><label class="lbl" for="u-login">Login</label><input class="inp" id="u-login" value="${esc(ed.login)}" ${ed.id ? 'disabled' : ''} autocapitalize="none" placeholder="ex.: leila"></div>
      <div class="fld"><label class="lbl" for="u-nome">Nome</label><input class="inp" id="u-nome" value="${esc(ed.nome)}"></div>
      <div class="fld"><label class="lbl" for="u-papel">Perfil</label><select class="inp" id="u-papel">${opts(Object.entries(PAPEL_NOME), ed.papel, null)}</select></div>
      <div class="fld">${ed.id ? `<label class="checks"><label><input type="checkbox" id="u-ativo" ${ed.ativo ? 'checked' : ''}> Ativo</label><label><input type="checkbox" id="u-redef"> Gerar nova senha</label></label>` : '<span class="hint">Uma senha temporária será gerada.</span>'}</div>
      <div class="fld full" id="u-postos-box" ${ed.papel === 'gerente' ? '' : 'hidden'}><span class="lbl">Postos que o gerente acompanha</span><div class="checks">${postosList().map(p => `<label><input type="checkbox" name="u-posto" value="${esc(p)}" ${ed.postos.includes(p) ? 'checked' : ''}> ${esc(p)}</label>`).join('')}</div></div>
      <div class="fld full" style="flex-direction:row;gap:10px;align-items:center"><button class="btn pri sm" type="button" id="u-save">${ed.id ? 'Salvar usuário' : 'Criar usuário'}</button><button class="btn sm" type="button" id="u-cancel">Cancelar</button><span class="ferr" id="u-err"></span></div>
    </div>` : '';
  const tmp = S.senhaTmp ? `<div class="senha-tmp">Senha temporária de <b>${esc(S.senhaTmp.login)}</b>: <code id="u-tmp">${esc(S.senhaTmp.senha)}</code><button class="btn sm" type="button" id="u-copy">Copiar</button><span>Passe para a pessoa; ela troca no primeiro acesso.</span></div>` : '';
  box.innerHTML = `<div class="card" style="margin-top:16px"><div class="card-h"><h3>Usuários</h3><button class="btn sm" type="button" id="u-novo">Novo usuário</button></div>
    <div class="tbl-wrap"><table class="tbl" style="min-width:640px"><thead><tr><th>Nome</th><th>Login</th><th>Perfil</th><th>Postos</th><th>Situação</th><th></th></tr></thead><tbody>
    ${S.usuarios.map(u => `<tr><td>${esc(u.nome)}</td><td class="mono">${esc(u.login)}</td><td>${esc(PAPEL_NOME[u.papel] || u.papel)}</td><td style="font-size:13px">${esc(u.papel === 'gerente' ? u.postos.join(', ') : 'Todos')}</td><td>${u.ativo ? '<span class="chip ok">Ativo</span>' : '<span class="chip">Inativo</span>'}</td><td><button class="btn ghost sm" type="button" data-uedit="${esc(u.id)}">Editar</button></td></tr>`).join('')}
    </tbody></table></div>${tmp}${form}</div>`;
}
async function saveUser() {
  const ed = S.uEdit;
  const body = { nome: $('#u-nome').value.trim(), papel: $('#u-papel').value, postos: $$('input[name="u-posto"]:checked').map(x => x.value) };
  if (body.papel !== 'gerente') body.postos = [];
  let r;
  try {
    if (ed === 'novo') { body.login = $('#u-login').value.trim().toLowerCase(); r = await api('POST', '/api/usuarios', body); }
    else { body.ativo = $('#u-ativo').checked; body.redefinirSenha = $('#u-redef').checked; r = await api('PUT', '/api/usuarios/' + ed, body); }
  } catch (e) { $('#u-err').textContent = errMsg(e); return; }
  const login = ed === 'novo' ? body.login : (S.usuarios.find(u => u.id === ed) || {}).login;
  S.usuarios = r.usuarios; S.uEdit = null;
  S.senhaTmp = r.senhaTemporaria ? { login, senha: r.senhaTemporaria } : null;
  rUsers(true); toast(ed === 'novo' ? 'Usuário criado' : 'Usuário atualizado');
}
/* ---------- lixeira e desfazer ----------
   Ocorrências e câmeras excluídas vão para a lixeira do servidor. Quem pode excluir vê a lista
   em Cadastros e restaura com um clique; logo depois de excluir, o aviso também traz "Desfazer". */
let lxPedido = null;
function carregarLixeira() {
  if (!lxPedido) lxPedido = api('GET', '/api/lixeira').then(r => { S.lixeira = r; }, () => { S.lixeira = S.lixeira || []; })
    .then(() => { lxPedido = null; rLixeira(); });
  return lxPedido;
}
function rLixeira() {
  const box = $('#lx-body'); if (!box) return;
  if (!S.perm.exclui || S.noDb) { box.innerHTML = ''; return; }
  if (!S.lixeira) { box.innerHTML = '<div class="card" style="margin-top:16px"><p class="muted">Carregando lixeira…</p></div>'; carregarLixeira(); return; }
  const corta = s => s.length > 160 ? s.slice(0, 159) + '…' : s;
  const linhas = S.lixeira.map(x => `<tr><td class="mono" style="white-space:nowrap">${esc(fmtDH(x.excluidoEm))}</td>
    <td style="white-space:nowrap">${x.tabela === 'ocorrencias' ? 'Ocorrência' : 'Câmera'} nº ${esc(x.n)}<div class="muted" style="font-size:12.5px">evento ${esc(fmtD(x.data))}</div></td>
    <td>${esc(x.posto)}</td><td style="font-size:13.5px">${esc(corta(x.resumo))}</td><td>${esc(x.excluidoPor)}</td>
    <td><button class="btn sm" type="button" data-lxrest="${esc(x.id)}">Restaurar</button></td></tr>`).join('');
  box.innerHTML = `<div class="card" style="margin-top:16px"><div class="card-h"><h3>Lixeira</h3><span class="sub">ocorrências e defeitos de câmera excluídos · ficam aqui até alguém restaurar</span></div>
    ${S.lixeira.length ? `<div class="tbl-wrap"><table class="tbl" style="min-width:760px"><thead><tr><th>Excluído em</th><th>Registro</th><th>Posto</th><th>Resumo</th><th>Excluído por</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>`
      : '<p class="muted" style="margin:0">Nenhum registro excluído.</p>'}</div>`;
}
async function restaurar(lxId) {
  try {
    const r = await api('POST', `/api/lixeira/${encodeURIComponent(lxId)}/restaurar`);
    toast(r.tabela === 'ocorrencias' ? `Ocorrência nº ${r.registro.n} restaurada` : `Defeito nº ${r.registro.n} restaurado`);
  } catch (e) { toast(errMsg(e)); }
  carregar(); if (S.lixeira) carregarLixeira();
}
// Devolve à ocorrência os prints que foram tirados ao salvar, na ordem original.
async function devolverPrints(id, orig, tirados) {
  if (carregando) await carregando;
  const reg = S.ocsRaw.find(x => x.id === id);
  if (!reg) { toast('Essa ocorrência não existe mais.'); return; }
  const atuais = reg.anexos || [];
  const anexos = orig.filter(a => atuais.includes(a) || tirados.includes(a)).concat(atuais.filter(a => !orig.includes(a))).slice(0, 10);
  try { await api('PUT', `/api/ocorrencias/${id}`, { anexos }); toast(tirados.length === 1 ? 'Print devolvido à ocorrência' : 'Prints devolvidos à ocorrência'); carregar(); }
  catch (e) { toast(errMsg(e)); }
}

function cadSync() {
  const c = S.cadDraft;
  $$('#k-body [data-k]').forEach(el => { const [a, i, k] = el.dataset.k.split('.'); c[a][+i][k] = k === 'prazo' ? Math.max(0, parseInt(el.value, 10) || 0) : el.value.trim(); });
  $$('#k-body [data-list]').forEach(el => { c[el.dataset.list] = el.value.split('\n').map(s => s.trim()).filter(Boolean); });
}
async function saveCad() {
  cadSync();
  const c = S.cadDraft;
  c.postos = c.postos.filter(p => p.nome); c.tipos = c.tipos.filter(t => t.nome);
  const dup = arr => arr.find((v, i) => arr.indexOf(v) !== i);
  const d1 = dup(c.postos.map(p => p.nome)), d2 = dup(c.tipos.map(t => t.nome));
  if (d1 || d2) { toast(`Nome repetido: ${d1 || d2}. Ajuste antes de salvar.`); return; }
  const btn = $('#btn-cad'); btn.disabled = true; btn.textContent = 'Salvando…';
  try { await api('PUT', '/api/cadastros', c); S.cadDirty = false; toast('Cadastros salvos'); await carregar(); }
  catch (e) { toast(errMsg(e)); }
  finally { btn.disabled = false; btn.textContent = 'Salvar cadastros'; }
}

/* ---------- formulário da gaveta ---------- */
function field(id, label, ctl, cls = '', hint = '') { return `<div class="fld ${cls}"><label class="lbl" for="${id}">${label}</label>${ctl}${hint ? `<div class="hint" id="${id}-h">${hint}</div>` : ''}<div class="ferr" id="${id}-e"></div></div>`; }
const inp = (id, name, val, type = 'text', extra = '') => `<input class="inp" id="${id}" name="${name}" type="${type}" value="${esc(val || '')}" ${extra}>`;
const sel = (id, name, list, val, empty = 'Selecione…') => `<select class="inp" id="${id}" name="${name}">${opts(listOf(list, [val]), val || '', empty)}</select>`;
function openDrawer(kind, id) {
  const isOc = kind === 'oc';
  const src = id ? (isOc ? S.D : S.C).find(x => x.id === id) : null;
  if (id && !src) return;
  const podeEditar = !!(S.perm.edita || (!id && S.perm.registra));
  const limit = isOc && !!id && !podeEditar && !!S.perm.retorno; // gerente: só o retorno
  const ro = S.noDb || (!podeEditar && !limit);
  S.dr = { kind, id: id || null, src, anexos: (src && src.anexos ? src.anexos.slice() : []), confirmDel: false, ro, limit };
  $('#dr-title').textContent = isOc ? (src ? `Ocorrência nº ${src.n || ''}` : 'Nova ocorrência') : (src ? `Defeito de câmera nº ${src.n || ''}` : 'Registrar defeito de câmera');
  $('#dr-meta').textContent = src ? `${src.posto} · ${fmtD(src.data)}` : (isOc ? 'Preencha o que foi observado. Duração, faixa, gerente e prazo são calculados.' : 'Prazo calculado pela gravidade.');
  $('#dr-form').innerHTML = isOc ? formOc(src) : formCam(src);
  if (ro) $$('#dr-form input, #dr-form select, #dr-form textarea').forEach(el => el.disabled = true);
  else if (limit) $$('#dr-form input, #dr-form select, #dr-form textarea').forEach(el => { if (!['f-status', 'f-dataSolucao', 'f-retorno'].includes(el.id)) el.disabled = true; });
  renderFoot();
  updCalc();
  if (isOc) renderAtt();
  if (src && src.historico) renderHist(src.historico);
  $('#drawer').classList.add('open'); $('#scrim').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => { const f = src ? $('#dr-x') : $('#dr-form .inp:not([disabled])'); f && f.focus(); }, 60);
}
function closeDrawer() { $('#drawer').classList.remove('open'); $('#scrim').classList.remove('open'); document.body.style.overflow = ''; S.dr = null; }
function formOc(o) {
  const v = o || { data: today(), hIni: '', hFim: '', dataFim: '', posto: '', camera: '', tipo: '', gravidade: '', frente: S.cfg.frentes[0] || '', descricao: '', dataAnalise: today(), horaAnalise: nowHM(), registradoPor: store.get('cco.op') || S.cfg.operadores[0] || '', encaminhamento: '', status: 'Encaminhado', dataSolucao: '', retorno: '' };
  const camList = Array.from(new Set(S.C.filter(c => !v.posto || c.posto === v.posto).map(c => c.camera).filter(Boolean)));
  return `<fieldset><legend>Quando aconteceu</legend><div class="fg">
      ${field('f-data', 'Data do evento', inp('f-data', 'data', v.data, 'date', 'required'))}
      ${field('f-dataFim', 'Data final', inp('f-dataFim', 'dataFim', v.dataFim, 'date'), '', 'Só se terminou em outro dia.')}
      ${field('f-hIni', 'Hora inicial', inp('f-hIni', 'hIni', v.hIni, 'time', 'required'))}
      ${field('f-hFim', 'Hora final', inp('f-hFim', 'hFim', v.hFim, 'time'))}
      <div class="calc full" id="calc-q"></div></div></fieldset>
    <fieldset><legend>Onde e o quê</legend><div class="fg">
      ${field('f-posto', 'Posto', sel('f-posto', 'posto', postosList(), v.posto))}
      ${field('f-camera', 'Câmera / canal', inp('f-camera', 'camera', v.camera, 'text', 'list="cam-dl" placeholder="Ex.: Bomba 17-18" autocomplete="off"') + `<datalist id="cam-dl">${camList.map(c => `<option value="${esc(c)}">`).join('')}</datalist>`)}
      ${field('f-tipo', 'Tipo de ocorrência', sel('f-tipo', 'tipo', tiposList(), v.tipo), 'full', ' ')}
      <div class="fld full"><span class="lbl" id="f-grav-l">Gravidade</span><div class="segr" role="radiogroup" aria-labelledby="f-grav-l">${GRAVS.map(g => `<label><input type="radio" name="gravidade" value="${g}" ${v.gravidade === g ? 'checked' : ''}><i class="sw ${GCLS[g]}"></i>${g}</label>`).join('')}</div><div class="hint" id="f-grav-h"></div><div class="ferr" id="f-grav-e"></div></div>
      ${field('f-frente', 'Frente', sel('f-frente', 'frente', S.cfg.frentes, v.frente), 'full')}
    </div></fieldset>
    <fieldset><legend>Descrição</legend><div class="fg">
      ${field('f-descricao', 'O que foi observado', `<textarea class="inp" id="f-descricao" name="descricao" rows="4" placeholder="Ex.: Caminhão aguardou 4 min até o primeiro contato do frentista.">${esc(v.descricao)}</textarea>`, 'full', 'Descreva o fato, sem presumir motivos.')}
      <div class="fld full" id="att-box"></div></div></fieldset>
    <fieldset><legend>Análise <small>quando a ronda ou a gravação foi vista</small></legend><div class="fg">
      ${field('f-dataAnalise', 'Data da análise', inp('f-dataAnalise', 'dataAnalise', v.dataAnalise, 'date'))}
      ${field('f-horaAnalise', 'Hora da análise', inp('f-horaAnalise', 'horaAnalise', v.horaAnalise, 'time'))}
      ${field('f-registradoPor', 'Registrado por', sel('f-registradoPor', 'registradoPor', S.cfg.operadores, v.registradoPor), 'full')}
    </div></fieldset>
    <fieldset><legend>Encaminhamento</legend><div class="fg">
      ${field('f-encaminhamento', 'Ação solicitada', `<textarea class="inp" id="f-encaminhamento" name="encaminhamento" rows="2" placeholder="Ex.: Orientar a equipe de pista sobre liberação da bomba.">${esc(v.encaminhamento)}</textarea>`, 'full')}
      ${field('f-gerente', 'Gerente acionado', `<input class="inp" id="f-gerente" readonly value="${esc(gerenteDe(v.posto))}">`)}
      ${field('f-status', 'Status', sel('f-status', 'status', S.cfg.status, v.status, null))}
    </div></fieldset>
    <fieldset id="fs-ret"><legend>Retorno do gerente</legend><div class="fg">
      ${field('f-dataSolucao', 'Data da solução', inp('f-dataSolucao', 'dataSolucao', v.dataSolucao, 'date'))}
      <div class="fld" style="justify-content:end">${o && (S.perm.edita || S.perm.retorno) && !S.noDb ? '<button class="btn sm" type="button" id="f-resolve">Marcar como resolvida hoje</button>' : ''}</div>
      ${field('f-retorno', 'Retorno / solução adotada', `<textarea class="inp" id="f-retorno" name="retorno" rows="3" placeholder="O que o posto fez a respeito.">${esc(v.retorno)}</textarea>`, 'full')}
      <div class="calc full" id="calc-p"></div></div></fieldset>
    ${o ? `<fieldset><legend>Histórico</legend><ul class="hist" id="hist"></ul></fieldset>` : ''}`;
}
function formCam(c) {
  const v = c || { data: today(), posto: '', camera: '', gravador: '', problema: '', detalhe: '', gravidade: '', status: 'Aberto', tecnico: S.cfg.tecnicos[0] || '', dataExecucao: '', solucao: '', registradoPor: store.get('cco.op') || S.cfg.operadores[0] || '' };
  const gravs = Array.from(new Set(S.C.map(x => x.gravador).filter(Boolean))).sort();
  const cams = Array.from(new Set(S.C.map(x => x.camera).filter(Boolean))).sort();
  return `<fieldset><legend>Levantamento</legend><div class="fg">
      ${field('c-data', 'Data do levantamento', inp('c-data', 'data', v.data, 'date'))}
      ${field('c-posto', 'Posto', sel('c-posto', 'posto', postosList(), v.posto))}
      ${field('c-camera', 'Câmera / canal', inp('c-camera', 'camera', v.camera, 'text', 'list="cc-dl" autocomplete="off" placeholder="Ex.: Caixa 5-6"') + `<datalist id="cc-dl">${cams.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`)}
      ${field('c-gravador', 'Gravador', inp('c-gravador', 'gravador', v.gravador, 'text', 'list="cg-dl" autocomplete="off" placeholder="Ex.: DVR 1"') + `<datalist id="cg-dl">${gravs.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`)}
      ${field('c-problema', 'Problema identificado', sel('c-problema', 'problema', S.cfg.camProblemas, v.problema))}
      <div class="fld"><span class="lbl" id="c-grav-l">Gravidade</span><div class="segr" role="radiogroup" aria-labelledby="c-grav-l">${GRAVS.map(g => `<label><input type="radio" name="gravidade" value="${g}" ${v.gravidade === g ? 'checked' : ''}><i class="sw ${GCLS[g]}"></i>${g}</label>`).join('')}</div><div class="ferr" id="c-grav-e"></div></div>
      ${field('c-detalhe', 'Detalhe / observação', `<textarea class="inp" id="c-detalhe" name="detalhe" rows="2">${esc(v.detalhe)}</textarea>`, 'full')}
      ${field('c-registradoPor', 'Registrado por', sel('c-registradoPor', 'registradoPor', S.cfg.operadores, v.registradoPor), 'full')}
    </div></fieldset>
    <fieldset><legend>Execução</legend><div class="fg">
      ${field('c-tecnico', 'Técnico responsável', sel('c-tecnico', 'tecnico', S.cfg.tecnicos, v.tecnico))}
      ${field('c-status', 'Status', sel('c-status', 'status', S.cfg.camStatus, v.status, null))}
      ${field('c-dataExecucao', 'Data da execução', inp('c-dataExecucao', 'dataExecucao', v.dataExecucao, 'date'))}
      <div class="fld"></div>
      ${field('c-solucao', 'Solução adotada / peças trocadas', `<textarea class="inp" id="c-solucao" name="solucao" rows="2">${esc(v.solucao)}</textarea>`, 'full')}
      <div class="calc full" id="calc-p"></div></div></fieldset>
    ${c ? `<fieldset><legend>Histórico</legend><ul class="hist" id="hist"></ul></fieldset>` : ''}`;
}
function formVals() {
  const fd = new FormData($('#dr-form')); const o = {};
  for (const [k, v] of fd.entries()) o[k] = typeof v === 'string' ? v.trim() : v;
  return o;
}
function updCalc() {
  if (!S.dr || S.dr.kind === 'senha') return;
  const v = Object.assign({}, S.dr.src || {}, formVals());
  if (S.dr.kind === 'oc') {
    const x = deriveOc(Object.assign({}, v, { status: v.status || 'Encaminhado' }));
    $('#calc-q').innerHTML = `<span>Dia <b>${x.dow != null ? DOW[x.dow] : '–'}</b></span><span>Faixa <b>${esc(x.faixa || '–')}</b></span><span>Duração <b>${fmtDur(x.dur)}</b></span>`;
    $('#calc-p').innerHTML = `<span>Prazo limite <b>${fmtD(x.prazo)}</b></span><span>Dias em aberto <b>${x.dias ?? '–'}</b></span><span>Situação ${chip(x.situacao, PRAZO_CHIP)}</span>`;
    $('#f-gerente').value = gerenteDe(v.posto);
    const t = S.cfg.tipos.find(t => t.nome === v.tipo); $('#f-tipo-h').textContent = t ? t.criterio : '';
    const g = S.cfg.gravidades.find(g => g.nome === v.gravidade); $('#f-grav-h').textContent = g ? `${g.criterio}${g.criterio ? ' ' : ''}Prazo: ${g.prazo} dia${g.prazo == 1 ? '' : 's'}.` : '';
    const camList = Array.from(new Set(S.C.filter(c => !v.posto || c.posto === v.posto).map(c => c.camera).filter(Boolean)));
    const dl = $('#cam-dl'); if (dl) dl.innerHTML = camList.map(c => `<option value="${esc(c)}">`).join('');
  } else {
    const x = deriveCam(v);
    $('#calc-p').innerHTML = `<span>Prazo limite <b>${fmtD(x.prazo)}</b></span><span>Dias em aberto <b>${x.dias ?? '–'}</b></span><span>Situação ${chip(x.situacao, PRAZO_CHIP)}</span>`;
  }
}
function renderAtt() {
  const box = $('#att-box'); if (!box || !S.dr) return;
  const ro = S.dr.ro || S.dr.limit;
  const thumbs = S.dr.anexos.map((id, i) => `<figure${id === '…' ? ' class="up"' : ''}>${id === '…' ? '' : `<img src="/api/anexos/${esc(id)}" alt="Anexo ${i + 1}" data-zoom="${esc(id)}">`}${ro || id === '…' ? '' : `<button type="button" data-rmatt="${i}" aria-label="Remover anexo">✕</button>`}</figure>`).join('');
  const ctl = ro ? '' : `<div class="drop" id="drop"><label class="btn sm" for="f-file">Anexar imagem</label><input id="f-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden><span>ou cole um print da câmera aqui com Ctrl+V</span></div>`;
  if (ro && !thumbs) { box.innerHTML = ''; return; }
  box.innerHTML = `<span class="lbl">Prints da câmera</span>${thumbs ? `<div class="att">${thumbs}</div>` : ''}${ctl}<div class="ferr" id="att-e"></div>`;
}
async function uploadFiles(files) {
  if (!S.dr || S.dr.ro || S.dr.limit) return;
  for (const f of files) {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) { $('#att-e').textContent = 'Só imagens PNG, JPG, WEBP ou GIF.'; continue; }
    if (f.size > 10 * 1024 * 1024) { $('#att-e').textContent = 'Imagem grande demais (limite de 10 MB).'; continue; }
    const dr = S.dr; dr.anexos.push('…'); renderAtt();
    try {
      const r = await fetch('/api/anexos', { method: 'POST', headers: { 'Content-Type': f.type }, body: f, credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw { status: r.status, erro: j.erro };
      const i = dr.anexos.indexOf('…'); if (i >= 0) dr.anexos[i] = j.id;
    } catch (e) {
      const i = dr.anexos.indexOf('…'); if (i >= 0) dr.anexos.splice(i, 1);
      if (S.dr === dr) { renderAtt(); $('#att-e').textContent = (e && e.erro) || 'Não foi possível enviar a imagem. Tente de novo.'; }
      continue;
    }
    if (S.dr === dr) renderAtt();
  }
}
async function renderHist(h) {
  const ul = $('#hist'); if (!ul) return;
  const items = h.slice().reverse();
  ul.innerHTML = '';
  items.forEach(x => {
    const li = document.createElement('li');
    const t = document.createElement('time'); const d = new Date(x.em);
    t.textContent = isNaN(d) ? '' : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const s = document.createElement('div'); s.textContent = x.txt || '';
    if (x.por || x.porNome) { const w = document.createElement('div'); w.className = 'who'; w.textContent = x.porNome || 'Usuário da plataforma'; s.appendChild(w); }
    li.append(t, s); ul.appendChild(li);
  });
}
function renderFoot() {
  const f = $('#dr-foot'), dr = S.dr; if (!dr) return;
  if (dr.ro) { f.innerHTML = `<span class="err" style="color:var(--ink-2)">${S.noDb ? 'Sem conexão com o servidor.' : 'Seu perfil só pode consultar este registro.'}</span><button class="btn" type="button" data-close>Fechar</button>`; return; }
  if (dr.confirmDel) { f.innerHTML = `<span class="err">Excluir este registro? Não dá para desfazer.</span><button class="btn" type="button" id="del-no">Cancelar</button><button class="btn danger" type="button" id="del-yes">Excluir</button>`; return; }
  const rotulo = dr.kind === 'senha' ? 'Trocar senha' : dr.limit ? 'Salvar retorno' : dr.id ? 'Salvar alterações' : 'Registrar';
  f.innerHTML = `<span class="err" id="dr-err"></span>${dr.id && S.perm.exclui ? '<button class="btn ghost" type="button" id="del-ask">Excluir</button>' : ''}<button class="btn" type="button" data-close>Cancelar</button><button class="btn pri" type="submit" form="dr-form" id="dr-save">${rotulo}</button>`;
}
function validate(v, kind) {
  const errs = {};
  const req = kind === 'oc' ? { 'f-data': v.data, 'f-hIni': v.hIni, 'f-posto': v.posto, 'f-tipo': v.tipo, 'f-grav': v.gravidade, 'f-frente': v.frente, 'f-descricao': v.descricao }
    : { 'c-data': v.data, 'c-posto': v.posto, 'c-camera': v.camera, 'c-problema': v.problema, 'c-grav': v.gravidade };
  Object.entries(req).forEach(([k, val]) => { if (!val) errs[k] = 'Campo obrigatório.'; });
  if (kind === 'oc') {
    if (v.dataFim && v.data && v.dataFim < v.data) errs['f-dataFim'] = 'A data final não pode ser antes da data do evento.';
    if (v.dataSolucao && v.data && v.dataSolucao < v.data) errs['f-dataSolucao'] = 'A solução não pode ser antes do evento.';
  } else if (v.dataExecucao && v.data && v.dataExecucao < v.data) errs['c-dataExecucao'] = 'A execução não pode ser antes do levantamento.';
  $$('#dr-form .ferr').forEach(e => e.textContent = '');
  Object.entries(errs).forEach(([k, m]) => { const e = $('#' + k + '-e'); if (e) e.textContent = m; });
  const first = Object.keys(errs)[0];
  if (first) { const el = $('#' + first) || $(`#dr-form [name="gravidade"]`); el && el.focus(); }
  return !first;
}
function histText(old, nw, kind) {
  const out = [];
  if (old.status !== nw.status) out.push(`Status: ${old.status || '–'} → ${nw.status}`);
  if (kind === 'oc') {
    if (!(old.retorno || '') && nw.retorno) out.push('Retorno do gerente registrado');
    else if ((old.retorno || '') !== (nw.retorno || '')) out.push('Retorno alterado');
    if ((old.dataSolucao || '') !== (nw.dataSolucao || '') && nw.dataSolucao) out.push('Data da solução: ' + fmtD(nw.dataSolucao));
    if ((old.anexos || []).join() !== (nw.anexos || []).join()) out.push(`Prints: ${(nw.anexos || []).length}`);
  } else if ((old.dataExecucao || '') !== (nw.dataExecucao || '') && nw.dataExecucao) out.push('Executada em ' + fmtD(nw.dataExecucao));
  const keys = kind === 'oc' ? ['data', 'hIni', 'hFim', 'dataFim', 'posto', 'camera', 'tipo', 'gravidade', 'frente', 'descricao', 'encaminhamento', 'dataAnalise', 'horaAnalise', 'registradoPor']
    : ['data', 'posto', 'camera', 'gravador', 'problema', 'detalhe', 'gravidade', 'tecnico', 'solucao', 'registradoPor'];
  const ch = keys.filter(k => (old[k] || '') !== (nw[k] || ''));
  if (ch.length) out.push('Editado: ' + ch.map(k => LBL[k]).join(', '));
  return out.join(' · ');
}
async function saveDrawer(ev) {
  ev.preventDefault();
  const dr = S.dr; if (!dr || dr.ro || S.noDb) return;
  if (dr.kind === 'senha') return saveSenha();
  if (dr.anexos.includes('…')) { $('#dr-err').textContent = 'Aguarde o envio das imagens terminar.'; return; }
  const v = Object.assign({}, dr.src ? pick(dr.src, CAMPOS[dr.kind]) : {}, formVals());
  if (!validate(v, dr.kind)) { $('#dr-err').textContent = 'Revise os campos marcados.'; return; }
  const coll = dr.kind === 'oc' ? 'ocorrencias' : 'cameras';
  let body = pick(v, CAMPOS[dr.kind]);
  if (dr.kind === 'oc') body.anexos = dr.anexos.slice();
  if (dr.limit) body = pick(v, ['status', 'dataSolucao', 'retorno']);
  if (v.registradoPor) store.set('cco.op', v.registradoPor);
  const btn = $('#dr-save'); const txt = btn.textContent; btn.disabled = true; btn.textContent = 'Salvando…';
  try {
    const r = dr.id ? await api('PUT', `/api/${coll}/${dr.id}`, body) : await api('POST', `/api/${coll}`, body);
    closeDrawer();
    const orig = (dr.src && dr.src.anexos) || [];
    const tirados = dr.id && body.anexos ? orig.filter(a => !body.anexos.includes(a)) : [];
    if (tirados.length) toast(`Alterações salvas · ${tirados.length === 1 ? '1 print removido' : tirados.length + ' prints removidos'}.`, () => devolverPrints(dr.id, orig, tirados));
    else toast(dr.id ? 'Alterações salvas' : (dr.kind === 'oc' ? `Ocorrência nº ${r.n} registrada` : `Defeito nº ${r.n} registrado`));
    carregar();
  } catch (e) { if ($('#dr-err')) $('#dr-err').textContent = errMsg(e); btn.disabled = false; btn.textContent = txt; }
}
const CAMPOS = {
  oc: ['data', 'hIni', 'hFim', 'dataFim', 'posto', 'camera', 'tipo', 'gravidade', 'frente', 'descricao', 'dataAnalise', 'horaAnalise', 'encaminhamento', 'status', 'dataSolucao', 'retorno', 'registradoPor'],
  cam: ['data', 'posto', 'tecnico', 'camera', 'gravador', 'problema', 'detalhe', 'gravidade', 'status', 'dataExecucao', 'solucao', 'registradoPor'],
};
const pick = (o, ks) => Object.fromEntries(ks.map(k => [k, o[k] == null ? '' : String(o[k])]));
function errMsg(e) {
  if (e && e.erro) return e.erro;
  if (e && e.status === 401) return 'Sua sessão expirou. Entre de novo.';
  return 'Não foi possível salvar. Verifique a conexão com o servidor e tente de novo.';
}

/* ---------- trocar a própria senha ---------- */
function openSenha() {
  S.dr = { kind: 'senha', id: null, src: null, anexos: [], ro: false, limit: false };
  $('#dr-title').textContent = 'Trocar senha';
  $('#dr-meta').textContent = S.me ? `${S.me.nome} · ${S.me.login}` : '';
  $('#dr-form').innerHTML = `<fieldset><div class="fg">
    ${field('s-atual', 'Senha atual', '<input class="inp" id="s-atual" name="atual" type="password" autocomplete="current-password">', 'full')}
    ${field('s-nova', 'Nova senha', '<input class="inp" id="s-nova" name="nova" type="password" autocomplete="new-password">', 'full', 'Pelo menos 8 caracteres.')}
    ${field('s-conf', 'Repita a nova senha', '<input class="inp" id="s-conf" name="conf" type="password" autocomplete="new-password">', 'full')}
  </div></fieldset>`;
  renderFoot();
  $('#drawer').classList.add('open'); $('#scrim').classList.add('open'); document.body.style.overflow = 'hidden';
  setTimeout(() => $('#s-atual').focus(), 60);
}
async function saveSenha() {
  const v = formVals();
  $$('#dr-form .ferr').forEach(e => e.textContent = '');
  if (!v.atual) { $('#s-atual-e').textContent = 'Informe a senha atual.'; return; }
  if ((v.nova || '').length < 8) { $('#s-nova-e').textContent = 'Use pelo menos 8 caracteres.'; return; }
  if (v.nova !== v.conf) { $('#s-conf-e').textContent = 'As senhas não conferem.'; return; }
  try { await api('PUT', '/api/me/senha', { atual: v.atual, nova: v.nova }); closeDrawer(); toast('Senha trocada'); }
  catch (e) { $('#dr-err').textContent = errMsg(e); }
}

/* ---------- exportações ---------- */
function exportCsv() {
  const list = filtOcList();
  const cols = [['Nº', o => o.n], ['Data do evento', o => fmtD(o.data)], ['Hora inicial', o => o.hIni], ['Hora final', o => o.hFim], ['Data final', o => o.dataFim ? fmtD(o.dataFim) : ''], ['Dia da semana', o => o.dow != null ? DOW[o.dow] : ''], ['Faixa horária', o => o.faixa], ['Posto', o => o.posto], ['Câmera', o => o.camera], ['Tipo', o => o.tipo], ['Gravidade', o => o.gravidade], ['Frente', o => o.frente], ['Duração', o => fmtDur(o.dur)], ['Descrição', o => o.descricao], ['Data da análise', o => fmtD(o.dataAnalise)], ['Hora da análise', o => o.horaAnalise], ['Encaminhamento', o => o.encaminhamento], ['Gerente', o => o.gerente], ['Status', o => o.status], ['Data da solução', o => o.dataSolucao ? fmtD(o.dataSolucao) : ''], ['Retorno', o => o.retorno], ['Prazo limite', o => fmtD(o.prazo)], ['Dias em aberto', o => o.dias], ['Situação do prazo', o => o.situacao], ['Registrado por', o => o.registradoPor]];
  const q = v => { const s = String(v ?? ''); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = '﻿' + [cols.map(c => q(c[0])).join(';')].concat(list.map(o => cols.map(c => q(c[1](o))).join(';'))).join('\r\n');
  baixar(`ocorrencias-cco-${today()}.csv`, csv, 'text/csv;charset=utf-8');
}
function exportRep() { window.print(); }
function baixar(nome, conteudo, tipo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

/* ---------- estado geral ---------- */
function emptyState(kind) {
  if (S.noDb) return `<div class="card empty"><h3>Sem conexão com o servidor do CCO</h3><p>Verifique se o servidor está ligado e se este computador está na rede do CCO. A página tenta de novo sozinha.</p></div>`;
  const loading = kind === 'ocs' ? !S.loaded.ocs : !S.loaded.cams;
  if (loading) return `<div class="card empty"><h3>Carregando…</h3><p>Buscando os registros no servidor do CCO.</p></div>`;
  return kind === 'ocs'
    ? `<div class="card empty"><h3>Nenhuma ocorrência registrada ainda</h3><p>As ocorrências lançadas pelo CCO aparecem aqui${S.perm.registra ? '. Use <b>Nova ocorrência</b> para registrar a primeira' : ''}.</p></div>`
    : `<div class="card empty"><h3>Nenhum defeito de câmera registrado</h3><p>${S.perm.registra ? 'Use <b>Registrar defeito</b> para lançar o primeiro levantamento.' : 'Os defeitos levantados aparecem aqui.'}</p></div>`;
}
function renderConn() {
  const b = $('#conn'), t = $('#conn-t');
  let msg = '', cls = 'info';
  if (S.noDb) { msg = 'Sem conexão com o servidor do CCO. Tentando de novo…'; cls = 'warn'; }
  else if (S.stale) { msg = 'A atualização ao vivo caiu. O que aparece pode estar desatualizado; a página tenta reconectar sozinha.'; cls = 'warn'; }
  else if (S.me && S.me.papel === 'gerente') msg = `Você vê as ocorrências de ${S.me.postos.length === 1 ? 'seu posto' : 'seus postos'} e pode registrar o retorno de cada uma.`;
  else if (S.me && S.me.papel === 'leitura') msg = 'Seu perfil é somente leitura.';
  b.hidden = !msg; b.className = 'conn ' + cls; t.textContent = msg;
  $('#btn-new').hidden = !S.perm.registra || S.noDb;
}
const VIEWS = ['painel', 'ocorrencias', 'cameras', 'relatorio', 'cadastros'];
const view = () => { const h = location.hash.slice(1); return VIEWS.includes(h) ? h : 'painel'; };
const CTL = { painel: ctlPainel, ocorrencias: ctlOcs, cameras: ctlCams, relatorio: ctlRel };
const RND = { painel: rPainel, ocorrencias: rOcs, cameras: rCams, relatorio: rRel, cadastros: rCad };
let raf = 0;
function render() { cancelAnimationFrame(raf); raf = requestAnimationFrame(doRender); }
function doRender() {
  const v = view();
  $$('nav.tabs a').forEach(a => { if (a.getAttribute('href') === '#' + v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  VIEWS.forEach(x => { $('#v-' + x).hidden = x !== v; });
  renderConn();
  const key = v + ':' + S.cfgVer + ':' + (S.D.length ? 1 : 0);
  if (CTL[v] && S.built[v] !== key) { CTL[v](); S.built[v] = key; }
  if (v === 'cadastros' && S.cadDirty) return;
  RND[v]();
}
function rebuild(v) { S.built[v] = null; render(); }
S.cfgVer = 0;
// Aviso no rodapé. Com `desfazer`, o aviso traz o botão Desfazer e fica 10 segundos
// (o tempo para enquanto o mouse está em cima dele).
function toast(m, desfazer) {
  const t = $('#toast');
  t.textContent = m;
  toast._fim = desfazer ? 10000 : 3200;
  if (desfazer) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'toast-btn'; b.textContent = 'Desfazer';
    b.addEventListener('click', () => { clearTimeout(toast._t); t.classList.remove('on'); b.remove(); desfazer(); });
    t.append(b);
  }
  t.classList.add('on'); clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('on'), toast._fim);
}
$('#toast').addEventListener('mouseenter', () => { if ($('#toast .toast-btn')) clearTimeout(toast._t); });
$('#toast').addEventListener('mouseleave', () => { if ($('#toast .toast-btn') && $('#toast').classList.contains('on')) toast._t = setTimeout(() => $('#toast').classList.remove('on'), 4000); });

/* ---------- exclusão em dois cliques ----------
   Todo ✕ que exclui (data-rm, data-rmatt) pede confirmação ali mesmo, sem janela:
   o primeiro clique troca o ✕ por "Excluir?", o segundo exclui. Clicar fora, apertar Esc
   ou esperar 5 segundos cancela. */
let armado = null, armadoT = 0;
function armar(b, texto = 'Excluir?', rotulo = 'Confirmar exclusão') {
  desarmar();
  armado = b;
  b.dataset.txt = b.textContent; b.dataset.rotulo = b.getAttribute('aria-label') || '';
  b.classList.add('armed'); b.textContent = texto; b.setAttribute('aria-label', rotulo);
  const item = b.closest('.rowi, figure'); if (item) item.classList.add('armed');
  armadoT = setTimeout(desarmar, 5000);
}
function desarmar() {
  clearTimeout(armadoT);
  if (!armado) return;
  const b = armado; armado = null;
  b.classList.remove('armed'); b.textContent = b.dataset.txt;
  if (b.dataset.rotulo) b.setAttribute('aria-label', b.dataset.rotulo); else b.removeAttribute('aria-label');
  const item = b.closest('.rowi, figure'); if (item) item.classList.remove('armed');
}

/* ---------- eventos ---------- */
window.addEventListener('hashchange', () => { desarmar(); render(); window.scrollTo(0, 0); });
$('#btn-new').addEventListener('click', () => openDrawer('oc'));
$('#btn-newcam').addEventListener('click', () => openDrawer('cam'));
$('#btn-csv').addEventListener('click', exportCsv);
$('#btn-rep').addEventListener('click', exportRep);
$('#btn-cad').addEventListener('click', saveCad);
$('#dr-x').addEventListener('click', closeDrawer);
$('#scrim').addEventListener('click', closeDrawer);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (armado) desarmar(); else if ($('.lightbox')) $('.lightbox').remove(); else if (S.dr) closeDrawer(); }
  if (e.key === 'Enter' && e.target.matches && e.target.matches('tr[data-oc],tr[data-cam],.kpi.link')) e.target.click();
});
function bindFilters(root, st, prefix, after) {
  root.addEventListener('change', e => {
    const id = e.target.id; if (!id.startsWith(prefix)) return;
    if (id === 'of-q' || id === 'cf-q') return;
    const k = id.slice(prefix.length); st[k] = e.target.value;
    after && after();
    S.built[view()] = null; cancelAnimationFrame(raf); doRender();
    const again = document.getElementById(id); if (again) again.focus();
  });
}
bindFilters($('#pf'), S.pf, 'pf-');
bindFilters($('#of'), S.of, 'of-', () => { S.ocLimit = 100; });
bindFilters($('#cf'), S.cf, 'cf-');
bindFilters($('#rf'), S.rf, 'rf-');
let qT;
$('#of').addEventListener('input', e => { if (e.target.id !== 'of-q') return; clearTimeout(qT); qT = setTimeout(() => { S.of.q = e.target.value; S.ocLimit = 100; e.target.classList.toggle('f-active', !!e.target.value); render(); }, 160); });
$('#cf').addEventListener('input', e => { if (e.target.id !== 'cf-q') return; clearTimeout(qT); qT = setTimeout(() => { S.cf.q = e.target.value; e.target.classList.toggle('f-active', !!e.target.value); render(); }, 160); });
$('#of').addEventListener('click', e => { if (e.target.id === 'of-clear') { Object.assign(S.of, { q: '', per: 'tudo', de: '', ate: '', posto: '', tipo: '', grav: '', status: '', prazo: '' }); S.ocLimit = 100; rebuild('ocorrencias'); } });
document.addEventListener('click', e => {
  const t = e.target;
  const xb = t.closest('[data-rm],[data-rmatt]');
  const sair = t.closest('#btn-sair');
  if (armado && xb !== armado && sair !== armado) desarmar();
  if (sair) {
    // Com cadastros não salvos, o primeiro clique em Sair vira "Sair sem salvar?" e só o segundo sai.
    if (S.cadPend && armado !== sair) { armar(sair, 'Sair sem salvar?', 'Sair sem salvar os cadastros'); toast('Os cadastros têm alterações não salvas.'); return; }
    desarmar(); S.cadPend = false;
    api('POST', '/api/logout').finally(() => { location.href = '/login.html'; });
    return;
  }
  if (xb) {
    if (xb !== armado) { armar(xb); return; }
    desarmar();
    if (xb.dataset.rmatt != null && S.dr) {
      const dr = S.dr, i = +xb.dataset.rmatt;
      const [id] = dr.anexos.splice(i, 1); renderAtt();
      toast('Print removido.', () => {
        if (S.dr !== dr) { toast('O formulário foi fechado sem salvar, então nada foi alterado.'); return; }
        dr.anexos.splice(Math.min(i, dr.anexos.length), 0, id); renderAtt(); toast('Print de volta.');
      });
    } else if (xb.dataset.rm && S.cadDraft) {
      cadSync();
      const [a, i] = xb.dataset.rm.split('.');
      const [item] = S.cadDraft[a].splice(+i, 1); S.cadDirty = true; rCad();
      const nome = `${a === 'postos' ? 'Posto' : 'Tipo'}${item.nome ? ` "${item.nome}"` : ''}`;
      toast(`${nome} removido da lista.`, () => {
        if (!S.cadDraft) return;
        cadSync(); S.cadDraft[a].splice(Math.min(+i, S.cadDraft[a].length), 0, item); S.cadDirty = true; rCad();
        toast(`${nome} voltou para a lista.`);
      });
    }
    return;
  }
  const lx = t.closest('[data-lxrest]');
  if (lx) { lx.disabled = true; lx.textContent = 'Restaurando…'; restaurar(lx.dataset.lxrest); return; }
  const row = t.closest('tr[data-oc]'); if (row) { openDrawer('oc', row.dataset.oc); return; }
  const crow = t.closest('tr[data-cam]'); if (crow) { openDrawer('cam', crow.dataset.cam); return; }
  if (t.id === 'of-more') { S.ocLimit += 100; render(); return; }
  const kl = t.closest('.kpi.link'); if (kl) { location.hash = kl.dataset.href; return; }
  const go = t.closest('.hb-label');
  if (go && go.dataset.go) {
    const g = go.dataset.go, val = go.dataset.val;
    if (g === 'cposto') { S.cf.posto = val; rebuild('cameras'); return; }
    if (g === 'cproblema') { S.cf.problema = val; rebuild('cameras'); return; }
    Object.assign(S.of, { q: '', posto: '', tipo: '', grav: '', status: '', prazo: '', per: S.pf.per, de: S.pf.de, ate: S.pf.ate });
    if (S.pf.posto) S.of.posto = S.pf.posto; if (S.pf.tipo) S.of.tipo = S.pf.tipo; if (S.pf.grav) S.of.grav = S.pf.grav;
    if (g === 'posto') S.of.posto = val; else if (g === 'tipo') S.of.tipo = val;
    else if (g === 'frente') { S.pf.frente = val; rebuild('painel'); return; }
    S.ocLimit = 100; S.built.ocorrencias = null; location.hash = '#ocorrencias'; return;
  }
  if (t.closest('[data-close]')) { closeDrawer(); return; }
  if (t.id === 'del-ask') { S.dr.confirmDel = true; renderFoot(); return; }
  if (t.id === 'del-no') { S.dr.confirmDel = false; renderFoot(); return; }
  if (t.id === 'del-yes') {
    const dr = S.dr; t.disabled = true;
    const msg = dr.kind === 'oc' ? `Ocorrência nº ${dr.src.n} excluída.` : `Defeito nº ${dr.src.n} excluído.`;
    api('DELETE', `/api/${dr.kind === 'oc' ? 'ocorrencias' : 'cameras'}/${dr.id}`)
      .then(r => { closeDrawer(); toast(msg, r && r.lixeira ? () => restaurar(r.lixeira) : null); carregar(); },
        err => { toast(errMsg(err)); dr.confirmDel = false; renderFoot(); });
    return;
  }
  if (t.id === 'btn-senha') { openSenha(); return; }
  if (t.closest('[data-uedit]')) { S.uEdit = t.closest('[data-uedit]').dataset.uedit; S.senhaTmp = null; rUsers(true); $('#u-nome') && $('#u-nome').focus(); return; }
  if (t.id === 'u-novo') { S.uEdit = 'novo'; S.senhaTmp = null; rUsers(true); $('#u-login') && $('#u-login').focus(); return; }
  if (t.id === 'u-cancel') { S.uEdit = null; rUsers(true); return; }
  if (t.id === 'u-save') { saveUser(); return; }
  if (t.id === 'u-copy') { const v = $('#u-tmp').textContent; navigator.clipboard && navigator.clipboard.writeText(v).then(() => toast('Senha copiada'), () => {}); return; }
  if (t.id === 'f-resolve') { $('#f-status').value = 'Resolvido'; if (!$('#f-dataSolucao').value) $('#f-dataSolucao').value = today(); updCalc(); $('#f-retorno').focus(); return; }
  if (t.dataset.zoom) { const lb = document.createElement('div'); lb.className = 'lightbox'; const im = document.createElement('img'); im.src = '/api/anexos/' + t.dataset.zoom; im.alt = 'Print ampliado'; lb.appendChild(im); lb.addEventListener('click', () => lb.remove()); document.body.appendChild(lb); return; }
  if (t.dataset.add && S.cadDraft) { cadSync(); S.cadDraft[t.dataset.add].push(t.dataset.add === 'postos' ? { nome: '', gerente: '' } : { nome: '', criterio: '' }); S.cadDirty = true; rCad(); return; }
});
$('#k-body').addEventListener('input', () => { S.cadDirty = true; cadSync(); marcarPendente(); });
$('#u-body').addEventListener('change', e => { if (e.target.id === 'u-papel') { const box = $('#u-postos-box'); if (box) box.hidden = e.target.value !== 'gerente'; } });
$('#dr-form').addEventListener('input', updCalc);
$('#dr-form').addEventListener('change', e => { updCalc(); if (e.target.id === 'f-file') { uploadFiles(Array.from(e.target.files || [])); e.target.value = ''; } });
$('#dr-form').addEventListener('submit', saveDrawer);
$('#drawer').addEventListener('paste', e => {
  if (!S.dr || S.dr.kind !== 'oc' || S.dr.ro || S.dr.limit) return;
  const files = Array.from(e.clipboardData && e.clipboardData.files || []).filter(f => /^image\//.test(f.type));
  if (files.length) { e.preventDefault(); uploadFiles(files); }
});
$('#drawer').addEventListener('dragover', e => { if (S.dr && S.dr.kind === 'oc' && !S.dr.ro && !S.dr.limit) e.preventDefault(); });
$('#drawer').addEventListener('drop', e => { if (!S.dr || S.dr.kind !== 'oc' || S.dr.ro || S.dr.limit) return; e.preventDefault(); uploadFiles(Array.from(e.dataTransfer.files || [])); });
const tip = $('#tip');
document.addEventListener('pointermove', e => {
  const el = e.target.closest && e.target.closest('[data-tip]');
  if (!el) { tip.classList.remove('on'); return; }
  tip.textContent = el.dataset.tip; tip.classList.add('on');
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let x = e.clientX + 14, y = e.clientY - h - 10;
  if (x + w > innerWidth - 8) x = e.clientX - w - 14; if (y < 8) y = e.clientY + 16;
  tip.style.left = Math.max(8, x) + 'px'; tip.style.top = y + 'px';
});
document.addEventListener('pointerleave', () => tip.classList.remove('on'));

/* ---------- conexão com o servidor ---------- */
async function api(metodo, url, corpo) {
  let r;
  try {
    r = await fetch(url, { method: metodo, credentials: 'same-origin', headers: corpo ? { 'Content-Type': 'application/json' } : {}, body: corpo ? JSON.stringify(corpo) : undefined });
  } catch (e) { throw { status: 0, erro: 'Sem conexão com o servidor do CCO.' }; }
  if (r.status === 401 && url !== '/api/logout') { location.href = '/login.html'; throw { status: 401 }; }
  const j = (r.headers.get('content-type') || '').includes('json') ? await r.json() : null;
  if (!r.ok) throw { status: r.status, erro: j && j.erro };
  return j;
}
let carregando = null, recarregar = false;
async function carregar() {
  if (carregando) { recarregar = true; return carregando; }
  carregando = (async () => {
    try {
      const e = await api('GET', '/api/estado');
      S.cfg = cloneCfg(e.cadastros); S.cfgVer++;
      S.ocsRaw = e.ocorrencias; S.camsRaw = e.cameras;
      S.loaded = { ocs: true, cams: true, cfg: true }; S.confirmed = true; S.noDb = false;
      recompute(); marcarPendente();
    } catch (err) { if (err.status !== 401) S.noDb = !S.D.length; }
    render();
  })();
  await carregando; carregando = null;
  if (recarregar) { recarregar = false; return carregar(); }
}
function ouvirMudancas() {
  if (!window.EventSource) { setInterval(carregar, 30e3); return; }
  const es = new EventSource('/api/eventos');
  let t = 0;
  es.addEventListener('mudou', () => { clearTimeout(t); t = setTimeout(() => { carregar(); if (S.lixeira) carregarLixeira(); }, 250); });
  es.onopen = () => { if (S.stale) { S.stale = false; carregar(); } };
  es.onerror = () => { S.stale = true; render(); };
}
function renderMe() {
  const box = $('#me'); box.innerHTML = '';
  const who = document.createElement('div'); who.className = 'who';
  const n = document.createElement('span'); n.textContent = S.me.nome;
  const p = document.createElement('small'); p.textContent = PAPEL_NOME[S.me.papel] || S.me.papel;
  who.append(n, p);
  const bs = document.createElement('button'); bs.className = 'btn ghost'; bs.type = 'button'; bs.id = 'btn-senha'; bs.textContent = 'Senha';
  const bo = document.createElement('button'); bo.className = 'btn'; bo.type = 'button'; bo.id = 'btn-sair'; bo.textContent = 'Sair';
  box.append(who, bs, bo);
}
render();
async function boot() {
  try {
    const r = await api('GET', '/api/me');
    S.me = r.usuario; S.perm = r.usuario.permissoes || {};
    S.canAdmin = !!S.perm.cadastros;
    S.readOnly = !(S.perm.registra || S.perm.edita || S.perm.retorno);
    renderMe();
  } catch (e) { if (e.status !== 401) { S.noDb = true; render(); setTimeout(boot, 5000); } return; }
  await carregar();
  ouvirMudancas();
}
boot();
})();
