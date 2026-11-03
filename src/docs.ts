import './docs.css';

// Copy buttons on code blocks
document.querySelectorAll<HTMLButtonElement>('.copy-code').forEach(btn => {
  btn.addEventListener('click', async () => {
    const code = btn.parentElement?.querySelector('code')?.textContent ?? '';
    try { await navigator.clipboard.writeText(code); } catch { /* clipboard blocked: the label still confirms */ }
    btn.textContent = 'Copied';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1400);
  });
});

// The contents list follows the section being read
const links = new Map([...document.querySelectorAll<HTMLAnchorElement>('.toc a')].map(a => [a.hash.slice(1), a]));
const spy = new IntersectionObserver(entries => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    links.forEach(a => a.removeAttribute('aria-current'));
    const a = links.get(e.target.id);
    if (a) { a.setAttribute('aria-current', 'true'); a.scrollIntoView({ block: 'nearest' }); }
  }
}, { rootMargin: '-20% 0px -70% 0px' });
document.querySelectorAll('.doc section[id]').forEach(s => spy.observe(s));

// Phones: the contents open as a drawer
const toggle = document.querySelector<HTMLButtonElement>('.toc-toggle')!;
const toc = document.getElementById('toc')!;
const setOpen = (open: boolean) => { toc.classList.toggle('open', open); toggle.setAttribute('aria-expanded', String(open)); };
toggle.addEventListener('click', () => setOpen(!toc.classList.contains('open')));
toc.addEventListener('click', e => { if ((e.target as Element).closest('a')) setOpen(false); });
