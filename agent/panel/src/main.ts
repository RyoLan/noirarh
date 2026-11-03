import './style.css';

/* ------------------------------------------------------------------ types */
type Level = 'allow' | 'ask' | 'block';
type Step =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; id: string; tool: string; summary: string; status: 'ok' | 'error' | 'denied' | 'blocked'; output: string }
  | { kind: 'approval'; tool: string; summary: string; approvalId: string };
interface Run { id: string; task: string; source: string; status: 'running' | 'done' | 'error' | 'stopped'; startedAt: number; endedAt: number | null; steps?: Step[]; result: string; jobId?: string }
interface Approval { id: string; runId: string; tool: string; summary: string; createdAt: number; expiresAt: number }
interface Job { id: string; name: string; cron: string; task: string; enabled: boolean; nextRunAt: number | null; lastRunAt: number | null }
interface Memory { id: string; text: string; createdAt: number }
interface Status { version: string; configured: boolean; model: string | null; workspace: string; activeRuns: number; approvals: number; remote: boolean }
interface ToolInfo { name: string; description: string; level: Level; defaultLevel: Level }
interface PublicConfig { provider: 'anthropic' | 'openai'; model: string; baseUrl: string; feedUrl: string; approvalTimeoutMin: number; apiKeySet: boolean; apiKeyHint: string; configured: boolean; policy: Record<string, Level> }
interface ChatMsg { id: string; role: 'user' | 'assistant'; text: string; runId?: string; steps: Step[]; status?: Run['status']; result?: string }

declare global {
  interface Window { __NOIRA__?: { token: string }; NOIRA_REMOTE?: boolean }
}

/* ------------------------------------------------------------------ helpers */
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
};
const session = {
  get: <T>(k: string, d: T): T => { try { return JSON.parse(sessionStorage.getItem(k) ?? '') as T; } catch { return d; } },
  set: (k: string, v: unknown) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } },
};
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll(sel)] as T[];
const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(t).toLocaleDateString();
};
const when = (t: number | null) => (t ? new Date(t).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : '—');

