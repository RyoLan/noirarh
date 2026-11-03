import './styles.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { getStatus } from './lib/api';
import { NoiraScene } from './scene/Scene';
import { Ask } from './ui/ask';
import { Detectors } from './ui/detectors';
import { setupDownloads } from './ui/download';
import { $, $$ } from './ui/dom';
import { cursor, driveScene, heroIntro, heroScroll, pointerToys, preloader, sectionReveals, smoothScroll } from './ui/motion';
import { Scanner } from './ui/scanner';
import { Ticker } from './ui/ticker';
import { Vibe } from './ui/vibe';

// Fill these in at launch: the copy button and the buy link switch on by themselves.
const CONTRACT_ADDRESS = '';
const BUY_URL = '';

// the intro and the pinned hero assume the page starts at the top
history.scrollRestoration = 'manual';
if (!location.hash) scrollTo(0, 0);

/* ---------------------------------------------------------------- scene */
const scene = new NoiraScene($<HTMLCanvasElement>('#scene'));
if (import.meta.env.DEV) Object.assign(window, { __scene: scene });
if (scene.ok) {
  driveScene(scene);
  ScrollTrigger.addEventListener('refresh', () => scene.layout());
} else {
  document.documentElement.classList.add('no-webgl');
}

/* ------------------------------------------------------------ live parts */
const ticker = new Ticker();
smoothScroll(ticker);
const scanner = new Scanner();
const detectors = new Detectors(scanner);
const ask = new Ask();
const vibe = new Vibe();

scanner.on('launch', l => ticker.push(l));
scanner.on('signal', () => scene.ok && scene.pulse());
if (scene.ok) scene.onCrystal(n => { $('#hudCrystals').textContent = String(n); });

$('#scanAsk').addEventListener('click', () => {
  const l = scanner.current();
  if (!l) return;
  detectors.set('ask');
  document.getElementById('detectors')!.scrollIntoView({ behavior: 'smooth', block: 'start' });
  void ask.ask(l.verdict === 'signal'
    ? `Tell me about ${l.ticker}. It passed all seven checks; what should I still watch?`
    : `Why did ${l.ticker} collapse to noise? Inspect its deployer too.`);
});

void getStatus().then(s => {
  const pill = $('#agentPill');
  if (!s) { pill.classList.add('offline'); pill.querySelector('span')!.textContent = 'Agent offline'; return; }
  if (!s.credentials) {
    pill.classList.add('offline');
    pill.querySelector('span')!.textContent = 'Agent: add API key';
    pill.title = 'Set ANTHROPIC_API_KEY in .env on the server and restart it';
    vibe.setQuota(s.buildsLeft);
    return;
  }
  pill.classList.add('online');
  pill.querySelector('span')!.textContent = 'Agent ready';
  pill.title = `Ask Noira and the builder run on ${s.model}`;
  vibe.setQuota(s.buildsLeft);
});

/* ------------------------------------------------------------------ nav */
const nav = $('#nav');
const toggle = $('.nav-toggle');
const onScroll = () => nav.classList.toggle('scrolled', scrollY > innerHeight * 0.4);
addEventListener('scroll', onScroll, { passive: true });
onScroll();
toggle.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
});
$$('.nav-links a').forEach(a => a.addEventListener('click', () => {
  nav.classList.remove('open');
  toggle.setAttribute('aria-expanded', 'false');
}));
const links = $$<HTMLAnchorElement>('.nav-links a');
const sections = new IntersectionObserver(entries => entries.forEach(e => {
  if (e.isIntersecting) links.forEach(a => a.setAttribute('aria-current', String(a.getAttribute('href') === `#${e.target.id}`)));
}), { rootMargin: '-45% 0px -50% 0px' });
setupDownloads();
['top', 'download', 'scanner', 'detectors', 'vibecode', 'token'].forEach(id => sections.observe(document.getElementById(id)!));

/* ----------------------------------------------------------------- copy */
$$<HTMLButtonElement>('[data-copy]').forEach(b => b.addEventListener('click', async () => {
  const text = b.dataset.copy;
  if (!text) return;
  try { await navigator.clipboard.writeText(text); } catch { /* clipboard blocked: the label still confirms */ }
  const lbl = b.querySelector('.lbl')!;
  const old = lbl.textContent;
  b.classList.add('copied');
  lbl.textContent = 'Copied';
  gsap.fromTo(b, { scale: 0.9 }, { scale: 1, duration: 0.5, ease: 'back.out(3)' });
  setTimeout(() => { b.classList.remove('copied'); lbl.textContent = old; }, 1400);
}));

/* ---------------------------------------------------------------- token */
if (CONTRACT_ADDRESS) {
  $('#caVal').textContent = CONTRACT_ADDRESS;
  const b = $<HTMLButtonElement>('#caCopy');
  b.dataset.copy = CONTRACT_ADDRESS;
  b.disabled = false;
}
if (BUY_URL) {
  const a = $<HTMLAnchorElement>('#buyLink');
  Object.assign(a, { href: BUY_URL, target: '_blank', rel: 'noopener' });
  a.removeAttribute('aria-disabled');
}

/* --------------------------------------------------------------- motion */
heroScroll();
sectionReveals();
pointerToys();
cursor();

const frames = new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
void preloader(Promise.all([document.fonts.ready, frames])).then(() => {
  document.documentElement.classList.add('scene-ready');
  heroIntro(scene);
  ScrollTrigger.refresh();
});
