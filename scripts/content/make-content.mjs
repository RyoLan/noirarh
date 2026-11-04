// Renders the X content in content/<folder>/: for every post in posts.mjs a photo (NN-photo.png, 1600x1600), a video
// (NN-video.mp4, 1080x1080, 8 s, H.264) and its caption (NN-caption.txt), plus captions.md per folder and every
// caption in order in content/captions.txt. Drawing happens in headless Chrome or Edge (scene.js); no ffmpeg needed.
// Posts with `shot` instead of `scene` get a 1600x900 screenshot of that section of the live site (NOIRA_SITE, default
// https://noirarh.xyz) and no video; `offset` scrolls that many px past the section top, `wait` gives it longer to play.
// The browser reports macOS so the page shows the plain `npm install` command. Posts with neither are text only.
// node scripts/content/make-content.mjs                       everything
// node scripts/content/make-content.mjs before-launch/03      one post (also: a whole folder, or --photos to skip videos)
// node scripts/content/make-content.mjs --captions            only the caption files
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

// captions: one captions.md per folder, and every caption in posting order in content/captions.txt
const TITLES = { 'before-launch': 'BEFORE LAUNCH', 'after-launch': 'AFTER LAUNCH', 'dev-log': 'DEV LOG' };
const MEDIA = 'Each post has a photo (`NN-photo.png`) and a video (`NN-video.mp4`) with the same number; post either one with its caption.';
const INTROS = {
  'before-launch': [MEDIA],
  'after-launch': [MEDIA, '', 'Replace `[CA]` with the real contract address before posting.'],
  'dev-log': ['Short posts in the dev team’s own voice: lowercase, no hype, each one showing something real. `NN-photo.png` is a screenshot of the live site; posts without one are text only.',
    '', 'Fill in every `[BRACKET]` with the real link or number when it happens, and skip the post if it has not happened.',
    '', 'Suggested bio: `The AI agent that watches every Pons launch. Your machine, your model. $NOIRA fees buy back and burn.` with `npm i -g @noirarh/noira` and noirarh.xyz in the profile.'],
};
const meta = p => [p.when && `When: ${p.when}`, p.note && `Note: ${p.note}`].filter(Boolean);
for (const [folder, { posts }] of Object.entries(FOLDERS)) {
  const md = [`# Noira on X: ${TITLES[folder][0]}${TITLES[folder].slice(1).toLowerCase()}`, '', ...INTROS[folder], '',
    ...posts.flatMap((p, i) => {
      const n = String(i + 1).padStart(2, '0'), m = meta(p).map(l => `${l}  `);
      return [`## ${n}`, '', ...m, ...(m.length ? [''] : []), '```', p.caption, '```', `${xLength(p.caption)}/280${p.scene || p.shot ? '' : ' · text only'}`, ''];
    })];
  mkdirSync(path.join(out, folder), { recursive: true });
  writeFileSync(path.join(out, folder, 'captions.md'), md.join('\n'));
}
const rule = '='.repeat(48), cut = '-'.repeat(48);
const txt = ['NOIRA ($NOIRA) · X CAPTIONS', 'Each number matches NN-photo.png / NN-video.mp4 in that folder.', 'Replace [CA] with the real contract address before posting.', '',
  ...Object.entries(FOLDERS).flatMap(([folder, { posts }]) => [rule, `${TITLES[folder]}  (content/${folder})`, rule, '',
    ...posts.flatMap((p, i) => [`[${TITLES[folder]} ${String(i + 1).padStart(2, '0')}]${p.scene || p.shot ? '' : '  (text only)'}`,
      ...meta(p).map(l => `(${l})`), p.caption.replaceAll('\n', '\r\n'), cut, ''])])];
// Windows line endings and a BOM, so Notepad shows the emoji and line breaks as written
writeFileSync(path.join(out, 'captions.txt'), `﻿${txt.join('\r\n')}`);
if (args.includes('--captions')) process.exit(0);

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
  writeFileSync(path.join(dir, `${n}-caption.txt`), `${post.caption}\n`);
  if (!post.scene) continue;
  writeFileSync(path.join(dir, `${n}-photo.png`), Buffer.from(await run(`photo(${JSON.stringify(post)})`), 'base64'));
  if (!photosOnly) {
    const size = await run(`video(${JSON.stringify(post)})`), parts = [];
    for (let at = 0; at < size; at += 4 << 20) parts.push(Buffer.from(await run(`mp4Slice(${at}, ${4 << 20})`), 'base64'));
    writeFileSync(path.join(dir, `${n}-video.mp4`), Buffer.concat(parts));
  }
  console.log(`${folder}/${n}  ${post.scene}`);
}

// screenshots of the live site, one section each
const shots = todo.filter(j => j.post.shot);
if (shots.length) {
  const site = process.env.NOIRA_SITE ?? 'https://noirarh.xyz';
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36', platform: 'MacIntel' });
  await send('Page.navigate', { url: site });
  for (let i = 0; i < 150 && !(await run('document.readyState === "complete" && !!document.getElementById("top")').catch(() => false)); i++) await sleep(100);
  await sleep(9000); // the loader and the hero scene
  for (const { folder, n, post } of shots) {
    await run(`(() => { const y = document.getElementById(${JSON.stringify(post.shot)}).getBoundingClientRect().top + scrollY + ${post.offset ?? 0};
      window.lenis?.scrollTo?.(y, { immediate: true }); window.scrollTo(0, y); })()`);
    await sleep(post.wait ?? 3500); // scroll-triggered reveals
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path.join(out, folder, `${n}-photo.png`), Buffer.from(shot.result.data, 'base64'));
    console.log(`${folder}/${n}  ${site}#${post.shot}`);
  }
}

ws.close();
proc.kill();
process.exit(0);
