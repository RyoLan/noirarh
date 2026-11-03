import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { buildSite, slugFor } from './builder.js';
import type { Config, Level } from './config.js';
import { fetchLaunches } from './feed.js';
import type { MemoryStore } from './memory.js';
import type { Provider, ToolSpec } from './model/index.js';
import type { Scheduler } from './scheduler.js';
import { clip } from './store.js';

export interface ToolContext {
  cfg: Config;
  workspace: string;
  memory: MemoryStore;
  scheduler: Scheduler;
  provider: Provider;
  signal: AbortSignal;
}

interface Tool<S extends z.ZodType> {
  name: string;
  description: string;
  input: S;
  /** what happens when the policy has no entry for this tool */
  level: Level;
  /** one line a person reads before saying yes */
  summary: (input: z.infer<S>) => string;
  run: (input: z.infer<S>, ctx: ToolContext) => Promise<string>;
}

const tool = <S extends z.ZodType>(t: Tool<S>) => t;

/** Resolves a path the model gave, refusing anything outside the workspace or the folders the user allowed. */
export function resolveInside(ctx: Pick<ToolContext, 'workspace' | 'cfg'>, p: string): string {
  const abs = path.resolve(ctx.workspace, p || '.');
  const roots = [ctx.workspace, ...ctx.cfg.allowedRoots.map(r => path.resolve(r))];
  const inside = roots.some(root => {
    const rel = path.relative(root, abs);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  });
  if (!inside) throw new Error(`"${p}" is outside the workspace. Allowed: ${roots.join(', ')}`);
  return abs;
}

const htmlToText = (html: string) => html
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ')
  .trim();

function shell(command: string, cwd: string, signal: AbortSignal): Promise<string> {
  // the model's API keys stay out of the commands it runs
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.OPENAI_API_KEY;
  return new Promise(resolve => {
    const child = spawn(command, { shell: true, cwd, env, windowsHide: true });
    let out = '';
    const add = (b: Buffer) => { if (out.length < 40_000) out += b.toString(); };
    child.stdout.on('data', add);
    child.stderr.on('data', add);
    const kill = () => child.kill();
    const timer = setTimeout(kill, 120_000);
    signal.addEventListener('abort', kill, { once: true });
    child.on('close', code => {
      clearTimeout(timer);
      resolve(`exit code ${code ?? 'killed'}\n${clip(out.trim(), 20_000)}`);
    });
    child.on('error', e => { clearTimeout(timer); resolve(`could not start: ${e.message}`); });
  });
}

