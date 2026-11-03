import type { ChatSession, ChatTurn, Provider, ToolResult, ToolSpec, TurnResult } from './types.js';

// The OpenAI chat-completions wire format, which OpenAI, OpenRouter, Groq, LM Studio and Ollama all speak.
interface OAToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }
type OAMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: OAToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };
interface OAResponse {
  choices?: { message: { content: string | null; tool_calls?: OAToolCall[] }; finish_reason: string }[];
  error?: { message?: string };
}

export class OpenAIError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function post(baseUrl: string, apiKey: string, body: unknown, signal?: AbortSignal): Promise<OAResponse> {
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify(body),
    signal,
  });
  const data = (await res.json().catch(() => ({}))) as OAResponse;
  if (!res.ok) throw new OpenAIError(data.error?.message ?? `The model endpoint returned ${res.status}`, res.status);
  return data;
}

const parseArgs = (s: string): unknown => { try { return JSON.parse(s || '{}'); } catch { return { __invalid_json: s }; } };

class OpenAIChat implements ChatSession {
  private messages: OAMessage[];
  private tools: unknown[];

  constructor(private baseUrl: string, private apiKey: string, private model: string, system: string, history: ChatTurn[], tools: ToolSpec[]) {
    this.messages = [{ role: 'system', content: system }, ...history.map(t => ({ role: t.role, content: t.content }) as OAMessage)];
    this.tools = tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.schema } }));
  }

  async turn(onText: (text: string) => void, signal?: AbortSignal): Promise<TurnResult> {
    const data = await post(this.baseUrl, this.apiKey, { model: this.model, messages: this.messages, tools: this.tools }, signal);
    const choice = data.choices?.[0];
    if (!choice) throw new OpenAIError('The model endpoint returned no answer', 502);
    const msg = choice.message;
    const text = msg.content ?? '';
    if (text) onText(text);
    this.messages.push({ role: 'assistant', content: msg.content, ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}) });
    const calls = (msg.tool_calls ?? []).map(c => ({ id: c.id, name: c.function.name, input: parseArgs(c.function.arguments) }));
    if (calls.length && choice.finish_reason === 'length') return { text, calls: [], stop: 'truncated' };
    if (choice.finish_reason === 'content_filter') return { text, calls: [], stop: 'refused' };
    return { text, calls, stop: calls.length ? 'tools' : 'done' };
  }

  addResults(results: ToolResult[]): void {
    for (const r of results) this.messages.push({ role: 'tool', tool_call_id: r.id, content: r.isError ? `ERROR: ${r.content}` : r.content });
  }
}

export class OpenAIProvider implements Provider {
  readonly label: string;

  constructor(private baseUrl: string, private apiKey: string, private model: string) {
    this.label = `${model} · ${new URL(baseUrl).host}`;
  }

  chat(system: string, messages: ChatTurn[], tools: ToolSpec[]): ChatSession {
    return new OpenAIChat(this.baseUrl, this.apiKey, this.model, system, messages, tools);
  }

  async complete(system: string, prompt: string, onText?: (text: string) => void, signal?: AbortSignal): Promise<string> {
    const data = await post(this.baseUrl, this.apiKey, { model: this.model, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }, signal);
    const text = data.choices?.[0]?.message.content ?? '';
    onText?.(text);
    return text;
  }
}
