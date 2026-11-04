import './admin.css';
import type { TokenInfo } from '../shared/types';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const login = $<HTMLFormElement>('login');
const editor = $<HTMLFormElement>('editor');
const pw = $<HTMLInputElement>('pw');
const ca = $<HTMLInputElement>('ca');
const buy = $<HTMLInputElement>('buy');
const loginMsg = $('loginMsg');
const saveMsg = $('saveMsg');
const save = $<HTMLButtonElement>('save');

// kept for this tab only; closing the tab logs out
const KEY = 'noira-admin';
let password = sessionStorage.getItem(KEY) ?? '';

const EVM = /^0x[0-9a-fA-F]{40}$/;
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

async function call(method: 'GET' | 'PUT', body?: unknown): Promise<TokenInfo> {
  const r = await fetch('/api/admin/token', {
    method,
    headers: { authorization: `Bearer ${password}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error ?? `Request failed (${r.status})`), { status: r.status });
  return data as TokenInfo;
}

function show(t: TokenInfo) {
  ca.value = t.contractAddress;
  buy.value = t.buyUrl;
  $('liveCa').textContent = t.contractAddress || 'Coming soon';
  $('liveCa').classList.toggle('empty', !t.contractAddress);
  $('liveTime').textContent = t.updatedAt ? `updated ${new Date(t.updatedAt).toLocaleString()}` : 'never set';
  validate();
}

function unlock(t: TokenInfo) {
  login.hidden = true;
  editor.hidden = false;
  $('logout').hidden = false;
  show(t);
  ca.focus();
}

function lock(message = '') {
  password = '';
  sessionStorage.removeItem(KEY);
  editor.hidden = true;
  $('logout').hidden = true;
  login.hidden = false;
  loginMsg.textContent = message;
  loginMsg.className = message ? 'msg bad' : 'msg';
  pw.value = '';
  pw.focus();
}

function validate(): boolean {
  const v = ca.value.trim();
  const good = !v || EVM.test(v) || B58.test(v);
  ca.classList.toggle('bad', !good);
  $('caHint').textContent = good
    ? (v ? 'Looks right.' : 'Empty: the site shows "Coming soon".')
    : 'Not a valid address: expected 0x followed by 40 hex characters.';
  $('caHint').classList.toggle('bad', !good);
  return good;
}
ca.addEventListener('input', () => { validate(); saveMsg.textContent = ''; });
buy.addEventListener('input', () => { saveMsg.textContent = ''; });

login.addEventListener('submit', async e => {
  e.preventDefault();
  password = pw.value;
  loginMsg.className = 'msg';
  loginMsg.textContent = 'Checking…';
  try {
    const t = await call('GET');
    sessionStorage.setItem(KEY, password);
    loginMsg.textContent = '';
    unlock(t);
  } catch (err) {
    lock((err as Error).message);
  }
});

editor.addEventListener('submit', async e => {
  e.preventDefault();
  if (!validate()) { ca.focus(); return; }
  const next = { contractAddress: ca.value.trim(), buyUrl: buy.value.trim() };
  if (next.contractAddress && !confirm(`Publish this CA on the site?\n\n${next.contractAddress}`)) return;
  save.disabled = true;
  saveMsg.className = 'msg';
  saveMsg.textContent = 'Saving…';
  try {
    show(await call('PUT', next));
    saveMsg.classList.add('ok');
    saveMsg.textContent = 'Saved. The home page shows it on the next load.';
  } catch (err) {
    if ((err as { status?: number }).status === 401) { lock('Session expired: sign in again.'); return; }
    saveMsg.classList.add('bad');
    saveMsg.textContent = (err as Error).message;
  } finally {
    save.disabled = false;
  }
});

$('clear').addEventListener('click', () => { ca.value = ''; validate(); ca.focus(); });
$('logout').addEventListener('click', () => lock());

if (password) {
  call('GET').then(unlock, () => lock());
} else {
  pw.focus();
}
