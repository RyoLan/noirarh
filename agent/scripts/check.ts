// Checks the agent's pure logic without a model: npm test -w agent
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NOIRA_HOME = mkdtempSync(path.join(os.tmpdir(), 'noira-check-'));
// keys from the surrounding shell would change what counts as configured
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;
const { cronMatcher, nextRun } = await import('../src/scheduler.js');
const { resolveInside, TOOLS, levelOf, toolSpecs } = await import('../src/tools.js');
const { loadConfig, publicConfig, isConfigured } = await import('../src/config.js');
const { cleanHtml, slugFor } = await import('../src/builder.js');

// cron
const at = (s: string) => new Date(s);
assert.ok(cronMatcher('0 8 * * 1-5')(at('2026-11-02T08:00:00')));   // Monday
assert.ok(!cronMatcher('0 8 * * 1-5')(at('2026-11-01T08:00:00')));  // Sunday
assert.ok(cronMatcher('*/15 * * * *')(at('2026-11-02T10:45:00')));
assert.ok(!cronMatcher('*/15 * * * *')(at('2026-11-02T10:46:00')));
assert.ok(cronMatcher('30 16 * * 5')(at('2026-11-06T16:30:00')));   // Friday
assert.ok(cronMatcher('0 0 1 * 7')(at('2026-11-01T00:00:00')));     // day 1 or Sunday
assert.throws(() => cronMatcher('61 * * * *'));
assert.throws(() => cronMatcher('* * *'));
assert.equal(nextRun('0 8 * * 1-5', at('2026-11-06T09:00:00'))?.getDay(), 1); // Friday 9am → Monday

// workspace confinement
const cfg = loadConfig();
const ws = path.join(process.env.NOIRA_HOME, 'workspace');
assert.equal(resolveInside({ workspace: ws, cfg }, 'notes/a.md'), path.join(ws, 'notes', 'a.md'));
assert.throws(() => resolveInside({ workspace: ws, cfg }, '../config.json'));
assert.throws(() => resolveInside({ workspace: ws, cfg }, path.parse(ws).root));
const extra = path.join(os.tmpdir());
assert.equal(resolveInside({ workspace: ws, cfg: { ...cfg, allowedRoots: [extra] } }, path.join(extra, 'x.txt')), path.join(extra, 'x.txt'));

// policy and tools
assert.equal(levelOf(cfg, 'read_file'), 'allow');
assert.equal(levelOf(cfg, 'run_shell'), 'ask');
assert.equal(levelOf({ ...cfg, policy: { run_shell: 'block' } }, 'run_shell'), 'block');
assert.equal(levelOf(cfg, 'nope'), 'block');
const specs = toolSpecs();
assert.equal(specs.length, TOOLS.length);
assert.ok(specs.every(s => s.schema.type === 'object'));
const write = TOOLS.find(t => t.name === 'write_file')!;
assert.ok(!write.input.safeParse({ path: 'a.txt' }).success); // missing content is rejected before anything runs

// config never leaks the key or token
const pub = publicConfig({ ...cfg, apiKey: 'sk-test-1234567890' }) as Record<string, unknown>;
assert.equal(pub.apiKey, undefined);
assert.equal(pub.token, undefined);
assert.equal(pub.apiKeyHint, '…7890');
assert.ok(!isConfigured({ ...cfg, apiKey: '', provider: 'openai', baseUrl: 'https://api.example.com/v1', model: 'm' }));
assert.ok(isConfigured({ ...cfg, apiKey: '', provider: 'openai', baseUrl: 'http://127.0.0.1:11434/v1', model: 'llama3.1' }));

// builder helpers
assert.equal(slugFor('a launch page for my frog coin'), 'launch-frog-coin');
assert.equal(cleanHtml('```html\n<!doctype html><html></html>\n```'), '<!doctype html><html></html>\n');

console.log('noira agent: all checks passed');
