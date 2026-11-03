import 'dotenv/config';
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { BuildRefusedError, MODEL, slugFor, streamSite } from '../shared/build.js';
import type { AgentStatus } from '../shared/types.js';
import { askAgent, parseHistory } from './agent.js';
import { DemoSource, LaunchFeed } from './feed.js';

// run from the project folder: npm run dev / npm start
const ROOT = process.cwd();
const PROD = process.argv.includes('--prod') || process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT ?? 5173);
const FREE_BUILDS = Number(process.env.BUILD_FREE_PER_DAY ?? 3);
const ASKS = Number(process.env.ASK_PER_DAY ?? 40);

const feed = new LaunchFeed(new DemoSource());
feed.start();

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
    const status: AgentStatus = { model: MODEL, credentials: hasCredentials, source: feed.source.name, buildsLeft: Math.max(0, FREE_BUILDS - used('build', req)) };
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

  if (route === 'POST /api/build') {
    const Body = z.object({ prompt: z.string().trim().min(4).max(400) });
    let prompt: string;
    try { prompt = Body.parse(await readJson(req)).prompt; } catch { json(res, 400, { error: 'Describe what to build in 4–400 characters.' }); return true; }
    if (used('build', req) >= FREE_BUILDS) {
      json(res, 429, { error: `You have used today’s ${FREE_BUILDS} free builds. Holders build without limits.` });
      return true;
    }

    const send = sse(res);
    const ac = abortOnClose(req, res);
    try {
      send('start', { slug: slugFor(prompt), model: MODEL });
      const html = await streamSite(claude(), prompt, {
        onThinking: text => send('thinking', { text }),
        onText: text => send('text', { text }),
      }, ac.signal);
      spend('build', req);
      send('done', { html, slug: slugFor(prompt), buildsLeft: Math.max(0, FREE_BUILDS - used('build', req)) });
    } catch (err) {
      if (!ac.signal.aborted) send('error', { message: friendly(err) });
    }
    res.end();
    return true;
  }

  return false;
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
  try {
    if (url.pathname.startsWith('/api/')) {
      if (!(await api(req, res, url))) json(res, 404, { error: 'Not found' });
      return;
    }
    if (vite) vite.middlewares(req, res);
    else await serveStatic(res, url);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) json(res, 500, { error: 'Server error' });
    else res.end();
  }
}).listen(PORT, () => {
  console.log(`Noira running at http://localhost:${PORT}  (${PROD ? 'production' : 'dev'}, model ${MODEL}, feed: ${feed.source.name})`);
  if (!hasCredentials) console.warn('No Claude credentials found: set ANTHROPIC_API_KEY in .env so Ask Noira and the builder can run.');
});