/** Escape-first Markdown for agent replies: code blocks, inline code, bold, lists, paragraphs. */
function md(src: string): string {
  const blocks = src.split(/```/);
  return blocks.map((b, i) => {
    if (i % 2) return `<pre><code>${esc(b.replace(/^[a-z]*\n/, ''))}</code></pre>`;
    const inline = (t: string) => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    const out: string[] = [];
    let list: string[] = [];
    const flush = () => { if (list.length) { out.push(`<ul>${list.map(x => `<li>${inline(x)}</li>`).join('')}</ul>`); list = []; } };
    for (const line of b.split('\n')) {
      const m = /^\s*(?:[-*•]|\d+\.)\s+(.*)$/.exec(line);
      if (m) { list.push(m[1]!); continue; }
      flush();
      const hm = /^#{1,4}\s+(.*)$/.exec(line);
      if (hm) out.push(`<p><b>${inline(hm[1]!)}</b></p>`);
      else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
    }
    flush();
    return out.join('');
  }).join('');
}

/* ------------------------------------------------------------------ connection */
const remote = Boolean(window.NOIRA_REMOTE);
let base = remote ? (store.get('noira.url') ?? '') : '';
let token = window.__NOIRA__?.token ?? (remote ? store.get('noira.token') ?? '' : '');

class ApiError extends Error { constructor(m: string, readonly status: number) { super(m); } }

async function api<T>(method: string, route: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base}/api${route}`, {
    method,
    headers: { 'x-noira-token': token, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Gateway returned ${res.status}`, res.status);
  return data as T;
}

/* ------------------------------------------------------------------ state */
const state = {
  view: (location.hash.slice(1) || 'chat') as string,
  status: null as Status | null,
  approvals: [] as Approval[],
  chat: session.get<ChatMsg[]>('noira.chat', []),
  filesPath: '.',
};
const main = $('#main');

function toast(text: string, bad = false) {
  const t = document.createElement('div');
  t.className = `toast${bad ? ' bad' : ''}`;
  t.textContent = text;
  document.body.append(t);
  setTimeout(() => t.classList.add('out'), 2600);
  setTimeout(() => t.remove(), 3100);
}

function setBadge() {
  const b = $('#apBadge');
  b.hidden = !state.approvals.length;
  b.textContent = String(state.approvals.length);
  document.title = state.approvals.length ? `(${state.approvals.length}) Noira` : 'Noira · Control panel';
}

function setGateway(ok: boolean, text: string) {
  const g = $('#gwState');
  g.classList.toggle('ok', ok);
  g.classList.toggle('bad', !ok);
  $('span', g).textContent = text;
}

async function refreshStatus() {
  try {
    state.status = await api<Status>('GET', '/status');
    setGateway(true, state.status.model ?? 'No model set up');
  } catch (e) {
    setGateway(false, e instanceof ApiError && e.status === 401 ? 'Wrong token' : 'Gateway offline');
  }
}

/* ------------------------------------------------------------------ live events */
let es: EventSource | null = null;
function connectEvents() {
  es?.close();
  es = new EventSource(`${base}/api/events?token=${encodeURIComponent(token)}`);
  es.onopen = () => void refreshStatus();
  es.onerror = () => setGateway(false, 'Reconnecting…');
  es.onmessage = ev => onEvent(JSON.parse(ev.data));
}

function chatFor(runId: string) { return state.chat.find(m => m.runId === runId); }
function saveChat() { session.set('noira.chat', state.chat.slice(-60)); }

function onEvent(e: Record<string, any>) {
  switch (e.type) {
    case 'hello':
      state.approvals = e.approvals;
      setBadge();
      break;
    case 'run.text': {
      const m = chatFor(e.runId);
      if (m) { m.text += e.text; paintMsg(m); }
      break;
    }
    case 'run.step': {
      const m = chatFor(e.runId);
      if (m && e.step.kind === 'tool') { m.steps.push(e.step); paintMsg(m); }
      if (m && e.step.kind === 'text' && !m.text.endsWith('\n\n') && m.text) { m.text += '\n\n'; }
      break;
    }
    case 'run.finished': {
      const run = e.run as Run;
      const m = chatFor(run.id);
      if (m) { m.status = run.status; m.result = run.result; if (!m.text.trim()) m.text = run.result; paintMsg(m); saveChat(); paintComposer(); }
      if (state.view === 'activity') void renderActivity();
      if (run.source === 'cron') toast(`Job finished: ${run.task.slice(0, 60)}`);
      void refreshStatus();
      break;
    }
    case 'run.started':
      if (state.view === 'activity') void renderActivity();
      break;
    case 'approval.requested':
      state.approvals.push(e.approval);
      setBadge();
      if (state.view === 'approvals') renderApprovals();
      { const m = chatFor(e.approval.runId); if (m) paintMsg(m); }
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('Noira is waiting for you', { body: e.approval.summary });
      }
      break;
    case 'approval.resolved':
      state.approvals = state.approvals.filter(a => a.id !== e.id);
      setBadge();
      if (state.view === 'approvals') renderApprovals();
      state.chat.forEach(m => m.runId && paintMsg(m));
      break;
    case 'jobs.changed':
      if (state.view === 'jobs') void renderJobs();
      break;
    case 'memory.changed':
      if (state.view === 'memory') void renderMemory();
      break;
    case 'config.changed':
      void refreshStatus();
      break;
  }
}

/* ------------------------------------------------------------------ chat */
const IDEAS = [
  'Summarize the notes in my workspace into report.md',
  'Scan the latest launches and tell me which ones passed all seven checks',
  'Build a small landing page for my idea: a frog coin with a countdown',
  'Every weekday at 8:00, scan launches and write a brief to brief.md',
  'Remember that I prefer short answers in Indonesian',
];

function renderChat() {
  main.innerHTML = `
    <section class="chat">
      <header class="bar"><h1>Chat</h1><button class="ghost sm" id="clearChat">New chat</button></header>
      <div class="thread" id="thread"></div>
      <form class="composer" id="composer">
        <textarea id="task" rows="1" placeholder="Hand Noira a job…" aria-label="Task"></textarea>
        <button class="primary" id="sendBtn" type="submit">Send</button>
      </form>
    </section>`;
  const thread = $('#thread');
  if (!state.chat.length) {
    thread.innerHTML = `<div class="empty">
      <div class="orb"></div>
      <h2>What should Noira work on?</h2>
      <p>It plans, uses its tools, and asks you before anything risky.</p>
      <div class="ideas">${IDEAS.map(i => `<button class="idea">${esc(i)}</button>`).join('')}</div>
    </div>`;
    $$('.idea', thread).forEach(b => b.addEventListener('click', () => { $<HTMLTextAreaElement>('#task').value = b.textContent ?? ''; $<HTMLTextAreaElement>('#task').focus(); }));
  }
  for (const m of state.chat) thread.append(msgEl(m));
  thread.scrollTop = thread.scrollHeight;

  const ta = $<HTMLTextAreaElement>('#task');
  const grow = () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`; };
  ta.addEventListener('input', grow);
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $<HTMLFormElement>('#composer').requestSubmit(); } });
  $('#composer').addEventListener('submit', e => { e.preventDefault(); void send(); });
  $('#clearChat').addEventListener('click', () => { state.chat = []; saveChat(); renderChat(); });
  paintComposer();
}

