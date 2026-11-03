// Draws the Noira app icon (the signal mark: lavender bars that form a crescent, on a deep violet tile) as PNGs,
// with no image libraries.
// node agent/scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { LARGE, SMALL, signalBars } from '../../brand/signal.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = buf => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** The mark's bars in unit space, centred and scaled so its widest extent is `span` of the icon. */
function markBars(preset, span) {
  const bars = signalBars(preset), h = preset.sw / 2;
  const x0 = Math.min(...bars.map(b => b.x1)) - h, x1 = Math.max(...bars.map(b => b.x2)) + h;
  const y0 = Math.min(...bars.map(b => b.y)) - h, y1 = Math.max(...bars.map(b => b.y)) + h;
  const k = span / Math.max(x1 - x0, y1 - y0), ox = 0.5 - (x0 + x1) / 2 * k, oy = 0.5 - (y0 + y1) / 2 * k;
  return { half: h * k, bars: bars.map(b => ({ x1: b.x1 * k + ox, x2: b.x2 * k + ox, y: b.y * k + oy, noise: b.noise })) };
}

/** Samples the design in unit space (0..1); `full` fills the square for maskable/adaptive icons. */
function icon(size, full) {
  // small icons get the thick 8-row mark; maskable ones keep it inside the safe zone
  const { half, bars } = markBars(size < 128 ? SMALL : LARGE, full ? 0.54 : 0.62);
  const S = 4; // supersampling
  const lerp = (a, b, t) => a + (b - a) * t;
  return png(size, (px, py) => {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const x = (px + (sx + 0.5) / S) / size, y = (py + (sy + 0.5) / S) / size;
      // rounded tile
      const m = full ? 0 : 0.06, rad = full ? 0 : 0.22;
      const qx = Math.max(Math.abs(x - 0.5) - (0.5 - m - rad), 0), qy = Math.max(Math.abs(y - 0.5) - (0.5 - m - rad), 0);
      if (Math.hypot(qx, qy) > rad) continue;
      // tile: deep violet with a glow at the top
      const glow = Math.max(0, 1 - Math.hypot(x - 0.62, y - 0.18) / 0.75);
      let cr = lerp(14, 70, glow), cg = lerp(8, 34, glow), cb = lerp(34, 160, glow);
      // bars: lavender crescent rows with a soft halo, dimmer violet noise to their left
      let main = Infinity, noise = Infinity;
      for (const bar of bars) {
        const dy = y - bar.y;
        if (Math.abs(dy) > half + 0.05) continue;
        const d = Math.hypot(Math.max(bar.x1 - x, 0, x - bar.x2), dy) - half;
        if (bar.noise) noise = Math.min(noise, d); else main = Math.min(main, d);
      }
      if (main < 0) { cr = 228; cg = 216; cb = 255; }
      else if (noise < 0) { cr = lerp(cr, 139, 0.6); cg = lerp(cg, 92, 0.6); cb = lerp(cb, 255, 0.6); }
      else {
        const halo = Math.max(0, 1 - main / 0.05) * 0.3;
        cr = lerp(cr, 180, halo); cg = lerp(cg, 150, halo); cb = lerp(cb, 255, halo);
      }
      r += cr; g += cg; b += cb; a += 255;
    }
    const n = S * S;
    return a ? [Math.round(r / (a / 255)), Math.round(g / (a / 255)), Math.round(b / (a / 255)), Math.round(a / n)] : [0, 0, 0, 0];
  });
}

const out = [
  ['agent/panel/public/icon-192.png', 192, false],
  ['agent/panel/public/icon-512.png', 512, false],
  ['agent/panel/public/icon-maskable-512.png', 512, true],
  ['desktop/build/icon.png', 1024, false],
  ['desktop/build/tray.png', 32, false],
  ['mobile/assets/icon-only.png', 1024, true],
  ['mobile/assets/icon-foreground.png', 1024, true],
  ['mobile/assets/icon-background.png', 1024, true],
];
for (const [file, size, full] of out) {
  const abs = path.join(root, file);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, icon(size, full));
  console.log(`${file} ${size}px`);
}
