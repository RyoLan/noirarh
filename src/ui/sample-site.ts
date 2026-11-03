// Builds the sample page shown at the end of the Vibecode replay. No model is involved:
// a small template reads the prompt for a name, a theme and which sections to include.

export interface SampleSite {
  html: string;
  slug: string;
  name: string;
  plan: string[];
}

const THEMES = [
  { k: /frog|pepe|green|forest|leaf|toad/, accent: '#5cff8f', bg: '#06140b', glow: '#1f7a43' },
  { k: /fire|sun|orange|hot|dragon|flame|lava/, accent: '#ff8a3d', bg: '#160904', glow: '#7a2e0f' },
  { k: /ocean|sea|blue|wave|water|fish|tidal|whale/, accent: '#3db8ff', bg: '#03101b', glow: '#0f4f7a' },
  { k: /pink|cat|kawaii|love|neko|candy/, accent: '#ff6bc8', bg: '#170512', glow: '#7a1f5c' },
  { k: /gold|luxury|king|crown|rich/, accent: '#f5c84b', bg: '#120e04', glow: '#6b5212' },
];
const NOUNS = /\b(frog|cat|dog|moon|dragon|fish|ape|robot|rocket|bear|bull|ghost|wolf|panda|whale|tiger|owl|fox|pepe)\b/;
const FILLER = new Set(['a', 'an', 'the', 'for', 'my', 'our', 'with', 'and', 'of', 'to', 'page', 'site', 'website', 'landing', 'called', 'named', 'themed']);

const cap = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase());
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function slugFor(prompt: string): string {
  const quoted = /["“”']([^"“”']{2,32})["“”']/.exec(prompt)?.[1];
  const base = (quoted ?? prompt.toLowerCase().split(/[^a-z0-9]+/).filter(w => w && !FILLER.has(w)).slice(0, 3).join(' ')).toLowerCase();
  return base.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'my-launch';
}

