// Exports the final Noira avatar and header, the X banner, then each concept's X avatar (400x400) and X header
// (1500x500), as PNG with headless Chrome or Edge.
// node brand/render.mjs                      everything   (set CHROME=path/to/chrome if it is not found)
// node brand/render.mjs x-banner [--guides]  only the named images; --guides also writes the X banner with its
//                                            safe areas drawn on it, to the temp folder

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { avatarHtml, CONCEPTS, FINAL, finalAvatarHtml, finalHeaderHtml, headerHtml } from './logos.mjs';
import { xBannerHtml } from './x-banner.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const browser = [process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && existsSync(p));
if (!browser) { console.error('No Chrome or Edge found; set CHROME=/path/to/chrome'); process.exit(1); }

const tmp = mkdtempSync(path.join(os.tmpdir(), 'noira-brand-'));
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
await send('Page.enable');

async function shoot(html, w, h, file) {
  const src = path.join(tmp, 'page.html');
  writeFileSync(src, html);
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `file:///${src.replace(/\\/g, '/')}` });
  await sleep(1800); // fonts
  const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
  writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
  console.log(file.startsWith(tmp) ? file : path.relative(here, file));
}

const jobs = [
  ['avatar', () => shoot(finalAvatarHtml(FINAL), 400, 400, path.join(here, 'logos', 'noira-avatar.png'))],
  ['header', () => shoot(finalHeaderHtml(FINAL), 1500, 500, path.join(here, 'logos', 'noira-header.png'))],
  ['x-banner', () => shoot(xBannerHtml(), 1500, 500, path.join(here, 'logos', 'noira-x-banner.png'))],
  ...CONCEPTS.map(c => [c.id, async () => {
    await shoot(avatarHtml(c), 400, 400, path.join(here, 'logos', `${c.id}-avatar.png`));
    await shoot(headerHtml(c), 1500, 500, path.join(here, 'logos', `${c.id}-header.png`));
  }]),
];
const only = process.argv.slice(2).filter(a => !a.startsWith('--'));
for (const [name, run] of jobs) if (!only.length || only.includes(name)) await run();
if (process.argv.includes('--guides')) await shoot(xBannerHtml({ withGuides: true }), 1500, 500, path.join(tmp, 'noira-x-banner-guides.png'));
ws.close();
proc.kill();
process.exit(0);
