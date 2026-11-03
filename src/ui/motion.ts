import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import Lenis from 'lenis';
import type { FrameState, NoiraScene } from '../scene/Scene';
import { $, $$, reduceMotion } from './dom';
import type { Ticker } from './ticker';

gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin);

const mobile = matchMedia('(max-width: 760px)').matches;
const fineHover = matchMedia('(hover: hover) and (pointer: fine)').matches;

/**
 * The swirl around the hero screen. `outer` is how far the hero has pulled back,
 * `dim` how much the sections below quiet it; each has its own scroll tween so
 * they never fight over one value.
 */
const frame = { outer: 0.55, dim: 1, radius: 30, edge: 0.32 };

export function smoothScroll(ticker: Ticker): Lenis | null {
  if (reduceMotion) return null;
  const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.95 });
  lenis.on('scroll', (e: Lenis) => { ScrollTrigger.update(); ticker.nudge(e.velocity); });
  gsap.ticker.add(t => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  $$<HTMLAnchorElement>('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const id = a.getAttribute('href')!;
    const target = id === '#top' ? 0 : document.querySelector<HTMLElement>(id);
    if (target === null) return;
    e.preventDefault();
    lenis.scrollTo(target, { offset: id === '#top' ? 0 : -24, duration: 1.6 });
  }));
  return lenis;
}

/** Drives the 3D scene from GSAP's ticker so it shares a clock with every tween. */
export function driveScene(scene: NoiraScene) {
  const heroFrame = $('#heroFrame');
  gsap.ticker.add(() => {
    const r = heroFrame.getBoundingClientRect();
    const state: FrameState = { rect: { x: r.left, y: r.top, w: r.width, h: r.height }, radius: frame.radius, outer: frame.outer * frame.dim, inner: 0, edge: frame.edge * frame.dim };
    scene.setFrame(state);
    scene.render();
  });
}

/** Counts up while the scene and fonts get ready, then lifts away. */
export function preloader(ready: Promise<unknown>): Promise<void> {
  const loader = $('#loader');
  if (reduceMotion) { loader.remove(); return Promise.resolve(); }
  const lines = ['Calibrating the field', 'Growing crystals', 'Lighting the planet', 'Entering the dark'];
  const p = { v: 0 };
  let line = 0;
  const num = $('#loaderNum'), bar = $('#loaderBar'), text = $('#loaderLine');
  const fill = (to: number, duration: number) => gsap.to(p, {
    v: to, duration, ease: 'power2.inOut',
    onUpdate: () => {
      num.textContent = String(Math.round(p.v)).padStart(2, '0');
      gsap.set(bar, { scaleX: p.v / 100 });
      const l = Math.min(lines.length - 1, Math.floor(p.v / 26));
      if (l !== line) { line = l; gsap.to(text, { duration: 0.5, scrambleText: { text: lines[l]!, chars: 'lowerCase', speed: 0.5 } }); }
    },
  });
  const first = fill(82, 1.4);
  return Promise.all([ready, first]).then(() => new Promise<void>(done => {
    fill(100, 0.5).then(() => {
      gsap.timeline({ onComplete: () => { loader.remove(); } })
        .to('.loader > *', { y: -20, opacity: 0, duration: 0.45, stagger: 0.05, ease: 'power2.in' })
        .add(done)
        .to(loader, { clipPath: 'inset(0 0 100% 0)', duration: 1.1, ease: 'expo.inOut' }, '-=0.1');
    });
  }));
}