export const TOOLS = [
  tool({
    name: 'list_files',
    description: 'List files and folders in the workspace (or an allowed folder). Paths are relative to the workspace.',
    input: z.object({ path: z.string().default('.') }),
    level: 'allow',
    summary: i => `List ${i.path}`,
    async run(i, ctx) {
      const dir = resolveInside(ctx, i.path);
      const entries = await readdir(dir, { withFileTypes: true });
      const rows = await Promise.all(entries.slice(0, 300).map(async e => {
        if (e.isDirectory()) return `${e.name}/`;
        const s = await stat(path.join(dir, e.name)).catch(() => null);
        return `${e.name}  ${s ? `${s.size} B` : ''}`;
      }));
      return rows.join('\n') || '(empty)';
    },
  }),
  tool({
    name: 'read_file',
    description: 'Read a text file from the workspace (or an allowed folder).',
    input: z.object({ path: z.string() }),
    level: 'allow',
    summary: i => `Read ${i.path}`,
    async run(i, ctx) {
      return clip(await readFile(resolveInside(ctx, i.path), 'utf8'), 60_000);
    },
  }),
  tool({
    name: 'write_file',
    description: 'Create or overwrite a text file in the workspace (or an allowed folder). Creates missing folders.',
    input: z.object({ path: z.string(), content: z.string() }),
    level: 'ask',
    summary: i => `Write ${i.path} (${i.content.length.toLocaleString('en-US')} characters)`,
    async run(i, ctx) {
      const file = resolveInside(ctx, i.path);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, i.content, 'utf8');
      return `Wrote ${path.relative(ctx.workspace, file) || file}`;
    },
  }),
  tool({
    name: 'run_shell',
    description: 'Run a shell command in the workspace folder and return its output (2-minute limit). On Windows this is cmd.exe.',
    input: z.object({ command: z.string().min(1) }),
    level: 'ask',
    summary: i => `Run: ${i.command}`,
    run: (i, ctx) => shell(i.command, ctx.workspace, ctx.signal),
  }),
  tool({
    name: 'fetch_url',
    description: 'Fetch a web page or API over HTTP(S) and return its text.',
    input: z.object({ url: z.url() }),
    level: 'ask',
    summary: i => `Fetch ${i.url}`,
    async run(i, ctx) {
      if (!/^https?:/i.test(i.url)) throw new Error('Only http and https URLs');
      const res = await fetch(i.url, { signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(20_000)]), redirect: 'follow' });
      const body = (await res.text()).slice(0, 400_000);
      const text = /html/i.test(res.headers.get('content-type') ?? '') ? htmlToText(body) : body;
      return `HTTP ${res.status}\n${clip(text, 20_000)}`;
    },
  }),
  tool({
    name: 'remember',
    description: 'Save a durable fact the user would want kept for future runs: preferences, project details, people, decisions. Not for passing chatter.',
    input: z.object({ text: z.string().min(3).max(2000) }),
    level: 'allow',
    summary: i => `Remember: ${i.text}`,
    async run(i, ctx) { return `Saved memory ${ctx.memory.add(i.text).id}`; },
  }),
  tool({
    name: 'recall',
    description: 'Search saved memories by keywords.',
    input: z.object({ query: z.string().min(1) }),
    level: 'allow',
    summary: i => `Recall: ${i.query}`,
    async run(i, ctx) {
      const hits = ctx.memory.search(i.query, 12);
      return hits.length ? hits.map(m => `${m.id}: ${m.text}`).join('\n') : 'No matching memories.';
    },
  }),
  tool({
    name: 'forget',
    description: 'Delete a saved memory by id.',
    input: z.object({ id: z.string() }),
    level: 'ask',
    summary: i => `Forget memory ${i.id}`,
    async run(i, ctx) { return ctx.memory.remove(i.id) ? 'Forgotten.' : 'No memory with that id.'; },
  }),
  tool({
    name: 'schedule_job',
    description: 'Create a recurring job: a task the agent runs by itself on a five-field cron schedule in the machine\'s local time, e.g. "0 8 * * 1-5" for weekdays at 08:00.',
    input: z.object({ name: z.string().max(80), cron: z.string(), task: z.string().min(3).max(4000) }),
    level: 'ask',
    summary: i => `Schedule "${i.name}" at ${i.cron}: ${i.task}`,
    async run(i, ctx) {
      const job = ctx.scheduler.add(i.name, i.cron, i.task);
      const next = ctx.scheduler.list().find(j => j.id === job.id)?.nextRunAt;
      return `Scheduled ${job.id}. Next run: ${next ? new Date(next).toString() : 'never'}`;
    },
  }),
  tool({
    name: 'list_jobs',
    description: 'List scheduled jobs with their next run times.',
    input: z.object({}),
    level: 'allow',
    summary: () => 'List jobs',
    async run(_i, ctx) {
      const jobs = ctx.scheduler.list();
      return jobs.length
        ? jobs.map(j => `${j.id} · ${j.enabled ? 'on' : 'off'} · ${j.cron} · ${j.name} · next ${j.nextRunAt ? new Date(j.nextRunAt).toLocaleString() : '—'}`).join('\n')
        : 'No jobs.';
    },
  }),
  tool({
    name: 'cancel_job',
    description: 'Delete a scheduled job by id.',
    input: z.object({ id: z.string() }),
    level: 'ask',
    summary: i => `Cancel job ${i.id}`,
    async run(i, ctx) { return ctx.scheduler.remove(i.id) ? 'Cancelled.' : 'No job with that id.'; },
  }),
  tool({
    name: 'scan_launches',
    description: 'Read recent token launches from the Noira launch feed, each scored on seven safety checks (dev, liquidity, holders, snipers, contract, volume, socials). "signal" means all seven passed.',
    input: z.object({ verdict: z.enum(['signal', 'noise', 'any']).default('any'), limit: z.number().int().min(1).max(50).default(10) }),
    level: 'allow',
    summary: i => `Scan launches (${i.verdict}, ${i.limit})`,
    async run(i, ctx) {
      const data = await fetchLaunches(ctx.cfg.feedUrl, i.verdict, i.limit, ctx.signal);
      return JSON.stringify(data);
    },
  }),
  tool({
    name: 'build_site',
    description: 'Write a complete single-file website from a one-sentence description into a folder in the workspace (index.html).',
    input: z.object({ prompt: z.string().min(4).max(800), folder: z.string().optional() }),
    level: 'ask',
    summary: i => `Build a site in ${i.folder ?? slugFor(i.prompt)}/: ${i.prompt}`,
    async run(i, ctx) {
      const folder = resolveInside(ctx, i.folder ?? slugFor(i.prompt));
      const html = await buildSite(ctx.provider, i.prompt, undefined, ctx.signal);
      await mkdir(folder, { recursive: true });
      await writeFile(path.join(folder, 'index.html'), html, 'utf8');
      return `Wrote ${path.relative(ctx.workspace, path.join(folder, 'index.html'))} (${(html.length / 1024).toFixed(1)} KB)`;
    },
  }),
];

export type AnyTool = (typeof TOOLS)[number];

export const toolSpecs = (): ToolSpec[] => TOOLS.map(t => ({
  name: t.name,
  description: t.description,
  schema: z.toJSONSchema(t.input, { io: 'input' }) as Record<string, unknown>,
}));

export const levelOf = (cfg: Config, name: string): Level => cfg.policy[name] ?? TOOLS.find(t => t.name === name)?.level ?? 'block';

export const findTool = (name: string): AnyTool | undefined => TOOLS.find(t => t.name === name);
