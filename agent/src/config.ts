import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readJson, writeJson } from './store.js';

export type Level = 'allow' | 'ask' | 'block';
export type ProviderKind = 'anthropic' | 'openai';

export interface Config {
  provider: ProviderKind;
  model: string;
  /** stored in ~/.noira/config.json; ANTHROPIC_API_KEY / OPENAI_API_KEY win when set */
  apiKey: string;
  /** OpenAI-compatible endpoints only, e.g. https://api.openai.com/v1 or http://127.0.0.1:11434/v1 */
  baseUrl: string;
  host: string;
  port: number;
  /** every API call needs it, even from this machine */
  token: string;
  policy: Record<string, Level>;
  /** folders outside the workspace the agent may read and write */
  allowedRoots: string[];
  /** a Noira site whose launch feed scan_launches reads */
  feedUrl: string;
  /** how long a waiting approval stays open before it counts as "deny" */
  approvalTimeoutMin: number;
}

export const HOME = process.env.NOIRA_HOME ?? path.join(os.homedir(), '.noira');

export const paths = {
  home: HOME,
  config: path.join(HOME, 'config.json'),
  memory: path.join(HOME, 'memory.json'),
  jobs: path.join(HOME, 'jobs.json'),
  runs: path.join(HOME, 'runs'),
  workspace: path.join(HOME, 'workspace'),
  pid: path.join(HOME, 'gateway.pid'),
  log: path.join(HOME, 'gateway.log'),
};

export const DEFAULT_PORT = 18790;
export const DEFAULT_MODELS: Record<ProviderKind, string> = { anthropic: 'claude-opus-5-5', openai: '' };

const defaults = (): Config => ({
  provider: 'anthropic',
  model: DEFAULT_MODELS.anthropic,
  apiKey: '',
  baseUrl: '',
  host: '127.0.0.1',
  port: DEFAULT_PORT,
  token: randomBytes(24).toString('base64url'),
  policy: {},
  allowedRoots: [],
  feedUrl: 'http://localhost:5173',
  approvalTimeoutMin: 12 * 60,
});

export function ensureHome(): void {
  for (const dir of [paths.home, paths.runs, paths.workspace]) mkdirSync(dir, { recursive: true });
}

export function loadConfig(): Config {
  ensureHome();
  const fresh = !existsSync(paths.config);
  const cfg = { ...defaults(), ...readJson<Partial<Config>>(paths.config, {}) };
  if (fresh) saveConfig(cfg);
  return cfg;
}

export function saveConfig(cfg: Config): void {
  ensureHome();
  writeJson(paths.config, cfg, 0o600);
}

export function resolveApiKey(cfg: Config): string {
  const env = cfg.provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY;
  return env || cfg.apiKey;
}

/** Ready to talk to a model: a key, or a local OpenAI-compatible server such as Ollama that needs none. */
export function isConfigured(cfg: Config): boolean {
  if (!cfg.model) return false;
  if (resolveApiKey(cfg)) return true;
  return cfg.provider === 'openai' && /^https?:\/\/(127\.0\.0\.1|localhost)/.test(cfg.baseUrl);
}

/** Config as the panel may see it: the key is reduced to its last characters. */
export function publicConfig(cfg: Config) {
  const key = resolveApiKey(cfg);
  const { token: _token, apiKey: _apiKey, ...rest } = cfg;
  return { ...rest, apiKeySet: Boolean(key), apiKeyHint: key ? `…${key.slice(-4)}` : '', configured: isConfigured(cfg) };
}