function busyRun(): ChatMsg | undefined { return state.chat.find(m => m.role === 'assistant' && m.status === 'running'); }

function paintComposer() {
  const btn = document.getElementById('sendBtn') as HTMLButtonElement | null;
  if (!btn) return;
  const busy = busyRun();
  btn.textContent = busy ? 'Stop' : 'Send';
  btn.classList.toggle('danger', Boolean(busy));
}

async function send() {
  const busy = busyRun();
  if (busy?.runId) { await api('POST', `/runs/${busy.runId}/stop`).catch(() => undefined); return; }
  const ta = $<HTMLTextAreaElement>('#task');
  const task = ta.value.trim();
  if (!task) return;
  if (state.status && !state.status.configured) { toast('Set up a model in Settings first.', true); go('settings'); return; }
  ta.value = '';
  ta.style.height = 'auto';
  const history = state.chat.filter(m => m.status !== 'running').slice(-12).map(m => ({ role: m.role, content: m.role === 'user' ? m.text : (m.result || m.text) })).filter(h => h.content);
  const user: ChatMsg = { id: crypto.randomUUID(), role: 'user', text: task, steps: [] };
  state.chat.push(user);
  if (state.chat.length === 1) $('#thread').innerHTML = '';
  $('#thread').append(msgEl(user));
  try {
    const run = await api<Run>('POST', '/runs', { task, source: 'panel', history });
    const bot: ChatMsg = { id: crypto.randomUUID(), role: 'assistant', text: '', runId: run.id, steps: [], status: 'running' };
    state.chat.push(bot);
    $('#thread').append(msgEl(bot));
    saveChat();
    paintComposer();
  } catch (e) {
    toast((e as Error).message, true);
  }
  $('#thread').scrollTop = $('#thread').scrollHeight;
}

function msgEl(m: ChatMsg): HTMLElement {
  const el = document.createElement('div');
  el.id = `m-${m.id}`;
  el.className = `msg ${m.role}`;
  fillMsg(el, m);
  return el;
}

