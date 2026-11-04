// Shapes shared by the server, the agent tools and the browser.

export type CheckId = 'dev' | 'liquidity' | 'holders' | 'snipers' | 'contract' | 'volume' | 'socials';
export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface CheckResult {
  id: CheckId;
  label: string;
  value: string;
  status: CheckStatus;
}

export interface Launch {
  ticker: string;
  name: string;
  address: string;
  deployer: string;
  createdAt: number;
  ageSec: number;
  mcapUsd: number;
  holders: number;
  checks: CheckResult[];
  passed: number;
  verdict: 'signal' | 'noise';
  /** first check that did not pass, when the verdict is noise */
  collapsedOn: CheckId | null;
}

export interface WalletReport {
  address: string;
  riskScore: number;
  fundedBy: { label: string; share: number; flagged: boolean }[];
  movesWith: { address: string; reason: string }[];
  launchesDeployed: string[];
}

export interface FeedStats {
  observed: number;
  signal: number;
  noise: number;
  passRate: Record<CheckId, number>;
  source: string;
}

export interface AgentStatus {
  model: string;
  /** whether the server found Claude credentials at start-up */
  credentials: boolean;
  source: string;
}

/** The $NOIRA contract address and buy link, set from /admin. Empty strings mean "Coming soon". */
export interface TokenInfo {
  contractAddress: string;
  buyUrl: string;
  /** ms since epoch of the last change; 0 when never set */
  updatedAt: number;
}

export const CHECK_LABELS: Record<CheckId, string> = {
  dev: 'Dev wallet share',
  liquidity: 'Liquidity lock',
  holders: 'Holder concentration',
  snipers: 'Sniper / bundle activity',
  contract: 'Contract risk',
  volume: 'Early volume quality',
  socials: 'Socials & metadata',
};

export const CHECK_ORDER: CheckId[] = ['dev', 'liquidity', 'holders', 'snipers', 'contract', 'volume', 'socials'];
