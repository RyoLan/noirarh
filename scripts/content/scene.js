// Browser side of make-content.mjs: draws one post at time t (seconds) on a 1080x1080 canvas, and turns a post into a
// PNG (its last frame) or an H.264 MP4 (WebCodecs + mp4-muxer). BARS (the Signal mark in its 512 box) is injected.
/* global BARS, Mp4Muxer */

const W = 1080, DUR = 8, FPS = 30;
const C = { bg: '#030208', ink: '#f4f0ff', muted: '#9488b8', soft: '#c9bfe8', violet: '#7b4dff', vhi: '#a582ff', lav: '#dccfff', ok: '#7cf0c2', warn: '#ffc76b', bad: '#ff6b8b' };
const DISP = 'Orbitron', SANS = 'Inter', MONO = '"JetBrains Mono"';
const X0 = 80, X1 = 1000;

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = x => 1 - Math.pow(1 - clamp(x), 3);
const at = (t, start, dur = 0.6) => ease((t - start) / dur);
const lin = (t, start, dur) => clamp((t - start) / dur);
const mulberry = seed => () => { seed |= 0; seed = seed + 0x6d2b79f5 | 0; let x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };

function font(g, weight, size, family, spacing = 0) {
  g.font = `${weight} ${size}px ${family}`;
  g.letterSpacing = `${spacing}px`;
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
function wrap(g, text, maxW) {
  const out = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && g.measureText(next).width > maxW) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  return out;
}
function panel(g, x, y, w, h, a = 1, r = 26) {
  g.save();
  g.globalAlpha *= a;
  rr(g, x, y, w, h, r);
  g.fillStyle = 'rgba(22,13,52,.78)'; g.fill();
  g.strokeStyle = 'rgba(165,130,255,.26)'; g.lineWidth = 1.5; g.stroke();
  g.restore();
}
function chip(g, text, x, y, color, align = 'left', a = 1) {
  font(g, 500, 17, MONO, 2);
  const w = g.measureText(text).width + 30, left = align === 'right' ? x - w : x;
  g.save(); g.globalAlpha *= a;
  rr(g, left, y - 17, w, 34, 17); g.fillStyle = 'rgba(123,77,255,.14)'; g.fill();
  g.strokeStyle = color; g.globalAlpha *= .55; g.lineWidth = 1.2; g.stroke(); g.globalAlpha /= .55;
  g.fillStyle = color; g.textBaseline = 'middle'; g.fillText(text, left + 15, y + 1); g.textBaseline = 'alphabetic';
  g.restore();
  return w;
}

/* ---------- the Signal mark ---------- */
function drawMark(g, cx, cy, size, t = Infinity, start = 0, glow = 1) {
  const s = size / 512, ox = cx - 256 * s, oy = cy - 256 * s;
  g.save();
  g.lineCap = 'round'; g.lineWidth = Math.max(1.6, 11 * s);
  BARS.forEach((b, i) => {
    const row = i >> 1;
    if (b.noise) {
      const a = at(t, start + row * 0.06, 0.5);
      if (!a) return;
      g.globalAlpha = .4 * a; g.strokeStyle = '#8b5cff'; g.shadowBlur = 0;
      const dx = -(1 - a) * 90 * s * 4;
      g.beginPath(); g.moveTo(ox + (b.x1 + dx) * s, oy + b.y * s); g.lineTo(ox + (b.x2 + dx) * s, oy + b.y * s); g.stroke();
    } else {
      const a = at(t, start + 0.5 + row * 0.07, 0.8);
      if (!a) return;
      g.globalAlpha = 1; g.strokeStyle = '#ece4ff'; g.shadowColor = 'rgba(190,160,255,.85)'; g.shadowBlur = 18 * s * 4 * glow;
      g.beginPath(); g.moveTo(ox + b.x1 * s, oy + b.y * s); g.lineTo(ox + (b.x1 + (b.x2 - b.x1) * a) * s, oy + b.y * s); g.stroke();
    }
  });
  g.restore();
}

/* ---------- shared layers ---------- */
const STARS = (() => { const r = mulberry(7); return Array.from({ length: 140 }, () => ({ x: r() * W, y: r() * W, s: r() * 1.6 + .4, p: r() * 6.28, v: .6 + r() * 1.6 })); })();

function background(g, t, planet) {
  g.fillStyle = C.bg; g.fillRect(0, 0, W, W);
  const gx = 560 + Math.sin(t * .35) * 40, gy = 300 + Math.cos(t * .25) * 25;
  let grad = g.createRadialGradient(gx, gy, 0, gx, gy, 760);
  grad.addColorStop(0, 'rgba(110,64,255,.42)'); grad.addColorStop(.45, 'rgba(70,34,170,.18)'); grad.addColorStop(1, 'rgba(3,2,8,0)');
  g.fillStyle = grad; g.fillRect(0, 0, W, W);
  for (const s of STARS) {
    g.globalAlpha = .25 + .55 * Math.abs(Math.sin(t * s.v + s.p));
    g.fillStyle = '#e8e0ff'; g.beginPath(); g.arc(s.x, s.y, s.s, 0, 6.283); g.fill();
  }
  g.globalAlpha = .035; g.fillStyle = '#b9a4ff';
  for (let y = 0; y < W; y += 6) g.fillRect(0, y, W, 1);
  g.globalAlpha = 1;
  if (planet) {
    const cy = 925 + 1900; // high enough that the rim stays above the footer at the edges
    g.save();
    grad = g.createRadialGradient(540, cy, 1880, 540, cy, 2040);
    grad.addColorStop(0, 'rgba(160,120,255,.0)'); grad.addColorStop(.12, 'rgba(160,120,255,.32)'); grad.addColorStop(1, 'rgba(160,120,255,0)');
    g.fillStyle = grad; g.fillRect(0, 700, W, 380);
    g.beginPath(); g.arc(540, cy, 1900, 0, 6.283); g.fillStyle = '#05030d'; g.fill();
    g.strokeStyle = 'rgba(220,207,255,.75)'; g.lineWidth = 2.5; g.shadowColor = 'rgba(180,150,255,.9)'; g.shadowBlur = 26; g.stroke();
    g.restore();
  }
}

