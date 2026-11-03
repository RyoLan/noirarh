import { timingSafeEqual } from 'node:crypto';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { Approvals } from './approvals.js';
import { isConfigured, loadConfig, paths, publicConfig, saveConfig, type Config, type Level } from './config.js';
import { EventBus, type GatewayEvent } from './events.js';
import { MemoryStore } from './memory.js';
import { createProvider } from './model/index.js';
import { Runs } from './runs.js';
import { Scheduler } from './scheduler.js';
import { resolveInside, TOOLS, levelOf } from './tools.js';
import { VERSION } from './version.js';

export interface GatewayOptions {
  /** where the built control panel lives; defaults to dist/panel next to this file */
  panelDir?: string;
  /** listen on every interface (for phones over Tailscale); the token is still required */
  remote?: boolean;
  port?: number;
  log?: (line: string) => void;
  /** what POST /api/shutdown does after the gateway has stopped; the CLI exits, the desktop app quits */
  onShutdown?: () => void;
}

export interface Gateway {
  url: string;
  token: string;
  stop(): Promise<void>;
}

// the Android app's WebView origins; every request from them still has to carry the token
const APP_ORIGINS = new Set(['http://localhost', 'https://localhost', 'capacitor://localhost']);
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export async function startGateway(opts: GatewayOptions = {}): Promise<Gateway> {
  let cfg: Config = loadConfig();
  const log = opts.log ?? ((l: string) => console.log(l));
  const panelDir = opts.panelDir ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'panel');
  const host = opts.remote ? '0.0.0.0' : cfg.host;
  const port = opts.port ?? cfg.port;

  const bus = new EventBus();
  const memory = new MemoryStore();
  const approvals = new Approvals(bus, () => cfg.approvalTimeoutMin);
  let scheduler!: Scheduler;
  const runs = new Runs(() => cfg, bus, approvals, memory, () => scheduler);
  scheduler = new Scheduler(bus, job => (isConfigured(cfg) ? runs.start(job.task, { source: 'cron', jobId: job.id }).id : null));
  scheduler.start();
  const startedAt = Date.now();

  /* ------------------------------------------------------------ guards */
  const tokenOk = (given: string | undefined) => {
    if (!given) return false;
    const a = Buffer.from(given), b = Buffer.from(cfg.token);
    return a.length === b.length && timingSafeEqual(a, b);
  };
  const hostOk = (req: IncomingMessage) => {
    if (opts.remote) return true;
    // DNS-rebinding guard: a page on another name that resolves to 127.0.0.1 is turned away
    const h = (req.headers.host ?? '').toLowerCase();
    return h === `127.0.0.1:${port}` || h === `localhost:${port}` || h === `[::1]:${port}`;
  };

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const body = async (req: IncomingMessage): Promise<unknown> => {
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const c of req) {
      size += (c as Buffer).length;
      if (size > 256_000) throw new HttpError(413, 'Request body too large');
      chunks.push(c as Buffer);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw new HttpError(400, 'Body must be JSON'); }
  };
  const parse = <S extends z.ZodType>(schema: S, value: unknown): z.infer<S> => {
    const r = schema.safeParse(value);
    if (!r.success) throw new HttpError(400, r.error.issues.map(i => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
    return r.data;
  };

  /* ------------------------------------------------------------ API */
  async function api(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const parts = url.pathname.split('/').filter(Boolean).slice(1); // after "api"
    const [resource, id, action] = parts;
    const m = req.method ?? 'GET';

    if (resource === 'status' && m === 'GET') {
      return send(res, 200, {
        name: 'noira', version: VERSION, configured: isConfigured(cfg), model: isConfigured(cfg) ? safeLabel() : null,
        host, port, remote: Boolean(opts.remote), workspace: paths.workspace, uptimeSec: Math.round((Date.now() - startedAt) / 1000),
        activeRuns: runs.activeCount(), approvals: approvals.list().length, jobs: scheduler.list().length, memories: memory.list().length,
      });
    }

    if (resource === 'events' && m === 'GET') {
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      res.flushHeaders();
      const write = (e: GatewayEvent) => res.write(`data: ${JSON.stringify(e)}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'hello', approvals: approvals.list() })}\n\n`);
      bus.on('event', write);
      const beat = setInterval(() => res.write(': ping\n\n'), 20_000);
      req.on('close', () => { bus.off('event', write); clearInterval(beat); });
      return;
    }

    if (resource === 'runs') {
      if (!id && m === 'GET') return send(res, 200, runs.list(Number(url.searchParams.get('limit') ?? 50)));
      if (!id && m === 'POST') {
        if (!isConfigured(cfg)) throw new HttpError(409, 'No model is set up yet. Run `noira onboard` or open Settings.');
        const b = parse(z.object({
          task: z.string().trim().min(1).max(8000),
          source: z.enum(['cli', 'panel', 'chat']).default('panel'),
          history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(20_000) })).max(20).default([]),
        }), await body(req));
        return send(res, 202, runs.start(b.task, { source: b.source, history: b.history }));
      }
      if (id && !action && m === 'GET') { const r = runs.get(id); return r ? send(res, 200, r) : send(res, 404, { error: 'No such run' }); }
      if (id && action === 'stop' && m === 'POST') return send(res, runs.stop(id) ? 200 : 404, {});
    }

    if (resource === 'approvals') {
      if (!id && m === 'GET') return send(res, 200, approvals.list());
      if (id && m === 'POST') {
        const b = parse(z.object({ decision: z.enum(['allow', 'deny', 'always']) }), await body(req));
        return send(res, approvals.answer(id, b.decision) ? 200 : 404, {});
      }
    }

    if (resource === 'jobs') {
      if (!id && m === 'GET') return send(res, 200, scheduler.list());
      if (!id && m === 'POST') {
        const b = parse(z.object({ name: z.string().max(80).default(''), cron: z.string().min(9).max(120), task: z.string().trim().min(3).max(4000) }), await body(req));
        try { return send(res, 201, scheduler.add(b.name, b.cron, b.task)); } catch (e) { throw new HttpError(400, (e as Error).message); }
      }
      if (id && action === 'run' && m === 'POST') {
        if (!isConfigured(cfg)) throw new HttpError(409, 'No model is set up yet.');
        const runId = scheduler.runNow(id);
        return runId ? send(res, 202, { runId }) : send(res, 404, { error: 'No such job' });
      }
      if (id && m === 'PATCH') {
        const b = parse(z.object({ enabled: z.boolean().optional(), name: z.string().max(80).optional(), cron: z.string().optional(), task: z.string().min(3).max(4000).optional() }), await body(req));
        try { const j = scheduler.update(id, b); return j ? send(res, 200, j) : send(res, 404, { error: 'No such job' }); } catch (e) { throw new HttpError(400, (e as Error).message); }
      }
      if (id && m === 'DELETE') return send(res, scheduler.remove(id) ? 200 : 404, {});
    }

    if (resource === 'memory') {
      if (!id && m === 'GET') return send(res, 200, memory.list());
      if (!id && m === 'POST') {
        const b = parse(z.object({ text: z.string().trim().min(2).max(2000) }), await body(req));
        const mem = memory.add(b.text);
        bus.send({ type: 'memory.changed' });
        return send(res, 201, mem);
      }
      if (id && m === 'DELETE') { const ok = memory.remove(id); if (ok) bus.send({ type: 'memory.changed' }); return send(res, ok ? 200 : 404, {}); }
    }

    if (resource === 'files' && m === 'GET') {
      const target = resolveInside({ workspace: paths.workspace, cfg }, url.searchParams.get('path') ?? '.');
      const s = await stat(target).catch(() => null);
      if (!s) throw new HttpError(404, 'Not found');
      if (s.isDirectory()) {
        const entries = await readdir(target, { withFileTypes: true });
        const rows = await Promise.all(entries.slice(0, 500).map(async e => {
          const st = await stat(path.join(target, e.name)).catch(() => null);
          return { name: e.name, dir: e.isDirectory(), size: st?.size ?? 0, modified: st?.mtimeMs ?? 0 };
        }));
        return send(res, 200, { path: path.relative(paths.workspace, target), entries: rows.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name)) });
      }
      if (s.size > 2_000_000) throw new HttpError(413, 'File too large to preview');
      return send(res, 200, { path: path.relative(paths.workspace, target), size: s.size, content: await readFile(target, 'utf8') });
    }

    if (resource === 'tools' && m === 'GET') {
      return send(res, 200, TOOLS.map(t => ({ name: t.name, description: t.description, level: levelOf(cfg, t.name), defaultLevel: t.level })));
    }

    if (resource === 'config') {
      if (m === 'GET') return send(res, 200, publicConfig(cfg));
      if (m === 'PUT') {
        const level = z.enum(['allow', 'ask', 'block']);
        const b = parse(z.object({
          provider: z.enum(['anthropic', 'openai']).optional(),
          model: z.string().max(120).optional(),
          apiKey: z.string().max(400).optional(),
          baseUrl: z.union([z.literal(''), z.url()]).optional(),
          feedUrl: z.union([z.literal(''), z.url()]).optional(),
          policy: z.record(z.string(), level).optional(),
          approvalTimeoutMin: z.number().int().min(1).max(7 * 24 * 60).optional(),
        }), await body(req));
        const next: Config = { ...cfg, ...b, policy: b.policy ? (b.policy as Record<string, Level>) : cfg.policy };
        if (b.apiKey === undefined) next.apiKey = cfg.apiKey;
        cfg = next;
        saveConfig(cfg);
        bus.send({ type: 'config.changed' });
        return send(res, 200, publicConfig(cfg));
      }
    }

    if (resource === 'shutdown' && m === 'POST') {
      send(res, 200, { ok: true });
      setTimeout(() => void stop().then(opts.onShutdown ?? (() => process.exit(0))), 100);
      return;
    }

    throw new HttpError(404, 'Not found');
  }

  const safeLabel = () => { try { return createProvider(cfg).label; } catch { return cfg.model; } };

  /* ------------------------------------------------------------ panel */
  async function panel(res: ServerResponse, url: URL): Promise<void> {
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '/panel') rel = '/panel.html';
    const file = path.normalize(path.join(panelDir, rel));
    if (!file.startsWith(panelDir) || !existsSync(file)) { res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found'); return; }
    const ext = path.extname(file);
    let data: Buffer | string = await readFile(file);
    if (ext === '.html') {
      // the panel gets the token inside its own page; another site cannot read this response
      data = data.toString('utf8').replace('<!--NOIRA_BOOT-->', `<script>window.__NOIRA__=${JSON.stringify({ token: cfg.token })}</script>`);
    }
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'cache-control': ext === '.html' || rel.endsWith('sw.js') ? 'no-cache' : 'public, max-age=3600',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
    });
    res.end(data);
  }

  /* ------------------------------------------------------------ server */
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const origin = req.headers.origin;
    try {
      if (!hostOk(req)) throw new HttpError(421, 'Unknown host');
      if (origin && APP_ORIGINS.has(origin)) {
        res.setHeader('access-control-allow-origin', origin);
        res.setHeader('access-control-allow-headers', 'content-type, x-noira-token');
        res.setHeader('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE');
        res.setHeader('vary', 'origin');
        if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
      }
      if (url.pathname.startsWith('/api/')) {
        const given = (req.headers['x-noira-token'] as string | undefined) ?? url.searchParams.get('token') ?? undefined;
        if (!tokenOk(given)) throw new HttpError(401, 'Missing or wrong gateway token');
        await api(req, res, url);
        return;
      }
      if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed');
      await panel(res, url);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) log(`error: ${(err as Error).stack ?? err}`);
      if (!res.headersSent) send(res, status, { error: err instanceof Error ? err.message : 'Server error' });
      else res.end();
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', (e: NodeJS.ErrnoException) => reject(e.code === 'EADDRINUSE' ? new Error(`Port ${port} is busy: is another Noira gateway already running? (noira status)`) : e));
    server.listen(port, host, resolve);
  });
  writeFileSync(paths.pid, String(process.pid));

  const shownHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  const url = `http://${shownHost}:${port}`;
  log(`Noira gateway ${VERSION} on ${url}${opts.remote ? ' (all interfaces, token required)' : ''}`);
  log(isConfigured(cfg) ? `Model: ${safeLabel()}` : 'No model set up yet: run `noira onboard` or open the panel.');

  let stopped = false;
  async function stop() {
    if (stopped) return;
    stopped = true;
    scheduler.stop();
    runs.stopAll();
    server.closeAllConnections();
    await new Promise<void>(r => server.close(() => r()));
    try { unlinkSync(paths.pid); } catch { /* already gone */ }
  }

  return { url, token: cfg.token, stop };
}
