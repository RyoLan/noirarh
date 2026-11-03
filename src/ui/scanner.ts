import gsap from 'gsap';
import { subscribeFeed, type FeedStats, type Launch } from '../lib/api';
import { $, $$, pad, reduceMotion, shortAddr, wait } from './dom';

type Listener = (l: Launch) => void;

const CIRC = 163.4;

/**
 * Plays each launch from the live feed through the scanner card, one
 * measurement at a time, and keeps the log, ratio, HUD and listeners current.
 */
export class Scanner {
  readonly launches: Launch[] = [];
  stats: FeedStats | null = null;
  private queue: Launch[] = [];
  private playing = false;
  private visible = false;
  private listeners: { launch: Listener[]; signal: Listener[] } = { launch: [], signal: [] };
  private shown: Launch | null = null;

  private el = {
    name: $('#scanName'), addr: $('#scanAddr'), age: $('#scanAge'), mcap: $('#scanMcap'), orb: $('#scanOrb'),
    ring: $<SVGCircleElement>('#scanRing'), score: $('#scanScore'), verdict: $('#scanVerdict'),
    items: $$('#scanChecks li'), log: $('#scanLog'), source: $('#feedSource'),
    rs: $('#ratioSignal'), rn: $('#ratioNoise'), rf: $('#ratioFill'),
    hudObserved: $('#hudObserved'), hudState: $('#hudState'),
  };

  constructor() {
    new IntersectionObserver(([e]) => {
      this.visible = !!e?.isIntersecting;
      if (this.visible) void this.drain();
    }, { threshold: 0.2 }).observe($('.scan'));

    subscribeFeed({
      snapshot: (launches, stats) => {
        this.launches.splice(0, this.launches.length, ...launches);
        this.setStats(stats);
        [...launches].reverse().forEach(l => this.addLog(l, false));
        if (launches[0]) this.queue.push(launches[0]);
        launches.forEach(l => this.listeners.launch.forEach(f => f(l)));
        void this.drain();
      },
      launch: (launch, stats) => {
        this.launches.unshift(launch);
        if (this.launches.length > 60) this.launches.length = 60;
        this.setStats(stats);
        this.queue.push(launch);
        if (this.queue.length > 2) this.queue.splice(0, this.queue.length - 2);
        this.listeners.launch.forEach(f => f(launch));
        void this.drain();
      },
      offline: () => { this.el.source.textContent = 'Feed offline'; this.el.verdict.textContent = 'The feed server is not reachable.'; },
    });
  }

  on(kind: 'launch' | 'signal', f: Listener) { this.listeners[kind].push(f); }

  /** The launch currently on the card. */
  current(): Launch | null { return this.shown ?? this.launches[0] ?? null; }

  private setStats(s: FeedStats) {
    this.stats = s;
    this.el.source.textContent = /demo/i.test(s.source) ? 'Demo feed' : 'Live';
    const tot = s.signal + s.noise || 1;
    gsap.to(this.el.rf, { width: `${(s.signal / tot) * 100}%`, duration: 0.8, ease: 'power3.out' });
    this.count(this.el.rs, s.signal);
    this.count(this.el.rn, s.noise);
    this.count(this.el.hudObserved, s.observed, 4);
  }

  private count(el: HTMLElement, to: number, digits = 0) {
    const o = { v: Number(el.textContent) || 0 };
    gsap.to(o, { v: to, duration: 0.9, ease: 'power2.out', onUpdate: () => { el.textContent = digits ? pad(Math.round(o.v), digits) : String(Math.round(o.v)); } });
  }

  private async drain() {
    if (this.playing || !this.visible) return;
    const next = this.queue.shift();
    if (!next) return;
    this.playing = true;
    await this.play(next);
    this.playing = false;
    if (this.queue.length) { await wait(1400); void this.drain(); }
  }

  private async play(l: Launch) {
    const e = this.el;
    this.shown = l;
    e.hudState.textContent = 'measuring';
    e.name.textContent = l.ticker;
    e.addr.textContent = shortAddr(l.address);
    e.age.textContent = `age ${l.ageSec}s`;
    e.mcap.textContent = `mcap $${(l.mcapUsd / 1000).toFixed(1)}k`;
    e.orb.textContent = l.name[0] ?? '?';
    e.orb.style.background = ''; e.orb.style.boxShadow = '';
    e.verdict.className = 'verdict';
    e.verdict.textContent = 'Measuring…';
    e.ring.style.stroke = '';
    gsap.set(e.ring, { strokeDashoffset: CIRC });
    e.score.textContent = '0/7';
    e.items.forEach(li => { li.className = ''; li.querySelector('.c-val')!.textContent = '···'; });
    gsap.fromTo([e.name, e.orb], { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'power3.out', stagger: 0.06 });

    let pass = 0;
    for (let i = 0; i < l.checks.length; i++) {
      const c = l.checks[i]!;
      const li = e.items[i]!;
      const val = li.querySelector<HTMLElement>('.c-val')!;
      li.className = 'measuring';
      val.textContent = 'measuring';
      await wait(reduceMotion ? 40 : 360 + Math.random() * 240);
      li.className = c.status;
      val.textContent = c.value;
      gsap.fromTo(val, { x: 10, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, ease: 'power3.out' });
      if (c.status === 'pass') pass++;
      gsap.to(e.ring, { strokeDashoffset: CIRC * (1 - (i + 1) / 7), duration: 0.4, ease: 'power2.out' });
      e.score.textContent = `${pass}/7`;
    }

    if (l.verdict === 'signal') {
      e.verdict.className = 'verdict signal';
      e.verdict.textContent = 'Signal — escapes to the map';
      e.ring.style.stroke = 'var(--ok)';
      e.orb.style.background = '#1fb985'; e.orb.style.boxShadow = '0 0 26px #7cf0c2';
      gsap.fromTo('.scan', { boxShadow: '0 0 0 1px rgba(124,240,194,.8) inset, 0 0 90px -10px rgba(124,240,194,.55)' }, { boxShadow: '0 0 0 1px rgba(190,165,255,.13) inset, 0 0 0 0 rgba(0,0,0,0)', duration: 2.2, ease: 'power2.out' });
      this.listeners.signal.forEach(f => f(l));
    } else {
      const reason = l.checks.find(c => c.id === l.collapsedOn)?.label.toLowerCase() ?? 'a check';
      e.verdict.className = 'verdict noise';
      e.verdict.textContent = `Noise — collapsed on ${reason}`;
      e.ring.style.stroke = 'var(--bad)';
      e.orb.style.background = '#3a2350'; e.orb.style.boxShadow = 'none';
    }
    this.addLog(l, true);
    e.hudState.textContent = 'observing';
  }

  private addLog(l: Launch, animate: boolean) {
    const log = this.el.log;
    log.querySelector('.log-empty')?.remove();
    if ([...log.children].some(li => (li as HTMLElement).dataset.t === l.ticker + l.createdAt)) return;
    const li = document.createElement('li');
    li.dataset.t = l.ticker + l.createdAt;
    li.innerHTML = `<b></b><span class="lg-s">${l.passed}/7 · ${l.ageSec}s</span><span class="lg-v ${l.verdict}">${l.verdict}</span>`;
    li.querySelector('b')!.textContent = l.ticker;
    log.prepend(li);
    if (animate) gsap.fromTo(li, { y: -10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out', clearProps: 'transform,opacity' });
    while (log.children.length > 6) log.lastElementChild!.remove();
  }
}
