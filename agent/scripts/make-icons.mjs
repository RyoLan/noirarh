// Draws the Noira app icon (a lavender crescent on a deep violet tile) as PNGs, with no image libraries.
// node agent/scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

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

/** Samples the design in unit space (0..1); `full` fills the square for maskable/adaptive icons. */
function icon(size, full) {
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
      // crescent: inside the big disc, outside the offset one
      const inA = Math.hypot(x - 0.47, y - 0.52) < 0.27;
      const inB = Math.hypot(x - 0.58, y - 0.43) < 0.23;
      if (inA && !inB) { cr = 228; cg = 216; cb = 255; }
      else {
        const halo = Math.max(0, 1 - Math.abs(Math.hypot(x - 0.47, y - 0.52) - 0.27) / 0.06) * (inB ? 0 : 0.35);
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
