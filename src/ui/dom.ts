export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll(sel)] as T[];

export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const pad = (n: number, l = 4) => String(n).padStart(l, '0');
export const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
export const shortAddr = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Minimal, escape-first Markdown for agent replies: paragraphs, lists, **bold**, `code`. */
export function renderMarkdown(src: string): string {
  const inline = (t: string) => escapeHtml(t)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => { if (list.length) { out.push(`<ul>${list.map(i => `<li>${inline(i)}</li>`).join('')}</ul>`); list = []; } };
  for (const line of src.split('\n')) {
    const m = /^\s*(?:[-*•]|\d+\.)\s+(.*)$/.exec(line);
    if (m) { list.push(m[1]!); continue; }
    flush();
    if (line.trim()) out.push(`<p>${inline(line.trim())}</p>`);
  }
  flush();
  return out.join('');
}