function frame(g, t, phase, foot) {
  drawMark(g, 98, 82, 58);
  g.fillStyle = C.ink; font(g, 600, 26, DISP, 7); g.fillText('NOIRA', 140, 93);
  const live = phase === 'live';
  font(g, 500, 17, MONO, 2);
  const label = live ? 'LIVE ON PONS' : 'COMING SOON';
  const w = g.measureText(label).width + 52, x = X1 - w;
  rr(g, x, 64, w, 36, 18); g.fillStyle = 'rgba(123,77,255,.16)'; g.fill();
  g.strokeStyle = live ? 'rgba(124,240,194,.55)' : 'rgba(165,130,255,.5)'; g.lineWidth = 1.2; g.stroke();
  const pulse = .55 + .45 * Math.abs(Math.sin(t * 2.2));
  g.fillStyle = live ? C.ok : C.vhi; g.globalAlpha = pulse; g.beginPath(); g.arc(x + 20, 82, 5, 0, 6.283); g.fill(); g.globalAlpha = 1;
  g.fillStyle = live ? C.ok : C.lav; g.textBaseline = 'middle'; g.fillText(label, x + 34, 83); g.textBaseline = 'alphabetic';
  g.fillStyle = 'rgba(220,207,255,.12)'; g.fillRect(X0, 990, X1 - X0, 1);
  font(g, 500, 21, MONO, 1); g.fillStyle = C.soft; g.fillText('noirarh.xyz', X0, 1032);
  g.textAlign = 'right'; g.fillStyle = C.muted; g.fillText(foot || '$NOIRA · SELF-HOSTED AI AGENT', X1, 1032); g.textAlign = 'left';
}

function kicker(g, text, t, start = .2, x = X0, y = 196) {
  font(g, 500, 21, MONO, 4);
  const n = Math.round(text.length * lin(t, start, .6));
  g.fillStyle = C.vhi; g.fillText(text.slice(0, n), x, y);
  if (n < text.length && n > 0) { g.globalAlpha = .8; g.fillRect(x + g.measureText(text.slice(0, n)).width + 4, y - 18, 11, 22); g.globalAlpha = 1; }
}

/** Big display title, line by line; returns the y below it. */
function title(g, text, t, start = .45, { x = X0, y = 222, size = 72, maxW = X1 - X0, align = 'left', lh = 1.12 } = {}) {
  const lines = text.split('\n');
  font(g, 700, size, DISP, 1);
  while (size > 30 && Math.max(...lines.map(l => g.measureText(l).width)) > maxW) font(g, 700, size -= 2, DISP, 1);
  lines.forEach((line, i) => {
    const a = at(t, start + i * .16, .7), base = y + size * (i + .9) * lh;
    g.save(); g.globalAlpha = a; g.translate(0, (1 - a) * 34);
    const grad = g.createLinearGradient(0, base - size, 0, base);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#c4b2ff');
    g.fillStyle = grad; g.shadowColor = 'rgba(150,110,255,.55)'; g.shadowBlur = 24; g.textAlign = align;
    g.fillText(line, align === 'center' ? 540 : x, base);
    g.restore();
  });
  return y + size * lines.length * lh + size * .2;
}

function body(g, text, t, start, { x = X0, y, size = 30, maxW = X1 - X0, color = C.soft, align = 'left' } = {}) {
  font(g, 400, size, SANS);
  const lines = wrap(g, text, maxW), a = at(t, start, .8);
  g.save(); g.globalAlpha = a; g.fillStyle = color; g.textAlign = align;
  lines.forEach((l, i) => g.fillText(l, align === 'center' ? 540 : x, y + (1 - a) * 18 + i * size * 1.42));
  g.restore();
  return y + lines.length * size * 1.42;
}

const STATUS = { pass: ['PASS', C.ok], warn: ['WARN', C.warn], fail: ['FAIL', C.bad] };
const CHECK_LABELS = ['Dev wallet share', 'Liquidity lock', 'Holder concentration', 'Sniper / bundle activity', 'Contract risk', 'Early volume quality', 'Socials metadata'];