/** Opening sequence of the hero. */
export function heroIntro(scene: NoiraScene) {
  const chars = new SplitText('#wordmark', { type: 'chars', charsClass: 'ch' }).chars as HTMLElement[];
  wordmarkHover(chars);
  if (reduceMotion) return;

  const lede = new SplitText('#lede', { type: 'lines', mask: 'lines', linesClass: 'split-line-inner' });
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
  tl.add(scene.introTimeline(), 0)
    .from('.nav > *', { y: -24, opacity: 0, duration: 1.1, stagger: 0.08 }, 0.2)
    .from('.hero-chip', { y: 16, opacity: 0, duration: 1 }, 0.5)
    .to('.chip-text', { duration: 1.2, scrambleText: { text: 'Precision. Speed. Intelligence.', chars: 'NOIRA·01', speed: 0.4 } }, 0.55)
    .from(chars, { yPercent: 115, rotateX: -85, opacity: 0, filter: 'blur(18px)', duration: 1.6, stagger: { each: 0.07, from: 'center' } }, 0.45)
    .from('#tagline', { opacity: 0, duration: 0.3 }, 1.0)
    .to('#tagline', { duration: 1.3, scrambleText: { text: 'Stop guessing — start scanning', chars: 'upperCase', speed: 0.45, revealDelay: 0.2 } }, 1.0)
    .from(lede.lines, { yPercent: 110, duration: 1.2, stagger: 0.08 }, 1.15)
    .from('.install', { y: 20, opacity: 0, scale: 0.96, duration: 1 }, 1.3)
    .from('.hero .cta-row > *', { y: 22, opacity: 0, duration: 1, stagger: 0.08 }, 1.4)
    .from('.hud, .scroll-cue', { opacity: 0, y: 10, duration: 1, stagger: 0.1 }, 1.6);
}

function wordmarkHover(chars: HTMLElement[]) {
  if (reduceMotion || !fineHover) return;
  const hero = $('.hero');
  const ys = chars.map(c => gsap.quickTo(c, 'y', { duration: 0.6, ease: 'power3.out' }));
  hero.addEventListener('pointermove', e => {
    chars.forEach((ch, i) => {
      const r = ch.getBoundingClientRect();
      const p = Math.max(0, 1 - Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) / 260);
      ch.style.setProperty('--p', p.toFixed(3));
      ys[i]!(-p * 14);
    });
  });
  hero.addEventListener('pointerleave', () => chars.forEach((ch, i) => { ch.style.setProperty('--p', '0'); ys[i]!(0); }));
}

/** The hero screen pulls back to a framed card, as in the reference shot, then the page takes over. */
export function heroScroll() {
  if (reduceMotion) { frame.dim = 0.3; return; }
  const tl = gsap.timeline({
    scrollTrigger: { trigger: '.hero', start: 'top top', end: mobile ? '+=45%' : '+=75%', scrub: 1, pin: true, anticipatePin: 1 },
  });
  tl.to('#heroFrame', { scale: mobile ? 0.9 : 0.8, borderRadius: 40, ease: 'none' }, 0)
    .to(frame, { outer: 1, radius: 40, edge: 0.55, ease: 'none' }, 0)
    .to('.hero-copy', { y: -30, ease: 'none' }, 0)
    .to('.scroll-cue', { opacity: 0, ease: 'none', duration: 0.3 }, 0);

  // once the screen has gone, dim the swirl so the sections read cleanly
  gsap.fromTo(frame, { dim: 1 }, {
    dim: 0.12, ease: 'none',
    scrollTrigger: { trigger: '#download', start: 'top bottom', end: 'top 30%', scrub: true },
  });
  // and let it bloom again behind the closing call to action
  gsap.fromTo(frame, { dim: 0.12 }, {
    dim: 0.32, ease: 'none', immediateRender: false,
    scrollTrigger: { trigger: '#open', start: 'top bottom', end: 'center center', scrub: true },
  });
}

