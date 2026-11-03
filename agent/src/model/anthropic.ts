import Anthropic from '@anthropic-ai/sdk';
import type { ChatSession, ChatTurn, Provider, ToolResult, ToolSpec, TurnResult } from './types.js';

type Msg = Anthropic.Beta.BetaMessageParam;

// Server-side refusal fallback: a declined request is retried on a fallback model inside the same call.
const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };

class AnthropicChat implements ChatSession {
  private messages: Msg[];
  private tools: Anthropic.Beta.BetaTool[];

  constructor(private client: Anthropic, private model: string, private system: string, history: ChatTurn[], tools: ToolSpec[]) {
    this.messages = history.map(t => ({ role: t.role, content: t.content }));
    this.tools = tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.schema as Anthropic.Beta.BetaTool.InputSchema,
      eager_input_streaming: true,
    }));
  }

  async turn(onText: (text: string) => void, signal?: AbortSignal): Promise<TurnResult> {
    for (let attempt = 0; ; attempt++) {
      const stream = this.client.beta.messages.stream(
        {
          model: this.model,
          max_tokens: 32000,
          ...FALLBACK,
          output_config: { effort: 'high' },
          system: this.system,
          tools: this.tools,
          messages: this.messages,
        },
        { signal },
      );
      stream.on('text', onText);

      let msg: Anthropic.Beta.BetaMessage;
      try {
        msg = await stream.finalMessage();
      } catch (err) {
        // with eager input streaming an unparseable tool input rejects here; only that is worth re-issuing
        if (err instanceof Anthropic.APIError || signal?.aborted || attempt >= 2) throw err;
        continue;
      }

      const text = msg.content.map(b => (b.type === 'text' ? b.text : '')).join('');
      if (msg.stop_reason === 'refusal') return { text, calls: [], stop: 'refused' };
      if (msg.stop_reason === 'pause_turn') {
        this.messages.push({ role: 'assistant', content: msg.content });
        continue;
      }
      const uses = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
      if (uses.length && msg.stop_reason === 'max_tokens') return { text, calls: [], stop: 'truncated' };
      this.messages.push({ role: 'assistant', content: msg.content });
      if (!uses.length) return { text, calls: [], stop: 'done' };
      return { text, calls: uses.map(u => ({ id: u.id, name: u.name, input: u.input })), stop: 'tools' };
    }
  }

  addResults(results: ToolResult[]): void {
    this.messages.push({
      role: 'user',
      content: results.map(r => ({ type: 'tool_result' as const, tool_use_id: r.id, content: r.content, is_error: r.isError })),
    });
  }
}

export class AnthropicProvider implements Provider {
  readonly label: string;
  private client: Anthropic;

  constructor(apiKey: string, private model: string) {
    // with no key the SDK still resolves ANTHROPIC_AUTH_TOKEN or an `ant auth login` profile
    this.client = new Anthropic(apiKey ? { apiKey } : {});
    this.label = `Claude · ${model}`;
  }

  chat(system: string, messages: ChatTurn[], tools: ToolSpec[]): ChatSession {
    return new AnthropicChat(this.client, this.model, system, messages, tools);
  }

  async complete(system: string, prompt: string, onText?: (text: string) => void, signal?: AbortSignal): Promise<string> {
    const stream = this.client.beta.messages.stream(
      {
        model: this.model,
        max_tokens: 64000,
        ...FALLBACK,
        output_config: { effort: 'medium' },
        system,
        messages: [{ role: 'user', content: prompt }],
      },
      { signal },
    );
    if (onText) stream.on('text', onText);
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'refusal') throw new Error('The model declined this request.');
    return msg.content.map(b => (b.type === 'text' ? b.text : '')).join('');
  }
}
