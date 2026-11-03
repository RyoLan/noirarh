import { EventEmitter } from 'node:events';
import { CHECK_LABELS, CHECK_ORDER, type CheckId, type CheckResult, type CheckStatus, type FeedStats, type Launch, type WalletReport } from '../shared/types.js';

/**
 * Where launches come from. The demo source invents plausible launches so the
 * whole product runs end to end; swap in an indexer that reads Pons launches
 * from chain by implementing the same interface.
 */
export interface LaunchSource {
  readonly name: string;
  start(onLaunch: (launch: Launch) => void): void;
  wallet(address: string): WalletReport | null;
}

const PRE = ['MOON', 'PEPE', 'ROBO', 'HOOD', 'NEKO', 'GIGA', 'BASED', 'TURBO', 'FROG', 'ZAP', 'LUNA', 'APE', 'ORBI', 'QUARK', 'NOVA', 'VOLT', 'PIXEL', 'MOCHI'];
const SUF = ['', 'INU', 'CAT', 'AI', 'X', 'FI', 'BOT', 'WIF', 'DOG'];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;
const hex = (n: number) => Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
const short = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

type Gen = (good: boolean) => { value: string; status: CheckStatus };
const GENERATORS: Record<CheckId, Gen> = {
  dev: g => { const v = g ? rand(0.4, 4.6) : rand(1.5, 18); return { value: `${v.toFixed(1)}% of supply`, status: v < 5 ? 'pass' : v < 9 ? 'warn' : 'fail' }; },
  liquidity: g => (g || Math.random() < 0.5)
    ? pick([{ value: 'LP burned', status: 'pass' }, { value: 'Locked 180d', status: 'pass' }, { value: 'Locked 365d', status: 'pass' }] as const)
    : pick([{ value: 'Unlocked', status: 'fail' }, { value: 'Locked 3d', status: 'warn' }] as const),
  holders: g => { const v = g ? rand(9, 27) : rand(16, 64); return { value: `Top 10 hold ${v.toFixed(0)}%`, status: v < 30 ? 'pass' : v < 45 ? 'warn' : 'fail' }; },
  snipers: g => { const n = g ? 0 : Math.floor(rand(0, 9)); return { value: n === 0 ? 'No same-block buys' : `${n} bundled wallets`, status: n === 0 ? 'pass' : n < 3 ? 'warn' : 'fail' }; },
  contract: g => (g || Math.random() < 0.55)
    ? { value: 'No mint · no blacklist', status: 'pass' }
    : pick([{ value: 'Owner can mint', status: 'fail' }, { value: 'Upgradeable proxy', status: 'warn' }, { value: 'Blacklist function', status: 'fail' }] as const),
  volume: g => { const v = g ? rand(78, 97) : rand(30, 90); return { value: `${v.toFixed(0)}% organic`, status: v >= 75 ? 'pass' : v >= 55 ? 'warn' : 'fail' }; },
  socials: g => (g || Math.random() < 0.5)
    ? { value: 'Site + X verified', status: 'pass' }
    : pick([{ value: 'No socials', status: 'warn' }, { value: 'Copied metadata', status: 'fail' }] as const),
};

export class DemoSource implements LaunchSource {
  readonly name = 'demo feed (simulated Pons launches)';
  private wallets = new Map<string, WalletReport>();

  start(onLaunch: (launch: Launch) => void): void {
    for (let i = 0; i < 10; i++) onLaunch(this.make(Date.now() - (10 - i) * 7000));
    setInterval(() => onLaunch(this.make(Date.now())), 6500).unref();
  }

  wallet(address: string): WalletReport | null {
    return this.wallets.get(address.toLowerCase()) ?? null;
  }

