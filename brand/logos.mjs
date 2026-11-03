// Five Noira logo concepts as hand-built SVG. `node brand/logos.mjs` writes brand/logos/*.svg and brand/index.html;
// `node brand/render.mjs` then exports the X avatar and header PNGs.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LARGE, signalLines } from './signal.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const LAV = '#e4d8ff', VIO = '#8b5cff', DEEP = '#0b0618';

/** The crescent used across concepts: a disc at (cx,cy) radius r, bitten by a disc offset up-right. */
const crescent = (id, cx, cy, r, bite = 0.82, dx = 0.42, dy = -0.36) => `
  <mask id="${id}"><rect width="512" height="512" fill="#fff"/><circle cx="${cx + r * dx}" cy="${cy + r * dy}" r="${r * bite}" fill="#000"/></mask>`;

export const CONCEPTS = [
  {
    id: '01-crescent-orbit',
    name: 'Crescent Orbit',
    idea: 'The night-shift moon with a satellite on its orbit: an agent that keeps circling your work while you sleep. Closest to the current site mark.',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>${crescent('m1', 236, 268, 150)}
    <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="${LAV}"/></linearGradient>
  </defs>
  <g transform="rotate(-18 256 256)" fill="none" stroke="${VIO}" stroke-width="10" stroke-linecap="round">
    <path d="M46 256a210 66 0 0 1 420 0" opacity=".55"/>
  </g>
  <circle cx="236" cy="268" r="150" fill="url(#g1)" mask="url(#m1)"/>
  <g transform="rotate(-18 256 256)" fill="none" stroke="${VIO}" stroke-width="10" stroke-linecap="round">
    <path d="M466 256a210 66 0 0 1-420 0"/>
  </g>
  <circle cx="438" cy="196" r="20" fill="${LAV}"/>
</svg>`,
  },
  {
    id: '02-eclipse',
    name: 'Eclipse',
    idea: 'The hero planet in one shape: a dark world with a bright limb at the top. Reads as "noir" with light breaking through.',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="p2" cx=".42" cy=".3" r=".8"><stop offset="0" stop-color="#2a1866"/><stop offset=".55" stop-color="#140a36"/><stop offset="1" stop-color="${DEEP}"/></radialGradient>
    <linearGradient id="r2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="${LAV}"/><stop offset="1" stop-color="${VIO}" stop-opacity="0"/></linearGradient>
    <filter id="b2" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="14"/></filter>
  </defs>
  <circle cx="256" cy="276" r="168" fill="none" stroke="${VIO}" stroke-width="30" opacity=".55" filter="url(#b2)"/>
  <circle cx="256" cy="276" r="168" fill="url(#p2)"/>
  <circle cx="256" cy="276" r="164" fill="none" stroke="url(#r2)" stroke-width="10"/>
</svg>`,
  },
  {
    id: '03-amethyst-n',
    name: 'Amethyst N',
    idea: 'An N cut from the crystals that float around the site, each facet a different light. Strongest as a letter mark for small sizes.',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <g stroke="${DEEP}" stroke-width="5" stroke-linejoin="round">
    <polygon points="112,92 196,64 206,420 120,448" fill="#6c3ff0"/>
    <polygon points="196,64 206,420 160,436" fill="#4b24c4"/>
    <polygon points="196,64 316,312 300,440 206,236" fill="#b49bff"/>
    <polygon points="206,236 300,440 206,420" fill="#8b5cff"/>
    <polygon points="316,72 400,48 392,400 316,312" fill="#9e7cff"/>
    <polygon points="316,72 316,312 300,440 392,400 400,48" fill="none"/>
    <polygon points="392,400 300,440 316,312" fill="#5a2fd9"/>
    <polygon points="400,48 316,72 356,40" fill="${LAV}"/>
  </g>
  <polygon points="140,110 176,98 168,230" fill="#fff" opacity=".35"/>
</svg>`,
  },
  {
    id: '04-signal',
    name: 'Signal',
    idea: 'Lines of noise that only become a crescent where the signal is: Noira filtering every launch down to what is real.',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <g stroke-width="${LARGE.sw}" stroke-linecap="round">${signalLines(LARGE, { main: LAV, dim: VIO, dimOpacity: 0.35 })}</g>
</svg>`,
  },
  {
    id: '05-noir-monogram',
    name: 'Noir Monogram',
    idea: 'Two pillars joined by a crescent instead of a straight stroke: an N that is also a moon. Calm, premium, works as a stamp or app icon.',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g5" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="${LAV}"/></linearGradient>
    <linearGradient id="c5" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b49bff"/><stop offset="1" stop-color="${VIO}"/></linearGradient>
  </defs>
  <rect x="112" y="92" width="58" height="328" rx="29" fill="url(#g5)"/>
  <rect x="342" y="92" width="58" height="328" rx="29" fill="url(#g5)"/>
  <!-- the diagonal of the N is a crescent from the top of the left pillar to the foot of the right one -->
  <path d="M141 104 A222 222 0 0 0 371 408 A330 330 0 0 1 141 104 Z" fill="url(#c5)"/>
</svg>`,
  },
];

/** The mark on the Noira tile, sized for an X avatar (X crops it to a circle). */
export const avatarHtml = c => `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:400px;height:400px;background:${DEEP};}
.t{width:400px;height:400px;display:grid;place-items:center;background:radial-gradient(circle at 50% 35%,#2b1670 0%,#130a35 55%,${DEEP} 100%);}
.t svg{width:250px;height:250px;filter:drop-shadow(0 0 22px rgba(160,120,255,.55));}
</style></head><body><div class="t">${c.svg}</div></body></html>`;

/** An X header (1500x500): planet limb along the bottom, mark and wordmark on the left. */
export const headerHtml = c => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;600&family=Inter:wght@500&display=swap" rel="stylesheet">
<style>
html,body{margin:0;width:1500px;height:500px;overflow:hidden;background:${DEEP};font-family:Inter,sans-serif;}
.h{position:relative;width:1500px;height:500px;background:radial-gradient(900px 420px at 78% 10%,rgba(123,77,255,.35),transparent 60%),${DEEP};}
.planet{position:absolute;left:50%;top:330px;width:1900px;height:1900px;margin-left:-950px;border-radius:50%;background:radial-gradient(circle at 50% 8%,#2a1866,#0e0726 40%,${DEEP} 70%);box-shadow:0 -3px 0 rgba(235,225,255,.9),0 -40px 120px rgba(150,110,255,.55);}
.row{position:absolute;left:300px;top:118px;display:flex;align-items:center;gap:40px;}
.row svg{width:190px;height:190px;filter:drop-shadow(0 0 26px rgba(160,120,255,.6));}
.wm{font:600 112px/1 Orbitron,sans-serif;letter-spacing:.18em;color:#fbf9ff;text-shadow:0 0 30px rgba(200,180,255,.55);}
.tag{margin-top:18px;font-size:30px;letter-spacing:.04em;color:#cbc1e8;}
.tick{position:absolute;right:56px;bottom:40px;font:600 26px Orbitron,sans-serif;letter-spacing:.12em;color:#a582ff;}
</style></head><body><div class="h"><div class="planet"></div>
<div class="row">${c.svg}<div><div class="wm">NOIRA</div><div class="tag">A self-hosted AI agent that works the night shift</div></div></div>
<div class="tick">$NOIRA</div></div></body></html>`;

/** The chosen mark (concept 04), exported as brand/logos/noira-*. */
export const FINAL = { ...CONCEPTS.find(c => c.id === '04-signal'), id: 'noira', name: 'Noira' };

/**
 * A night-sky backdrop so the mark never sits on a flat tile: violet glow, stars, orbit rings around the mark,
 * faint scanlines that echo its bars, a planet limb along the bottom, vignette and grain. (mx,my) is the mark centre.
 */
function backdrop(w, h, { mx, my, rings, limb, stars }) {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const dots = Array.from({ length: stars }, () => {
    const x = rnd() * w, y = rnd() * (limb.cy - limb.r + 20), r = 0.4 + rnd() ** 3 * 1.4, o = 0.2 + rnd() * 0.6;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="#efe8ff" opacity="${o.toFixed(2)}"/>`;
  }).join('');
  const ringEls = rings.map((r, i) => `<circle cx="${mx}" cy="${my}" r="${r}" fill="none" stroke="#b9a2ff" stroke-opacity="${(0.13 - i * 0.03).toFixed(2)}" stroke-width="1"${i === 1 ? ' stroke-dasharray="2 7"' : ''}/>`).join('');
  const sat = rings[1] ?? rings[0];
  return `<svg class="bg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
  <defs>
    <radialGradient id="bgBase" cx="${mx / w}" cy="${my / h}" r="${Math.max(w, h) / Math.min(w, h) * 0.75}">
      <stop offset="0" stop-color="#2f1a7a"/><stop offset=".45" stop-color="#160b3d"/><stop offset="1" stop-color="#06030e"/>
    </radialGradient>
    <radialGradient id="bgGlow"><stop offset="0" stop-color="#8b5cff" stop-opacity=".55"/><stop offset="1" stop-color="#8b5cff" stop-opacity="0"/></radialGradient>
    <radialGradient id="bgPlanet" cx=".5" cy="0" r=".7"><stop offset="0" stop-color="#2a1866"/><stop offset=".35" stop-color="#110830"/><stop offset="1" stop-color="#05020c"/></radialGradient>
    <radialGradient id="bgVig" cx=".5" cy=".45" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".6"/></radialGradient>
    <pattern id="bgScan" width="${w}" height="6" patternUnits="userSpaceOnUse"><rect width="${w}" height="1.4" fill="#c9b6ff" opacity=".045"/></pattern>
    <filter id="bgLimb" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="${(h / 40).toFixed(1)}"/></filter>
    <filter id="bgGrain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0"/></filter>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bgBase)"/>
  <rect width="${w}" height="${h}" fill="url(#bgScan)"/>
  ${dots}
  <circle cx="${mx}" cy="${my}" r="${rings[0] * 1.15}" fill="url(#bgGlow)"/>
  ${ringEls}
  <circle cx="${(mx + sat * Math.cos(-0.6)).toFixed(1)}" cy="${(my + sat * Math.sin(-0.6)).toFixed(1)}" r="${(h / 130).toFixed(1)}" fill="#e4d8ff"/>
  <circle cx="${limb.cx}" cy="${limb.cy}" r="${limb.r}" fill="none" stroke="#9d78ff" stroke-width="${(h / 25).toFixed(1)}" opacity=".7" filter="url(#bgLimb)"/>
  <circle cx="${limb.cx}" cy="${limb.cy}" r="${limb.r}" fill="url(#bgPlanet)"/>
  <circle cx="${limb.cx}" cy="${limb.cy}" r="${limb.r}" fill="none" stroke="#efe6ff" stroke-width="${(h / 220).toFixed(1)}" opacity=".85"/>
  <rect width="${w}" height="${h}" fill="url(#bgVig)"/>
  <rect width="${w}" height="${h}" filter="url(#bgGrain)" opacity=".09"/>
</svg>`;
}

/** The final mark on the night-sky tile, for the X avatar (X crops it to a circle). */
export const finalAvatarHtml = c => `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:400px;height:400px;background:${DEEP};}
.t{position:relative;width:400px;height:400px;overflow:hidden;}
.bg{position:absolute;inset:0;width:100%;height:100%;}
.t>svg:not(.bg){position:absolute;left:84px;top:52px;width:260px;height:260px;filter:drop-shadow(0 0 18px rgba(170,130,255,.65));}
</style></head><body><div class="t">${backdrop(400, 400, { mx: 200, my: 185, rings: [118, 150, 186], limb: { cx: 200, cy: 1010, r: 660 }, stars: 70 })}${c.svg}</div></body></html>`;

/** The final X header (1500x500): the same sky, mark and wordmark on the left, planet limb along the bottom. */
export const finalHeaderHtml = c => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;600&family=Inter:wght@500&display=swap" rel="stylesheet">
<style>
html,body{margin:0;width:1500px;height:500px;overflow:hidden;background:${DEEP};font-family:Inter,sans-serif;}
.h{position:relative;width:1500px;height:500px;overflow:hidden;}
.bg{position:absolute;inset:0;width:100%;height:100%;}
.row{position:absolute;left:290px;top:96px;display:flex;align-items:center;gap:36px;}
.row svg{width:210px;height:210px;filter:drop-shadow(0 0 22px rgba(170,130,255,.65));}
.wm{font:600 112px/1 Orbitron,sans-serif;letter-spacing:.18em;color:#fbf9ff;text-shadow:0 0 30px rgba(200,180,255,.55);}
.tag{margin-top:18px;font-size:30px;letter-spacing:.04em;color:#cbc1e8;}
.tick{position:absolute;right:56px;top:40px;font:600 26px Orbitron,sans-serif;letter-spacing:.12em;color:#b597ff;}
</style></head><body><div class="h">${backdrop(1500, 500, { mx: 395, my: 200, rings: [128, 168, 214], limb: { cx: 750, cy: 2330, r: 1900 }, stars: 160 })}
<div class="row">${c.svg}<div><div class="wm">NOIRA</div><div class="tag">A self-hosted AI agent that works the night shift</div></div></div>
<div class="tick">$NOIRA</div></div></body></html>`;

function board() {
  const card = c => `<article class="card">
    <div class="stage">${c.svg}</div>
    <div class="body">
      <h2>${c.name}</h2>
      <p>${c.idea}</p>
      <div class="uses">
        <div class="avatar"><img src="logos/${c.id}-avatar.png" alt="${c.name} as an X profile picture"></div>
        <div class="sizes"><span class="fav">${c.svg}</span><span class="fav s">${c.svg}</span><span class="on-light">${c.svg}</span></div>
        <div class="lockup">${c.svg}<b>NOIRA</b></div>
      </div>
      <img class="header" src="logos/${c.id}-header.png" alt="${c.name} X header">
      <p class="files">logos/${c.id}.svg · ${c.id}-avatar.png (400×400) · ${c.id}-header.png (1500×500)</p>
    </div>
  </article>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Noira logo concepts</title>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#07040f;--ink:#f3efff;--mut:#9488b8;--line:rgba(190,165,255,.16);}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 Inter,system-ui,sans-serif;}
main{max-width:1180px;margin:0 auto;padding:48px 20px 80px;display:grid;gap:28px}
h1{margin:0;font:600 34px Orbitron,sans-serif;letter-spacing:.06em}.lede{margin:0;color:#cbc1e8;max-width:720px}
.card{display:grid;grid-template-columns:320px 1fr;gap:28px;padding:26px;border-radius:24px;background:rgba(20,13,42,.7);box-shadow:inset 0 0 0 1px var(--line)}
.stage{aspect-ratio:1;border-radius:20px;display:grid;place-items:center;background:radial-gradient(circle at 50% 35%,#2b1670,#130a35 55%,#0b0618)}
.stage svg{width:72%;height:72%}
h2{margin:0 0 6px;font-size:24px}.body p{margin:0;color:#cbc1e8}
.uses{display:flex;flex-wrap:wrap;align-items:center;gap:22px;margin:20px 0}
.avatar img{width:96px;height:96px;border-radius:50%;display:block;box-shadow:0 0 0 3px #000,0 0 0 4px var(--line)}
.sizes{display:flex;align-items:center;gap:14px}.fav svg{width:32px;height:32px}.fav.s svg{width:16px;height:16px}
.on-light{display:grid;place-items:center;width:56px;height:56px;border-radius:14px;background:#f4f0ff}.on-light svg{width:40px;height:40px;filter:invert(.92) hue-rotate(180deg)}
.lockup{display:flex;align-items:center;gap:12px;padding:10px 18px;border-radius:999px;background:rgba(255,255,255,.04)}.lockup svg{width:34px;height:34px}.lockup b{font:600 22px Orbitron,sans-serif;letter-spacing:.14em}
.header{width:100%;border-radius:14px;display:block}.files{margin-top:10px!important;font-size:13px;color:var(--mut)!important}
.final{display:grid;grid-template-columns:200px 1fr;gap:20px;align-items:center}.final img{display:block;width:100%;border-radius:16px}.final .fa{border-radius:50%}
@media(max-width:820px){.card,.final{grid-template-columns:1fr}.final .fa{width:160px}}
</style></head><body><main>
<h1>Noira · logo concepts</h1>
<p class="lede">Five directions for the site and the X account. Each shows the mark, an X profile picture (cropped to a circle), favicon sizes, a light-background check, the header lockup and an X header banner.</p>
${CONCEPTS.map(card).join('\n')}
</main></body></html>`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  mkdirSync(path.join(here, 'logos'), { recursive: true });
  for (const c of CONCEPTS) writeFileSync(path.join(here, 'logos', `${c.id}.svg`), `${c.svg}\n`);
  writeFileSync(path.join(here, 'logos', 'noira-logo.svg'), `${FINAL.svg}\n`);
  writeFileSync(path.join(here, 'index.html'), board());
  console.log(`wrote ${CONCEPTS.length + 1} SVGs and brand/index.html`);
}
