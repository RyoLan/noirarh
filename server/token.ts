import { timingSafeEqual, createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { TokenInfo } from '../shared/types.js';

/* The token's contract address and buy link, edited from /admin and read by the home page.
   Stored as JSON in DATA_DIR (default ./data) so it survives restarts. */

const EMPTY: TokenInfo = { contractAddress: '', buyUrl: '', updatedAt: 0 };

export class TokenStore {
  private value: TokenInfo = { ...EMPTY };
  private readonly file: string;

  constructor(dir: string) {
    this.file = path.join(dir, 'token.json');
  }

  async load(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf8')) as Partial<TokenInfo>;
      this.value = {
        contractAddress: typeof raw.contractAddress === 'string' ? raw.contractAddress : '',
        buyUrl: typeof raw.buyUrl === 'string' ? raw.buyUrl : '',
        updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
      };
    } catch {
      this.value = { ...EMPTY };
    }
  }

  get(): TokenInfo {
    return { ...this.value };
  }

  async set(next: Omit<TokenInfo, 'updatedAt'>): Promise<TokenInfo> {
    this.value = { ...next, updatedAt: Date.now() };
    await mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(this.value, null, 2));
    await rename(tmp, this.file);
    return this.get();
  }
}

/** EVM (0x + 40 hex) or Solana-style base58 (32–44 chars). Empty means "Coming soon". */
export function parseTokenInput(body: unknown): { ok: true; value: Omit<TokenInfo, 'updatedAt'> } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const ca = typeof b.contractAddress === 'string' ? b.contractAddress.trim() : '';
  const buy = typeof b.buyUrl === 'string' ? b.buyUrl.trim() : '';

  if (ca && !/^0x[0-9a-fA-F]{40}$/.test(ca) && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(ca)) {
    return { ok: false, error: 'That does not look like a contract address (expected 0x… with 40 hex characters).' };
  }
  if (buy) {
    let u: URL;
    try { u = new URL(buy); } catch { return { ok: false, error: 'The buy link is not a valid URL.' }; }
    if (u.protocol !== 'https:') return { ok: false, error: 'The buy link must start with https://' };
  }
  return { ok: true, value: { contractAddress: ca, buyUrl: buy } };
}

/* ---------- admin password ---------- */
const digest = (s: string) => createHash('sha256').update(s).digest();

/** Constant-time check of the Authorization: Bearer <ADMIN_PASSWORD> header. */
export function isAdmin(header: string | undefined, password: string | undefined): boolean {
  if (!password) return false;
  const given = /^Bearer (.+)$/.exec(header ?? '')?.[1] ?? '';
  return timingSafeEqual(digest(given), digest(password));
}

/** Slows down password guessing: 10 wrong tries per address per 15 minutes. */
export class LoginLimiter {
  private fails = new Map<string, { n: number; until: number }>();
  blocked(who: string): boolean {
    const f = this.fails.get(who);
    if (!f) return false;
    if (Date.now() > f.until) { this.fails.delete(who); return false; }
    return f.n >= 10;
  }
  fail(who: string) {
    const f = this.fails.get(who);
    const until = Date.now() + 15 * 60_000;
    this.fails.set(who, { n: (f && Date.now() <= f.until ? f.n : 0) + 1, until });
  }
  ok(who: string) { this.fails.delete(who); }
}