function fillMsg(el: HTMLElement, m: ChatMsg) {
  if (m.role === 'user') { el.textContent = m.text; return; }
  const pending = state.approvals.filter(a => a.runId === m.runId);
  const icon = { ok: '✓', error: '✗', denied: '⊘', blocked: '⊘' } as const;
  el.innerHTML = `
    ${m.steps.length ? `<div class="steps">${m.steps.map(s => s.kind === 'tool' ? `<details class="step ${s.status}"><summary><span>${icon[s.status]}</span> ${esc(s.summary)}</summary><pre>${esc(s.output)}</pre></details>` : '').join('')}</div>` : ''}
    ${pending.map(a => `<div class="ask-card" data-id="${a.id}">
      <p><b>Approve?</b> ${esc(a.summary)}</p>
      <div class="row"><button class="primary sm" data-d="allow">Allow</button><button class="ghost sm" data-d="always">Always allow ${esc(a.tool)}</button><button class="ghost sm danger-text" data-d="deny">Deny</button></div>
    </div>`).join('')}
    <div class="md">${m.text ? md(m.text) : m.status === 'running' && !pending.length ? '<span class="dots"><i></i><i></i><i></i></span>' : ''}</div>
    ${m.status && m.status !== 'running' && m.status !== 'done' ? `<p class="run-end ${m.status}">${m.status === 'error' ? esc(m.result ?? 'Error') : 'Stopped.'}</p>` : ''}`;
  $$<HTMLButtonElement>('.ask-card button', el).forEach(b => b.addEventListener('click', () => {
    const id = b.closest<HTMLElement>('.ask-card')!.dataset.id!;
    void decide(id, b.dataset.d as 'allow' | 'deny' | 'always');
  }));
}

function paintMsg(m: ChatMsg) {
  const el = document.getElementById(`m-${m.id}`);
  if (!el) return;
  fillMsg(el, m);
  const thread = document.getElementById('thread');
  if (thread && thread.scrollHeight - thread.scrollTop - thread.clientHeight < 160) thread.scrollTop = thread.scrollHeight;
}

async function decide(id: string, decision: 'allow' | 'deny' | 'always') {
  try { await api('POST', `/approvals/${id}`, { decision }); } catch (e) { toast((e as Error).message, true); }
}

/* ------------------------------------------------------------------ approvals */
function renderApprovals() {
  main.innerHTML = `<section class="page">
    <header class="bar"><h1>Approvals</h1></header>
    <p class="lede">Shell commands, file changes, web requests and new jobs wait here until you answer. Unanswered requests are denied when they expire.</p>
    <div class="list" id="apList"></div>
    ${'Notification' in window && Notification.permission === 'default' ? '<button class="ghost" id="notifyBtn">Notify me when something is waiting</button>' : ''}
  </section>`;
  const list = $('#apList');
  list.innerHTML = state.approvals.length
    ? state.approvals.map(a => `<article class="card ask-card" data-id="${a.id}">
        <div class="card-top"><span class="pill">${esc(a.tool)}</span><span class="muted">${ago(a.createdAt)} · expires ${when(a.expiresAt)}</span></div>
        <p class="summary">${esc(a.summary)}</p>
        <div class="row"><button class="primary" data-d="allow">Allow</button><button class="ghost" data-d="always">Always allow</button><button class="ghost danger-text" data-d="deny">Deny</button></div>
      </article>`).join('')
    : '<div class="blank">Nothing is waiting for you.</div>';
  $$<HTMLButtonElement>('.ask-card button', list).forEach(b => b.addEventListener('click', () => void decide(b.closest<HTMLElement>('.ask-card')!.dataset.id!, b.dataset.d as 'allow')));
  document.getElementById('notifyBtn')?.addEventListener('click', () => void Notification.requestPermission().then(() => renderApprovals()));
}

/* ------------------------------------------------------------------ activity */
async function renderActivity(openId?: string) {
  const runs = await api<Run[]>('GET', '/runs?limit=60').catch(() => [] as Run[]);
  main.innerHTML = `<section class="page">
    <header class="bar"><h1>Activity</h1></header>
    <p class="lede">Every run, whoever started it: you, a scheduled job, or the terminal.</p>
    <div class="list" id="runList">${runs.length ? runs.map(r => `
      <button class="card run-row" data-id="${r.id}">
        <span class="dot ${r.status}"></span>
        <span class="run-task">${esc(r.task)}</span>
        <span class="muted">${r.source === 'cron' ? 'job' : r.source} · ${ago(r.startedAt)}</span>
      </button>`).join('') : '<div class="blank">No runs yet.</div>'}</div>
    <div id="runDetail"></div>
  </section>`;
  $$('.run-row').forEach(b => b.addEventListener('click', () => void showRun(b.dataset.id!)));
  if (openId) void showRun(openId);
}

