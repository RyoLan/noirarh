import gsap from 'gsap';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { getWallet, type Launch, type WalletReport } from '../lib/api';
import { $, $$, reduceMotion, shortAddr } from './dom';
import type { Scanner } from './scanner';

gsap.registerPlugin(ScrambleTextPlugin);

type Mode = 'scanner' | 'xray' | 'entangle' | 'radar' | 'pulse' | 'ask';

const INFO: Record<Mode, { title: string; tag: string; cap: string }> = {
  scanner: { title: 'Launch Scanner', tag: 'Live feed', cap: 'Rows land as launches go live; seven dots per row, one per check.' },
  xray: { title: 'Wallet X-Ray', tag: 'Latest deployer', cap: 'Funding sources on the left flow in; wallets that move with it sit on the right.' },
  entangle: { title: 'Entanglement Map', tag: 'Holders', cap: 'Each orb is a holder sized by supply. Wallets that trade together orbit together.' },
  radar: { title: 'Sniper Radar', tag: 'Block by block', cap: 'Each sweep is a block. Blips are same-block buys, bundles and fresh wallets.' },
  pulse: { title: 'Liquidity Pulse', tag: 'Curve · LP · locks', cap: 'The pulse is buy pressure on the curve; markers are LP moves and locks.' },
  ask: { title: 'Ask Noira', tag: 'Claude agent', cap: 'The agent reads the same feed through its tools before it answers.' },
};

