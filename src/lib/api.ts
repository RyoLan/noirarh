import type { AgentStatus, FeedStats, Launch, WalletReport } from '../../shared/types';

export type { AgentStatus, FeedStats, Launch, WalletReport };

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** POSTs JSON and yields each server-sent event of the streamed response. */
export async function* postStream(url: string, body: unknown, signal?: AbortSignal): AsyncGenerator<{ event: string; data: any }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
    throw new ApiError(err.error ?? `Request failed (${res.status})`, res.status);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const raw = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const event = /^event: (.+)$/m.exec(raw)?.[1];
      const data = /^data: (.+)$/m.exec(raw)?.[1];
      if (event && data) yield { event, data: JSON.parse(data) };
    }
  }
}

export async function getStatus(): Promise<AgentStatus | null> {
  try {
    const r = await fetch('/api/status');
    return r.ok ? r.json() : null;
  } catch {
    return null;
  }
}

export async function getWallet(address: string): Promise<WalletReport | null> {
  const r = await fetch(`/api/wallet?address=${encodeURIComponent(address)}`);
  return r.ok ? r.json() : null;
}

type FeedHandler = { snapshot: (l: Launch[], s: FeedStats) => void; launch: (l: Launch, s: FeedStats) => void; offline: () => void };

/** Subscribes to the live launch feed. */
export function subscribeFeed(h: FeedHandler): () => void {
  const es = new EventSource('/api/feed');
  es.addEventListener('snapshot', e => { const d = JSON.parse((e as MessageEvent).data); h.snapshot(d.launches, d.stats); });
  es.addEventListener('launch', e => { const d = JSON.parse((e as MessageEvent).data); h.launch(d.launch, d.stats); });
  es.onerror = () => { if (es.readyState === EventSource.CLOSED) h.offline(); };
  return () => es.close();
}
