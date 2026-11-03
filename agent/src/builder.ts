import type { Provider } from './model/index.js';

const SYSTEM = `You are Noira's vibecode builder. You turn one sentence into a finished, single-file website.

Return exactly one complete HTML document and nothing else: no prose before or after it, no Markdown code fences. Start with <!doctype html>.

The file must stand on its own:
- All CSS in one <style> element and all JavaScript in one <script> element. The only external resource you may load is a Google Fonts stylesheet.
- No external images. Draw pictures with inline SVG, CSS or canvas.
- Responsive from 360px phones to wide desktops, with no horizontal scrolling.
- Accessible: real headings in order, keyboard-usable controls, visible focus, alt text or aria-labels, WCAG AA contrast.

Design it like a studio would: a palette and typography that fit the subject, a clear hero that says what it is in a few words, every section carrying real content for this subject, tasteful motion that respects prefers-reduced-motion.

For token or crypto pages: never invent prices, holder counts, partnerships, audits, testimonials or returns. Mark anything the user has not given as a placeholder such as "CA: coming soon", and add a short "not financial advice" line in the footer.

If the request is something you should not build (a phishing page imitating a real brand, a page that collects seed phrases or private keys), return a small HTML page that politely explains you cannot build it.`;

export function cleanHtml(raw: string): string {
  let s = raw.trim().replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/, '');
  const start = s.search(/<!doctype html/i);
  if (start > 0) s = s.slice(start);
  const end = s.toLowerCase().lastIndexOf('</html>');
  if (end >= 0) s = s.slice(0, end + 7);
  return `${s.trim()}\n`;
}

export function slugFor(prompt: string): string {
  const quoted = /["“”']([^"“”']{2,32})["“”']/.exec(prompt)?.[1];
  const filler = new Set(['a', 'an', 'the', 'for', 'my', 'our', 'with', 'and', 'of', 'to', 'page', 'site', 'website', 'landing', 'called', 'named', 'themed']);
  const base = (quoted ?? prompt.toLowerCase().split(/[^a-z0-9]+/).filter(w => w && !filler.has(w)).slice(0, 3).join(' ')).toLowerCase();
  return base.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'my-site';
}

export async function buildSite(provider: Provider, prompt: string, onText?: (t: string) => void, signal?: AbortSignal): Promise<string> {
  return cleanHtml(await provider.complete(SYSTEM, `Build this: ${prompt}`, onText, signal));
}
