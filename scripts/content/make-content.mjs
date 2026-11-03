// Renders the X content in content/<folder>/: for every post in posts.mjs a photo (NN-photo.png, 1600x1600), a video
// (NN-video.mp4, 1080x1080, 8 s, H.264) and its caption (NN-caption.txt), plus captions.md with all of them.
// Drawing happens in headless Chrome or Edge (scene.js); no ffmpeg needed.
// node scripts/content/make-content.mjs                       everything
// node scripts/content/make-content.mjs before-launch/03      one post (also: a whole folder, or --photos to skip videos)
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LARGE, signalBars } from '../../brand/signal.mjs';
import { FOLDERS } from './posts.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '..', '..', 'content');
const args = process.argv.slice(2);
const photosOnly = args.includes('--photos');
const only = args.find(a => !a.startsWith('--'));

/** X's weighted length: links count 23, emoji and other wide characters count 2. */
function xLength(text) {
  const plain = text.replace(/\b[a-z0-9-]+\.(xyz|com)(\/\S*)?/gi, 'x'.repeat(23));
  return [...plain].reduce((n, ch) => n + (ch.codePointAt(0) > 0x2fff ? 2 : 1), 0);
}

const jobs = Object.entries(FOLDERS).flatMap(([folder, { phase, posts }]) =>
  posts.map((post, i) => ({ folder, n: String(i + 1).padStart(2, '0'), post: { ...post, phase } })));
const long = jobs.filter(j => xLength(j.post.caption) > 280);
if (long.length) { for (const j of long) console.error(`${j.folder}/${j.n}: caption is ${xLength(j.post.caption)} of 280`); process.exit(1); }
const todo = only ? jobs.filter(j => `${j.folder}/${j.n}`.startsWith(only)) : jobs;

const browser = [process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && existsSync(p));
if (!browser) { console.error('No Chrome or Edge found; set CHROME=/path/to/chrome'); process.exit(1); }

const tmp = mkdtempSync(path.join(os.tmpdir(), 'noira-content-'));
const port = 9400 + Math.floor(Math.random() * 400);
const proc = spawn(browser, ['--headless=new', `--remote-debugging-port=${port}`, '--hide-scrollbars', '--no-first-run', `--user-data-dir=${tmp}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { await sleep(200); } }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
async function run(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
  return r.result.result.value;
}

const page = path.join(tmp, 'content.html');
writeFileSync(page, `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Orbitron:wght@500;600;700&display=block">
<script src="https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.min.js"></script>
<canvas id="c" width="1080" height="1080"></canvas>
<script>const BARS = ${JSON.stringify(signalBars(LARGE))};</script>
<script>${readFileSync(path.join(here, 'scene.js'), 'utf8')}</script>`);
await send('Page.navigate', { url: `file:///${page.replace(/\\/g, '/')}` });
for (let i = 0; i < 100 && !(await run('typeof window.ready !== "undefined"').catch(() => false)); i++) await sleep(100);
const fonts = await run('window.ready');
if (!fonts.every(Boolean)) console.warn('Some fonts did not load; text falls back to system fonts.', fonts);

for (const { folder, n, post } of todo) {
  const dir = path.join(out, folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${n}-photo.png`), Buffer.from(await run(`photo(${JSON.stringify(post)})`), 'base64'));
  writeFileSync(path.join(dir, `${n}-caption.txt`), `${post.caption}\n`);
  if (!photosOnly) {
    const size = await run(`video(${JSON.stringify(post)})`), parts = [];
    for (let at = 0; at < size; at += 4 << 20) parts.push(Buffer.from(await run(`mp4Slice(${at}, ${4 << 20})`), 'base64'));
    writeFileSync(path.join(dir, `${n}-video.mp4`), Buffer.concat(parts));
  }
  console.log(`${folder}/${n}  ${post.scene}`);
}

for (const [folder, { posts }] of Object.entries(FOLDERS)) {
  const title = folder === 'before-launch' ? 'Before launch' : 'After launch';
  const md = [`# Noira on X: ${title}`, '',
    'Each post has a photo (`NN-photo.png`) and a video (`NN-video.mp4`) with the same number; post either one with its caption.',
    ...(folder === 'after-launch' ? ['', 'Replace `[CA]` with the real contract address before posting.'] : []), '',
    ...posts.flatMap((p, i) => { const n = String(i + 1).padStart(2, '0'); return [`## ${n}`, '', '```', p.caption, '```', `${xLength(p.caption)}/280`, '']; })];
  mkdirSync(path.join(out, folder), { recursive: true });
  writeFileSync(path.join(out, folder, 'captions.md'), md.join('\n'));
}

ws.close();
proc.kill();
process.exit(0);
