import { EventEmitter } from 'node:events';
import type { Approval } from './approvals.js';
import type { Run, Step } from './runs.js';

export type GatewayEvent =
  | { type: 'run.started'; run: Run }
  | { type: 'run.text'; runId: string; text: string }
  | { type: 'run.step'; runId: string; step: Step }
  | { type: 'run.finished'; run: Run }
  | { type: 'approval.requested'; approval: Approval }
  | { type: 'approval.resolved'; id: string; decision: 'allow' | 'deny' }
  | { type: 'jobs.changed' }
  | { type: 'memory.changed' }
  | { type: 'config.changed' };

/** One stream of everything the gateway does; the panel and CLI subscribe over SSE. */
export class EventBus extends EventEmitter<{ event: [GatewayEvent] }> {
  constructor() {
    super();
    this.setMaxListeners(100);
  }

  send(e: GatewayEvent): void {
    this.emit('event', e);
  }
}