async function showRun(id: string) {
  const r = await api<Run>('GET', `/runs/${id}`);
  const d = $('#runDetail');
  d.innerHTML = `<article class="card detail">
    <div class="card-top"><span class="pill ${r.status}">${r.status}</span><span class="muted">${new Date(r.startedAt).toLocaleString()}${r.endedAt ? ` · ${Math.round((r.endedAt - r.startedAt) / 1000)} s` : ''}</span></div>
    <h3>${esc(r.task)}</h3>
    <div class="steps">${(r.steps ?? []).map(s => s.kind === 'tool'
      ? `<details class="step ${s.status}"><summary>${esc(s.summary)} <em>${s.status}</em></summary><pre>${esc(s.output)}</pre></details>`
      : s.kind === 'text' ? `<div class="md">${md(s.text)}</div>` : '').join('')}</div>
    ${r.status !== 'done' ? `<p class="run-end ${r.status}">${esc(r.result)}</p>` : ''}
  </article>`;
  d.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ------------------------------------------------------------------ jobs */
const PRESETS: [string, string][] = [['Every weekday 08:00', '0 8 * * 1-5'], ['Every day 07:00', '0 7 * * *'], ['Every hour', '0 * * * *'], ['Every Friday 16:00', '0 16 * * 5'], ['Every Monday 09:00', '0 9 * * 1']];

async function renderJobs() {
  const jobs = await api<Job[]>('GET', '/jobs').catch(() => [] as Job[]);
  main.innerHTML = `<section class="page">
    <header class="bar"><h1>Jobs</h1></header>
    <p class="lede">Tasks Noira runs by itself on a schedule while this machine is on. Results land in Activity.</p>
    <form class="card form" id="jobForm">
      <label>Task<textarea name="task" rows="2" required placeholder="Scan launches and write a short brief to brief.md"></textarea></label>
      <div class="grid2">
        <label>When<select name="preset">${PRESETS.map(([l, c]) => `<option value="${c}">${l}</option>`).join('')}<option value="">Custom cron…</option></select></label>
        <label>Cron<input name="cron" value="${PRESETS[0]![1]}" required pattern="\\S+(\\s+\\S+){4}" title="Five fields: minute hour day month weekday"></label>
      </div>
      <label>Name <span class="muted">(optional)</span><input name="name" maxlength="80"></label>
      <button class="primary" type="submit">Schedule job</button>
    </form>
    <div class="list">${jobs.length ? jobs.map(j => `
      <article class="card job" data-id="${j.id}">
        <div class="card-top"><b>${esc(j.name)}</b><label class="switch"><input type="checkbox" ${j.enabled ? 'checked' : ''} data-act="toggle"><span></span></label></div>
        <p class="summary">${esc(j.task)}</p>
        <p class="muted"><code>${esc(j.cron)}</code> · next ${when(j.nextRunAt)} · last ${j.lastRunAt ? ago(j.lastRunAt) : 'never'}</p>
        <div class="row"><button class="ghost sm" data-act="run">Run now</button><button class="ghost sm danger-text" data-act="del">Delete</button></div>
      </article>`).join('') : '<div class="blank">No jobs yet.</div>'}</div>
  </section>`;
  const f = $<HTMLFormElement>('#jobForm');
  const preset = f.elements.namedItem('preset') as HTMLSelectElement;
  const cron = f.elements.namedItem('cron') as HTMLInputElement;
  preset.addEventListener('change', () => { if (preset.value) cron.value = preset.value; else cron.focus(); });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const data = new FormData(f);
    try {
      await api('POST', '/jobs', { task: data.get('task'), cron: data.get('cron'), name: data.get('name') });
      toast('Job scheduled');
    } catch (err) { toast((err as Error).message, true); }
  });
  $$('.job').forEach(card => {
    const id = card.dataset.id!;
    $$<HTMLElement>('[data-act]', card).forEach(el => el.addEventListener(el.tagName === 'INPUT' ? 'change' : 'click', async () => {
      try {
        if (el.dataset.act === 'toggle') await api('PATCH', `/jobs/${id}`, { enabled: (el as HTMLInputElement).checked });
        if (el.dataset.act === 'run') { const r = await api<{ runId: string }>('POST', `/jobs/${id}/run`); toast('Started'); go('activity'); void renderActivity(r.runId); }
        if (el.dataset.act === 'del' && confirm('Delete this job?')) await api('DELETE', `/jobs/${id}`);
      } catch (err) { toast((err as Error).message, true); }
    }));
  });
}

