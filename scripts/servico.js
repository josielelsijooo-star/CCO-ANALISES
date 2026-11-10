// Serviço do CCO no Windows: o servidor sobe sozinho quando este usuário entra no Windows,
// sem janela, e volta sozinho se cair. A tarefa agendada "CCO Mirian" roda este arquivo sem
// argumentos (modo supervisor): ele inicia src/server.js, grava tudo o que o servidor imprime
// em data/logs/ e reinicia o servidor se ele parar.
//   npm run servico:instalar   cria a tarefa agendada e já inicia
//   npm run servico:status     mostra se está rodando, o último backup e as últimas linhas do log
//   npm run servico:parar      para o servidor (volta no próximo login ou com servico:iniciar)
//   npm run servico:iniciar    inicia de novo
//   npm run servico:remover    para e apaga a tarefa agendada
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listarBackups, pastasBackup } from '../src/backup.js';

const ESTE = fileURLToPath(import.meta.url);
const RAIZ = path.resolve(path.dirname(ESTE), '..');
const SERVIDOR = path.join(RAIZ, 'src', 'server.js');
const TAREFA = 'CCO Mirian';
const PORTA = Number(process.env.PORT || 3000);
const LOGS = path.join(RAIZ, 'data', 'logs');
const arquivoLog = () => path.join(LOGS, `servidor-${new Date().toISOString().slice(0, 7)}.log`);
const espera = ms => new Promise(r => setTimeout(r, ms));

/* ---------- modo supervisor (o que a tarefa agendada roda) ---------- */
function supervisionar() {
  fs.mkdirSync(LOGS, { recursive: true });
  const log = txt => { try { fs.appendFileSync(arquivoLog(), txt); } catch {} };
  const agora = () => new Date().toLocaleString('pt-BR');
  let filho = null, saindo = false, quedas = 0;
  const iniciar = () => {
    const inicio = Date.now();
    log(`\n[${agora()}] iniciando o servidor\n`);
    filho = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', '--env-file-if-exists=.env', SERVIDOR],
      { cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true });
    filho.stdout.on('data', log);
    filho.stderr.on('data', log);
    filho.on('exit', (codigo, sinal) => {
      filho = null;
      if (saindo) return;
      // Caiu logo depois de subir várias vezes seguidas (porta ocupada, por exemplo): espera mais.
      quedas = Date.now() - inicio < 60e3 ? quedas + 1 : 1;
      const seg = quedas > 3 ? 60 : 5;
      log(`[${agora()}] o servidor parou (${sinal || 'código ' + codigo}); tentando de novo em ${seg} s\n`);
      setTimeout(iniciar, seg * 1000);
    });
  };
  const encerrar = () => { saindo = true; if (filho) filho.kill(); process.exit(0); };
  for (const s of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) process.on(s, encerrar);
  iniciar();
}

/* ---------- comandos de gerenciamento ---------- */
const q = s => `'${String(s).replace(/'/g, "''")}'`;
function ps(script) {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand',
    Buffer.from(`[Console]::OutputEncoding = [Text.Encoding]::UTF8; $ErrorActionPreference = 'Stop'\n${script}`, 'utf16le').toString('base64')],
  { encoding: 'utf8' });
  return { ok: r.status === 0, saida: (r.stdout || '').trim(), erro: (r.stderr || '').trim() };
}
const responde = () => fetch(`http://127.0.0.1:${PORTA}/login.html`, { signal: AbortSignal.timeout(2000) }).then(r => r.ok, () => false);
async function esperarSubir(seg = 25) {
  for (let i = 0; i < seg * 2; i++) { if (await responde()) return true; await espera(500); }
  return false;
}
const estadoTarefa = () => { const r = ps(`(Get-ScheduledTask -TaskName ${q(TAREFA)}).State`); return r.ok ? r.saida : null; };

function pararTudo() {
  ps(`Stop-ScheduledTask -TaskName ${q(TAREFA)} -ErrorAction SilentlyContinue`);
  // Garante que o supervisor e o servidor desta pasta pararam. Um "npm start" aberto noutra janela não é tocado.
  ps(`Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.ProcessId -ne ${process.pid} -and ($_.CommandLine -like ${q('*' + ESTE + '*')} -or $_.CommandLine -like ${q('*' + SERVIDOR + '*')}) } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`);
}

