// The Noira mark: rows of noise that only become a crescent where the signal is.
// Shared by brand/logos.mjs, the app icons (agent/scripts/make-icons.mjs) and the inline site marks.

/**
 * Bars of the mark in the given box. Each bar is { x1, x2, y, noise } where `noise` bars sit left of the crescent.
 * `step` is the row pitch and `gap` the space between a noise bar and the crescent row it leads into.
 */
export function signalBars({ cx, cy, r, step, gap, noiseMin, noiseRange }) {
  const bx = cx + r * 0.42, by = cy - r * 0.36, br = r * 0.82;
  const bars = [];
  const rows = Math.floor((2 * r - step * 0.7) / step);
  const top = cy - (rows - 1) * step / 2;
  for (let i = 0; i < rows; i++) {
    const y = top + i * step;
    const half = Math.sqrt(Math.max(0, r * r - (y - cy) ** 2));
    const x1 = cx - half;
    let x2 = cx + half;
    const bh = Math.sqrt(Math.max(0, br * br - (y - by) ** 2));
    if (bh > 0) x2 = Math.min(x2, bx - bh);
    if (x2 - x1 < step * 0.3) continue;
    const noise = noiseMin + ((i * 53) % 70) / 70 * noiseRange;
    bars.push({ x1: x1 - noise, x2: x1 - gap, y, noise: true });
    bars.push({ x1, x2, y, noise: false });
  }
  return bars;
}

const f = n => +n.toFixed(2);

/** The mark as SVG lines; `main` and `dim` are the stroke colours of the crescent rows and the noise. */
export function signalLines(opts, { main = 'currentColor', dim = 'currentColor', dimOpacity = 0.4 } = {}) {
  return signalBars(opts).map(b => b.noise
    ? `<line x1="${f(b.x1)}" y1="${f(b.y)}" x2="${f(b.x2)}" y2="${f(b.y)}" stroke="${dim}" stroke-opacity="${dimOpacity}"/>`
    : `<line x1="${f(b.x1)}" y1="${f(b.y)}" x2="${f(b.x2)}" y2="${f(b.y)}" stroke="${main}"/>`).join('');
}

/** The full-detail mark (512 box): sixteen rows, for logos, avatars and headers. */
export const LARGE = { cx: 286, cy: 262, r: 160, step: 20, gap: 14, noiseMin: 36, noiseRange: 70, sw: 11 };
/** The small mark (32 box): eight thicker rows and fainter noise, so it still reads at 16–24px. */
export const SMALL = { cx: 19.5, cy: 16, r: 13, step: 2.9, gap: 1.9, noiseMin: 2, noiseRange: 3, sw: 1.9 };

/** Inline site mark in currentColor, e.g. for the nav. */
export const smallSvg = (attrs = '') =>
  `<svg viewBox="0 0 32 32"${attrs ? ` ${attrs}` : ''} aria-hidden="true"><g stroke-width="${SMALL.sw}" stroke-linecap="round">${signalLines(SMALL, { dimOpacity: 0.3 })}</g></svg>`;