/* ------------------------------------------------------------------ memory */
async function renderMemory() {
  const items = await api<Memory[]>('GET', '/memory').catch(() => [] as Memory[]);
  main.innerHTML = `<section class="page">
    <header class="bar"><h1>Memory</h1><span class="muted">${items.length} saved</span></header>
    <p class="lede">What Noira keeps between conversations. It adds to this when you tell it something worth keeping; you can add or remove entries yourself.</p>
    <form class="card form inline" id="memForm"><input name="text" required minlength="2" placeholder="e.g. My project lives in ~/code/shop and deploys with npm run ship"><button class="primary">Add</button></form>
    <div class="list">${items.length ? items.map(m => `<article class="card mem"><p>${esc(m.text)}</p><div class="row"><span class="muted">${ago(m.createdAt)}</span><button class="ghost sm danger-text" data-id="${m.id}">Forget</button></div></article>`).join('') : '<div class="blank">Nothing remembered yet.</div>'}</div>
  </section>`;
  $<HTMLFormElement>('#memForm').addEventListener('submit', async e => {
    e.preventDefault();
    const input = $<HTMLInputElement>('input', e.target as HTMLElement);
    try { await api('POST', '/memory', { text: input.value }); } catch (err) { toast((err as Error).message, true); }
  });
  $$<HTMLButtonElement>('.mem button').forEach(b => b.addEventListener('click', () => void api('DELETE', `/memory/${b.dataset.id}`)));
}

/* ------------------------------------------------------------------ files */
async function renderFiles(p = state.filesPath) {
  state.filesPath = p;
  let data: { path: string; entries?: { name: string; dir: boolean; size: number; modified: number }[]; content?: string; size?: number };
  try { data = await api('GET', `/files?path=${encodeURIComponent(p)}`); } catch (e) { toast((e as Error).message, true); data = { path: '.', entries: [] }; }
  const crumbs = ['workspace', ...(data.path && data.path !== '.' ? data.path.split(/[\\/]/) : [])];
  const up = data.path && data.path !== '.' ? data.path.split(/[\\/]/).slice(0, -1).join('/') || '.' : null;
  main.innerHTML = `<section class="page">
    <header class="bar"><h1>Files</h1><span class="muted crumbs">${crumbs.map(esc).join(' / ')}</span></header>
    <p class="lede">The agent's workspace${state.status ? `: <code>${esc(state.status.workspace)}</code>` : ''}. Everything it writes lands here.</p>
    ${data.entries ? `<div class="list files">
      ${up !== null ? `<button class="card file" data-path="${esc(up)}"><span>↰</span><span>..</span><span></span></button>` : ''}
      ${data.entries.length ? data.entries.map(e => {
        const full = data.path && data.path !== '.' ? `${data.path}/${e.name}` : e.name;
        return `<button class="card file" data-path="${esc(full)}"><span>${e.dir ? '▸' : '·'}</span><span>${esc(e.name)}${e.dir ? '/' : ''}</span><span class="muted">${e.dir ? '' : `${(e.size / 1024).toFixed(1)} KB`}</span></button>`;
      }).join('') : '<div class="blank">Empty folder.</div>'}
    </div>` : `<article class="card viewer">
      <div class="card-top"><button class="ghost sm" data-path="${esc(up ?? '.')}">← Back</button><span class="muted">${((data.size ?? 0) / 1024).toFixed(1)} KB</span></div>
      ${/\.html?$/i.test(data.path) ? `<iframe sandbox="allow-scripts" title="Preview" srcdoc="${esc(data.content ?? '')}"></iframe><details><summary>Source</summary><pre>${esc(data.content ?? '')}</pre></details>` : `<pre>${esc(data.content ?? '')}</pre>`}
    </article>`}
  </section>`;
  $$<HTMLElement>('[data-path]').forEach(b => b.addEventListener('click', () => void renderFiles(b.dataset.path!)));
}

