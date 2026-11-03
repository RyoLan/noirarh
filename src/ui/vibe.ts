import gsap from 'gsap';
import { postStream } from '../lib/api';
import { $, $$, escapeHtml } from './dom';

type Tab = 'preview' | 'code';

/** The vibecode builder: streams a real site from the Claude-powered builder. */
export class Vibe {
  private form = $<HTMLFormElement>('#vibeForm');
  private input = $<HTMLInputElement>('#vibePrompt');
  private btnTxt = $('.vibe-btn-txt');
  private builder = $('.builder');
  private preview = $<HTMLIFrameElement>('#vibePreview');
  private code = $<HTMLPreElement>('#vibeCode');
  private codeEl = this.code.querySelector('code')!;
  private think = $('#vibeThink');
  private thinkText = $('#vibeThinkText');
  private empty = $('#winEmpty');
  private dl = $<HTMLButtonElement>('#vibeDl');
  private path = $('#winPath');
  private quota = $('#vibeQuota');
  private quotaLine = $('#vibeQuotaLine');
  private tabs = $$<HTMLButtonElement>('.win-tabs button');
  private html = '';
  private slug = 'my-launch';
  private building = false;
  private ctrl: AbortController | null = null;

  constructor() {
    $$('.vibe-sugg button').forEach(b => b.addEventListener('click', () => { this.input.value = b.textContent ?? ''; this.input.focus(); }));
    this.tabs.forEach(b => b.addEventListener('click', () => this.show(b.dataset.tab as Tab)));
    this.form.addEventListener('submit', e => { e.preventDefault(); void this.build(); });
    this.dl.addEventListener('click', () => this.download());
  }

  setQuota(left: number) {
    this.quota.textContent = String(left);
  }

  private show(tab: Tab) {
    this.tabs.forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    this.code.hidden = tab !== 'code';
    this.preview.hidden = tab !== 'preview' || !this.html;
    this.empty.hidden = tab === 'code' || !!this.html || this.building;
  }

  private async build() {
    if (this.building) { this.ctrl?.abort(); return; }
    let prompt = this.input.value.trim();
    if (!prompt) {
      gsap.fromTo(this.form, { x: -6 }, { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' });
      prompt = this.input.placeholder;
      this.input.value = prompt;
    }

    this.building = true;
    this.ctrl = new AbortController();
    this.builder.classList.add('is-building');
    this.btnTxt.textContent = 'Stop';
    this.dl.disabled = true;
    this.quotaLine.classList.remove('error');
    this.empty.hidden = true;
    this.think.hidden = false;
    this.thinkText.textContent = 'Reading your prompt…';
    gsap.from(this.think, { y: 12, opacity: 0, duration: 0.4, ease: 'power3.out' });

    let src = '';
    let thought = '';
    let pending = false;
    const paint = () => {
      pending = false;
      this.codeEl.innerHTML = highlight(src) + '<span class="cursor"></span>';
      this.code.scrollTop = this.code.scrollHeight;
    };

    try {
      for await (const { event, data } of postStream('/api/build', { prompt }, this.ctrl.signal)) {
        if (event === 'start') {
          this.slug = data.slug;
          this.path.textContent = `~/${data.slug}/index.html`;
        } else if (event === 'thinking') {
          thought += data.text;
          const last = thought.trim().split(/(?<=[.!?])\s+|\n+/).filter(Boolean).pop() ?? '';
          this.thinkText.textContent = last.length > 4 ? last : 'Planning…';
        } else if (event === 'text') {
          if (!src) { this.show('code'); this.thinkText.textContent = 'Writing index.html…'; }
          src += data.text;
          if (!pending) { pending = true; requestAnimationFrame(paint); }
        } else if (event === 'done') {
          this.html = data.html;
          this.codeEl.innerHTML = highlight(this.html);
          this.preview.srcdoc = this.html;
          this.setQuota(data.buildsLeft);
          this.thinkText.textContent = `Built ${(this.html.length / 1024).toFixed(1)} KB`;
          await new Promise(r => setTimeout(r, 500));
          this.show('preview');
          gsap.fromTo(this.preview, { opacity: 0, scale: 0.985 }, { opacity: 1, scale: 1, duration: 0.7, ease: 'power3.out' });
          this.dl.disabled = false;
        } else if (event === 'error') {
          throw new Error(data.message);
        }
      }
    } catch (err) {
      if (!this.ctrl.signal.aborted) {
        this.quotaLine.classList.add('error');
        this.quotaLine.textContent = err instanceof Error ? err.message : 'The build failed.';
      }
      if (!this.html) this.show('preview');
    } finally {
      this.building = false;
      this.builder.classList.remove('is-building');
      this.btnTxt.textContent = 'Build';
      gsap.to(this.think, { opacity: 0, duration: 0.4, delay: 1.2, onComplete: () => { this.think.hidden = true; gsap.set(this.think, { opacity: 1 }); } });
      if (!this.quotaLine.classList.contains('error')) {
        this.quotaLine.innerHTML = `<b id="vibeQuota">${escapeHtml(this.quota.textContent ?? '0')}</b> free builds left today · holders build without limits`;
        this.quota = $('#vibeQuota');
      }
    }
  }

  private download() {
    if (!this.html) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([this.html], { type: 'text/html' }));
    a.download = `${this.slug}.html`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
}

function highlight(src: string): string {
  return escapeHtml(src).replace(
    /(\/\*[\s\S]*?\*\/|&lt;!--[\s\S]*?--&gt;)|(&quot;[^&\n]*?&quot;)|(&lt;\/?[\w-]+|\/?&gt;)|([\w-]+(?==))/g,
    (_m, c, s, t, a) => c ? `<span class="c">${c}</span>` : s ? `<span class="s">${s}</span>` : t ? `<span class="t">${t}</span>` : `<span class="a">${a}</span>`,
  );
}
