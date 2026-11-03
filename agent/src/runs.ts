import { readdirSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Approvals } from './approvals.js';
import { paths, saveConfig, type Config } from './config.js';
import type { EventBus } from './events.js';
import type { MemoryStore } from './memory.js';
import { createProvider, explainModelError, type ChatTurn, type ToolResult } from './model/index.js';
import type { Scheduler } from './scheduler.js';
import { clip, newId, readJson, writeJson } from './store.js';
import { findTool, levelOf, toolSpecs, type ToolContext } from './tools.js';

export type Step =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; id: string; tool: string; summary: string; status: 'ok' | 'error' | 'denied' | 'blocked'; output: string }
  | { kind: 'approval'; tool: string; summary: string; approvalId: string };

export interface Run {
  id: string;
  task: string;
  source: 'cli' | 'panel' | 'cron' | 'chat';
  jobId?: string;
  status: 'running' | 'done' | 'error' | 'stopped';
  startedAt: number;
  endedAt: number | null;
  steps: Step[];
  /** the final answer, or the error */
  result: string;
}

export interface StartOptions {
  source: Run['source'];
  jobId?: string;
  /** earlier turns of the same conversation, oldest first */
  history?: ChatTurn[];
}

const MAX_TURNS = 30;
const KEEP_RUNS = 300;

function systemPrompt(cfg: Config, memories: string[]): string {
  return `You are Noira, a self-hosted AI agent running on the user's own computer through the Noira gateway.

Workspace: ${paths.workspace}
Relative paths are resolved there, and file tools only reach the workspace${cfg.allowedRoots.length ? ` and ${cfg.allowedRoots.join(', ')}` : ''}.
Machine: ${os.type()} ${os.release()} (${process.platform}), shell commands run in ${process.platform === 'win32' ? 'cmd.exe' : 'sh'}.
Local time: ${new Date().toString()}

Tools that change things (writing files, running commands, fetching URLs, scheduling jobs, building sites) only run once the user approves them under their policy. If a call is denied, do not retry it; continue without it or explain what you needed.

Use remember for durable facts the user would want kept (preferences, projects, people, decisions); use schedule_job when the user asks for something recurring. Never invent facts about launches, files or command output: read them with a tool first.

Finish with a short answer: what you did, where the results are, and anything still waiting on the user.${memories.length ? `\n\nWhat you remember about this user:\n${memories.map(m => `- ${m}`).join('\n')}` : ''}`;
}

/** Starts, tracks and stores agent runs. */
export class Runs {
  private active = new Map<string, { run: Run; ctrl: AbortController }>();

  constructor(
    private cfg: () => Config,
    private bus: EventBus,
    private approvals: Approvals,
    private memory: MemoryStore,
    private scheduler: () => Scheduler,
  ) {}

  start(task: string, opts: StartOptions): Run {
    const run: Run = { id: newId('run'), task, source: opts.source, jobId: opts.jobId, status: 'running', startedAt: Date.now(), endedAt: null, steps: [], result: '' };
    const ctrl = new AbortController();
    this.active.set(run.id, { run, ctrl });
    this.bus.send({ type: 'run.started', run });
    void this.execute(run, opts.history ?? [], ctrl.signal).finally(() => {
      this.active.delete(run.id);
      run.endedAt = Date.now();
      this.save(run);
      this.bus.send({ type: 'run.finished', run });
    });
    return run;
  }

  stop(id: string): boolean {
    const a = this.active.get(id);
    if (!a) return false;
    a.run.status = 'stopped';
    a.ctrl.abort();
    return true;
  }

  stopAll(): void {
    for (const id of this.active.keys()) this.stop(id);
  }

  get(id: string): Run | null {
    return this.active.get(id)?.run ?? readJson<Run | null>(path.join(paths.runs, `${id}.json`), null);
  }

  activeCount(): number {
    return this.active.size;
  }

  list(limit = 50): Omit<Run, 'steps'>[] {
    const files = readdirSync(paths.runs).filter(f => f.endsWith('.json')).sort().reverse().slice(0, limit);
    const stored = files.map(f => readJson<Run | null>(path.join(paths.runs, f), null)).filter((r): r is Run => !!r);
    const all = [...[...this.active.values()].map(a => a.run), ...stored.filter(r => !this.active.has(r.id))];
    return all.sort((a, b) => b.startedAt - a.startedAt).slice(0, limit).map(({ steps: _s, ...rest }) => rest);
  }