/* ------------------------------------------------------------------ settings */
async function renderSettings() {
  const [cfg, tools] = await Promise.all([api<PublicConfig>('GET', '/config'), api<ToolInfo[]>('GET', '/tools')]).catch(e => { toast((e as Error).message, true); return [null, []] as const; });
  if (!cfg) { main.innerHTML = '<section class="page"><div class="blank">Could not load settings.</div></section>'; return; }
  main.innerHTML = `<section class="page">
    <header class="bar"><h1>Settings</h1></header>
    ${cfg.configured ? '' : '<div class="callout">Pick a model and add its key to start. Keys stay in <code>~/.noira/config.json</code> on this machine.</div>'}
    <form class="card form" id="modelForm">
      <h2>Model</h2>
      <label>Provider<select name="provider">
        <option value="anthropic" ${cfg.provider === 'anthropic' ? 'selected' : ''}>Claude (Anthropic)</option>
        <option value="openai" ${cfg.provider === 'openai' ? 'selected' : ''}>OpenAI-compatible (OpenAI, OpenRouter, Ollama…)</option>
      </select></label>
      <label class="oa">Endpoint URL<input name="baseUrl" value="${esc(cfg.baseUrl)}" placeholder="https://api.openai.com/v1 or http://127.0.0.1:11434/v1"></label>
      <label>Model<input name="model" value="${esc(cfg.model)}" placeholder="claude-opus-5-5" required></label>
      <label>API key<input name="apiKey" type="password" autocomplete="off" placeholder="${cfg.apiKeySet ? `Saved (${esc(cfg.apiKeyHint)}). Leave empty to keep it.` : 'Paste your key'}"></label>
      <div class="grid2">
        <label>Launch feed<input name="feedUrl" value="${esc(cfg.feedUrl)}" placeholder="https://your-noira-site"></label>
        <label>Approvals expire after (minutes)<input name="approvalTimeoutMin" type="number" min="1" value="${cfg.approvalTimeoutMin}"></label>
      </div>
      <button class="primary" type="submit">Save</button>
    </form>
    <section class="card">
      <h2>Permissions</h2>
      <p class="muted">What each tool may do without asking.</p>
      <div class="policy">${tools.map(t => `<div class="pol-row" data-tool="${t.name}">
        <div><b>${t.name}</b><p class="muted">${esc(t.description)}</p></div>
        <div class="seg" role="radiogroup" aria-label="${t.name}">${(['allow', 'ask', 'block'] as Level[]).map(l => `<button type="button" role="radio" aria-checked="${t.level === l}" data-l="${l}">${l === 'allow' ? 'Always allow' : l === 'ask' ? 'Ask me' : 'Blocked'}</button>`).join('')}</div>
      </div>`).join('')}</div>
    </section>
    <section class="card about">
      <h2>Gateway</h2>
      <p class="muted">Version ${esc(state.status?.version ?? '?')} · ${remote ? `connected to ${esc(base)}` : `on this machine (${esc(location.host)})`}</p>
      ${remote ? '<button class="ghost" id="disconnect">Connect to another gateway</button>' : '<p class="muted">Phone: run <code>noira start --remote</code> and <code>noira pair</code>, then connect the Noira app over Tailscale.</p>'}
    </section>
  </section>`;
  const f = $<HTMLFormElement>('#modelForm');
  const provider = f.elements.namedItem('provider') as HTMLSelectElement;
  const syncProvider = () => $$('.oa', f).forEach(el => { el.hidden = provider.value !== 'openai'; });
  provider.addEventListener('change', () => {
    syncProvider();
    const model = f.elements.namedItem('model') as HTMLInputElement;
    if (provider.value === 'anthropic' && !model.value) model.value = 'claude-opus-5-5';
  });
  syncProvider();
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const d = new FormData(f);
    const body: Record<string, unknown> = {
      provider: d.get('provider'), model: String(d.get('model')).trim(), baseUrl: String(d.get('baseUrl')).trim(),
      feedUrl: String(d.get('feedUrl')).trim(), approvalTimeoutMin: Number(d.get('approvalTimeoutMin')),
    };
    const key = String(d.get('apiKey')).trim();
    if (key) body.apiKey = key;
    try { await api('PUT', '/config', body); toast('Saved'); void refreshStatus(); void renderSettings(); } catch (err) { toast((err as Error).message, true); }
  });
  $$('.pol-row').forEach(row => $$<HTMLButtonElement>('button', row).forEach(b => b.addEventListener('click', async () => {
    const policy = { ...cfg.policy, [row.dataset.tool!]: b.dataset.l as Level };
    try {
      await api('PUT', '/config', { policy });
      cfg.policy = policy;
      $$<HTMLButtonElement>('button', row).forEach(x => x.setAttribute('aria-checked', String(x === b)));
    } catch (err) { toast((err as Error).message, true); }
  })));
  document.getElementById('disconnect')?.addEventListener('click', () => { store.set('noira.token', ''); location.reload(); });
}