/** Headings, labels and panels arrive as their section enters. */
export function sectionReveals() {
  if (reduceMotion) return;
  $$('[data-split]').forEach(h => {
    const s = new SplitText(h, { type: 'lines', mask: 'lines', linesClass: 'split-line-inner' });
    gsap.from(s.lines, { yPercent: 115, duration: 1.25, ease: 'expo.out', stagger: 0.09, scrollTrigger: { trigger: h, start: 'top 86%', once: true } });
  });
  $$('[data-scramble]').forEach(k => {
    const text = k.textContent ?? '';
    gsap.set(k, { opacity: 0 });
    ScrollTrigger.create({
      trigger: k, start: 'top 90%', once: true,
      onEnter: () => gsap.to(k, { opacity: 1, duration: 1.1, scrambleText: { text, chars: 'NOIRA01·', speed: 0.5 } }),
    });
  });
  gsap.set('[data-rise]', { y: 46, opacity: 0 });
  ScrollTrigger.batch('[data-rise]', {
    start: 'top 90%', once: true,
    onEnter: els => gsap.to(els, { y: 0, opacity: 1, duration: 1.1, ease: 'power3.out', stagger: 0.09, overwrite: true }),
  });
  gsap.from('#scanChecks li', { x: -18, opacity: 0, duration: 0.7, ease: 'power3.out', stagger: 0.05, scrollTrigger: { trigger: '.scan', start: 'top 80%', once: true } });
  gsap.from('.det-item', { x: -24, opacity: 0, duration: 0.8, ease: 'power3.out', stagger: 0.06, scrollTrigger: { trigger: '.det', start: 'top 80%', once: true } });

  const access = { v: 0 };
  gsap.to(access, {
    v: 0.1, duration: 1.6, ease: 'power3.out',
    scrollTrigger: { trigger: '.tk-access', start: 'top 85%', once: true },
    onUpdate: () => { $('#accessNum').textContent = access.v.toFixed(1); },
  });

  // closing line: letters settle as you scroll into it
  const fin = new SplitText('#finalH', { type: 'chars,words', charsClass: 'ch' });
  gsap.from(fin.chars, {
    yPercent: 80, opacity: 0.08, rotate: 10, filter: 'blur(10px)', ease: 'power2.out', stagger: 0.02,
    scrollTrigger: { trigger: '#finalH', start: 'top 92%', end: 'center 55%', scrub: 1 },
  });
  const mark = new SplitText('.foot-mark', { type: 'chars' });
  gsap.from(mark.chars, { yPercent: 100, opacity: 0, duration: 1.2, ease: 'expo.out', stagger: 0.05, scrollTrigger: { trigger: '.foot-mark', start: 'top 95%', once: true } });

  // the nav tucks away while reading down and returns on the way up
  const nav = $('#nav');
  ScrollTrigger.create({
    start: () => innerHeight * 1.2, end: 'max',
    onUpdate: s => gsap.to(nav, { yPercent: s.direction === 1 ? -140 : 0, duration: 0.45, ease: 'power3.out', overwrite: true }),
    onLeaveBack: () => gsap.to(nav, { yPercent: 0, duration: 0.3, overwrite: true }),
  });
}

/** Buttons that lean towards the pointer and cards that tilt under it. */
export function pointerToys() {
  if (reduceMotion || !fineHover) return;
  $$('.magnetic').forEach(el => {
    const x = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3.out' });
    const y = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3.out' });
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      x((e.clientX - (r.left + r.width / 2)) * 0.28);
      y((e.clientY - (r.top + r.height / 2)) * 0.38);
    });
    el.addEventListener('pointerleave', () => {
      gsap.to(el, { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1, 0.35)', overwrite: true });
    });
  });
  $$('.tilt').forEach(el => {
    const rx = gsap.quickTo(el, 'rotationX', { duration: 0.6, ease: 'power3.out' });
    const ry = gsap.quickTo(el, 'rotationY', { duration: 0.6, ease: 'power3.out' });
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      rx(-((e.clientY - r.top) / r.height - 0.5) * 10);
      ry(((e.clientX - r.left) / r.width - 0.5) * 12);
    });
    el.addEventListener('pointerleave', () => { rx(0); ry(0); });
  });
  $$('.panel, .btn').forEach(el => el.addEventListener('pointermove', e => {
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  }));
}

/** A soft cursor that reacts to links, text fields and the crystals. */
export function cursor() {
  if (!fineHover || reduceMotion) return;
  const root = $('.cursor');
  const dot = $('.cursor-dot'), ring = $('.cursor-ring');
  const dx = gsap.quickTo(dot, 'x', { duration: 0.12 }), dy = gsap.quickTo(dot, 'y', { duration: 0.12 });
  const rx = gsap.quickTo(ring, 'x', { duration: 0.45, ease: 'power3.out' }), ry = gsap.quickTo(ring, 'y', { duration: 0.45, ease: 'power3.out' });
  addEventListener('pointermove', e => {
    document.documentElement.classList.add('has-cursor');
    dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY);
    const t = e.target as Element;
    root.classList.toggle('is-text', !!t.closest?.('input, textarea'));
    root.classList.toggle('is-link', !!t.closest?.('a, button, [role="tab"]') && !t.closest?.('input'));
    root.classList.toggle('is-crystal', document.body.classList.contains('over-crystal'));
  }, { passive: true });
  document.addEventListener('pointerleave', () => document.documentElement.classList.remove('has-cursor'));
}
