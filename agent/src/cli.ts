#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, openSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { buildSite, slugFor } from './builder.js';
import { DEFAULT_MODELS, isConfigured, loadConfig, paths, saveConfig, type Config } from './config.js';
import { fetchLaunches } from './feed.js';
import { createProvider, explainModelError } from './model/index.js';
import type { Run, Step } from './runs.js';
import { VERSION } from './version.js';

/* ------------------------------------------------------------ output */
const tty = process.stdout.isTTY;
const paint = (code: string) => (s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const violet = paint('38;5;141'), dim = paint('2'), green = paint('32'), red = paint('31'), yellow = paint('33'), bold = paint('1');
const out = (s = '') => process.stdout.write(`${s}\n`);
const fail = (s: string): never => { process.stderr.write(`${red('✗')} ${s}\n`); process.exit(1); };
const MOON = violet('☾');

const argv = process.argv.slice(2);
const flags = new Set(argv.filter(a => a.startsWith('--')));
const flagValue = (name: string) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--out', '--port', '--name'].includes(argv[i - 1]!)));
const [command = '', ...rest] = positional;

/* ------------------------------------------------------------ gateway client */
let cfg: Config = loadConfig();
const base = () => `http://127.0.0.1:${cfg.port}`;

async function api<T = unknown>(method: string, route: string, payload?: unknown): Promise<T> {
  const res = await fetch(`${base()}/api${route}`, {
    method,
    headers: { 'x-noira-token': cfg.token, ...(payload ? { 'content-type': 'application/json' } : {}) },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Gateway returned ${res.status}`);
  return data as T;
}

async function running(): Promise<boolean> {
  try { await api('GET', '/status'); return true; } catch { return false; }
}

async function requireGateway() {
  if (!(await running())) fail(`The gateway is not running. Start it with ${bold('noira start')}.`);
}

/** Streams gateway events; resolves when `until` returns true. */
async function follow(until: (e: Record<string, unknown>) => boolean | Promise<boolean>): Promise<void> {
  const res = await fetch(`${base()}/api/events?token=${encodeURIComponent(cfg.token)}`);
  if (!res.ok || !res.body) throw new Error('Could not open the event stream');
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buf += value;
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      const line = chunk.split('\n').find(l => l.startsWith('data: '));
      if (!line) continue;
      if (await until(JSON.parse(line.slice(6)))) { void reader.cancel(); return; }
    }
  }
}

/* ------------------------------------------------------------ prompts */
// One readline for the whole session, with a queue: piped answers can arrive before their question is asked.
let rl: ReturnType<typeof createInterface> | null = null;
let muted = false;
const lines: string[] = [];
let waiting: ((line: string | null) => void) | null = null;
let inputEnded = false;
function reader() {
  if (!rl) {
    rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
    // while a secret is typed, echo dots instead of the characters
    const r = rl as unknown as { _writeToOutput?: (s: string) => void; output: NodeJS.WriteStream };
    if (typeof r._writeToOutput === 'function') {
      const write = r._writeToOutput.bind(rl);
      r._writeToOutput = (s: string) => (muted && !/^\r?\n$/.test(s) ? r.output.write(s.replace(/[^\r\n]/g, '•').slice(-1)) : write(s));
    }
    rl.on('line', line => { if (waiting) { const w = waiting; waiting = null; w(line); } else lines.push(line); });
    rl.on('close', () => { rl = null; inputEnded = true; waiting?.(null); waiting = null; });
  }
  return rl;
}
process.on('exit', () => rl?.close());

function readLine(question: string): Promise<string | null> {
  reader();
  process.stdout.write(question);
  if (lines.length) { const l = lines.shift()!; if (!process.stdin.isTTY) process.stdout.write(`${l}\n`); return Promise.resolve(l); }
  if (inputEnded) return Promise.resolve(null);
  return new Promise(resolve => { waiting = resolve; });
}

async function ask(question: string, fallback = ''): Promise<string> {
  const a = await readLine(`${violet('›')} ${question}${fallback ? dim(` (${fallback})`) : ''} `);
  if (a === null) { out(); return fallback; }
  return a.trim() || fallback;
}

/** Reads a secret without echoing it. */
async function askSecret(question: string): Promise<string> {
  muted = Boolean(process.stdin.isTTY);
  try { return ((await readLine(`${violet('›')} ${question} `)) ?? '').trim(); } finally { muted = false; }
}

/* ------------------------------------------------------------ commands */
async function onboard() {
  out(`${MOON} ${bold('Noira')} ${dim(`v${VERSION} · set up your agent`)}\n`);
  out(`  1  Claude ${dim('(Anthropic API key)')}`);
  out(`  2  OpenAI-compatible ${dim('(OpenAI, OpenRouter, Groq, LM Studio…)')}`);
  out(`  3  Ollama ${dim('(a local model; prompts never leave this machine)')}\n`);
  const prev = { ...cfg };
  const choice = await ask('Which model?', prev.provider === 'openai' ? (prev.baseUrl.includes('11434') ? '3' : '2') : '1');

  if (choice === '3') {
    cfg.provider = 'openai';
    cfg.baseUrl = await ask('Ollama URL', 'http://127.0.0.1:11434/v1');
    cfg.model = await ask('Model name', prev.provider === 'openai' && prev.model ? prev.model : 'llama3.1');
    cfg.apiKey = '';
  } else if (choice === '2') {
    cfg.provider = 'openai';
    cfg.baseUrl = await ask('Endpoint URL', cfg.baseUrl || 'https://api.openai.com/v1');
    cfg.model = await ask('Model name', prev.provider === 'openai' ? prev.model : '');
    const key = await askSecret('API key (input hidden; Enter keeps the current one)');
    if (key) cfg.apiKey = key;
  } else {
    cfg.provider = 'anthropic';
    cfg.baseUrl = '';
    cfg.model = await ask('Model', prev.provider === 'anthropic' && prev.model ? prev.model : DEFAULT_MODELS.anthropic);
    if (process.env.ANTHROPIC_API_KEY) out(dim('  Using ANTHROPIC_API_KEY from the environment.'));
    else {
      const key = await askSecret('Anthropic API key (input hidden; Enter keeps the current one)');
      if (key) cfg.apiKey = key;
    }
  }
  if (!cfg.model) fail('A model name is required.');
  saveConfig(cfg);

  process.stdout.write(`${violet('›')} Checking the model… `);
  try {
    await createProvider(cfg).complete('Reply with exactly: ok', 'ping');
    out(green('ok'));
  } catch (err) {
    out(red('failed'));
    out(`  ${explainModelError(err)}`);
    out(dim('  Saved anyway; fix it later with `noira onboard` or in the panel.'));
  }
  out(`\n${green('✓')} Saved to ${paths.config}`);
  out(`\n  ${bold('noira start')}   start the gateway in the background`);
  out(`  ${bold('noira')}         chat with your agent`);
  out(`  ${bold('noira panel')}   open the control panel\n`);
}

async function gatewayForeground() {
  const { startGateway } = await import('./gateway.js');
  const gw = await startGateway({ remote: flags.has('--remote'), port: flagValue('--port') ? Number(flagValue('--port')) : undefined });
  out(dim(`Panel: ${gw.url}/panel.html   Stop with Ctrl+C`));
  const quit = () => void gw.stop().then(() => process.exit(0));
  process.on('SIGINT', quit);
  process.on('SIGTERM', quit);
}

async function startBackground() {
  if (await running()) return out(`${green('●')} The gateway is already running on ${base()}`);
  mkdirSync(paths.home, { recursive: true });
  const log = openSync(paths.log, 'a');
  const self = fileURLToPath(import.meta.url);
  const child = spawn(process.execPath, [self, 'gateway', ...(flags.has('--remote') ? ['--remote'] : [])], { detached: true, stdio: ['ignore', log, log], windowsHide: true });
  child.unref();
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 200));
    if (await running()) {
      out(`${green('●')} Gateway running on ${base()} ${dim(`(pid ${child.pid}, log ${paths.log})`)}`);
      if (!isConfigured(cfg)) out(`${yellow('!')} No model yet: run ${bold('noira onboard')}.`);
      return;
    }
  }
  fail(`The gateway did not start. See ${paths.log}`);
}

async function stopGateway() {
  if (!(await running())) return out(dim('The gateway is not running.'));
  await api('POST', '/shutdown');
  out(`${green('✓')} Gateway stopped.`);
}

async function status() {
  if (!(await running())) {
    out(`${red('●')} Gateway stopped ${dim(`(${base()})`)}`);
    out(dim(`  model: ${isConfigured(cfg) ? `${cfg.model}` : 'not set up'}   home: ${paths.home}`));
    return;
  }
  const s = await api<Record<string, unknown>>('GET', '/status');
  out(`${green('●')} Gateway running on ${base()}${s.remote ? ' (remote on)' : ''} · v${s.version} · up ${Math.round(Number(s.uptimeSec) / 60)} min`);
  out(`  model      ${s.model ?? yellow('not set up')}`);
  out(`  runs       ${s.activeRuns} active   approvals ${s.approvals} waiting`);
  out(`  jobs       ${s.jobs}   memories ${s.memories}`);
  out(`  workspace  ${s.workspace}`);
}

function printStep(step: Step) {
  if (step.kind !== 'tool') return;
  const mark = { ok: green('✓'), error: red('✗'), denied: yellow('⊘ denied'), blocked: red('⊘ blocked') }[step.status];
  out(`\n${dim('  ⚙')} ${step.summary} ${mark}`);
}

/** Sends one task and streams it, answering approvals inline. Returns the finished run. */
async function runTask(task: string, history: { role: 'user' | 'assistant'; content: string }[] = []): Promise<Run | null> {
  let runId = '';
  let finished: Run | null = null;
  const early: Record<string, unknown>[] = [];
  let atLineStart = true;
  const handle = async (e: Record<string, unknown>): Promise<boolean> => {
    if (!runId) { early.push(e); return false; }
    const forThis = (e.runId ?? (e.run as Run | undefined)?.id ?? (e.approval as { runId?: string } | undefined)?.runId) === runId;
    if (!forThis) return false;
    if (e.type === 'run.text') { process.stdout.write(String(e.text)); atLineStart = String(e.text).endsWith('\n'); }
    if (e.type === 'run.step') printStep(e.step as Step);
    if (e.type === 'approval.requested') {
      const a = e.approval as { id: string; summary: string; tool: string };
      if (!atLineStart) out();
      const answer = (await ask(`${yellow('Approve?')} ${a.summary}  ${dim('[y]es / [n]o / [a]lways for ' + a.tool)}`, 'n')).toLowerCase();
      const decision = answer.startsWith('a') ? 'always' : answer.startsWith('y') ? 'allow' : 'deny';
      await api('POST', `/approvals/${a.id}`, { decision }).catch(() => out(dim('  (already answered elsewhere)')));
    }
    if (e.type === 'run.finished') { finished = e.run as Run; return true; }
    return false;
  };
  const stream = follow(handle);
  const run = await api<Run>('POST', '/runs', { task, source: 'cli', history });
  runId = run.id;
  for (const e of early.splice(0)) if (await handle(e)) break;
  await stream;
  const r = finished as Run | null;
  if (r && r.status !== 'done') out(`\n${r.status === 'error' ? red('✗') : yellow('■')} ${r.result}`);
  out();
  return r;
}

async function chat() {
  out(`${MOON} ${bold('Noira')} ${dim('· chat with your agent · /exit to leave')}`);
  const history: { role: 'user' | 'assistant'; content: string }[] = [];
  for (;;) {
    const line = await ask(bold('you'));
    if (!line) continue;
    if (['/exit', '/quit', 'exit', 'quit'].includes(line)) return;
    out(violet('noira'));
    const r = await runTask(line, history.slice(-12));
    if (r) history.push({ role: 'user', content: line }, { role: 'assistant', content: r.result });
  }
}

async function approvalsCmd() {
  const [sub, id] = rest;
  if (sub === 'approve' || command === 'approve') {
    const target = command === 'approve' ? sub : id;
    if (!target) fail('Which approval? noira approve <id>');
    await api('POST', `/approvals/${target}`, { decision: flags.has('--always') ? 'always' : 'allow' });
    return out(`${green('✓')} Approved.`);
  }
  if (sub === 'deny' || command === 'deny') {
    const target = command === 'deny' ? sub : id;
    if (!target) fail('Which approval? noira deny <id>');
    await api('POST', `/approvals/${target}`, { decision: 'deny' });
    return out(`${green('✓')} Denied.`);
  }
  const list = await api<{ id: string; tool: string; summary: string; createdAt: number }[]>('GET', '/approvals');
  if (!list.length) return out(dim('Nothing is waiting for you.'));
  for (const a of list) out(`${yellow('?')} ${a.id}  ${a.summary}  ${dim(new Date(a.createdAt).toLocaleTimeString())}`);
  out(dim('\nnoira approve <id> [--always]   ·   noira deny <id>'));
}

async function jobsCmd() {
  const [sub, a, b] = rest;
  if (sub === 'add') {
    if (!a || !b) fail('noira jobs add "<cron>" "<task>" [--name "…"]   e.g. noira jobs add "0 8 * * 1-5" "Summarize my notes"');
    const job = await api<{ id: string }>('POST', '/jobs', { cron: a, task: b, name: flagValue('--name') ?? '' });
    return out(`${green('✓')} Job ${job.id} scheduled.`);
  }
  if (sub === 'rm' || sub === 'remove') { await api('DELETE', `/jobs/${a}`); return out(`${green('✓')} Removed.`); }
  if (sub === 'run') { const r = await api<{ runId: string }>('POST', `/jobs/${a}/run`); return out(`${green('✓')} Started ${r.runId}`); }
  if (sub === 'on' || sub === 'off') { await api('PATCH', `/jobs/${a}`, { enabled: sub === 'on' }); return out(`${green('✓')} Job ${sub}.`); }
  const jobs = await api<{ id: string; name: string; cron: string; enabled: boolean; nextRunAt: number | null; task: string }[]>('GET', '/jobs');
  if (!jobs.length) return out(dim('No jobs yet. noira jobs add "0 8 * * 1-5" "Summarize my notes into report.md"'));
  for (const j of jobs) out(`${j.enabled ? green('●') : dim('○')} ${j.id}  ${bold(j.cron)}  ${j.name}  ${dim(j.nextRunAt ? `next ${new Date(j.nextRunAt).toLocaleString()}` : 'off')}`);
}

async function memoryCmd() {
  const [sub, ...words] = rest;
  if (sub === 'add') { await api('POST', '/memory', { text: words.join(' ') }); return out(`${green('✓')} Remembered.`); }
  if (sub === 'rm' || sub === 'forget') { await api('DELETE', `/memory/${words[0]}`); return out(`${green('✓')} Forgotten.`); }
  const list = await api<{ id: string; text: string }[]>('GET', '/memory');
  if (!list.length) return out(dim('No memories yet.'));
  for (const m of list) out(`${violet('•')} ${m.text} ${dim(m.id)}`);
}

async function build() {
  let prompt = rest.join(' ').trim();
  if (!prompt) prompt = await ask('What should I build?');
  if (!prompt) process.exit(1);
  if (!isConfigured(cfg)) fail(`No model is set up. Run ${bold('noira onboard')} first.`);
  out(`${violet('›')} building with ${createProvider(cfg).label}`);
  let bytes = 0;
  const html = await buildSite(createProvider(cfg), prompt, t => {
    bytes += t.length;
    if (tty) process.stdout.write(`\r${violet('›')} writing index.html ${dim(`${(bytes / 1024).toFixed(1)} KB`)}   `);
  });
  const dir = path.resolve(flagValue('--out') ?? slugFor(prompt));
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'index.html'), html);
  out(`\n${green('✓')} ${path.relative(process.cwd(), path.join(dir, 'index.html'))} ${dim(`(${(html.length / 1024).toFixed(1)} KB)`)}`);
}

async function scan() {
  const verdict = flags.has('--signal') ? 'signal' : 'any';
  const data = (await fetchLaunches(cfg.feedUrl, verdict, 12)) as { launches?: { ticker: string; verdict: string; passed: string; collapsedOn: string | null }[] };
  for (const l of data.launches ?? []) {
    out(`${l.verdict === 'signal' ? green('◆ signal') : red('◇ noise ')}  ${bold(l.ticker.padEnd(12))} ${dim(`${l.passed}${l.collapsedOn ? ` · collapsed on ${l.collapsedOn}` : ''}`)}`);
  }
}

function openUrl(url: string) {
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

async function panel() {
  if (!(await running())) await startBackground();
  const url = `${base()}/panel.html`;
  openUrl(url);
  out(`${green('✓')} Opened ${url}`);
}

async function pair() {
  const s = await api<{ remote: boolean }>('GET', '/status').catch(() => null);
  if (!s) fail(`Start the gateway first: ${bold('noira start --remote')}`);
  if (!s!.remote) fail(`The gateway only listens on this machine. Restart it with ${bold('noira stop')} then ${bold('noira start --remote')}.`);
  const addrs = Object.values(os.networkInterfaces()).flat().filter(n => n && n.family === 'IPv4' && !n.internal).map(n => n!.address);
  out(`${MOON} Connect the Noira app on your phone\n`);
  for (const a of addrs) out(`  URL    ${bold(`http://${a}:${cfg.port}`)}${a.startsWith('100.') ? dim('  (Tailscale)') : ''}`);
  out(`  Token  ${bold(cfg.token)}\n`);
  out(dim('Use a private network such as Tailscale; do not expose this port to the internet.'));
}

function help() {
  out(`${MOON} ${bold('Noira')} ${dim(`v${VERSION}`)} — a self-hosted AI agent that asks before it acts

  ${bold('noira onboard')}                 pick a model and save your key
  ${bold('noira start')} ${dim('[--remote]')}          start the gateway in the background
  ${bold('noira stop')} · ${bold('noira status')}       stop it · see what it is doing
  ${bold('noira')} · ${bold('noira chat')}             chat with your agent
  ${bold('noira run')} "<task>"             hand it one task
  ${bold('noira approvals')}               what is waiting for your yes
  ${bold('noira approve')} <id> ${dim('[--always]')}   · ${bold('noira deny')} <id>
  ${bold('noira jobs')} ${dim('[add "<cron>" "<task>" | rm <id> | run <id> | on|off <id>]')}
  ${bold('noira memory')} ${dim('[add "<text>" | rm <id>]')}
  ${bold('noira build')} "<site idea>" ${dim('[--out dir]')}  vibecode a page into a folder
  ${bold('noira scan')} ${dim('[--signal]')}            the latest launches
  ${bold('noira panel')}                   open the control panel
  ${bold('noira pair')}                    connect the phone app
  ${bold('noira gateway')} ${dim('[--remote] [--port n]')}  run the gateway in this window

  ${dim(`home ${paths.home}`)}`);
}

/* ------------------------------------------------------------ main */
async function main() {
  if (flags.has('--version') || command === 'version') return out(VERSION);
  if (flags.has('--help') || command === 'help') return help();
  switch (command) {
    case 'onboard': case 'setup': return onboard();
    case 'gateway': return gatewayForeground();
    case 'start': return startBackground();
    case 'stop': return stopGateway();
    case 'status': return status();
    case 'run': {
      const task = rest.join(' ').trim() || (await ask('Task?'));
      if (!task) return;
      await requireGateway();
      const r = await runTask(task);
      process.exit(r?.status === 'done' ? 0 : 1);
      return;
    }
    case 'chat': await requireGateway(); return chat();
    case 'approvals': case 'approve': case 'deny': await requireGateway(); return approvalsCmd();
    case 'jobs': await requireGateway(); return jobsCmd();
    case 'memory': await requireGateway(); return memoryCmd();
    case 'build': return build();
    case 'scan': return scan();
    case 'panel': return panel();
    case 'pair': return pair();
    case 'logs': return out(existsSync(paths.log) ? readFileSync(paths.log, 'utf8').split('\n').slice(-60).join('\n') : 'No log yet.');
    case '': {
      if (!isConfigured(cfg)) { await onboard(); cfg = loadConfig(); if (!isConfigured(cfg)) return; }
      if (!(await running())) await startBackground();
      return chat();
    }
    default:
      return fail(`Unknown command "${command}". See noira --help`);
  }
}

// an open readline keeps the process alive, so close it once the command is done
main().then(() => rl?.close(), err => fail(explainModelError(err)));
