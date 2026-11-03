import Anthropic from '@anthropic-ai/sdk';
import { resolveApiKey, type Config } from '../config.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIError, OpenAIProvider } from './openai.js';
import type { Provider } from './types.js';

export type * from './types.js';

export function createProvider(cfg: Config): Provider {
  const key = resolveApiKey(cfg);
  if (cfg.provider === 'openai') {
    if (!cfg.baseUrl) throw new Error('Set the endpoint URL for your OpenAI-compatible model (noira onboard).');
    return new OpenAIProvider(cfg.baseUrl, key, cfg.model);
  }
  return new AnthropicProvider(key, cfg.model);
}

/** Turns provider errors into something a person can act on. */
export function explainModelError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return 'The model rejected the API key. Run `noira onboard` or update it in Settings.';
  }
  if (err instanceof Anthropic.RateLimitError) return 'The model is rate limited right now. Try again in a minute.';
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the model API. Check the internet connection.';
  if (err instanceof Anthropic.APIError) return `The model API returned an error (${err.status ?? 'unknown'}).`;
  if (err instanceof OpenAIError) return err.status === 401 ? 'The model endpoint rejected the API key.' : err.message;
  if (err instanceof Error && /api key|apiKey|authToken|credentials/i.test(err.message)) {
    return 'No model API key is set. Run `noira onboard` or add it in Settings.';
  }
  return err instanceof Error ? err.message : String(err);
}