/* ---------- scenes ---------- */
const SCENES = {
  mark(g, t, p) {
    const glow = .85 + .15 * Math.sin(t * 2);
    g.save();
    const halo = g.createRadialGradient(540, 400, 20, 540, 400, 330);
    halo.addColorStop(0, `rgba(150,110,255,${.32 * at(t, .8, 2)})`); halo.addColorStop(1, 'rgba(150,110,255,0)');
    g.fillStyle = halo; g.fillRect(0, 70, W, 660);
    g.restore();
    drawMark(g, 540, 410, 540, t, .2, glow);
    const y = title(g, p.title, t, 2.6, { y: 605, size: 70, align: 'center' });
    body(g, p.sub, t, 3.3, { y: y + 30, size: 30, align: 'center', color: C.lav });
  },

  headline(g, t, p) {
    kicker(g, p.kicker, t);
    const y = title(g, p.title, t, .5, { size: 84 });
    body(g, p.body, t, 1.3, { y: y + 40, size: 32, maxW: 760 });
    g.save(); g.globalAlpha = .9 * at(t, 1.6, 1.5);
    drawMark(g, 790, 770, 380, t, 1.6, .8);
    g.restore();
  },

  scan(g, t, p) {
    kicker(g, p.kicker, t);
    const y0 = title(g, p.title, t, .45, { size: 60 }) + 14;
    const h = 990 - 28 - y0, a = at(t, .9, .6);
    panel(g, X0, y0 + (1 - a) * 30, X1 - X0, h, a);
    if (!a) return;
    g.save(); g.globalAlpha = a; g.translate(0, (1 - a) * 30);
    const px = X0 + 40;
    font(g, 700, 38, DISP, 1); g.fillStyle = C.ink; g.fillText(p.ticker, px, y0 + 62);
    const tw = g.measureText(p.ticker).width;
    font(g, 400, 24, SANS); g.fillStyle = C.muted; g.fillText(p.name, px + tw + 18, y0 + 60);
    font(g, 400, 19, MONO); g.fillText('0x7a3f…c91e · age 41s · mcap $52.5K', px, y0 + 96);
    chip(g, 'EXAMPLE DATA', X1 - 40, y0 + 52, C.muted, 'right');
    const rowH = (h - 210) / 7, done = p.checks.filter((_, i) => t >= 1.6 + i * .42).length;
    font(g, 500, 20, MONO, 1); g.fillStyle = C.vhi; g.textAlign = 'right'; g.fillText(`${done}/7`, X1 - 40, y0 + 96); g.textAlign = 'left';
    p.checks.forEach((s, i) => {
      const ry = y0 + 130 + i * rowH, on = t >= 1.6 + i * .42;
      g.fillStyle = 'rgba(220,207,255,.08)'; g.fillRect(px, ry, X1 - X0 - 80, 1);
      font(g, 500, 25, SANS); g.fillStyle = on ? C.ink : C.muted; g.fillText(CHECK_LABELS[i], px, ry + rowH * .64);
      if (on) {
        const [label, col] = STATUS[s], k = at(t, 1.6 + i * .42, .35);
        g.save(); g.globalAlpha *= k;
        g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 12; g.beginPath(); g.arc(X1 - 150, ry + rowH * .55, 7, 0, 6.283); g.fill(); g.shadowBlur = 0;
        font(g, 600, 20, MONO, 2); g.textAlign = 'right'; g.fillText(label, X1 - 40, ry + rowH * .62);
        g.restore();
      } else {
        font(g, 500, 20, MONO, 2); g.fillStyle = C.muted; g.textAlign = 'right';
        g.fillText('·'.repeat(1 + Math.floor(t * 4 + i) % 3).padEnd(3, ' '), X1 - 40, ry + rowH * .62);
      }
      g.textAlign = 'left';
    });
    const signal = p.checks.every(s => s === 'pass'), v = at(t, 4.6, .5);
    if (v) {
      const vy = y0 + h - 64, col = signal ? C.ok : C.bad;
      g.save(); g.globalAlpha *= v;
      rr(g, px, vy, X1 - X0 - 80, 46, 23); g.fillStyle = signal ? 'rgba(124,240,194,.12)' : 'rgba(255,107,139,.10)'; g.fill();
      g.strokeStyle = col; g.lineWidth = 1.5; g.stroke();
      font(g, 700, 22, DISP, 6); g.fillStyle = col; g.textAlign = 'center'; g.shadowColor = col; g.shadowBlur = 16;
      g.fillText(signal ? 'COLLAPSED TO SIGNAL' : 'STAYS NOISE', 540, vy + 31);
      g.restore();
    }
    g.restore();
  },

  rows(g, t, p) {
    kicker(g, p.kicker, t);
    const y0 = title(g, p.title, t, .45, { size: 72 }) + 20, rowH = (970 - y0) / p.items.length;
    p.items.forEach((item, i) => {
      const a = at(t, 1.2 + i * .28, .6), y = y0 + i * rowH;
      g.save(); g.globalAlpha = a; g.translate((1 - a) * 40, 0);
      g.fillStyle = 'rgba(220,207,255,.1)'; g.fillRect(X0, y + rowH - 1, X1 - X0, 1);
      font(g, 500, 20, MONO, 2); g.fillStyle = C.vhi; g.fillText(String(i + 1).padStart(2, '0'), X0, y + rowH * .62);
      font(g, 600, 32, SANS); g.fillStyle = C.ink; g.fillText(item, X0 + 70, y + rowH * .64);
      const k = at(t, 2.4 + i * .2, .4);
      g.globalAlpha = a * k; g.strokeStyle = C.ok; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
      const cx = X1 - 22, cy = y + rowH * .52;
      g.beginPath(); g.arc(cx, cy, 15, 0, 6.283); g.strokeStyle = 'rgba(124,240,194,.4)'; g.lineWidth = 1.5; g.stroke();
      g.beginPath(); g.moveTo(cx - 7, cy); g.lineTo(cx - 2, cy + 5); g.lineTo(cx + 7, cy - 5); g.strokeStyle = C.ok; g.lineWidth = 3; g.stroke();
      g.restore();
    });
  },

  grid(g, t, p) {
    kicker(g, p.kicker, t);
    const y0 = title(g, p.title, t, .45, { size: 66 }) + 16, gap = 18, cw = (X1 - X0 - gap) / 2, ch = (968 - y0 - gap * 2) / 3;
    p.items.forEach((item, i) => {
      const a = at(t, 1.2 + i * .22, .6), x = X0 + (i % 2) * (cw + gap), y = y0 + Math.floor(i / 2) * (ch + gap);
      g.save(); g.translate(0, (1 - a) * 26);
      panel(g, x, y, cw, ch, a, 22);
      g.globalAlpha = a;
      font(g, 500, 18, MONO, 2); g.fillStyle = C.vhi; g.fillText(String(i + 1).padStart(2, '0'), x + 26, y + 40);
      font(g, 700, 25, DISP, 1); g.fillStyle = C.ink; g.fillText(item.t.toUpperCase(), x + 26, y + 78);
      font(g, 400, 19, SANS); g.fillStyle = C.soft;
      wrap(g, item.d, cw - 52).slice(0, 2).forEach((l, j) => g.fillText(l, x + 26, y + 112 + j * 26));
      g.restore();
    });
  },

  chat(g, t, p) {
    kicker(g, p.kicker, t);
    const top = title(g, p.title, t, .45, { size: 72 }) + 30;
    // size the panel to the whole conversation and centre it in the space left
    font(g, 500, 28, SANS);
    const qLines = wrap(g, p.q, 600), qh = qLines.length * 40 + 30;
    font(g, 400, 29, SANS);
    const aLines = wrap(g, p.a, X1 - X0 - 72).length;
    const ph = 36 + qh + 44 + 100 + aLines * 42 + 20, y0 = top + Math.max(0, (968 - top - ph) / 2);
    panel(g, X0, y0, X1 - X0, ph, at(t, .8, .6));
    // question
    font(g, 500, 28, SANS);
    const q = p.q.slice(0, Math.round(p.q.length * lin(t, 1.1, 1.1))), qa = at(t, 1.0, .3);
    if (qa) {
      const w = Math.max(...qLines.map(l => g.measureText(l).width)) + 48, h = qh;
      const x = X1 - 36 - w, y = y0 + 36;
      g.save(); g.globalAlpha = qa;
      rr(g, x, y, w, h, 22); g.fillStyle = C.lav; g.fill();
      g.fillStyle = '#1a0f3d'; wrap(g, q, 600).forEach((l, i) => g.fillText(l, x + 24, y + 46 + i * 40));
      g.restore();
    }
    // answer
    const ay = y0 + 36 + qh + 44, ax = X0 + 36;
    if (t > 2.4) {
      drawMark(g, ax + 26, ay + 26, 52);
      font(g, 600, 20, MONO, 2); g.fillStyle = C.vhi; g.fillText('NOIRA', ax + 66, ay + 34);
      chip(g, 'EXAMPLE', X1 - 36, ay + 26, C.muted, 'right', at(t, 2.4, .4));
    }
    if (t > 2.6 && t < 3.3) {
      for (let i = 0; i < 3; i++) { g.globalAlpha = .3 + .7 * Math.abs(Math.sin(t * 6 - i * .6)); g.fillStyle = C.lav; g.beginPath(); g.arc(ax + 30 + i * 22, ay + 92, 6, 0, 6.283); g.fill(); }
      g.globalAlpha = 1;
    }
    if (t >= 3.3) {
      font(g, 400, 29, SANS); g.fillStyle = C.ink;
      const shown = p.a.slice(0, Math.round(p.a.length * lin(t, 3.3, 2.2)));
      wrap(g, shown, X1 - X0 - 72).forEach((l, i) => g.fillText(l, ax, ay + 100 + i * 42));
    }
  },

  radar(g, t, p) {
    kicker(g, p.kicker, t);
    const y0 = title(g, p.title, t, .45, { size: 66 });
    const cx = 540, cy = (y0 + 980) / 2 + 6, r = Math.min(270, (980 - y0) / 2 - 20), a = at(t, .8, .8);
    g.save(); g.globalAlpha = a;
    for (let i = 1; i <= 3; i++) { g.beginPath(); g.arc(cx, cy, r * i / 3, 0, 6.283); g.strokeStyle = 'rgba(165,130,255,.28)'; g.lineWidth = 1.2; g.stroke(); }
    g.beginPath(); g.moveTo(cx - r, cy); g.lineTo(cx + r, cy); g.moveTo(cx, cy - r); g.lineTo(cx, cy + r); g.stroke();
    const ang = (t - .8) * 1.7;
    const sweep = g.createConicGradient(ang - .9, cx, cy);
    sweep.addColorStop(0, 'rgba(165,130,255,0)'); sweep.addColorStop(.143, 'rgba(165,130,255,.38)'); sweep.addColorStop(.1433, 'rgba(165,130,255,0)');
    g.fillStyle = sweep; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, r, 0, 6.283); g.fill();
    g.strokeStyle = C.lav; g.lineWidth = 2; g.shadowColor = C.vhi; g.shadowBlur = 14;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r); g.stroke(); g.shadowBlur = 0;
    const blips = [[.7, .62, 'SAME-BLOCK BUY'], [2.3, .8, 'BUNDLE ×4'], [3.6, .45, 'FRESH WALLET'], [5.1, .7, 'SNIPER']];
    for (const [ba, br, label] of blips) {
      const seen = ang - ba; if (seen < 0) continue;
      const k = clamp(seen * 2), x = cx + Math.cos(ba) * r * br, y = cy + Math.sin(ba) * r * br, ping = (seen % 6.283) / 6.283;
      g.globalAlpha = a * k; g.fillStyle = C.bad; g.shadowColor = C.bad; g.shadowBlur = 16;
      g.beginPath(); g.arc(x, y, 8, 0, 6.283); g.fill(); g.shadowBlur = 0;
      g.globalAlpha = a * k * (1 - ping) * .8; g.strokeStyle = C.bad; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 8 + ping * 34, 0, 6.283); g.stroke();
      g.globalAlpha = a * k; font(g, 600, 18, MONO, 2); g.fillStyle = C.ink;
      const right = Math.cos(ba) >= -.2;
      g.textAlign = right ? 'left' : 'right'; g.fillText(label, x + (right ? 18 : -18), y - 12); g.textAlign = 'left';
    }
    g.restore();
  },

  orbit(g, t, p) {
    kicker(g, p.kicker, t);
    const y0 = title(g, p.title, t, .45, { size: 66 }), mid = (y0 + 980) / 2;
    const clusters = [
      { x: 300, y: mid - 40, n: 5, r: 92, col: C.bad, label: 'ONE HAND · 31%', big: 30 },
      { x: 720, y: mid - 90, n: 4, r: 70, col: C.vhi, label: 'LINKED · 4 WALLETS', big: 20 },
      { x: 640, y: mid + 140, n: 3, r: 58, col: C.vhi, label: 'LINKED · 3 WALLETS', big: 16 },
    ];
    const rand = mulberry(11);
    for (let i = 0; i < 26; i++) {
      const x = X0 + 30 + rand() * 860, y = y0 + 40 + rand() * (930 - y0), s = 2 + rand() * 4, a = at(t, .8 + rand(), .8);
      g.globalAlpha = .55 * a; g.fillStyle = C.lav; g.beginPath(); g.arc(x + Math.sin(t * .6 + i) * 6, y + Math.cos(t * .5 + i) * 6, s, 0, 6.283); g.fill();
    }
    g.globalAlpha = 1;
    clusters.forEach((c, ci) => {
      const a = at(t, 1.3 + ci * .5, .8);
      if (!a) return;
      g.save(); g.globalAlpha = a;
      g.beginPath(); g.arc(c.x, c.y, c.r, 0, 6.283); g.strokeStyle = c.col; g.globalAlpha = a * .25; g.setLineDash([4, 7]); g.stroke(); g.setLineDash([]); g.globalAlpha = a;
      for (let i = 0; i < c.n; i++) {
        const ang = t * (.5 + ci * .12) + i * 6.283 / c.n, x = c.x + Math.cos(ang) * c.r, y = c.y + Math.sin(ang) * c.r;
        g.strokeStyle = c.col; g.globalAlpha = a * .35; g.lineWidth = 1.2; g.beginPath(); g.moveTo(c.x, c.y); g.lineTo(x, y); g.stroke();
        g.globalAlpha = a; g.fillStyle = c.col; g.beginPath(); g.arc(x, y, 7 + (i % 3) * 3, 0, 6.283); g.fill();
      }
      g.fillStyle = c.col; g.shadowColor = c.col; g.shadowBlur = 30; g.beginPath(); g.arc(c.x, c.y, c.big, 0, 6.283); g.fill(); g.shadowBlur = 0;
      font(g, 600, 18, MONO, 2); g.fillStyle = C.ink; g.textAlign = 'center'; g.fillText(c.label, c.x, c.y + c.r + 40); g.textAlign = 'left';
      g.restore();
    });
    chip(g, 'EXAMPLE DATA', X1, y0 + 20, C.muted, 'right', at(t, 1, .5));
  },

  pulse(g, t, p) {
    kicker(g, p.kicker, t);
    const y0 = title(g, p.title, t, .45, { size: 72 }), base = y0 + 190;
    const beat = x => { const ph = ((x / 230) % 1 + 1) % 1; return ph < .38 ? Math.sin(ph * 40) * 3 : ph < .44 ? -(ph - .38) * 1800 : ph < .5 ? -108 + (ph - .44) * 3200 : ph < .56 ? 84 - (ph - .5) * 1400 : 0; };
    const reveal = X0 + (X1 - X0) * lin(t, .9, 2.2), shift = Math.max(0, t - 3.1) * 140;
    g.save();
    g.strokeStyle = C.lav; g.lineWidth = 4; g.lineJoin = 'round'; g.shadowColor = C.vhi; g.shadowBlur = 20;
    g.beginPath();
    for (let x = X0; x <= reveal; x += 3) { const y = base + beat(x + shift); x === X0 ? g.moveTo(x, y) : g.lineTo(x, y); }
    g.stroke();
    g.fillStyle = C.ink; g.beginPath(); g.arc(reveal, base + beat(reveal + shift), 8, 0, 6.283); g.fill();
    g.restore();
    const stats = [['CURVE PROGRESS', 'bar', .64], ['LP MOVES', 'None in 24h', C.ok], ['LIQUIDITY LOCK', 'Locked', C.ok]];
    const sy = base + 150, cw = (X1 - X0 - 36) / 3;
    stats.forEach(([label, val, extra], i) => {
      const a = at(t, 2.4 + i * .3, .6), x = X0 + i * (cw + 18);
      panel(g, x, sy, cw, 170, a, 20);
      g.save(); g.globalAlpha = a;
      font(g, 500, 16, MONO, 2); g.fillStyle = C.muted; g.fillText(label, x + 24, sy + 40);
      if (val === 'bar') {
        const k = extra * at(t, 2.8, 1.6);
        font(g, 700, 40, DISP); g.fillStyle = C.ink; g.fillText(`${Math.round(k * 100)}%`, x + 24, sy + 100);
        rr(g, x + 24, sy + 124, cw - 48, 12, 6); g.fillStyle = 'rgba(220,207,255,.12)'; g.fill();
        rr(g, x + 24, sy + 124, (cw - 48) * k, 12, 6); g.fillStyle = C.vhi; g.fill();
      } else {
        font(g, 600, 30, SANS); g.fillStyle = extra; g.fillText(val, x + 24, sy + 104);
      }
      g.restore();
    });
    chip(g, 'EXAMPLE DATA', X1, y0 + 20, C.muted, 'right', at(t, 1, .5));
  },

  platforms(g, t, p) {
    kicker(g, p.kicker, t);
    const y0 = title(g, p.title, t, .45, { size: 66 }) + 16;
    const tiles = [
      ['WINDOWS', '.exe', 'Runs the gateway from the tray'], ['MACOS', '.dmg', 'Lives in the menu bar'],
      ['ANDROID', '.apk', 'Connects to your gateway'], ['WEB APP', 'install', 'From your own gateway'],
      ['NPM', 'npm i -g @noirarh/noira', 'Gateway, CLI and panel · Windows, macOS, Linux'],
    ];
    const gap = 18, cw = (X1 - X0 - gap) / 2, ch = (968 - y0 - gap * 2) / 3;
    tiles.forEach(([name, tag, desc], i) => {
      const wide = i === 4, a = at(t, 1.1 + i * .25, .6);
      const x = wide ? X0 : X0 + (i % 2) * (cw + gap), y = y0 + Math.floor(i / 2) * (ch + gap), w = wide ? X1 - X0 : cw;
      g.save(); g.translate(0, (1 - a) * 26);
      panel(g, x, y, w, ch, a, 22);
      g.globalAlpha = a;
      font(g, 700, 30, DISP, 2); g.fillStyle = C.ink; g.fillText(name, x + 28, y + 56);
      chip(g, tag, x + w - 26, y + 44, C.vhi, 'right');
      font(g, 400, 21, SANS); g.fillStyle = C.soft; g.fillText(desc, x + 28, y + ch - 32);
      g.restore();
    });
  },

  terminal(g, t, p) {
    kicker(g, p.kicker, t);
    const y0 = title(g, p.title, t, .45, { size: 72 }) + 30, h = 968 - y0, a = at(t, .8, .6);
    g.save(); g.translate(0, (1 - a) * 30); g.globalAlpha = a;
    rr(g, X0, y0, X1 - X0, h, 22); g.fillStyle = 'rgba(8,5,20,.92)'; g.fill(); g.strokeStyle = 'rgba(165,130,255,.3)'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = 'rgba(165,130,255,.08)'; rr(g, X0, y0, X1 - X0, 52, [22, 22, 0, 0]); g.fill();
    ['#ff6b8b', '#ffc76b', '#7cf0c2'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(X0 + 30 + i * 24, y0 + 26, 7, 0, 6.283); g.fill(); });
    font(g, 500, 18, MONO, 1); g.fillStyle = C.muted; g.textAlign = 'center';
    g.fillText(p.simulated ? 'noira · 127.0.0.1:18790 · simulated' : '~ terminal', 540, y0 + 32); g.textAlign = 'left';
    let clock = 1.3, cursor = null;
    const lh = Math.min(70, (h - 100) / p.lines.length);
    p.lines.forEach((line, i) => {
      const y = y0 + 110 + i * lh;
      if (line.cmd) {
        const n = Math.round(line.cmd.length * lin(t, clock, line.cmd.length / 26));
        if (t >= clock) {
          font(g, 500, 27, MONO); g.fillStyle = C.vhi; g.fillText('$', X0 + 36, y);
          g.fillStyle = C.ink; g.fillText(line.cmd.slice(0, n), X0 + 66, y);
          if (n < line.cmd.length) cursor = [X0 + 70 + g.measureText(line.cmd.slice(0, n)).width, y];
          else if (line.note) { font(g, 400, 20, MONO); g.fillStyle = C.muted; g.fillText(line.note, X0 + 66, y + 30); }
          if (n >= line.cmd.length && i === p.lines.length - 1) cursor = [X0 + 70 + (font(g, 500, 27, MONO), g.measureText(line.cmd).width), y];
        }
        clock += line.cmd.length / 26 + .35;
      } else {
        if (t >= clock) {
          const k = at(t, clock, .3);
          g.save(); g.globalAlpha *= k;
          font(g, 500, 26, MONO); g.fillStyle = { muted: C.muted, warn: C.warn, ok: C.ok }[line.tone] || C.ink;
          g.fillText(line.out, X0 + 36, y); g.restore();
        }
        clock += line.tone === 'warn' ? 1.1 : .6;
      }
    });
    if (cursor && Math.floor(t * 2.4) % 2 === 0) { g.fillStyle = C.lav; g.fillRect(cursor[0], cursor[1] - 24, 14, 30); }
    g.restore();
  },

  token(g, t, p) {
    kicker(g, p.kicker, t);
    let y0 = title(g, p.title, t, .45, { size: 66 }) + 30;
    const cards = [
      ['0.1%', 'Hold it. Open everything.', 'A wallet holding 0.1% of supply opens every detector. Everyone else gets 3 free builds a day.'],
      ['BURN', 'Every fee feeds the singularity.', 'Fees buy $NOIRA off the curve and send it to the dead address in one transaction.'],
      ['TOP 5', 'The heaviest wallets get paid.', 'A share of fees goes to the 5 largest holders, posted with the transactions.'],
    ];
    const gap = 18, cw = (X1 - X0 - gap * 2) / 3;
    // cards as tall as the longest text, centred in the space left
    const ch = Math.max(...cards.map(([, head, desc]) => {
      font(g, 600, 25, SANS); const hl = wrap(g, head, cw - 52).length;
      font(g, 400, 20, SANS); return 182 + hl * 34 + wrap(g, desc, cw - 52).length * 29 + 16;
    }));
    const top = y0;
    y0 = top + Math.max(0, (968 - top - ch) / 2);
    cards.forEach(([big, head, desc], i) => {
      const a = at(t, 1.1 + i * .3, .6), x = X0 + i * (cw + gap), focus = i === p.focus;
      g.save(); g.translate(0, (1 - a) * 30);
      panel(g, x, y0, cw, ch, a, 24);
      g.globalAlpha = a;
      if (focus) {
        const k = .6 + .4 * Math.abs(Math.sin(t * 1.6));
        rr(g, x, y0, cw, ch, 24); g.strokeStyle = C.vhi; g.lineWidth = 2.5; g.shadowColor = C.violet; g.shadowBlur = 30 * k; g.stroke(); g.shadowBlur = 0;
      }
      let label = big;
      if (big === '0.1%') label = `${(0.1 * at(t, 1.4, 1.8)).toFixed(1)}%`;
      font(g, 700, 50, DISP, 1); g.fillStyle = focus ? C.ink : C.lav; g.fillText(label, x + 26, y0 + 92);
      font(g, 600, 25, SANS); g.fillStyle = C.ink;
      const hl = wrap(g, head, cw - 52); hl.forEach((l, j) => g.fillText(l, x + 26, y0 + 160 + j * 34));
      font(g, 400, 20, SANS); g.fillStyle = C.soft;
      wrap(g, desc, cw - 52).forEach((l, j) => g.fillText(l, x + 26, y0 + 182 + hl.length * 34 + j * 29));
      g.restore();
    });
    font(g, 400, 17, MONO, 1); g.globalAlpha = at(t, 2.4, .6); g.fillStyle = C.muted; g.textAlign = 'right';
    g.fillText('NOT FINANCIAL ADVICE · DYOR', X1, y0 + ch + 40); g.textAlign = 'left'; g.globalAlpha = 1;
  },

  burn(g, t, p) {
    kicker(g, p.kicker, t);
    const y0 = title(g, p.title, t, .45, { size: 66 }), cy = (y0 + 980) / 2 - 20;
    const nodes = [[220, 'FEES', 'every fee'], [540, '$NOIRA', 'bought off the curve'], [860, '0x…dEaD', 'burned for good']];
    for (let s = 0; s < 2; s++) {
      const [x1] = nodes[s], [x2] = nodes[s + 1], a = at(t, 1.6 + s * .6, .6);
      g.globalAlpha = a * .35; g.strokeStyle = C.vhi; g.setLineDash([3, 9]); g.lineWidth = 2;
      g.beginPath(); g.moveTo(x1 + 96, cy); g.lineTo(x2 - 96, cy); g.stroke(); g.setLineDash([]);
      for (let k = 0; k < 6; k++) {
        const ph = ((t - 1.6 - s * .6) * .5 + k / 6) % 1; if (t < 1.6 + s * .6 || ph < 0) continue;
        const x = x1 + 96 + (x2 - x1 - 192) * ph;
        g.globalAlpha = a * Math.sin(ph * Math.PI); g.fillStyle = s ? C.warn : C.lav; g.shadowColor = g.fillStyle; g.shadowBlur = 14;
        g.beginPath(); g.arc(x, cy + Math.sin(ph * 12 + k) * 4, 5, 0, 6.283); g.fill(); g.shadowBlur = 0;
      }
    }
    nodes.forEach(([x, label, sub], i) => {
      const a = at(t, 1 + i * .45, .6), hot = i === 2;
      g.save(); g.globalAlpha = a;
      const r = 92 + (hot ? Math.sin(t * 5) * 3 : 0);
      const grad = g.createRadialGradient(x, cy, 10, x, cy, r * 1.6);
      grad.addColorStop(0, hot ? 'rgba(255,140,90,.45)' : 'rgba(123,77,255,.35)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad; g.beginPath(); g.arc(x, cy, r * 1.6, 0, 6.283); g.fill();
      g.beginPath(); g.arc(x, cy, r, 0, 6.283); g.fillStyle = 'rgba(22,13,52,.9)'; g.fill();
      g.strokeStyle = hot ? C.warn : C.vhi; g.lineWidth = 2; g.stroke();
      font(g, 700, label.length > 6 ? 22 : 26, DISP, 1); g.fillStyle = C.ink; g.textAlign = 'center'; g.fillText(label, x, cy + 9);
      font(g, 400, 21, SANS); g.fillStyle = C.soft; g.fillText(sub, x, cy + r + 44);
      g.restore();
    });
    g.textAlign = 'center';
    font(g, 600, 21, MONO, 3); g.globalAlpha = at(t, 3.4, .6); g.fillStyle = C.lav;
    g.fillText('ONE TRANSACTION · POSTED WITH ITS TX', 540, Math.min(960, cy + 230));
    g.globalAlpha = 1; g.textAlign = 'left';
  },

  xray(g, t, p) {
    kicker(g, p.kicker, t);
    const y0 = title(g, p.title, t, .45, { size: 72 }) + 30, h = 968 - y0, a = at(t, .8, .6);
    panel(g, X0, y0, X1 - X0, h, a);
    g.save(); g.globalAlpha = a;
    font(g, 500, 22, MONO, 1); g.fillStyle = C.ink; g.fillText('deployer 0x6c40…37af', X0 + 36, y0 + 54);
    chip(g, 'EXAMPLE DATA', X1 - 36, y0 + 46, C.muted, 'right');
    const cx = X0 + 190, cy = y0 + h / 2 + 24, r = 118, k = at(t, 1.4, 2), score = Math.round(74 * k);
    g.lineCap = 'round';
    g.beginPath(); g.arc(cx, cy, r, 0, 6.283); g.strokeStyle = 'rgba(220,207,255,.1)'; g.lineWidth = 18; g.stroke();
    g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + 6.283 * .74 * k); g.strokeStyle = score > 60 ? C.bad : C.warn; g.shadowColor = g.strokeStyle; g.shadowBlur = 18; g.stroke(); g.shadowBlur = 0;
    font(g, 700, 66, DISP); g.fillStyle = C.ink; g.textAlign = 'center'; g.fillText(score, cx, cy + 22);
    font(g, 500, 16, MONO, 3); g.fillStyle = C.muted; g.fillText('RISK SCORE', cx, cy + r + 52); g.textAlign = 'left';
    const bx = X0 + 400, bw = X1 - 40 - bx;
    font(g, 500, 17, MONO, 3); g.fillStyle = C.muted; g.fillText('FUNDED BY', bx, cy - 132);
    [['Fresh wallet', .38, true], ['Mixer-like hops', .24, true], ['Exchange withdrawal', .22, false], ['Older wallets', .16, false]].forEach(([label, share, flag], i) => {
      const y = cy - 96 + i * 68, kk = at(t, 1.8 + i * .3, .9);
      font(g, 500, 23, SANS); g.fillStyle = C.ink; g.fillText(label, bx, y);
      font(g, 600, 20, MONO); g.textAlign = 'right'; g.fillStyle = flag ? C.bad : C.soft; g.fillText(`${Math.round(share * 100 * kk)}%${flag ? ' ⚑' : ''}`, bx + bw, y); g.textAlign = 'left';
      rr(g, bx, y + 14, bw, 10, 5); g.fillStyle = 'rgba(220,207,255,.1)'; g.fill();
      rr(g, bx, y + 14, Math.max(10, bw * share / .4 * kk), 10, 5); g.fillStyle = flag ? C.bad : C.vhi; g.fill();
    });
    g.restore();
  },

  quote(g, t, p) {
    const glyphs = '▮▯░▒#%&$@01/\\<>';
    drawMark(g, 540, 250, 200, t, .1);
    const lines = p.title.split('\n');
    lines.forEach((line, li) => {
      const size = 74, y = 470 + li * 104;
      font(g, 700, size, DISP, 2);
      const total = g.measureText(line).width;
      let x = 540 - total / 2;
      for (let i = 0; i < line.length; i++) {
        const settle = 1 + li * .7 + i * .045, ch = line[i];
        const shown = t >= settle ? ch : t >= settle - .8 && ch !== ' ' ? glyphs[Math.floor(mulberry(i * 97 + li * 13 + Math.floor(t * 18))() * glyphs.length)] : '';
        if (shown) {
          g.save();
          g.fillStyle = t >= settle ? '#f4f0ff' : C.vhi; g.globalAlpha = t >= settle ? 1 : .6;
          if (t >= settle) { g.shadowColor = 'rgba(150,110,255,.6)'; g.shadowBlur = 22; }
          g.fillText(shown, x, y); g.restore();
        }
        x += g.measureText(ch).width + 2;
      }
    });
  },
};

