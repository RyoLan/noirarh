import 'dotenv/config';
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { BuildRefusedError, MODEL } from '../shared/build.js';
import type { AgentStatus } from '../shared/types.js';
import { askAgent, parseHistory } from './agent.js';
import { DemoSource, LaunchFeed } from './feed.js';
import { isAdmin, LoginLimiter, parseTokenInput, TokenStore } from './token.js';

// run from the project folder: npm run dev / npm start
const ROOT = process.cwd();
const PROD = process.argv.includes('--prod') || process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT ?? 5173);
const HOST = process.env.HOST; // e.g. 127.0.0.1 behind a reverse proxy; unset listens on every interface
const ASKS = Number(process.env.ASK_PER_DAY ?? 40);

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD?.trim() || undefined;

const feed = new LaunchFeed(new DemoSource());
feed.start();

const token = new TokenStore(path.resolve(ROOT, process.env.DATA_DIR ?? 'data'));
await token.load();
const logins = new LoginLimiter();

const hasCredentials = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE)
  || existsSync(path.join(os.homedir(), '.config', 'anthropic'));

let client: Anthropic | null = null;
function claude(): Anthropic {
  // Resolves ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN or an `ant auth login` profile.
  client ??= new Anthropic();
  return client;
}

/* ---------- per-visitor daily quotas (in memory; use a store when you run more than one instance) ---------- */
const usage = new Map<string, number>();
const today = () => new Date().toISOString().slice(0, 10);
const visitor = (req: IncomingMessage) => String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? 'anon').split(',')[0]!.trim();
const used = (kind: string, req: IncomingMessage) => usage.get(`${kind}:${visitor(req)}:${today()}`) ?? 0;
const spend = (kind: string, req: IncomingMessage) => usage.set(`${kind}:${visitor(req)}:${today()}`, used(kind, req) + 1);

/* ---------- helpers ---------- */
function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function sse(res: ServerResponse) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.flushHeaders();
  return (event: string, data: unknown) => {
    if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
}

async function readJson(req: IncomingMessage, limit = 32_000): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error('Request body too large');
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

/** Turns SDK errors into something a visitor can act on. */
function friendly(err: unknown): string {
  if (err instanceof BuildRefusedError) return err.message;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return 'The agent is offline: the server has no valid Claude credentials. Set ANTHROPIC_API_KEY in .env and restart.';
  }
  if (err instanceof Anthropic.RateLimitError) return 'The agent is busy right now. Try again in a minute.';
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the Claude API from the server.';
  if (err instanceof Anthropic.APIError) return `The Claude API returned an error (${err.status ?? 'unknown'}).`;
  if (err instanceof Error && /api key|apiKey|authToken|credentials/i.test(err.message)) {
    return 'The agent is offline: the server has no Claude credentials. Set ANTHROPIC_API_KEY in .env and restart.';
  }
  return err instanceof Error ? err.message : 'Something went wrong.';
}

function abortOnClose(req: IncomingMessage, res: ServerResponse) {
  const ac = new AbortController();
  res.on('close', () => { if (!res.writableFinished) ac.abort(); });
  req.on('aborted', () => ac.abort());
  return ac;
}

/* ---------- routes ---------- */
async function api(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  const route = `${req.method} ${url.pathname}`;

  if (route === 'GET /api/status') {
    const status: AgentStatus = { model: MODEL, credentials: hasCredentials, source: feed.source.name };
    json(res, 200, status);
    return true;
  }

  if (route === 'GET /api/feed') {
    const send = sse(res);
    send('snapshot', { launches: feed.recent(12), stats: feed.stats() });
    const onLaunch = (launch: unknown) => send('launch', { launch, stats: feed.stats() });
    feed.on('launch', onLaunch);
    const beat = setInterval(() => res.write(': ping\n\n'), 20_000);
    req.on('close', () => { feed.off('launch', onLaunch); clearInterval(beat); });
    return true;
  }

  // read by the Noira agent's scan_launches tool and `noira scan`
  if (route === 'GET /api/launches') {
    const v = url.searchParams.get('verdict');
    const verdict = v === 'signal' || v === 'noise' ? v : 'any';
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 10));
    const launches = feed.query({ verdict, limit }).map(l => ({
      ticker: l.ticker, verdict: l.verdict, passed: `${l.passed}/7`, collapsedOn: l.collapsedOn, mcapUsd: l.mcapUsd,
      ageSec: Math.round((Date.now() - l.createdAt) / 1000) + l.ageSec, deployer: l.deployer,
      checks: Object.fromEntries(l.checks.map(c => [c.id, `${c.status}: ${c.value}`])),
    }));
    res.setHeader('access-control-allow-origin', '*');
    json(res, 200, { source: feed.source.name, stats: feed.stats(), launches });
    return true;
  }

  if (route === 'GET /api/wallet') {
    const w = feed.wallet(url.searchParams.get('address') ?? '');
    json(res, w ? 200 : 404, w ?? { error: 'Wallet not seen in the feed' });
    return true;
  }

  if (route === 'POST /api/ask') {
    let history;
    try { history = parseHistory((await readJson(req) as { messages?: unknown }).messages); } catch { history = null; }
    if (!history) { json(res, 400, { error: 'Send { messages: [...] } ending with a user message.' }); return true; }
    if (used('ask', req) >= ASKS) { json(res, 429, { error: 'Daily question limit reached. Come back tomorrow.' }); return true; }
    spend('ask', req);

    const send = sse(res);
    const ac = abortOnClose(req, res);
    try {
      await askAgent(claude(), feed, history, e => send(e.type, e), ac.signal);
    } catch (err) {
      if (!ac.signal.aborted) send('error', { message: friendly(err) });
    }
    res.end();
    return true;
  }

  // The page's Vibecode window is a scripted replay, and real builds happen in the
  // user's own agent (`noira build`), so the site no longer spends API credit on builds.

  /* ---------- $NOIRA contract address (public read, admin write) ---------- */
  if (route === 'GET /api/token') {
    json(res, 200, token.get());
    return true;
  }

  if (url.pathname === '/api/admin/token' && (req.method === 'GET' || req.method === 'PUT')) {
    const who = visitor(req);
    if (!ADMIN_PASSWORD) { json(res, 503, { error: 'Admin is off: set ADMIN_PASSWORD in .env and restart the server.' }); return true; }
    if (logins.blocked(who)) { json(res, 429, { error: 'Too many wrong passwords. Try again in 15 minutes.' }); return true; }
    if (!isAdmin(req.headers.authorization, ADMIN_PASSWORD)) {
      logins.fail(who);
      json(res, 401, { error: 'Wrong password.' });
      return true;
    }
    logins.ok(who);
    if (req.method === 'GET') { json(res, 200, token.get()); return true; }

    let body: unknown;
    try { body = await readJson(req, 4_000); } catch { json(res, 400, { error: 'Send JSON: { contractAddress, buyUrl }' }); return true; }
    const parsed = parseTokenInput(body);
    if (!parsed.ok) { json(res, 400, { error: parsed.error }); return true; }
    const saved = await token.set(parsed.value);
    console.log(`[admin] token updated by ${who}: CA=${saved.contractAddress || '(empty)'} buy=${saved.buyUrl || '(empty)'}`);
    json(res, 200, saved);
    return true;
  }

  if (route === 'GET /api/downloads') {
    json(res, 200, await listDownloads());
    return true;
  }

  return false;
}

