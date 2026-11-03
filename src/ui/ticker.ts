import gsap from 'gsap';
import type { Launch } from '../lib/api';
import { $, reduceMotion } from './dom';

/** Endless strip of the latest launches; scrolling speeds it up and skews it. */
export class Ticker {
  private track = $('#tickerTrack');
  private items: Launch[] = [];
  private x = 0;
  private speed = 0.6;
  private boost = 0;
  private width = 0;

  constructor() {
    if (!reduceMotion) gsap.ticker.add(() => this.step());
  }

  /** Called with Lenis's scroll velocity. */
  nudge(velocity: number) {
    this.boost = Math.max(-30, Math.min(30, velocity));
  }

  push(l: Launch) {
    this.items.unshift(l);
    if (this.items.length > 14) this.items.length = 14;
    this.render();
  }

  private chip(l: Launch): string {
    const dots = l.checks.map(c => `<i class="${c.status}"></i>`).join('');
    const safe = l.ticker.replace(/[^$A-Z0-9]/gi, '');
    return `<span class="tick"><b>${safe}</b><span class="tk-dots">${dots}</span><span class="v ${l.verdict}">${l.verdict}</span></span>`;
  }

  private render() {
    const set = this.items.map(l => this.chip(l)).join('');
    // two copies so the loop is seamless
    this.track.innerHTML = set + set;
    this.width = this.track.scrollWidth / 2;
  }

  private step() {
    if (!this.width) return;
    this.boost *= 0.92;
    this.x -= this.speed + Math.abs(this.boost) * 0.25;
    if (this.x <= -this.width) this.x += this.width;
    gsap.set(this.track, { x: this.x, skewX: -this.boost * 0.25 });
  }
}