  private step(run: Run, step: Step) {
    run.steps.push(step);
    this.bus.send({ type: 'run.step', runId: run.id, step });
  }

  private async execute(run: Run, history: ChatTurn[], signal: AbortSignal): Promise<void> {
    const cfg = this.cfg();
    try {
      const provider = createProvider(cfg);
      const memories = this.memory.forTask(run.task).map(m => m.text);
      const chat = provider.chat(systemPrompt(cfg, memories), [...history, { role: 'user', content: run.task }], toolSpecs());
      const ctx: ToolContext = { cfg, workspace: paths.workspace, memory: this.memory, scheduler: this.scheduler(), provider, signal };

      for (let turn = 0; turn < MAX_TURNS; turn++) {
        let text = '';
        const result = await chat.turn(t => { text += t; this.bus.send({ type: 'run.text', runId: run.id, text: t }); }, signal);
        if (text.trim()) this.step(run, { kind: 'text', text });
        if (result.stop === 'refused') { run.result = 'The model declined this task.'; break; }
        if (result.stop === 'truncated') { run.result = 'A tool call was cut off because it was too long. Try asking for smaller steps.'; break; }
        if (result.stop === 'done') { run.result = text.trim() || 'Done.'; break; }

        const results: ToolResult[] = [];
        for (const call of result.calls) {
          if (signal.aborted) break;
          results.push(await this.callTool(run, call.id, call.name, call.input, ctx));
        }
        if (signal.aborted) break;
        chat.addResults(results);
        if (turn === MAX_TURNS - 1) run.result = 'Stopped after too many steps.';
      }
      if (run.status === 'running') run.status = 'done';
      if (run.status === 'stopped') run.result ||= 'Stopped.';
    } catch (err) {
      if (run.status === 'stopped' || signal.aborted) { run.status = 'stopped'; run.result ||= 'Stopped.'; return; }
      run.status = 'error';
      run.result = explainModelError(err);
    }
  }

  private async callTool(run: Run, id: string, name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolResult> {
    const t = findTool(name);
    if (!t) return { id, content: `Unknown tool ${name}`, isError: true };
    // the SDK's tolerant parser can hand back a truncated input; check it against the schema before anything runs
    const parsed = t.input.safeParse(rawInput);
    if (!parsed.success) return { id, content: `INVALID_INPUT: ${parsed.error.message}`, isError: true };
    const input = parsed.data as never;
    const summary = t.summary(input);

    const level = levelOf(this.cfg(), name);
    if (level === 'block') {
      this.step(run, { kind: 'tool', id, tool: name, summary, status: 'blocked', output: 'Blocked by policy' });
      return { id, content: 'This tool is blocked by the user\'s policy.', isError: true };
    }
    if (level === 'ask') {
      const decision = await this.approvals.request(run.id, name, summary, input, ctx.signal);
      if (decision === 'always') {
        const cfg = this.cfg();
        cfg.policy[name] = 'allow';
        saveConfig(cfg);
        this.bus.send({ type: 'config.changed' });
      }
      if (decision === 'deny') {
        this.step(run, { kind: 'tool', id, tool: name, summary, status: 'denied', output: 'Denied by the user' });
        return { id, content: 'The user denied this action.', isError: true };
      }
    }

    try {
      const output = await t.run(input, ctx);
      this.step(run, { kind: 'tool', id, tool: name, summary, status: 'ok', output: clip(output, 2000) });
      return { id, content: output, isError: false };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.step(run, { kind: 'tool', id, tool: name, summary, status: 'error', output: msg });
      return { id, content: msg, isError: true };
    }
  }

  private save(run: Run) {
    writeJson(path.join(paths.runs, `${run.id}.json`), run);
    const files = readdirSync(paths.runs).filter(f => f.endsWith('.json')).sort();
    for (const f of files.slice(0, Math.max(0, files.length - KEEP_RUNS))) {
      try { unlinkSync(path.join(paths.runs, f)); } catch { /* already gone */ }
    }
  }
}
