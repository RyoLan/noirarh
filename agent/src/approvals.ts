import type { EventBus } from './events.js';
import { newId } from './store.js';

export interface Approval {
  id: string;
  runId: string;
  tool: string;
  summary: string;
  input: unknown;
  createdAt: number;
  expiresAt: number;
}

export type Decision = 'allow' | 'deny' | 'always';

interface Pending {
  approval: Approval;
  done: (d: Decision) => void;
  timer: NodeJS.Timeout;
}

/** Calls the agent wants to make that wait for a person to say yes. */
export class Approvals {
  private pending = new Map<string, Pending>();

  constructor(private bus: EventBus, private timeoutMin: () => number) {}

  list(): Approval[] {
    return [...this.pending.values()].map(p => p.approval);
  }

  /** Resolves when someone answers, or with "deny" when the approval times out or the run is stopped. */
  request(runId: string, tool: string, summary: string, input: unknown, signal?: AbortSignal): Promise<Decision> {
    const ms = this.timeoutMin() * 60_000;
    const approval: Approval = { id: newId('apr'), runId, tool, summary, input, createdAt: Date.now(), expiresAt: Date.now() + ms };
    return new Promise(resolve => {
      const finish = (d: Decision) => {
        const p = this.pending.get(approval.id);
        if (!p) return;
        clearTimeout(p.timer);
        this.pending.delete(approval.id);
        this.bus.send({ type: 'approval.resolved', id: approval.id, decision: d === 'deny' ? 'deny' : 'allow' });
        resolve(d);
      };
      this.pending.set(approval.id, { approval, done: finish, timer: setTimeout(() => finish('deny'), ms) });
      signal?.addEventListener('abort', () => finish('deny'), { once: true });
      this.bus.send({ type: 'approval.requested', approval });
    });
  }

  answer(id: string, d: Decision): boolean {
    const p = this.pending.get(id);
    if (!p) return false;
    p.done(d);
    return true;
  }
}