export function sampleSite(prompt: string): SampleSite {
  const p = prompt.toLowerCase();
  const t = THEMES.find(x => x.k.test(p)) ?? { accent: '#a582ff', bg: '#0a0618', glow: '#4a2a9c' };
  const quoted = /["“”']([^"“”']{2,24})["“”']/.exec(prompt)?.[1];
  const noun = NOUNS.exec(p)?.[1];
  const name = cap(quoted ?? (noun ? `${noun}${/coin|token|meme/.test(p) ? ' coin' : ''}` : 'nova'));
  const ticker = `$${name.replace(/coin|token/i, '').replace(/[^a-z]/gi, '').slice(0, 5).toUpperCase() || 'NOVA'}`;
  const want = {
    count: /countdown|mint|launch|presale|drop|timer/.test(p),
    dash: /dashboard|staking|stake|stats|analytics|apy/.test(p),
    token: /coin|token|meme|\$|tokenomics/.test(p),
  };
  const plan = ['hero', ...(want.count ? ['countdown'] : []), ...(want.dash ? ['staking panel'] : []), ...(want.token || !want.dash ? ['tokenomics', 'how to buy'] : []), 'footer'];

  const headline = want.dash ? `Stake ${ticker}.<br><span>Watch it grow.</span>` : want.count ? `${esc(name)}<br><span>drops soon.</span>` : `${esc(name)}<br><span>${ticker}</span>`;
  const sub = want.dash
    ? `Lock your ${ticker}, follow the rewards in real time, and withdraw when the lock ends.`
    : `${esc(name)} is a community token with burned liquidity, no team allocation and a roadmap the holders vote on.`;

  const sections: string[] = [];
  if (want.count) sections.push(`
<section class="count-wrap">
  <h2>Launch in</h2>
  <div class="count">
    <div><b id="d">03</b><small>days</small></div>
    <div><b id="h">07</b><small>hours</small></div>
    <div><b id="m">00</b><small>min</small></div>
    <div><b id="s">00</b><small>sec</small></div>
  </div>
</section>`);
  if (want.dash) sections.push(`
<section>
  <h2>Your position</h2>
  <div class="grid">
    <div class="card"><b>18.4%</b>Current APY</div>
    <div class="card"><b>12,400</b>${ticker} staked</div>
    <div class="card"><b>62.1</b>Rewards to claim</div>
    <div class="card"><b>21 days</b>Lock remaining</div>
  </div>
</section>`);
  if (want.token || !want.dash) sections.push(`
<section>
  <h2>Tokenomics</h2>
  <div class="grid">
    <div class="card"><b>1B</b>Total supply</div>
    <div class="card"><b>0%</b>Team allocation</div>
    <div class="card"><b>100%</b>LP burned</div>
    <div class="card"><b>0 / 0</b>Buy / sell tax</div>
  </div>
</section>
<section>
  <h2>How to buy</h2>
  <ol class="steps">
    <li><b>Get a wallet</b>Any EVM wallet works.</li>
    <li><b>Add funds</b>Bridge or buy ETH on the chain.</li>
    <li><b>Swap for ${ticker}</b>Paste the contract address once it is live.</li>
  </ol>
</section>`);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(name)} ${ticker}</title>
<style>
  :root { --bg: ${t.bg}; --ink: #f5f3ff; --accent: ${t.accent}; --glow: ${t.glow}; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: var(--bg); color: var(--ink); }
  nav { display: flex; justify-content: space-between; align-items: center; padding: 20px 6vw; }
  .logo { font-weight: 800; letter-spacing: .04em; font-size: 20px; }
  .btn { display: inline-block; background: var(--accent); color: var(--bg); padding: 12px 22px; border-radius: 999px; font-weight: 700; text-decoration: none; transition: transform .2s; }
  .btn:hover { transform: translateY(-2px); }
  header { padding: 14vh 6vw 12vh; background: radial-gradient(ellipse at 80% 0%, var(--glow), transparent 60%); }
  h1 { font-size: clamp(48px, 10vw, 120px); line-height: .92; letter-spacing: -.045em; }
  h1 span { color: var(--accent); }
  .sub { max-width: 520px; margin: 24px 0 32px; font-size: 18px; line-height: 1.5; opacity: .85; }
  section { padding: 64px 6vw; }
  h2 { font-size: 34px; margin-bottom: 24px; letter-spacing: -.02em; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; }
  .card { background: rgba(255, 255, 255, .06); border-radius: 18px; padding: 24px; }
  .card b { display: block; font-size: 30px; color: var(--accent); margin-bottom: 6px; }
  .count { display: flex; flex-wrap: wrap; gap: 12px; }
  .count div { background: rgba(255, 255, 255, .06); border-radius: 16px; padding: 18px; min-width: 96px; text-align: center; }
  .count b { display: block; font-size: 44px; color: var(--accent); font-variant-numeric: tabular-nums; }
  .count small { opacity: .7; }
  .steps { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; counter-reset: s; }
  .steps li { counter-increment: s; background: rgba(255, 255, 255, .06); border-radius: 18px; padding: 24px; line-height: 1.5; }
  .steps li::before { content: counter(s); display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: var(--accent); color: var(--bg); font-weight: 800; margin-bottom: 12px; }
  .steps b { display: block; font-size: 18px; margin-bottom: 4px; }
  footer { padding: 40px 6vw; opacity: .6; font-size: 14px; }
  @media (prefers-reduced-motion: reduce) { .btn { transition: none; } }
</style>
</head>
<body>
<nav>
  <div class="logo">${esc(name)}</div>
  <a class="btn" href="#buy">Buy ${ticker}</a>
</nav>
<header>
  <h1>${headline}</h1>
  <p class="sub">${sub}</p>
  <a class="btn" href="#buy">${want.dash ? 'Connect wallet' : 'Join the launch'}</a>
</header>
${sections.join('\n')}
<footer>CA: coming soon · © ${new Date().getFullYear()} ${esc(name)} · Not financial advice · Built with Noira</footer>${want.count ? `
<script>
  var end = Date.now() + 3 * 864e5 + 7 * 36e5;
  function pad(n) { return String(n).padStart(2, "0"); }
  setInterval(function () {
    var t = Math.max(0, end - Date.now()) / 1000;
    document.getElementById("d").textContent = pad(Math.floor(t / 86400));
    document.getElementById("h").textContent = pad(Math.floor(t / 3600) % 24);
    document.getElementById("m").textContent = pad(Math.floor(t / 60) % 60);
    document.getElementById("s").textContent = pad(Math.floor(t) % 60);
  }, 250);
</script>` : ''}
</body>
</html>
`;
  return { html, slug: slugFor(prompt), name, plan };
}