function draw(g, post, t) {
  background(g, t, post.scene === 'mark' || post.scene === 'quote');
  SCENES[post.scene](g, t, post);
  frame(g, t, post.phase);
  // fade in from black, and a soft fade at the very end so the loop isn't a hard cut
  const fade = Math.max(1 - t / .5, clamp((t - (DUR - .35)) / .35) * .6);
  if (fade > 0) { g.fillStyle = `rgba(3,2,8,${fade})`; g.fillRect(0, 0, W, W); }
}

const canvas = document.getElementById('c');

window.ready = (async () => {
  await Promise.all(['700 40px Orbitron', '600 40px Orbitron', '400 20px Inter', '500 20px Inter', '600 20px Inter', '500 20px "JetBrains Mono"', '400 20px "JetBrains Mono"', '600 20px "JetBrains Mono"'].map(f => document.fonts.load(f)));
  return ['700 20px Orbitron', '400 20px Inter', '500 20px "JetBrains Mono"'].map(f => document.fonts.check(f));
})();

/** The photo: the post's settled last frame, at `size` px, as base64 PNG. */
window.photo = (post, size = 1600) => {
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  g.setTransform(size / W, 0, 0, size / W, 0, 0);
  draw(g, post, DUR - .4);
  return canvas.toDataURL('image/png').split(',')[1];
};

