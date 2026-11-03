export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema for the input object */
  schema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResult {
  id: string;
  content: string;
  isError: boolean;
}

export interface TurnResult {
  text: string;
  calls: ToolCall[];
  /** done: answered; tools: wants the calls run; refused: declined; truncated: a tool call was cut off */
  stop: 'done' | 'tools' | 'refused' | 'truncated';
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** One conversation with the model, kept by the provider in its own message format. */
export interface ChatSession {
  turn(onText: (text: string) => void, signal?: AbortSignal): Promise<TurnResult>;
  addResults(results: ToolResult[]): void;
}

export interface Provider {
  readonly label: string;
  chat(system: string, messages: ChatTurn[], tools: ToolSpec[]): ChatSession;
  /** A single prompt and answer without tools, e.g. writing a whole web page. */
  complete(system: string, prompt: string, onText?: (text: string) => void, signal?: AbortSignal): Promise<string>;
}