const C = { v: '#7b4dff', vh: '#a582ff', lav: '#dccfff', ok: '#7cf0c2', bad: '#ff6b8b', warn: '#ffc76b', mut: '#9488b8', ink: '#f4f0ff' };
const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Detectors {
  private cv = $<HTMLCanvasElement>('#detCanvas');
  private ctx = this.cv.getContext('2d')!;
  private askEl = $('#ask');
  private tabs = $$<HTMLButtonElement>('.det-item');
  private mode: Mode = 'scanner';
  private W = 0;
  private H = 0;
  private visible = false;
  private raf = 0;
  private t0 = performance.now();
  private rowOff = 0;
  private lastTop = 0;
  private wallet: WalletReport | null = null;
  private walletFor = '';
  private nodes: { ci: number; a: number; r: number; sp: number; m: number }[] = [];
  private blips: { a: number; r: number; k: string; life: number }[] = [];
  private prog = 52;
  private events: { x: number; e: [string, string, string] }[] = [];
  private nextEv = 1;

  constructor(private scanner: Scanner) {
    new ResizeObserver(() => this.size()).observe(this.cv);
    new IntersectionObserver(([e]) => {
      this.visible = !!e?.isIntersecting;
      if (this.visible && !this.raf) this.raf = requestAnimationFrame(t => this.draw(t));
    }).observe(this.cv);

    this.tabs.forEach((b, i) => {
      b.tabIndex = b.getAttribute('aria-selected') === 'true' ? 0 : -1;
      b.addEventListener('click', () => this.set(b.dataset.mode as Mode));
      b.addEventListener('keydown', e => {
        if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key)) return;
        e.preventDefault();
        const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : this.tabs.length - 1;
        const n = this.tabs[(i + step) % this.tabs.length]!;
        n.focus();
        this.set(n.dataset.mode as Mode);
      });
    });
    scanner.on('launch', () => { if (this.mode === 'xray') void this.loadWallet(); });
    this.initMode();
  }

  set(m: Mode) {
    if (m === this.mode) return;
    this.mode = m;
    this.tabs.forEach(b => { const on = b.dataset.mode === m; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    const info = INFO[m];
    gsap.to('#detTitle', { duration: 0.7, scrambleText: { text: info.title, chars: 'NOIRA01', speed: 0.6 } });
    $('#detTag').textContent = info.tag;
    $('#detCaption').textContent = info.cap;
    this.askEl.hidden = m !== 'ask';
    gsap.fromTo(this.cv, { opacity: 0, scale: 0.98 }, { opacity: m === 'ask' ? 0.16 : 1, scale: 1, duration: 0.6, ease: 'power3.out' });
    if (m === 'ask') gsap.from('#ask > *', { y: 14, opacity: 0, duration: 0.5, stagger: 0.06, ease: 'power3.out' });
    this.initMode();
  }

  private size() {
    const r = this.cv.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.W = r.width; this.H = r.height;
    this.cv.width = Math.round(this.W * dpr); this.cv.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private initMode() {
    if (this.mode === 'xray') void this.loadWallet();
    if (this.mode === 'entangle') {
      const n = [16, 11, 9, 5];
      this.nodes = n.flatMap((count, ci) => Array.from({ length: count }, (_, i) => ({
        ci, a: Math.random() * 6.28, r: 14 + Math.random() * (ci === 0 ? 70 : 54),
        sp: (0.15 + Math.random() * 0.35) * (Math.random() < 0.5 ? -1 : 1), m: 2 + Math.random() * (i === 0 ? 10 : 5),
      })));
    }
    if (this.mode === 'radar') this.blips = Array.from({ length: 14 }, () => ({ a: Math.random() * 6.28, r: 0.2 + Math.random() * 0.75, k: pick(['same-block', 'bundle', 'fresh wallet']), life: 0 }));
  }

  private async loadWallet() {
    const l = this.scanner.current();
    if (!l || l.deployer === this.walletFor) return;
    this.walletFor = l.deployer;
    this.wallet = await getWallet(l.deployer);
    $('#detTag').textContent = `Deployer of ${l.ticker}`;
  }

  /* --------------------------------------------------------------- drawing */
  private draw(now: number) {
    this.raf = 0;
    if (!this.visible) return;
    const t = (now - this.t0) / 1000;
    this.ctx.clearRect(0, 0, this.W, this.H);
    switch (this.mode) {
      case 'xray': this.xray(t); break;
      case 'entangle': this.entangle(t); break;
      case 'radar': this.radar(t); break;
      case 'pulse': this.pulse(t); break;
      default: this.rows();
    }
    if (!reduceMotion) this.raf = requestAnimationFrame(n => this.draw(n));
  }

  private label(x: number, y: number, txt: string, color = C.mut, size = 12, align: CanvasTextAlign = 'left', w = 500, f = 'Inter') {
    const c = this.ctx;
    c.fillStyle = color; c.font = `${w} ${size}px ${f}, system-ui, sans-serif`; c.textAlign = align; c.fillText(txt, x, y);
  }

  private dot(x: number, y: number, r: number, color: string, blur = 14) {
    const c = this.ctx;
    c.save(); c.shadowColor = color; c.shadowBlur = blur; c.fillStyle = color;
    c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill(); c.restore();
  }

  private rows() {
    const { W, H, ctx } = this;
    const rows: Launch[] = this.scanner.launches.slice(0, 12);
    const rh = 46, pad = 18, narrow = W < 460;
    this.rowOff = Math.max(0, this.rowOff - 1.2);
    if (!rows.length) { this.label(W / 2, H / 2, 'Waiting for the feed…', C.mut, 13, 'center'); return; }
    rows.forEach((r, i) => {
      const y = pad + 22 + i * rh - this.rowOff;
      if (y > H + 20) return;
      ctx.globalAlpha = Math.min(1, Math.max(0, (H - y) / 80));
      ctx.fillStyle = i === 0 ? 'rgba(123,77,255,.16)' : 'rgba(255,255,255,.03)';
      ctx.beginPath(); ctx.roundRect(pad, y - 22, W - pad * 2, 38, 10); ctx.fill();
      this.label(pad + 14, y + 2, r.ticker, C.ink, 14, 'left', 500, 'Orbitron');
      const dx = narrow ? W * 0.44 : W * 0.4;
      r.checks.forEach((c, j) => this.dot(dx + j * (narrow ? 13 : 18), y - 3, 4, c.status === 'pass' ? C.ok : c.status === 'warn' ? C.warn : C.bad, 6));
      if (!narrow) this.label(W * 0.4 + 7 * 18 + 14, y + 1, `${r.passed}/7 · $${(r.mcapUsd / 1000).toFixed(1)}k`, C.mut, 12);
      this.label(W - pad - 14, y + 1, r.verdict === 'signal' ? 'SIGNAL' : 'noise', r.verdict === 'signal' ? C.ok : C.bad, 12, 'right', 600);
    });
    ctx.globalAlpha = 1;
    // a new launch on top slides the list down one row
    const top = rows[0];
    if (top && top.createdAt !== this.lastTop) { this.lastTop = top.createdAt; this.rowOff = rh; }
  }

  private xray(t: number) {
    const { W, H, ctx } = this;
    const w = this.wallet;
    if (!w) { this.label(W / 2, H / 2, 'Opening the latest deployer…', C.mut, 13, 'center'); return; }
    const cx = W * 0.52, cy = H * 0.5;
    const lx = Math.max(W * 0.08, 16);
    const bez = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, u: number) => {
      const m = 1 - u;
      return [m ** 3 * x0 + 3 * m * m * u * x1 + 3 * m * u * u * x2 + u ** 3 * x3, m ** 3 * y0 + 3 * m * m * u * y1 + 3 * m * u * u * y2 + u ** 3 * y3] as const;
    };
    w.fundedBy.forEach((s, i) => {
      const y = H * (0.18 + i * (0.64 / Math.max(1, w.fundedBy.length - 1)));
      const col = s.flagged ? C.bad : C.lav;
      ctx.strokeStyle = s.flagged ? 'rgba(255,107,139,.4)' : 'rgba(165,130,255,.35)'; ctx.lineWidth = 1 + s.share * 4;
      ctx.beginPath(); ctx.moveTo(lx + 8, y); ctx.bezierCurveTo(W * 0.3, y, W * 0.32, cy, cx - 40, cy); ctx.stroke();
      for (let k = 0; k < 3; k++) {
        const p = bez(lx + 8, y, W * 0.3, y, W * 0.32, cy, cx - 40, cy, (t * 0.35 + i * 0.21 + k / 3) % 1);
        this.dot(p[0], p[1], 2.4, col, 10);
      }
      this.dot(lx, y, 5, s.flagged ? C.bad : C.vh, 12);
      this.label(lx + 14, y - 10, s.label, C.ink, 12.5, 'left', 600);
      this.label(lx + 14, y + 20, `${Math.round(s.share * 100)}%`, C.mut, 12);
    });
    const rx = W - Math.max(W * 0.1, 22);
    w.movesWith.forEach((p, i) => {
      const y = H * (0.25 + i * (0.5 / Math.max(1, w.movesWith.length - 1 || 1)));
      ctx.setLineDash([4, 6]); ctx.lineDashOffset = -t * 20; ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(220,207,255,.28)';
      ctx.beginPath(); ctx.moveTo(cx + 40, cy); ctx.quadraticCurveTo(W * 0.72, y, rx - 8, y); ctx.stroke();
      ctx.setLineDash([]);
      this.dot(rx, y, 5, C.lav, 10);
      this.label(rx - 14, y - 10, p.address, C.ink, 12.5, 'right', 600, 'JetBrains Mono');
      this.label(rx - 14, y + 20, p.reason, C.mut, 12, 'right');
    });
    const pulse = 1 + Math.sin(t * 2.4) * 0.06;
    ctx.save(); ctx.shadowColor = C.v; ctx.shadowBlur = 40;
    const g = ctx.createRadialGradient(cx - 8, cy - 10, 4, cx, cy, 38 * pulse);
    g.addColorStop(0, '#efe8ff'); g.addColorStop(0.45, '#7b4dff'); g.addColorStop(1, '#22105a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 36 * pulse, 0, 6.283); ctx.fill(); ctx.restore();
    this.label(cx, cy - 52, shortAddr(w.address), C.ink, 12.5, 'center', 600, 'JetBrains Mono');
    const riskCol = w.riskScore > 60 ? C.bad : w.riskScore > 35 ? C.warn : C.ok;
    this.label(cx, cy + 82, `Risk ${w.riskScore} / 100 · moves with ${w.movesWith.length}`, riskCol, 12.5, 'center', 600);
  }

  private entangle(t: number) {
    const { W, H, ctx } = this;
    const cl = [
      { x: 0.34, y: 0.5, c: C.bad, label: 'Linked · same funder' },
      { x: 0.7, y: 0.3, c: C.vh, label: 'Organic holders' },
      { x: 0.72, y: 0.72, c: C.vh, label: '' },
      { x: 0.15, y: 0.36, c: C.ok, label: 'LP' },
    ];
    const pos = this.nodes.map(n => {
      const c = cl[n.ci]!;
      const a = n.a + t * n.sp * (reduceMotion ? 0 : 1);
      return [c.x * W + Math.cos(a) * n.r * Math.min(1, W / 600), c.y * H + Math.sin(a) * n.r * 0.72] as const;
    });
    ctx.lineWidth = 1;
    this.nodes.forEach((n, i) => {
      const j = this.nodes.findIndex((m, k) => k > i && m.ci === n.ci);
      if (j < 0) return;
      ctx.strokeStyle = n.ci === 0 ? 'rgba(255,107,139,.28)' : 'rgba(165,130,255,.2)';
      ctx.beginPath(); ctx.moveTo(pos[i]![0], pos[i]![1]); ctx.lineTo(pos[j]![0], pos[j]![1]); ctx.stroke();
    });
    cl.forEach(c => {
      const g = ctx.createRadialGradient(c.x * W, c.y * H, 0, c.x * W, c.y * H, 110);
      g.addColorStop(0, c.c === C.bad ? 'rgba(255,107,139,.18)' : 'rgba(123,77,255,.16)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x * W, c.y * H, 110, 0, 6.283); ctx.fill();
    });
    this.nodes.forEach((n, i) => this.dot(pos[i]![0], pos[i]![1], n.m, cl[n.ci]!.c, 10));
    cl.forEach(c => c.label && this.label(c.x * W, c.y * H - (c.c === C.bad ? 100 : 72), c.label, c.c === C.bad ? C.bad : C.ink, 12.5, 'center', 600));
  }

  private radar(t: number) {
    const { W, H, ctx } = this;
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.42;
    ctx.strokeStyle = 'rgba(165,130,255,.18)'; ctx.lineWidth = 1;
    for (let k = 1; k <= 4; k++) { ctx.beginPath(); ctx.arc(cx, cy, (R * k) / 4, 0, 6.283); ctx.stroke(); }
    const sweep = (t * 1.1) % 6.283;
    const g = ctx.createConicGradient(sweep - 1.2, cx, cy);
    g.addColorStop(0, 'rgba(123,77,255,0)'); g.addColorStop(0.19, 'rgba(123,77,255,.38)'); g.addColorStop(0.191, 'rgba(123,77,255,0)'); g.addColorStop(1, 'rgba(123,77,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.fill();
    ctx.strokeStyle = 'rgba(220,207,255,.7)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(sweep) * R, cy + Math.sin(sweep) * R); ctx.stroke();
    for (const b of this.blips) {
      const d = (((sweep - b.a) % 6.283) + 6.283) % 6.283;
      if (d < 0.08) { b.life = 1; if (Math.random() < 0.3) b.k = pick(['same-block', 'bundle', 'fresh wallet']); }
      b.life *= 0.985;
      if (b.life < 0.03) continue;
      const x = cx + Math.cos(b.a) * b.r * R, y = cy + Math.sin(b.a) * b.r * R;
      const col = b.k === 'bundle' ? C.bad : b.k === 'same-block' ? C.warn : C.lav;
      ctx.globalAlpha = b.life; this.dot(x, y, 4, col, 14);
      if (b.life > 0.45) this.label(x + 9, y + 4, b.k, col, 11.5, 'left', 600);
      ctx.globalAlpha = 1;
    }
    this.dot(cx, cy, 4, C.lav, 12);
    const l = this.scanner.current();
    this.label(18, H - 18, l ? `watching ${l.ticker} · ${l.checks.find(c => c.id === 'snipers')?.value ?? ''}` : 'watching the feed', C.mut, 12);
  }

  private pulse(t: number) {
    const { W, H, ctx } = this;
    const mid = H * 0.56, pad = 18;
    this.prog = Math.min(99.9, this.prog + 0.004);
    this.label(pad, 34, 'Curve progress', C.mut, 12.5);
    this.label(W - pad, 34, `${this.prog.toFixed(1)}%`, C.ink, 18, 'right', 600, 'Orbitron');
    ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.beginPath(); ctx.roundRect(pad, 48, W - pad * 2, 8, 4); ctx.fill();
    ctx.save(); ctx.shadowColor = C.vh; ctx.shadowBlur = 12; ctx.fillStyle = C.vh;
    ctx.beginPath(); ctx.roundRect(pad, 48, ((W - pad * 2) * this.prog) / 100, 8, 4); ctx.fill(); ctx.restore();
    const beat = (u: number) => {
      u = ((u % 1) + 1) % 1;
      if (u < 0.08) return Math.sin((u / 0.08) * Math.PI) * 0.25;
      if (u > 0.16 && u < 0.2) return (-(u - 0.16) / 0.04) * 0.6;
      if (u >= 0.2 && u < 0.26) return -0.6 + ((u - 0.2) / 0.06) * 2.2;
      if (u >= 0.26 && u < 0.32) return 1.6 - ((u - 0.26) / 0.06) * 1.9;
      if (u >= 0.32 && u < 0.38) return -0.3 + ((u - 0.32) / 0.06) * 0.3;
      if (u > 0.5 && u < 0.66) return Math.sin(((u - 0.5) / 0.16) * Math.PI) * 0.35;
      return 0;
    };
    const amp = H * 0.14;
    ctx.save(); ctx.strokeStyle = C.lav; ctx.lineWidth = 2; ctx.shadowColor = C.vh; ctx.shadowBlur = 16;
    ctx.beginPath();
    for (let x = pad; x <= W - pad; x += 2) { const y = mid - beat(x / 240 - t * 0.55) * amp; x === pad ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke(); ctx.restore();
    this.nextEv -= 1 / 60;
    if (this.nextEv <= 0) {
      this.nextEv = 1.6 + Math.random() * 1.8;
      this.events.push({ x: W - pad - 10, e: pick([['LP add', `+${rand(0.3, 3).toFixed(2)} ETH`, C.ok], ['Lock extended', '+90 days', C.lav], ['Large buy', `${rand(0.5, 4).toFixed(1)} ETH`, C.vh], ['LP pull attempt', 'blocked by lock', C.bad]] as [string, string, string][]) });
    }
    this.events = this.events.filter(ev => ev.x > pad - 40);
    for (const ev of this.events) {
      ev.x -= 1.1;
      const y = mid - amp * 1.9;
      ctx.strokeStyle = 'rgba(220,207,255,.14)'; ctx.beginPath(); ctx.moveTo(ev.x, y + 14); ctx.lineTo(ev.x, mid + amp); ctx.stroke();
      this.dot(ev.x, y + 14, 3.5, ev.e[2], 10);
      this.label(ev.x + 8, y + 4, ev.e[0], C.ink, 12, 'left', 600);
      this.label(ev.x + 8, y + 20, ev.e[1], ev.e[2], 11.5);
    }
    const l = this.scanner.current();
    this.label(pad, H - 18, `Buy pressure ${(58 + Math.sin(t * 0.7) * 9).toFixed(0)} bpm`, C.mut, 12.5);
    this.label(W - pad, H - 18, l ? `${l.ticker} · ${l.checks.find(c => c.id === 'liquidity')?.value}` : '', C.ok, 12.5, 'right', 600);
  }
}
