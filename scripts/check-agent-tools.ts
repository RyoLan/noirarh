// Exercises the agent's tools and helpers without calling Claude: npx tsx scripts/check-agent-tools.ts
import assert from 'node:assert/strict';
import { parseHistory, runTool } from '../server/agent.js';
import { DemoSource, LaunchFeed } from '../server/feed.js';
import { cleanHtml, slugFor } from '../shared/build.js';

const feed = new LaunchFeed(new DemoSource());
feed.start();

const list = JSON.parse(runTool(feed, 'list_launches', { verdict: 'any', limit: 5 }).content);
assert.equal(list.count, 5);
const clean = JSON.parse(runTool(feed, 'list_launches', { passed_check: 'snipers' }).content);
assert.ok(clean.launches.every((l: { checks: Record<string, string> }) => l.checks.snipers!.startsWith('pass')));
const first = list.launches[0];
const one = JSON.parse(runTool(feed, 'get_launch', { ticker: first.ticker }).content);
assert.equal(one.ticker, first.ticker);
const wallet = JSON.parse(runTool(feed, 'inspect_wallet', { address: one.deployer }).content);
assert.ok(wallet.riskScore >= 0 && wallet.fundedBy.length > 0);
assert.equal(runTool(feed, 'list_launches', { verdict: 'maybe' }).ok, false);
assert.equal(runTool(feed, 'get_launch', { ticker: '$NOPE' }).ok, false);
assert.ok(JSON.parse(runTool(feed, 'feed_stats', {}).content).observed >= 10);

assert.equal(parseHistory([{ role: 'assistant', content: 'x' }]), null);
assert.ok(parseHistory([{ role: 'user', content: 'hi' }]));
assert.equal(slugFor('a launch page for my frog coin with a countdown'), 'launch-frog-coin');
assert.equal(slugFor('an ocean themed meme coin site called "Tidal"'), 'tidal');
assert.equal(cleanHtml('```html\n<!doctype html><html></html>\n```'), '<!doctype html><html></html>\n');
console.log('agent tools: all checks passed');
process.exit(0);
