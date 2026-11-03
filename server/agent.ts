import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { MODEL } from '../shared/build.js';
import { CHECK_ORDER, type Launch } from '../shared/types.js';
import type { LaunchFeed } from './feed.js';

type BetaMessageParam = Anthropic.Beta.BetaMessageParam;

export type AgentEvent =
  | { type: 'tool'; name: string; input: unknown }
  | { type: 'text'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

const SYSTEM = `You are Noira, an on-chain analyst for Pons launches. You answer questions about new token launches, their deployer wallets and the seven safety checks Noira runs on each one:
dev (dev wallet share), liquidity (liquidity lock), holders (holder concentration), snipers (sniper and bundle activity), contract (contract risk), volume (early volume quality), socials (socials and metadata).
A launch is "signal" only when all seven pass; otherwise it is "noise" and "collapsedOn" names the first check that did not pass.

Use the tools to look things up before answering anything about specific launches, wallets or counts. Never invent tickers, numbers or addresses that the tools did not return. If the tools have nothing relevant, say so.

The feed currently comes from the source named in feed_stats. When that source is the demo feed, mention once, briefly, that the data is simulated until the chain indexer is connected.

Answer in the language the user writes in. Keep it short and plain: a sentence or two, or a compact list of tickers with the key reason. Write tickers like $NAME. You are not a financial adviser: describe risk, never tell anyone to buy or sell.`;

const ListInput = z.object({
  verdict: z.enum(['signal', 'noise', 'any']).optional(),
  passed_check: z.enum(CHECK_ORDER as [string, ...string[]]).optional(),
  failed_check: z.enum(CHECK_ORDER as [string, ...string[]]).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});
const TickerInput = z.object({ ticker: z.string().min(1).max(20) });
const WalletInput = z.object({ address: z.string().min(6).max(80) });

const checkEnum = { type: 'string', enum: CHECK_ORDER } as const;

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'list_launches',
    description: 'List recent launches, newest first. Filter by verdict, or by a check that passed or did not pass. Returns ticker, verdict, checks and age.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        verdict: { type: 'string', enum: ['signal', 'noise', 'any'] },
        passed_check: { ...checkEnum, description: 'Only launches where this check passed' },
        failed_check: { ...checkEnum, description: 'Only launches where this check warned or failed' },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
    },
  },
  {
    name: 'get_launch',
    description: 'Full detail for one launch by ticker, including every check value and the deployer address.',
    eager_input_streaming: true,
    input_schema: { type: 'object', properties: { ticker: { type: 'string', description: 'e.g. $FROGCAT' } }, required: ['ticker'] },
  },
  {
    name: 'inspect_wallet',
    description: 'Open up a deployer wallet: where its funds came from, which wallets move with it, and a 0-100 risk score.',
    eager_input_streaming: true,
    input_schema: { type: 'object', properties: { address: { type: 'string' } }, required: ['address'] },
  },
  {
    name: 'feed_stats',
    description: 'Counts of launches observed, signal and noise, the pass rate of each check, and the name of the data source.',
    eager_input_streaming: true,
    input_schema: { type: 'object', properties: {} },
  },
];

const brief = (l: Launch) => ({
  ticker: l.ticker,
  verdict: l.verdict,
  passed: `${l.passed}/7`,
  collapsedOn: l.collapsedOn,
  ageSec: Math.round((Date.now() - l.createdAt) / 1000) + l.ageSec,
  mcapUsd: l.mcapUsd,
  checks: Object.fromEntries(l.checks.map(c => [c.id, `${c.status}: ${c.value}`])),
});

export function runTool(feed: LaunchFeed, name: string, input: unknown): { ok: boolean; content: string } {
  const out = (v: unknown) => ({ ok: true, content: JSON.stringify(v) });
  const bad = (msg: string) => ({ ok: false, content: JSON.stringify({ error: msg }) });
  switch (name) {
    case 'list_launches': {
      const p = ListInput.safeParse(input ?? {});
      if (!p.success) return bad(`INVALID_INPUT: ${p.error.message}`);
      const rows = feed.query({
        verdict: p.data.verdict,
        passed: p.data.passed_check as Launch['checks'][number]['id'] | undefined,
        failed: p.data.failed_check as Launch['checks'][number]['id'] | undefined,
        limit: p.data.limit,
      });
      return out({ count: rows.length, launches: rows.map(brief) });
    }
    case 'get_launch': {
      const p = TickerInput.safeParse(input);
      if (!p.success) return bad(`INVALID_INPUT: ${p.error.message}`);
      const l = feed.find(p.data.ticker);
      return l ? out({ ...brief(l), address: l.address, deployer: l.deployer, holders: l.holders }) : bad(`No launch ${p.data.ticker} in the feed`);
    }
    case 'inspect_wallet': {
      const p = WalletInput.safeParse(input);
      if (!p.success) return bad(`INVALID_INPUT: ${p.error.message}`);
      const w = feed.wallet(p.data.address);
      return w ? out(w) : bad('Wallet not seen in the feed');
    }
    case 'feed_stats':
      return out(feed.stats());
    default:
      return bad(`Unknown tool ${name}`);
  }
}

/** Runs the agent loop for one user turn and reports progress through `emit`. */
export async function askAgent(
  client: Anthropic,
  feed: LaunchFeed,
  history: { role: 'user' | 'assistant'; content: string }[],
  emit: (e: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const messages: BetaMessageParam[] = history.map(m => ({ role: m.role, content: m.content }));
  let jsonRetries = 0;

  for (let turn = 0; turn < 8; turn++) {
    const stream = client.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low' },
        system: SYSTEM,
        tools: TOOLS,
        messages,
      },
      { signal },
    );
    stream.on('text', text => emit({ type: 'text', text }));

    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      // only an unparseable eager tool input is worth re-issuing
      if (err instanceof Anthropic.APIError || signal?.aborted || jsonRetries++ >= 2) throw err;
      continue;
    }

    if (message.stop_reason === 'refusal') {
      emit({ type: 'text', text: '\n\nI can’t help with that one. Ask me about launches, wallets or the seven checks.' });
      break;
    }
    if (message.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: message.content });
      continue;
    }

    const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (toolUses.length === 0) break;
    if (message.stop_reason === 'max_tokens') throw new Error('Tool input was cut off; try a shorter question.');

    messages.push({ role: 'assistant', content: message.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = toolUses.map(t => {
      emit({ type: 'tool', name: t.name, input: t.input });
      const r = runTool(feed, t.name, t.input);
      return { type: 'tool_result', tool_use_id: t.id, content: r.content, is_error: !r.ok };
    });
    messages.push({ role: 'user', content: results });
  }
  emit({ type: 'done' });
}

/** Checks the browser-supplied history before it reaches the model. */
export function parseHistory(raw: unknown): { role: 'user' | 'assistant'; content: string }[] | null {
  const Hist = z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(2000) })).min(1).max(16);
  const p = Hist.safeParse(raw);
  if (!p.success) return null;
  const h = p.data;
  if (h[0]!.role !== 'user' || h[h.length - 1]!.role !== 'user') return null;
  return h;
}
