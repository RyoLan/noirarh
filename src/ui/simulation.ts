import { $, $$, escapeHtml, reduceMotion } from './dom';
import { sampleSite } from './sample-site';

/* A scripted Noira gateway: tool calls, files in the workspace, approvals and the phone chat.
   Nothing here talks to a model or a server. */

type Step =
  | { kind: 'note'; text: string }
  | { kind: 'you'; text: string }
  | { kind: 'phone'; text: string }
  | { kind: 'tool'; tool: string; arg: string; result: string; ask?: true; file?: { path: string; lines: string[] } };

interface Scenario { id: string; from: string; steps: Step[] }

const site = sampleSite('a launch page for my frog coin with a countdown');

const SCENARIOS: Scenario[] = [
  {
    id: 'brief',
    from: 'Schedule · weekdays 08:00',
    steps: [
      { kind: 'note', text: 'Scheduled run started. Nobody had to ask.' },
      { kind: 'tool', tool: 'recall', arg: 'priorities this week', result: '3 memories: launch on Friday, short answers, gym at 18:00' },
      { kind: 'tool', tool: 'read_file', arg: 'notes/tasks.md', result: '7 open tasks, 2 due today' },
      { kind: 'tool', tool: 'scan_launches', arg: 'signal · last 12 h', result: '2 of 41 launches passed all seven checks' },
      {
        kind: 'tool', tool: 'write_file', arg: 'briefs/today.md', ask: true, result: 'Saved',
        file: { path: 'briefs/today.md', lines: ['# Today', '', '1. Send the launch checklist to the team', '2. Review the pricing page', '3. Reply to the supplier about delivery', '', 'Signal: $ORBIAI, $NOVAX (7/7 checks)', 'Evening: gym at 18:00'] },
      },
      { kind: 'phone', text: 'Good morning. 3 things matter today:\n\n1. Send the launch checklist\n2. Review the pricing page\n3. Reply to the supplier\n\n$ORBIAI and $NOVAX passed all seven checks. Full brief in briefs/today.md' },
      { kind: 'you', text: 'Move #2 to tomorrow' },
      {
        kind: 'tool', tool: 'write_file', arg: 'notes/tasks.md', ask: true, result: 'Pricing review moved to tomorrow',
        file: { path: 'notes/tasks.md', lines: ['# Tasks', '', '- [ ] Send the launch checklist (today)', '- [ ] Reply to the supplier (today)', '- [ ] Review the pricing page (tomorrow)', '- [ ] Draft the weekly update (Fri)'] },
      },
      { kind: 'phone', text: 'Done. Moved to tomorrow.' },
      { kind: 'tool', tool: 'remember', arg: 'pricing review moved to Thursday', result: 'Saved to memory' },
    ],
  },
  {
    id: 'build',
    from: 'You · panel chat',
    steps: [
      { kind: 'note', text: 'You asked from the panel: “a launch page for my frog coin with a countdown”.' },
      { kind: 'tool', tool: 'recall', arg: 'brand, colours', result: '1 memory: green, playful, never invent numbers' },
      {
        kind: 'tool', tool: 'build_site', arg: `${site.slug}/`, ask: true, result: `Wrote ${site.slug}/index.html (${(site.html.length / 1024).toFixed(1)} KB)`,
        file: { path: `${site.slug}/index.html`, lines: site.html.split('\n').slice(0, 16) },
      },
      { kind: 'phone', text: `Your page is ready: ${site.slug}/index.html.\nHero, countdown, tokenomics and how to buy. Copy it to ~/sites?` },
      { kind: 'you', text: 'Yes, and open it' },
      { kind: 'tool', tool: 'run_shell', arg: `cp -r ${site.slug} ~/sites/`, ask: true, result: 'exit code 0' },
      { kind: 'tool', tool: 'run_shell', arg: `open ~/sites/${site.slug}/index.html`, ask: true, result: 'Opened in your browser' },
      { kind: 'tool', tool: 'remember', arg: `frog coin page lives in ~/sites/${site.slug}`, result: 'Saved to memory' },
      { kind: 'phone', text: 'Done. It’s open in your browser, and I’ll remember where it lives.' },
      { kind: 'note', text: 'Run finished in 41 s · 3 approvals.' },
    ],
  },
  {
    id: 'scan',
    from: 'Schedule · every 30 minutes',
    steps: [
      { kind: 'note', text: 'Scheduled run started. Nobody had to ask.' },
      { kind: 'tool', tool: 'scan_launches', arg: 'any · last 30 min', result: '9 launches, 1 signal: $ORBIAI' },
      { kind: 'tool', tool: 'fetch_url', arg: 'https://orbiai.example', ask: true, result: 'Site live, socials linked' },
      {
        kind: 'tool', tool: 'write_file', arg: 'watchlist.md', ask: true, result: 'Saved',
        file: { path: 'watchlist.md', lines: ['# Watchlist', '', '## $ORBIAI  (7/7)', '- dev wallet 2.1% of supply', '- LP burned', '- top 10 hold 18%', '- no same-block buys', '- site and socials verified', '', 'Re-check: hourly'] },
      },
      { kind: 'phone', text: '$ORBIAI passed all seven checks.\nDev 2.1% · LP burned · top 10 hold 18% · no snipers.\nAdded to watchlist.md. Not financial advice.' },
      { kind: 'you', text: 'Check it again every hour' },
      { kind: 'tool', tool: 'schedule_job', arg: '0 * * * *  re-check $ORBIAI', ask: true, result: 'Scheduled. Next run 10:00' },
      { kind: 'tool', tool: 'remember', arg: 'watching $ORBIAI hourly', result: 'Saved to memory' },
      { kind: 'phone', text: 'Scheduled. I’ll message you if anything changes.' },
      { kind: 'note', text: 'Next scan in 30 minutes.' },
    ],
  },
  {
    id: 'fix',
    from: 'You · terminal',
    steps: [
      { kind: 'note', text: 'You ran: noira run “the site build fails, fix it”.' },
      { kind: 'tool', tool: 'read_file', arg: 'logs/build.log', result: 'Error: FEED_URL is not defined' },
      { kind: 'tool', tool: 'list_files', arg: 'site/', result: '12 files, no .env' },
      { kind: 'tool', tool: 'read_file', arg: 'site/.env.example', result: 'FEED_URL and PORT expected' },
      {
        kind: 'tool', tool: 'write_file', arg: 'site/.env', ask: true, result: 'Saved',
        file: { path: 'site/.env', lines: ['# copied from .env.example', 'FEED_URL=http://localhost:5173', 'PORT=8080'] },
      },
      { kind: 'tool', tool: 'run_shell', arg: 'npm run build', ask: true, result: 'built in 2.1 s' },
      { kind: 'tool', tool: 'run_shell', arg: 'npm test', ask: true, result: '14 passed' },
      { kind: 'phone', text: 'Fixed: the build needed FEED_URL. I added it to site/.env from the example; the build and all 14 tests pass.' },
      { kind: 'you', text: 'Thanks, remember that' },
      { kind: 'tool', tool: 'remember', arg: 'site needs FEED_URL in .env', result: 'Saved to memory' },
    ],
  },
];

