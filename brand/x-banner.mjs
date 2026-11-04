// The Noira X banner (1500x500): every launch streams in from the left as noise and collapses into the Signal
// crescent; the wordmark sits in the clean signal space to its right. Rendered by `node brand/render.mjs x-banner`
// to brand/logos/noira-x-banner.png (add --guides for a copy with the X safe areas drawn on it).
//
// Safe areas, in banner pixels: X puts the profile picture over the bottom-left (about x 0–400, y 320–500 on
// desktop) and the mobile app trims the top and bottom edges, so the mark and all copy stay inside x 440–1400,
// y 70–430. The noise field on the left is decoration and may sit under the picture.
import { LARGE, signalBars } from './signal.mjs';

const W = 1500, H = 500;
const LAV = '#e4d8ff', VIO = '#8b5cff';

/** Where the mark sits: its centre and the scale of the 512 box. */
const MARK = { cx: 600, cy: 250, s: 0.86 };

const f = n => +n.toFixed(2);

function field() {
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const { cx, cy, s } = MARK;
  const tx = x => cx + (x - 256) * s, ty = y => cy + (y - 256) * s;
  const bars = signalBars(LARGE).map(b => ({ ...b, x1: tx(b.x1), x2: tx(b.x2), y: ty(b.y) }));
  const sw = LARGE.sw * s, pitch = LARGE.step * s;

  const mark = bars.map(b => b.noise
    ? `<line x1="${f(b.x1)}" y1="${f(b.y)}" x2="${f(b.x2)}" y2="${f(b.y)}" stroke="${VIO}" stroke-opacity=".5"/>`
    : `<line x1="${f(b.x1)}" y1="${f(b.y)}" x2="${f(b.x2)}" y2="${f(b.y)}" stroke="url(#crescent)"/>`).join('');

  // the noise that feeds each crescent row: broken dashes from the left edge, brighter as they near the mark
  const dashes = [];
  const stream = (y, end, peak, width) => {
    let x = end - 10 - rnd() * 22;
    while (x > 0) {
      const len = 6 + rnd() ** 1.6 * 80;
      const x1 = Math.max(0, x - len), t = x / end;
      const o = peak * t ** 1.8 * (0.55 + rnd() * 0.45);
      if (o > 0.012) dashes.push(`<line x1="${f(x1)}" y1="${f(y)}" x2="${f(x)}" y2="${f(y)}" stroke-width="${f(width)}" stroke-opacity="${f(o)}"/>`);
      x = x1 - (8 + rnd() * 46);
    }
  };
  const rows = bars.filter(b => b.noise);
  for (const b of rows) stream(b.y, b.x1, 0.48, sw);
  // fainter, thinner rows above and below the mark keep the field going to the edges
  const top = rows[0].y, bottom = rows.at(-1).y;
  for (let y = top - pitch, i = 1; y > -pitch; y -= pitch, i++) stream(y, MARK.cx - 150 + rnd() * 60, 0.3 / (1 + i * 0.35), sw * 0.55);
  for (let y = bottom + pitch, i = 1; y < H + pitch; y += pitch, i++) stream(y, MARK.cx - 150 + rnd() * 60, 0.3 / (1 + i * 0.35), sw * 0.55);

  const stars = Array.from({ length: 70 }, () => {
    const x = 760 + rnd() * (W - 760), y = rnd() * H, r = 0.4 + rnd() ** 3 * 1.3;
    return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="#efe8ff" opacity="${f(0.15 + rnd() * 0.5)}"/>`;
  }).join('');

  return `<svg class="bg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="base" cx="${cx / W}" cy="${cy / H}" r="1.1" gradientTransform="translate(${cx / W} ${cy / H}) scale(1 3) translate(${-cx / W} ${-cy / H})">
      <stop offset="0" stop-color="#22114f"/><stop offset=".38" stop-color="#0e0727"/><stop offset="1" stop-color="#030208"/>
    </radialGradient>
    <radialGradient id="glow"><stop offset="0" stop-color="#8b5cff" stop-opacity=".5"/><stop offset=".6" stop-color="#7b4dff" stop-opacity=".12"/><stop offset="1" stop-color="#7b4dff" stop-opacity="0"/></radialGradient>
    <radialGradient id="glow2"><stop offset="0" stop-color="#7b4dff" stop-opacity=".22"/><stop offset="1" stop-color="#7b4dff" stop-opacity="0"/></radialGradient>
    <linearGradient id="crescent" gradientUnits="userSpaceOnUse" x1="${cx - 120}" y1="${cy - 130}" x2="${cx + 140}" y2="${cy + 130}">
      <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="${LAV}"/>
    </linearGradient>
    <radialGradient id="vig" cx=".55" cy=".5" r=".75"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>
    <pattern id="scan" width="${W}" height="5" patternUnits="userSpaceOnUse"><rect width="${W}" height="1.2" fill="#c9b6ff" opacity=".03"/></pattern>
    <filter id="bloom" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#base)"/>
  <ellipse cx="1120" cy="250" rx="520" ry="300" fill="url(#glow2)"/>
  <rect width="${W}" height="${H}" fill="url(#scan)"/>
  ${stars}
  <circle cx="${cx}" cy="${cy}" r="250" fill="url(#glow)"/>
  <circle cx="${cx}" cy="${cy}" r="196" fill="none" stroke="#b9a2ff" stroke-opacity=".1"/>
  <circle cx="${cx}" cy="${cy}" r="232" fill="none" stroke="#b9a2ff" stroke-opacity=".07" stroke-dasharray="2 7"/>
  <circle cx="${f(cx + 232 * Math.cos(0.95))}" cy="${f(cy + 232 * Math.sin(0.95))}" r="3.6" fill="${LAV}" opacity=".9"/>
  <g stroke="${VIO}" stroke-linecap="round">${dashes.join('')}</g>
  <g stroke-width="${f(sw)}" stroke-linecap="round" filter="url(#bloom)">${mark}</g>
  <rect width="${W}" height="${H}" fill="url(#vig)"/>
  <rect width="${W}" height="${H}" filter="url(#grain)" opacity=".08"/>
</svg>`;
}

/** The X safe areas drawn over the banner, for checking only. */
const guides = `<svg class="bg" viewBox="0 0 ${W} ${H}" style="z-index:5">
  <circle cx="207" cy="500" r="170" fill="#ff3b6b" fill-opacity=".35" stroke="#ff3b6b" stroke-width="3"/>
  <text x="80" y="430" fill="#fff" font-family="Inter" font-size="20">profile picture</text>
  <rect x="0" y="0" width="${W}" height="60" fill="#ffc76b" fill-opacity=".22"/><rect x="0" y="${H - 60}" width="${W}" height="60" fill="#ffc76b" fill-opacity=".22"/>
  <rect x="440" y="70" width="960" height="360" fill="none" stroke="#7cf0c2" stroke-width="2" stroke-dasharray="8 6"/>
</svg>`;

export const xBannerHtml = ({ withGuides = false } = {}) => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;600&family=Inter:wght@500&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#030208;}
.h{position:relative;width:${W}px;height:${H}px;overflow:hidden;}
.bg{position:absolute;inset:0;width:100%;height:100%;}
.copy{position:absolute;left:830px;top:50%;transform:translateY(-50%);}
.eyebrow{display:flex;align-items:center;gap:16px;font:500 17px 'JetBrains Mono',monospace;letter-spacing:.22em;color:#9488b8;}
.eyebrow b{font:600 22px Orbitron,sans-serif;letter-spacing:.12em;color:#b597ff;}
.eyebrow i{width:36px;height:1px;background:rgba(200,178,255,.35);}
.wm{margin:16px 0 0 -6px;font:600 118px/1 Orbitron,sans-serif;letter-spacing:.16em;color:#fbf9ff;
  background:linear-gradient(180deg,#fff 30%,#dccfff);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
  filter:drop-shadow(0 0 26px rgba(190,165,255,.45));}
.tag{margin-top:20px;font:500 31px Inter,sans-serif;letter-spacing:.01em;color:#cdc3ea;}
.tag em{font-style:normal;color:#fff;text-shadow:0 0 18px rgba(165,130,255,.9);}
.foot{display:flex;align-items:center;gap:12px;margin-top:22px;font:500 17px 'JetBrains Mono',monospace;letter-spacing:.06em;color:#9488b8;}
.foot .dot{width:8px;height:8px;border-radius:50%;background:#7cf0c2;box-shadow:0 0 10px #7cf0c2;}
.foot .url{color:#dccfff;}
</style></head><body><div class="h">${field()}
<div class="copy">
  <div class="eyebrow"><b>$NOIRA</b><i></i><span>AI LAUNCH AGENT</span></div>
  <div class="wm">NOIRA</div>
  <div class="tag">Collapse the noise into <em>signal</em>.</div>
  <div class="foot"><span class="dot"></span><span>Watching every Pons launch</span><span>·</span><span class="url">noirarh.xyz</span></div>
</div>${withGuides ? guides : ''}</div></body></html>`;
