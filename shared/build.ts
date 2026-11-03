import Anthropic from '@anthropic-ai/sdk';

// Shared by the web builder (server/builder.ts) and the terminal CLI (cli/agent.ts).

export const MODEL = 'claude-opus-5-5';

export const BUILD_SYSTEM = `You are Noira's vibecode builder. You turn one sentence into a finished, single-file website.

Return exactly one complete HTML document and nothing else: no prose before or after it, no Markdown code fences. Start with <!doctype html>.

The file must stand on its own:
- All CSS in one <style> element and all JavaScript in one <script> element. The only external resource you may load is a Google Fonts stylesheet.
- No external images. Draw pictures with inline SVG, CSS or canvas.
- Responsive from 360px phones to wide desktops, with no horizontal scrolling.
- Accessible: real headings in order, buttons and links that work from the keyboard, visible focus, alt text or aria-labels where needed, colour contrast that passes WCAG AA.

Design it like a studio would. Choose a palette and typography that fit the subject instead of a generic template, give the page a clear hero that says what it is in a few words, and make every section carry real content written for this subject. Add tasteful motion with CSS or vanilla JS and respect prefers-reduced-motion.

For token or crypto pages: never invent prices, holder counts, partnerships, audits, testimonials or returns. Use clearly marked placeholders such as "CA: coming soon" for anything the user has not given, and include a short "not financial advice" line in the footer.

If the request is something you should not build (for example a phishing page imitating a real brand, or a page that collects wallet seed phrases or private keys), return a small HTML page that politely explains you cannot build it.`;

export interface BuildHandlers {
  onThinking?: (text: string) => void;
  onText?: (text: string) => void;
}

export class BuildRefusedError extends Error {}

/** Streams a site for `prompt`; resolves with the cleaned HTML document. */
export async function streamSite(client: Anthropic, prompt: string, handlers: BuildHandlers = {}, signal?: AbortSignal): Promise<string> {
  const stream = client.beta.messages.stream(
    {
      model: MODEL,
      max_tokens: 64000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: { effort: 'medium' },
      system: BUILD_SYSTEM,
      messages: [{ role: 'user', content: `Build this: ${prompt}` }],
    },
    { signal },
  );

  stream.on('streamEvent', event => {
    if (event.type !== 'content_block_delta') return;
    if (event.delta.type === 'thinking_delta') handlers.onThinking?.(event.delta.thinking);
    else if (event.delta.type === 'text_delta') handlers.onText?.(event.delta.text);
  });

  const message = await stream.finalMessage();
  if (message.stop_reason === 'refusal') throw new BuildRefusedError('The builder declined this request.');

  const text = message.content.map(b => (b.type === 'text' ? b.text : '')).join('');
  return cleanHtml(text);
}

export function cleanHtml(raw: string): string {
  let s = raw.trim().replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/, '');
  const start = s.search(/<!doctype html/i);
  if (start > 0) s = s.slice(start);
  const end = s.toLowerCase().lastIndexOf('</html>');
  if (end >= 0) s = s.slice(0, end + 7);
  return s.trim() + '\n';
}

export function slugFor(prompt: string): string {
  const quoted = prompt.match(/["“”']([^"“”']{2,32})["“”']/)?.[1];
  const filler = new Set(['a', 'an', 'the', 'for', 'my', 'our', 'with', 'and', 'of', 'to', 'page', 'site', 'website', 'landing', 'called', 'named', 'themed']);
  const base = (quoted ?? prompt.toLowerCase().split(/[^a-z0-9]+/).filter(w => w && !filler.has(w)).slice(0, 3).join(' ')).toLowerCase();
  return base.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'my-launch';
}
