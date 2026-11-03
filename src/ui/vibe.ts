import gsap from 'gsap';
import { $, $$, escapeHtml, reduceMotion, wait } from './dom';
import { sampleSite, type SampleSite } from './sample-site';

type Tab = 'term' | 'preview' | 'code';

/**
 * The Vibecode window replays a real noira session: install, build, an approval, done.
 * Nothing is sent and no model runs; the page at the end comes from a local template.
 */
export class Vibe {
  private form = $<HTMLFormElement>('#vibeForm');
  private input = $<HTMLInputElement>('#vibePrompt');
  private btnTxt = $('.vibe-btn-txt');
  private builder = $('.builder');
  private term = $('#term');
  private preview = $<HTMLIFrameElement>('#vibePreview');
  private code = $<HTMLPreElement>('#vibeCode');
  private codeEl = this.code.querySelector('code')!;
  private tabs = $$<HTMLButtonElement>('.win-tabs button');
  private run = 0;
  private installed = false;
  private site: SampleSite | null = null;

  constructor() {
    $$('.vibe-sugg button').forEach(b => b.addEventListener('click', () => {
      this.input.value = b.textContent ?? '';
      void this.play(this.input.value);
    }));
    this.tabs.forEach(b => b.addEventListener('click', () => this.show(b.dataset.tab as Tab)));
    this.form.addEventListener('submit', e => {
      e.preventDefault();
      if (!this.input.value.trim()) this.input.value = this.input.placeholder;
      void this.play(this.input.value.trim());
    });
    // the first time the window comes into view, it plays the first example by itself
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return;
      io.disconnect();
      if (!this.run) void this.play(this.input.placeholder);
    }, { threshold: 0.45 });
    io.observe(this.term);
  }

  private show(tab: Tab) {
    this.tabs.forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    this.term.hidden = tab !== 'term';
    this.preview.hidden = tab !== 'preview';
    this.code.hidden = tab !== 'code';
    if (tab === 'preview' && !this.site) this.preview.srcdoc = '<body style="margin:0;display:grid;place-items:center;height:100vh;font:15px system-ui;color:#9488b8;background:#0b0618">Run a prompt to see the page.</body>';
  }

  /* ------------------------------------------------------------ terminal primitives */
  private line(cls = ''): HTMLDivElement {
    const el = document.createElement('div');
    el.className = `t-line ${cls}`;
    this.term.append(el);
    while (this.term.children.length > 80) this.term.firstElementChild!.remove();
    this.term.scrollTop = this.term.scrollHeight;
    return el;
  }

  private alive(id: number) { return id === this.run; }

  private async pause(ms: number) { await wait(reduceMotion ? 0 : ms); }

  /** Types a command after the prompt, then "presses Enter". */
  private async command(id: number, text: string) {
    const el = this.line();
    el.innerHTML = '<span class="t-ps">~/projects</span> <span class="t-dollar">$</span> <span class="t-cmd"></span><span class="t-cursor"></span>';
    const cmd = el.querySelector('.t-cmd')!;
    await this.pause(350);
    for (let i = 1; i <= text.length; i++) {
      if (!this.alive(id)) return;
      cmd.textContent = text.slice(0, i);
      await this.pause(text[i - 1] === ' ' ? 45 : 22 + Math.random() * 30);
    }
    await this.pause(260);
    el.querySelector('.t-cursor')?.remove();
  }

  private async print(id: number, html: string, cls = '', delay = 180) {
    if (!this.alive(id)) return;
    await this.pause(delay);
    if (!this.alive(id)) return;
    this.line(cls).innerHTML = html;
  }

  private async progress(id: number, total: number) {
    const el = this.line('t-dim');
    const steps = reduceMotion ? 1 : 26;
    for (let i = 1; i <= steps; i++) {
      if (!this.alive(id)) return;
      const f = i / steps;
      const filled = Math.round(f * 20);
      el.innerHTML = `<span class="t-acc">›</span> writing index.html  <span class="t-bar">${'█'.repeat(filled)}${'░'.repeat(20 - filled)}</span>  ${(total * f).toFixed(1)} KB`;
      this.term.scrollTop = this.term.scrollHeight;
      await this.pause(70 + Math.random() * 60);
    }
  }

  /** Waits at an approval, then the user's "y" appears. */
  private async approve(id: number, summary: string, tool: string) {
    if (!this.alive(id)) return;
    const el = this.line('t-ask');
    el.innerHTML = `<span class="t-warn">›</span> <b>Approve?</b> ${escapeHtml(summary)}  <span class="t-dim">[y]es / [n]o / [a]lways for ${tool}</span> <span class="t-answer"></span><span class="t-cursor"></span>`;
    await this.pause(1300);
    if (!this.alive(id)) return;
    el.querySelector('.t-answer')!.textContent = 'y';
    el.querySelector('.t-cursor')?.remove();
    await this.pause(300);
  }

  /* ------------------------------------------------------------ the session */
  private async play(prompt: string) {
    const id = ++this.run;
    const site = sampleSite(prompt);
    const kb = +(site.html.length / 1024).toFixed(1);
    this.site = null;
    this.builder.classList.add('is-building');
    this.btnTxt.textContent = 'Running';
    this.show('term');
    this.term.innerHTML = '';
    $('#winPath').textContent = '~/projects — noira';

    if (!this.installed) {
      await this.command(id, 'npm install -g @noirarh/noira');
      await this.print(id, 'added 4 packages in 3s', 't-dim', 700);
      this.installed = true;
    }

    await this.command(id, `noira build "${prompt}"`);
    await this.print(id, '<span class="t-moon">☾</span> building with Claude · claude-opus-5-5', '', 300);
    await this.print(id, `<span class="t-acc">›</span> planning  <span class="t-dim">${site.plan.join(' · ')}</span>`, '', 900);
    if (this.alive(id)) await this.progress(id, kb);
    await this.print(id, `<span class="t-ok">✓</span> ${site.slug}/index.html <span class="t-dim">(${kb} KB)</span>`, '', 250);

    const task = `copy ${site.slug} into ~/sites and open it`;
    await this.command(id, `noira run "${task}"`);
    await this.print(id, `<span class="t-moon">noira</span> I'll copy the folder into ~/sites, then open the page in your browser.`, '', 700);
    await this.approve(id, `Run: cp -r ${site.slug} ~/sites/${site.slug}`, 'run_shell');
    await this.print(id, `  <span class="t-dim">⚙</span> Run: cp -r ${site.slug} ~/sites/${site.slug} <span class="t-ok">✓</span>`, '', 450);
    await this.approve(id, `Run: open ~/sites/${site.slug}/index.html`, 'run_shell');
    await this.print(id, `  <span class="t-dim">⚙</span> Run: open ~/sites/${site.slug}/index.html <span class="t-ok">✓</span>`, '', 450);
    await this.print(id, `Copied to <b>~/sites/${site.slug}</b> and opened it in your browser.`, '', 500);
    await this.print(id, '<span class="t-ps">~/projects</span> <span class="t-dollar">$</span> <span class="t-cursor"></span>', '', 300);
    if (!this.alive(id)) return;

    this.site = site;
    this.preview.srcdoc = site.html;
    this.codeEl.innerHTML = highlight(site.html);
    $('#winPath').textContent = `~/sites/${site.slug}/index.html`;
    this.builder.classList.remove('is-building');
    this.btnTxt.textContent = 'Run';
    await this.pause(900);
    if (!this.alive(id)) return;
    this.show('preview');
    gsap.fromTo(this.preview, { opacity: 0, scale: 0.985 }, { opacity: 1, scale: 1, duration: 0.7, ease: 'power3.out' });
  }
}

function highlight(src: string): string {
  return escapeHtml(src).replace(
    /(\/\*[\s\S]*?\*\/|&lt;!--[\s\S]*?--&gt;)|(&quot;[^&\n]*?&quot;)|(&lt;\/?[\w-]+|\/?&gt;)|([\w-]+(?==))/g,
    (_m, c, s, t, a) => c ? `<span class="c">${c}</span>` : s ? `<span class="s">${s}</span>` : t ? `<span class="t">${t}</span>` : `<span class="a">${a}</span>`,
  );
}