export class Simulation {
  private root = $('#sim');
  private runList = $('#runList');
  private wsTabs = $('#wsTabs');
  private wsPath = $('#wsPath');
  private wsCode = $('#wsCode');
  private chat = $('#phoneChat');
  private bar = $('#simBar');
  private count = $('#simCount');
  private pauseBtn = $<HTMLButtonElement>('#simPause');
  private tabs = $$<HTMLButtonElement>('.sim-tabs button');
  private files = new Map<string, string[]>();
  private token = 0;
  private paused = false;
  private visible = false;
  private started = false;
  private current = 0;

  constructor() {
    this.tabs.forEach((b, i) => b.addEventListener('click', () => this.start(i)));
    this.pauseBtn.addEventListener('click', () => this.setPaused(!this.paused));
    new IntersectionObserver(([e]) => {
      this.visible = !!e?.isIntersecting;
      if (this.visible && !this.started) { this.started = true; this.start(0); }
    }, { threshold: 0.3 }).observe(this.root);
  }

  private setPaused(p: boolean) {
    this.paused = p;
    this.pauseBtn.textContent = p ? 'Play' : 'Pause';
    this.pauseBtn.setAttribute('aria-pressed', String(p));
  }

  /** Waits, holding while paused or scrolled away; resolves false if a newer scenario took over. */
  private async tick(id: number, ms: number): Promise<boolean> {
    const step = 50;
    let left = reduceMotion ? 0 : ms;
    while (left > 0 || this.paused || !this.visible) {
      if (id !== this.token) return false;
      await new Promise(r => setTimeout(r, step));
      if (!this.paused && this.visible) left -= step;
    }
    return id === this.token;
  }

  private start(index: number) {
    const id = ++this.token;
    this.current = index;
    this.setPaused(false);
    this.tabs.forEach((b, i) => b.setAttribute('aria-selected', String(i === index)));
    void this.play(id, SCENARIOS[index]!);
  }

  /* ------------------------------------------------------------ painting */
  private reset(s: Scenario) {
    $('#simFrom').textContent = s.from;
    this.runList.innerHTML = '';
    this.chat.innerHTML = '<p class="ph-empty">Messages arrive here.</p>';
    this.files.clear();
    this.wsTabs.innerHTML = '<span class="ws-empty">No files yet</span>';
    this.wsPath.textContent = '';
    this.wsCode.innerHTML = '';
    this.progress(0, s.steps.length);
  }