/* ------------------------------------------------------------------ routing */
const VIEWS: Record<string, () => void | Promise<void>> = {
  chat: renderChat, approvals: renderApprovals, activity: () => renderActivity(), jobs: renderJobs, memory: renderMemory, files: () => renderFiles(), settings: renderSettings,
};

function go(view: string) {
  if (!VIEWS[view]) view = 'chat';
  state.view = view;
  history.replaceState(null, '', `#${view}`);
  $$<HTMLButtonElement>('.tabs button').forEach(b => b.toggleAttribute('aria-current', b.dataset.view === view));
  void VIEWS[view]!();
}

/* ------------------------------------------------------------------ connect (phone / remote) */
function renderConnect(error = '') {
  document.body.classList.add('connect-mode');
  main.innerHTML = `<section class="connect">
    <div class="orb"></div>
    <h1>Connect to your gateway</h1>
    <p class="lede">The Noira agent runs on your computer or server. On it, run <code>noira start --remote</code> and <code>noira pair</code>, then enter what it shows. Use a private network such as Tailscale.</p>
    <form class="card form" id="connectForm">
      <label>Gateway URL<input name="url" required inputmode="url" placeholder="http://100.101.102.103:18790" value="${esc(base)}"></label>
      <label>Token<input name="token" required autocomplete="off" value=""></label>
      ${error ? `<p class="err">${esc(error)}</p>` : ''}
      <button class="primary" type="submit">Connect</button>
    </form>
  </section>`;
  $<HTMLFormElement>('#connectForm').addEventListener('submit', async e => {
    e.preventDefault();
    const d = new FormData(e.target as HTMLFormElement);
    base = String(d.get('url')).trim().replace(/\/+$/, '');
    token = String(d.get('token')).trim();
    try {
      await api('GET', '/status');
      store.set('noira.url', base);
      store.set('noira.token', token);
      document.body.classList.remove('connect-mode');
      start();
    } catch (err) {
      renderConnect(err instanceof ApiError && err.status === 401 ? 'That token is not right.' : `Could not reach ${base}. Is the gateway running with --remote, and is this phone on the same private network?`);
    }
  });
}

/* ------------------------------------------------------------------ install + boot */
let installEvent: (Event & { prompt: () => Promise<void> }) | null = null;
addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installEvent = e as typeof installEvent;
  $('#installBtn').hidden = false;
});
$('#installBtn').addEventListener('click', async () => { await installEvent?.prompt(); $('#installBtn').hidden = true; });
if ('serviceWorker' in navigator && isSecureContext && !remote) void navigator.serviceWorker.register('sw.js').catch(() => undefined);

$$<HTMLButtonElement>('.tabs button').forEach(b => b.addEventListener('click', () => go(b.dataset.view!)));

function start() {
  connectEvents();
  void refreshStatus().then(() => { if (state.status && !state.status.configured && state.view === 'chat') go('settings'); });
  setInterval(() => void refreshStatus(), 20_000);
  go(state.view);
}

if (!token) renderConnect();
else start();
