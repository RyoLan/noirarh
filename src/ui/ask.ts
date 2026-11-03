import gsap from 'gsap';
import { ApiError, postStream } from '../lib/api';
import { $, $$, renderMarkdown } from './dom';

type Turn = { role: 'user' | 'assistant'; content: string };

const TOOL_LABEL: Record<string, string> = {
  list_launches: 'listing launches',
  get_launch: 'reading launch',
  inspect_wallet: 'x-raying wallet',
  feed_stats: 'counting the feed',
};

/** Ask Noira: a chat with the Claude-powered agent on the server. */
export class Ask {
  private thread = $('#askThread');
  private form = $<HTMLFormElement>('#askForm');
  private input = $<HTMLInputElement>('#askInput');
  private btn = $<HTMLButtonElement>('#askBtn');
  private history: Turn[] = [];
  private busy = false;

  constructor() {
    this.form.addEventListener('submit', e => { e.preventDefault(); void this.ask(this.input.value); });
    $$('.ask-sugg button').forEach(b => b.addEventListener('click', () => void this.ask(b.dataset.q ?? b.textContent ?? '')));
  }

  private bubble(kind: 'me' | 'bot' | 'tool' | 'error', text = ''): HTMLElement {
    const el = document.createElement('div');
    el.className = `msg ${kind}`;
    el.textContent = text;
    this.thread.append(el);
    gsap.fromTo(el, { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: 'power3.out', clearProps: 'transform,opacity' });
    this.thread.scrollTop = this.thread.scrollHeight;
    return el;
  }

  async ask(q: string) {
    q = q.trim();
    if (!q || this.busy) return;
    this.busy = true;
    this.btn.disabled = true;
    this.input.value = '';
    this.bubble('me', q);
    this.history.push({ role: 'user', content: q });

    const bot = this.bubble('bot');
    bot.classList.add('typing');
    let text = '';

    try {
      for await (const { event, data } of postStream('/api/ask', { messages: this.history.slice(-12) })) {
        if (event === 'tool') {
          const input = data.input && Object.keys(data.input).length ? ` · ${Object.values(data.input as Record<string, unknown>).join(', ')}` : '';
          // tool chips stack above the answer that is being written
          bot.before(this.bubble('tool', `${TOOL_LABEL[data.name] ?? data.name}${input}`));
        } else if (event === 'text') {
          text += data.text;
          bot.innerHTML = renderMarkdown(text);
          this.thread.scrollTop = this.thread.scrollHeight;
        } else if (event === 'error') {
          throw new ApiError(data.message, 500);
        }
      }
      if (!text) throw new ApiError('The agent returned no answer. Try asking again.', 500);
      this.history.push({ role: 'assistant', content: text });
    } catch (err) {
      bot.remove();
      this.bubble('error', err instanceof Error ? err.message : 'Something went wrong.');
      this.history.pop(); // forget the unanswered question so the history stays user/assistant
    } finally {
      bot.classList.remove('typing');
      this.busy = false;
      this.btn.disabled = false;
      if (this.history.length > 16) this.history.splice(0, this.history.length - 16);
    }
  }
}