  private progress(n: number, total: number) {
    this.count.textContent = `${n}/${total}`;
    this.bar.style.transform = `scaleX(${total ? n / total : 0})`;
  }

  private addRun(html: string, cls: string): HTMLLIElement {
    const li = document.createElement('li');
    li.className = cls;
    li.innerHTML = html;
    this.runList.append(li);
    this.runList.scrollTop = this.runList.scrollHeight;
    return li;
  }

  private phone(text: string, who: 'noira' | 'noira typing' | 'you' | 'ask'): HTMLElement {
    this.chat.querySelector('.ph-empty')?.remove();
    const b = document.createElement('div');
    // 'ask' gets its own class name: .ask already belongs to the Ask Noira panel
    b.className = `ph-msg ${who === 'ask' ? 'ph-ask' : who}`;
    b.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
    this.chat.append(b);
    this.chat.scrollTop = this.chat.scrollHeight;
    return b;
  }

  private showFile(path: string) {
    this.wsTabs.innerHTML = [...this.files.keys()].map(p => `<span class="ws-tab${p === path ? ' on' : ''}">${escapeHtml(p.split('/').pop()!)}</span>`).join('');
    this.wsPath.textContent = path;
  }

  private renderCode(lines: string[], typing = '') {
    const all = typing ? [...lines, typing] : lines;
    this.wsCode.innerHTML = all.map((l, i) => `<span class="ln">${i + 1}</span>${escapeHtml(l)}${typing && i === all.length - 1 ? '<i class="cur"></i>' : ''}`).join('\n');
    this.wsCode.scrollTop = this.wsCode.scrollHeight;
  }

  private async typeFile(id: number, path: string, lines: string[]): Promise<boolean> {
    const done: string[] = [];
    this.files.set(path, done);
    this.showFile(path);
    for (const line of lines) {
      for (let i = 1; i <= line.length; i += 3) {
        this.renderCode(done, line.slice(0, i));
        if (!(await this.tick(id, 14))) return false;
      }
      done.push(line);
      this.renderCode(done, ' ');
      if (!(await this.tick(id, 60))) return false;
    }
    this.renderCode(done);
    return true;
  }

  /* ------------------------------------------------------------ the script */
  private async play(id: number, s: Scenario) {
    this.reset(s);
    if (!(await this.tick(id, 500))) return;
    for (let n = 0; n < s.steps.length; n++) {
      const step = s.steps[n]!;
      if (step.kind === 'note') {
        this.addRun(escapeHtml(step.text), 'r-note');
      } else if (step.kind === 'you') {
        this.phone(step.text, 'you');
        this.addRun(`<b>You, on your phone:</b> ${escapeHtml(step.text)}`, 'r-you');
      } else if (step.kind === 'phone') {
        const typing = this.phone('', 'noira typing');
        typing.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>';
        if (!(await this.tick(id, 900))) return;
        typing.className = 'ph-msg noira';
        typing.innerHTML = escapeHtml(step.text).replace(/\n/g, '<br>');
        this.chat.scrollTop = this.chat.scrollHeight;
      } else {
        const card = this.addRun(`
          <div class="tc-top"><b>${step.tool}</b><span class="tc-arg">${escapeHtml(step.arg)}</span><span class="tc-st run">running</span></div>
          <div class="tc-body"></div>`, 'r-tool');
        const st = card.querySelector<HTMLElement>('.tc-st')!;
        const body = card.querySelector<HTMLElement>('.tc-body')!;
        if (step.ask) {
          if (!(await this.tick(id, 500))) return;
          st.className = 'tc-st ask';
          st.textContent = 'waiting for you';
          card.classList.add('asking');
          const req = this.phone(`Allow ${step.tool}?\n${step.arg}`, 'ask');
          req.insertAdjacentHTML('beforeend', '<span class="ph-btns"><b>Allow</b><b>Deny</b></span>');
          if (!(await this.tick(id, 1500))) return;
          req.classList.add('allowed');
          req.querySelector('.ph-btns')!.innerHTML = '<b class="yes">Allowed</b>';
          card.classList.remove('asking');
          body.textContent = 'Allowed on your phone';
          body.classList.add('tc-ok');
          st.className = 'tc-st run';
          st.textContent = 'running';
        }
        if (step.file) { if (!(await this.typeFile(id, step.file.path, step.file.lines))) return; }
        else if (!(await this.tick(id, 750))) return;
        st.className = 'tc-st done';
        st.textContent = '✓ done';
        body.classList.remove('tc-ok');
        body.textContent = step.result;
      }
      this.progress(n + 1, s.steps.length);
      if (!(await this.tick(id, 950))) return;
    }
    // then the next scenario, round and round
    if (await this.tick(id, 3200)) this.start((this.current + 1) % SCENARIOS.length);
  }
}
