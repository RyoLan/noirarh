// The Noira mark: rows of noise that only become a crescent where the signal is.
// Shared by brand/logos.mjs, the app icons (agent/scripts/make-icons.mjs) and the inline site marks
// (brand/sync-marks.mjs writes them into the HTML).

/**
 * Bars of the mark, centred in a `size` box. Each bar is { x1, x2, y, noise } where `noise` bars sit left of the
 * crescent. `step` is the row pitch and `gap` the space between a noise bar and the crescent row it leads into.
 *
 * The crescent is a disc of radius `r` minus a larger "bite" disc up and to the right. The bite's top and bottom both
 * fall outside the disc, so every row is one unbroken bar and both horns taper to a point instead of being cut off.
 */
export function signalBars({ size, r, step, gap, noiseMin, noiseRange }) {
  const bx = r * 0.6, by = -r * 0.22, br = r * 1.05;
  const bars = [];
  const rows = Math.floor(2 * r / step);
  const top = -(rows - 1) * step / 2;
  for (let i = 0; i < rows; i++) {
    const y = top + i * step;
    const half = Math.sqrt(Math.max(0, r * r - y * y));
    const x1 = -half;
    let x2 = half;
    const bh = Math.sqrt(Math.max(0, br * br - (y - by) ** 2));
    if (bh > 0) x2 = Math.min(x2, bx - bh);
    if (x2 - x1 < step * 0.3) continue;
    const noise = noiseMin + ((i * 53) % 70) / 70 * noiseRange;
    bars.push({ x1: x1 - noise, x2: x1 - gap, y, noise: true });
    bars.push({ x1, x2, y, noise: false });
  }
  // centre the drawn extent in the box (the round caps add the same margin on every side)
  const dx = size / 2 - (Math.min(...bars.map(b => b.x1)) + Math.max(...bars.map(b => b.x2))) / 2;
  const dy = size / 2 - (Math.min(...bars.map(b => b.y)) + Math.max(...bars.map(b => b.y))) / 2;
  return bars.map(b => ({ x1: b.x1 + dx, x2: b.x2 + dx, y: b.y + dy, noise: b.noise }));
}

const f = n => +n.toFixed(2);

/** The mark as SVG lines; `main` and `dim` are the stroke colours of the crescent rows and the noise. */
export function signalLines(opts, { main = 'currentColor', dim = 'currentColor', dimOpacity = 0.4 } = {}) {
  return signalBars(opts).map(b => b.noise
    ? `<line x1="${f(b.x1)}" y1="${f(b.y)}" x2="${f(b.x2)}" y2="${f(b.y)}" stroke="${dim}" stroke-opacity="${dimOpacity}"/>`
    : `<line x1="${f(b.x1)}" y1="${f(b.y)}" x2="${f(b.x2)}" y2="${f(b.y)}" stroke="${main}"/>`).join('');
}

/** The full-detail mark (512 box): sixteen rows, for logos, avatars and headers. */
export const LARGE = { size: 512, r: 160, step: 20, gap: 14, noiseMin: 36, noiseRange: 70, sw: 11 };
/** The small mark (32 box): nine thicker rows and fainter noise, so it still reads at 16–24px. */
export const SMALL = { size: 32, r: 12, step: 2.6, gap: 1.9, noiseMin: 2, noiseRange: 3, sw: 1.7 };

/** Inline site mark in currentColor, e.g. for the nav. */
export const smallSvg = (attrs = '') =>
  `<svg viewBox="0 0 32 32"${attrs ? ` ${attrs}` : ''} aria-hidden="true"><g stroke-width="${SMALL.sw}" stroke-linecap="round">${signalLines(SMALL, { dimOpacity: 0.3 })}</g></svg>`;