async function instalar() {
  // Um servidor do CCO aberto fora do serviço (npm start) segura a porta: para ele, o serviço assume.
  const antigo = ps(`Get-NetTCPConnection -LocalPort ${PORTA} -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
    $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)"
    if ($p.Name -eq 'node.exe' -and $p.CommandLine -match 'src[\\\\/]server\\.js') { Stop-Process -Id $p.ProcessId -Force; 'parado' } }`);
  if (antigo.saida.includes('parado')) { console.log(`Havia um servidor do CCO aberto fora do serviço na porta ${PORTA}; ele foi parado para o serviço assumir.`); await espera(1000); }
  const ocupada = await responde();
  const r = ps(`
$u = "$env:USERDOMAIN\\$env:USERNAME"
$a = New-ScheduledTaskAction -Execute (Join-Path $env:WINDIR 'System32\\conhost.exe') -Argument ${q(`--headless "${process.execPath}" "${ESTE}"`)} -WorkingDirectory ${q(RAIZ)}
$t = New-ScheduledTaskTrigger -AtLogOn -User $u
$p = New-ScheduledTaskPrincipal -UserId $u -LogonType Interactive -RunLevel Limited
$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName ${q(TAREFA)} -Description ${q(`Servidor do CCO Mirian (${RAIZ}). Gerencie com npm run servico:status / parar / iniciar / remover.`)} -Action $a -Trigger $t -Principal $p -Settings $s -Force | Out-Null
Start-ScheduledTask -TaskName ${q(TAREFA)}`);
  if (!r.ok) { console.error('Não foi possível criar a tarefa agendada:\n' + r.erro); process.exit(1); }
  console.log(`Tarefa "${TAREFA}" criada: o CCO sobe sozinho quando ${process.env.USERNAME || 'este usuário'} entrar no Windows.`);
  if (ocupada) {
    console.log(`A porta ${PORTA} já está ocupada por outro servidor (um "npm start" aberto?).`);
    console.log('Feche-o: o serviço assume sozinho em até 1 minuto.');
    return;
  }
  console.log(await esperarSubir() ? `Rodando em http://localhost:${PORTA}` : `Ainda não respondeu. Veja o log: ${arquivoLog()}`);
}

async function status() {
  const st = estadoTarefa();
  const nomes = { Running: 'rodando', Ready: 'parada (pronta para subir no próximo login)', Disabled: 'desativada' };
  console.log(`Tarefa agendada: ${st ? (nomes[st] || st) : 'não instalada (npm run servico:instalar)'}`);
  console.log(`Servidor: ${await responde() ? `respondendo em http://localhost:${PORTA}` : 'não está respondendo'}`);
  const b = listarBackups(pastasBackup(RAIZ)[0])[0];
  console.log(`Último backup: ${b ? `${b.arquivo} (atualizado ${b.atualizado.toLocaleString('pt-BR')})` : 'nenhum ainda'}`);
  const log = arquivoLog();
  if (fs.existsSync(log)) {
    console.log(`\nÚltimas linhas de ${log}:`);
    console.log(fs.readFileSync(log, 'utf8').trimEnd().split(/\r?\n/).slice(-8).map(l => '  ' + l).join('\n'));
  }
}

const acao = process.argv[2];
if (!acao) supervisionar();
else if (acao === 'instalar') await instalar();
else if (acao === 'status') await status();
else if (acao === 'parar') {
  pararTudo();
  console.log(await responde() ? `Algo ainda responde na porta ${PORTA} (um "npm start" aberto?).` : 'Servidor parado.');
} else if (acao === 'iniciar') {
  if (!estadoTarefa()) { console.error('O serviço não está instalado. Rode: npm run servico:instalar'); process.exit(1); }
  const r = ps(`Start-ScheduledTask -TaskName ${q(TAREFA)}`);
  if (!r.ok) { console.error(r.erro); process.exit(1); }
  console.log(await esperarSubir() ? `Rodando em http://localhost:${PORTA}` : `Ainda não respondeu. Veja: npm run servico:status`);
} else if (acao === 'remover') {
  pararTudo();
  const r = ps(`Unregister-ScheduledTask -TaskName ${q(TAREFA)} -Confirm:$false -ErrorAction SilentlyContinue`);
  console.log(r.ok ? `Tarefa "${TAREFA}" removida. O CCO não sobe mais sozinho.` : r.erro);
} else {
  console.error('Uso: npm run servico:instalar | servico:status | servico:parar | servico:iniciar | servico:remover');
  process.exit(1);
}
