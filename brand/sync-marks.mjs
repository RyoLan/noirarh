// Writes the current small Signal mark (brand/signal.mjs) into the HTML pages: every inline 32-box mark and the
// favicon. Run after changing the mark; the app icons and X images come from agent/scripts/make-icons.mjs and
// brand/render.mjs.
// node brand/sync-marks.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SMALL, signalLines } from './signal.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = ['index.html', 'docs.html', 'agent/panel/panel.html'];

const inline = signalLines(SMALL, { dimOpacity: 0.3 });
// favicon: lavender rows and violet noise on a dark disc, written URL-encoded with single quotes
const favicon = signalLines(SMALL, { main: '#ece4ff', dim: '#8b5cff', dimOpacity: 0.75 })
  .replaceAll('"', "'").replaceAll('<', '%3C').replaceAll('>', '%3E').replaceAll('#', '%23');

for (const page of PAGES) {
  const file = path.join(root, page);
  let html = readFileSync(file, 'utf8'), marks = 0, icons = 0;
  html = html.replace(/(<svg viewBox="0 0 32 32"[^>]*>)<g stroke-width="[\d.]+" stroke-linecap="round">.*?(<\/g><\/svg>)/g,
    (_, svg, close) => (marks++, `${svg}<g stroke-width="${SMALL.sw}" stroke-linecap="round">${inline}${close}`));
  // the favicon's rows are a little heavier: it is shown at 16px, scaled down to fit its disc
  html = html.replace(/(%3Cg transform='[^']*' )stroke-width='[\d.]+'( stroke-linecap='round'%3E).*?(%3C\/g%3E)/g,
    (_, g, cap, close) => (icons++, `${g}stroke-width='${+(SMALL.sw + 0.3).toFixed(2)}'${cap}${favicon}${close}`));
  writeFileSync(file, html);
  console.log(`${page}: ${marks} inline mark(s), ${icons} favicon(s)`);
}