  private make(createdAt: number): Launch {
    const good = Math.random() < 0.27;
    let name = pick(PRE) + pick(SUF);
    if (name.length > 9) name = name.slice(0, 9);
    const checks: CheckResult[] = CHECK_ORDER.map(id => ({ id, label: CHECK_LABELS[id], ...GENERATORS[id](good) }));
    const passed = checks.filter(c => c.status === 'pass').length;
    const firstBad = checks.find(c => c.status !== 'pass');
    const deployer = `0x${hex(40)}`;
    const launch: Launch = {
      ticker: `$${name}`,
      name: name.charAt(0) + name.slice(1).toLowerCase(),
      address: `0x${hex(40)}`,
      deployer,
      createdAt,
      ageSec: Math.floor(rand(4, 70)),
      mcapUsd: Math.round(rand(4000, 58000)),
      holders: Math.round(rand(14, 420)),
      checks,
      passed,
      verdict: passed === 7 ? 'signal' : 'noise',
      collapsedOn: firstBad?.id ?? null,
    };
    this.wallets.set(deployer.toLowerCase(), this.walletFor(launch, good));
    return launch;
  }

  private walletFor(launch: Launch, good: boolean): WalletReport {
    const raw = good
      ? [['Bridge in', 0.55, false], ['CEX hot wallet', 0.35, false], ['Older own wallet', 0.1, false]]
      : [['Fresh wallet', 0.38, true], ['Mixer-like hops', 0.24, true], ['CEX hot wallet', 0.22, false], ['Prior rug deployer', 0.16, true]];
    const fundedBy = (raw as [string, number, boolean][]).map(([label, share, flagged]) => ({ label, share, flagged }));
    const peers = good ? 1 : Math.floor(rand(2, 6));
    const reasons = ['bought in the same block', 'funded by the same wallet', 'mirrors every trade', 'received supply at launch'];
    const report: WalletReport = {
      address: launch.deployer,
      riskScore: good ? Math.round(rand(8, 28)) : Math.round(rand(48, 92)),
      fundedBy,
      movesWith: Array.from({ length: peers }, () => ({ address: short(`0x${hex(40)}`), reason: pick(reasons) })),
      launchesDeployed: [launch.ticker],
    };
    return report;
  }
}

/** Keeps the recent launches in memory and fans them out to subscribers. */
export class LaunchFeed extends EventEmitter<{ launch: [Launch] }> {
  private launches: Launch[] = [];

  constructor(readonly source: LaunchSource, private keep = 300) {
    super();
    this.setMaxListeners(200);
  }

  start(): void {
    this.source.start(l => {
      this.launches.unshift(l);
      if (this.launches.length > this.keep) this.launches.length = this.keep;
      this.emit('launch', l);
    });
  }

  recent(limit = 20): Launch[] {
    return this.launches.slice(0, limit);
  }

  find(ticker: string): Launch | undefined {
    const t = ticker.replace(/^\$/, '').toUpperCase();
    return this.launches.find(l => l.ticker.slice(1) === t);
  }

  query(opts: { verdict?: 'signal' | 'noise' | 'any'; passed?: CheckId; failed?: CheckId; limit?: number }): Launch[] {
    return this.launches
      .filter(l => !opts.verdict || opts.verdict === 'any' || l.verdict === opts.verdict)
      .filter(l => !opts.passed || l.checks.find(c => c.id === opts.passed)?.status === 'pass')
      .filter(l => !opts.failed || l.checks.find(c => c.id === opts.failed)?.status !== 'pass')
      .slice(0, Math.min(opts.limit ?? 10, 50));
  }

  stats(): FeedStats {
    const n = this.launches.length || 1;
    const passRate = Object.fromEntries(CHECK_ORDER.map(id => [
      id, Math.round(this.launches.filter(l => l.checks.find(c => c.id === id)?.status === 'pass').length / n * 100),
    ])) as Record<CheckId, number>;
    const signal = this.launches.filter(l => l.verdict === 'signal').length;
    return { observed: this.launches.length, signal, noise: this.launches.length - signal, passRate, source: this.source.name };
  }

  wallet(address: string): WalletReport | null {
    return this.source.wallet(address);
  }
}