/** The video: DUR seconds at FPS as H.264 MP4; kept on window.__mp4, returns its size in bytes. */
window.video = async post => {
  canvas.width = canvas.height = W;
  const g = canvas.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  const muxer = new Mp4Muxer.Muxer({ target: new Mp4Muxer.ArrayBufferTarget(), video: { codec: 'avc', width: W, height: W, frameRate: FPS }, fastStart: 'in-memory' });
  let failed = null;
  const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: e => { failed = e; } });
  enc.configure({ codec: 'avc1.640028', width: W, height: W, bitrate: 7e6, framerate: FPS, avc: { format: 'avc' } });
  for (let i = 0; i < DUR * FPS; i++) {
    draw(g, post, i / FPS);
    const fr = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
    enc.encode(fr, { keyFrame: i % (FPS * 2) === 0 });
    fr.close();
    if (enc.encodeQueueSize > 8) await new Promise(r => enc.addEventListener('dequeue', r, { once: true }));
  }
  await enc.flush();
  if (failed) throw failed;
  muxer.finalize();
  window.__mp4 = new Uint8Array(muxer.target.buffer);
  return window.__mp4.length;
};

/** A base64 slice of the last video, so large files cross the DevTools socket in pieces. */
window.mp4Slice = (from, len) => {
  const part = window.__mp4.subarray(from, from + len);
  let s = '';
  for (let i = 0; i < part.length; i += 0x8000) s += String.fromCharCode(...part.subarray(i, i + 0x8000));
  return btoa(s);
};
