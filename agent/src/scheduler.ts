import { paths } from './config.js';
import type { EventBus } from './events.js';
import { newId, readJson, writeJson } from './store.js';

export interface Job {
  id: string;
  name: string;
  cron: string;
  task: string;
  enabled: boolean;
  createdAt: number;
  lastRunAt: number | null;
  lastRunId: string | null;
}

const RANGES: [number, number][] = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];

function field(spec: string, [min, max]: [number, number]): Set<number> {
  const out = new Set<number>();
  for (const part of spec.split(',')) {
    const m = /^(\*|\d+)(?:-(\d+))?(?:\/(\d+))?$/.exec(part.trim());
    if (!m) throw new Error(`Bad cron field "${part}"`);
    const step = m[3] ? Number(m[3]) : 1;
    const lo = m[1] === '*' ? min : Number(m[1]);
    const hi = m[1] === '*' ? max : m[2] !== undefined ? Number(m[2]) : m[3] ? max : lo;
    if (lo < min || hi > max || lo > hi || step < 1) throw new Error(`Cron field "${part}" is out of range ${min}-${max}`);
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

/** A standard five-field cron expression (minute hour day-of-month month day-of-week) as a test on a date. */
export function cronMatcher(expr: string): (d: Date) => boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error('Cron needs five fields: minute hour day-of-month month day-of-week');
  const [mi, ho, dom, mo, dw] = parts.map((p, i) => field(p, RANGES[i]!)) as [Set<number>, Set<number>, Set<number>, Set<number>, Set<number>];
  if (dw.has(7)) dw.add(0);
  const domAny = parts[2] === '*', dowAny = parts[4] === '*';
  return d => {
    if (!mi.has(d.getMinutes()) || !ho.has(d.getHours()) || !mo.has(d.getMonth() + 1)) return false;
    const a = dom.has(d.getDate()), b = dw.has(d.getDay());
    // classic cron: when both day fields are restricted, either one may match
    return domAny && dowAny ? true : domAny ? b : dowAny ? a : a || b;
  };
}

/** The next minute the expression fires after `from`, looking up to 400 days ahead. */
export function nextRun(expr: string, from = new Date()): Date | null {
  const match = cronMatcher(expr);
  const d = new Date(from);
  d.setSeconds(0, 0);
  for (let i = 0; i < 400 * 24 * 60; i++) {
    d.setMinutes(d.getMinutes() + 1);
    if (match(d)) return new Date(d);
  }
  return null;
}

/** Jobs that start a run on their own while the gateway is up. */
export class Scheduler {
  private jobs: Job[] = readJson<Job[]>(paths.jobs, []);
  private timer: NodeJS.Timeout | null = null;
  private lastMinute = -1;

  constructor(private bus: EventBus, private fire: (job: Job) => string | null) {}

  start(): void {
    this.timer = setInterval(() => this.tick(), 15_000);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  list(): (Job & { nextRunAt: number | null })[] {
    return this.jobs.map(j => ({ ...j, nextRunAt: j.enabled ? nextRun(j.cron)?.getTime() ?? null : null }));
  }

  get(id: string): Job | undefined {
    return this.jobs.find(j => j.id === id);
  }

  add(name: string, cron: string, task: string): Job {
    cronMatcher(cron); // throws on a bad expression
    const job: Job = { id: newId('job'), name: name.trim() || task.slice(0, 40), cron: cron.trim(), task, enabled: true, createdAt: Date.now(), lastRunAt: null, lastRunId: null };
    this.jobs.push(job);
    this.save();
    return job;
  }

  update(id: string, patch: Partial<Pick<Job, 'enabled' | 'name' | 'cron' | 'task'>>): Job | null {
    const job = this.get(id);
    if (!job) return null;
    if (patch.cron) cronMatcher(patch.cron);
    Object.assign(job, patch);
    this.save();
    return job;
  }

  remove(id: string): boolean {
    const n = this.jobs.length;
    this.jobs = this.jobs.filter(j => j.id !== id);
    if (n === this.jobs.length) return false;
    this.save();
    return true;
  }

  runNow(id: string): string | null {
    const job = this.get(id);
    return job ? this.launch(job) : null;
  }

  private tick() {
    const now = new Date();
    const minute = Math.floor(now.getTime() / 60_000);
    if (minute === this.lastMinute) return;
    this.lastMinute = minute;
    for (const job of this.jobs) {
      if (!job.enabled) continue;
      try { if (cronMatcher(job.cron)(now)) this.launch(job); } catch { /* a bad expression simply never fires */ }
    }
  }

  private launch(job: Job): string | null {
    const runId = this.fire(job);
    job.lastRunAt = Date.now();
    job.lastRunId = runId;
    this.save();
    return runId;
  }

  private save() {
    writeJson(paths.jobs, this.jobs);
    this.bus.send({ type: 'jobs.changed' });
  }
}