/* ---------- installers, served from this site ---------- */
// Files live in ./downloads (or DOWNLOADS_DIR). `npm run downloads:fetch` fills it from the
// release build, or copy the installers in by hand. Only these names are ever served.
const DOWNLOADS = path.resolve(ROOT, process.env.DOWNLOADS_DIR ?? 'downloads');
const INSTALLERS: Record<string, { os: string; type: string }> = {
  'Noira-Setup.exe': { os: 'windows', type: 'application/vnd.microsoft.portable-executable' },
  'Noira-mac.dmg': { os: 'mac', type: 'application/x-apple-diskimage' },
  'Noira-android.apk': { os: 'android', type: 'application/vnd.android.package-archive' },
};

async function listDownloads() {
  const rows = await Promise.all(Object.entries(INSTALLERS).map(async ([file, meta]) => {
    const s = await stat(path.join(DOWNLOADS, file)).catch(() => null);
    return { file, os: meta.os, available: Boolean(s?.isFile()), size: s?.size ?? 0, updated: s?.mtimeMs ?? 0 };
  }));
  return { version: process.env.npm_package_version ?? null, files: rows };
}

async function serveDownload(req: IncomingMessage, res: ServerResponse, name: string) {
  const meta = INSTALLERS[name];
  const file = path.join(DOWNLOADS, name);
  const s = meta ? await stat(file).catch(() => null) : null;
  if (!meta || !s?.isFile()) { json(res, 404, { error: 'This installer is not available yet.' }); return; }
  res.writeHead(200, {
    'content-type': meta.type,
    'content-length': s.size,
    'content-disposition': `attachment; filename="${name}"`,
    'cache-control': 'public, max-age=300',
    'x-content-type-options': 'nosniff',
  });
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(file).pipe(res);
}

/* ---------- static files (production) ---------- */
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json',
};
async function serveStatic(res: ServerResponse, url: URL) {
  const dist = path.join(ROOT, 'dist');
  let file = path.normalize(path.join(dist, decodeURIComponent(url.pathname)));
  if (!file.startsWith(dist)) { res.writeHead(403).end(); return; }
  try { if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html'); } catch { file = path.join(dist, 'index.html'); }
  try {
    const body = await readFile(file);
    const immutable = file.includes(`${path.sep}assets${path.sep}`);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}

/* ---------- boot ---------- */
const vite = PROD ? null : await (await import('vite')).createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'spa' });

createHttpServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  // /docs is the short address of the documentation page
  if (url.pathname === '/docs' || url.pathname === '/docs/') {
    url.pathname = '/docs.html';
    req.url = `/docs.html${url.search}`;
  }
  // /admin is the panel for the contract address
  if (url.pathname === '/admin' || url.pathname === '/admin/') {
    url.pathname = '/admin.html';
    req.url = `/admin.html${url.search}`;
  }
  try {
    if (url.pathname.startsWith('/api/')) {
      if (!(await api(req, res, url))) json(res, 404, { error: 'Not found' });
      return;
    }
    if (url.pathname.startsWith('/downloads/')) {
      await serveDownload(req, res, decodeURIComponent(url.pathname.slice('/downloads/'.length)));
      return;
    }
    if (vite) vite.middlewares(req, res);
    else await serveStatic(res, url);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) json(res, 500, { error: 'Server error' });
    else res.end();
  }
}).listen(PORT, HOST, () => {
  console.log(`Noira running at http://localhost:${PORT}  (${PROD ? 'production' : 'dev'}, model ${MODEL}, feed: ${feed.source.name})`);
  if (!ADMIN_PASSWORD) console.warn('No ADMIN_PASSWORD set: the /admin panel stays locked until you add one to .env.');
  if (!hasCredentials) console.warn('No Claude credentials found: set ANTHROPIC_API_KEY in .env so Ask Noira and the builder can run.');
});
