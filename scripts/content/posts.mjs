// The X posts rendered by make-content.mjs: one photo, one video and one caption each.
// `scene` picks the layout in scene.js; the other fields fill it. Claims stick to what the site and docs say, and
// anything that looks like live data (tickers, wallets, scores) is labelled EXAMPLE on the image.

const CHECKS = ['Dev wallet share', 'Liquidity lock', 'Holder concentration', 'Sniper / bundle activity', 'Contract risk', 'Early volume quality', 'Socials metadata'];
const DETECTORS = [
  { t: 'Launch Scanner', d: 'Every new launch, scored on all seven checks the second it lands.' },
  { t: 'Wallet X-Ray', d: 'The latest deployer, opened up: where its money came from.' },
  { t: 'Entanglement Map', d: 'Supply drawn as mass. Linked wallets orbit together.' },
  { t: 'Sniper Radar', d: 'Same-block buys, bundles and fresh wallets, caught early.' },
  { t: 'Liquidity Pulse', d: 'Curve progress, LP moves and locks as one heartbeat.' },
  { t: 'Ask Noira', d: 'The agent itself. Ask anything in plain words.' },
];
const INSTALL = [
  { cmd: 'npm install -g @noirarh/noira' },
  { cmd: 'noira onboard', note: '# Claude, OpenAI-compatible or Ollama' },
  { cmd: 'noira start', note: '# the gateway, in the background' },
  { cmd: 'noira', note: '# chat with it' },
];

export const FOLDERS = {
  'before-launch': {
    phase: 'soon',
    posts: [
      {
        scene: 'mark', title: 'SOMETHING IS\nLISTENING', sub: 'Every launch is noise until it’s observed.',
        caption: 'Every launch is noise until it’s observed.\n\nSomething is listening. 🌒\n\n$NOIRA',
      },
      {
        scene: 'headline', kicker: 'SELF-HOSTED AI AGENT', title: 'STOP GUESSING.\nSTART SCANNING.',
        body: 'Noira watches every Pons launch, works while you sleep, and asks before it acts.',
        caption: 'Meet Noira.\n\nA self-hosted AI agent that watches every Pons launch, works while you sleep, and asks before it acts.\n\nStop guessing. Start scanning.\n\n$NOIRA',
      },
      {
        scene: 'scan', kicker: '01 · INTO THE DARK', title: 'SEVEN CHECKS.\nIN SECONDS.',
        ticker: '$PEPECAT', name: 'Pepecat', checks: ['pass', 'pass', 'warn', 'fail', 'pass', 'fail', 'pass'],
        caption: 'The moment a Pons launch goes live, Noira takes the seven measurements a careful trader would make.\n\nIn seconds.\n\nPass all seven and it collapses to signal. Everything else stays noise.\n\n$NOIRA',
      },
      {
        scene: 'rows', kicker: 'THE SEVEN MEASUREMENTS', title: 'WHAT NOIRA\nCHECKS', items: CHECKS,
        caption: 'What Noira checks on every launch:\n\n▪️ Dev wallet share\n▪️ Liquidity lock\n▪️ Holder concentration\n▪️ Sniper / bundle activity\n▪️ Contract risk\n▪️ Early volume quality\n▪️ Socials metadata\n\nSeven checks. One verdict.\n\n$NOIRA',
      },
      {
        scene: 'headline', kicker: 'RUNS ON YOUR MACHINE', title: 'YOUR MACHINE.\nYOUR KEYS.',
        body: 'Keys, memory and files stay in ~/.noira. Pick Claude, an OpenAI-compatible model or a local model with Ollama.',
        caption: 'Noira isn’t a website you log into. It runs on a machine you control.\n\nKeys, memory and files stay in ~/.noira.\nBring Claude, any OpenAI-compatible model, or run it locally with Ollama.\n\n$NOIRA',
      },
      {
        scene: 'chat', kicker: 'ASK NOIRA', title: 'ASK IN\nPLAIN WORDS',
        q: 'Which launches today had no snipers?',
        a: 'Three of today’s launches showed no same-block buys or bundles. Two of them still failed the liquidity lock, so one passed all seven checks.',
        caption: 'No dashboards to decode.\n\nAsk Noira in plain words:\n“Which launches today had no snipers?”\n“Latest deployer?”\n“Locked but failed?”\n\nIt reads launches, wallets and holders, and answers.\n\n$NOIRA',
      },
      {
        scene: 'radar', kicker: 'DETECTOR · SNIPER RADAR', title: 'CAUGHT BEFORE\nTHEY CATCH YOU',
        caption: 'Sniper Radar 📡\n\nSame-block buys, bundles and fresh wallets, flagged the second a launch lands. Before they catch you.\n\n$NOIRA',
      },
      {
        scene: 'orbit', kicker: 'DETECTOR · ENTANGLEMENT MAP', title: 'LINKED WALLETS\nORBIT TOGETHER',
        caption: 'Entanglement Map 🪐\n\nSupply drawn as mass. Wallets that move together orbit together, so a “fair” distribution that is really one hand shows up at a glance.\n\n$NOIRA',
      },
      {
        scene: 'pulse', kicker: 'DETECTOR · LIQUIDITY PULSE', title: 'ONE STEADY\nHEARTBEAT',
        caption: 'Liquidity Pulse 💜\n\nCurve progress, LP moves and locks, read as one steady heartbeat. When it skips, you’ll know.\n\n$NOIRA',
      },
      {
        scene: 'headline', kicker: 'AGENT, NOT AUTOPILOT', title: 'IT ASKS\nBEFORE IT ACTS.',
        body: 'Noira works the night on its own, then waits for your yes before it acts.',
        caption: 'Noira works while you sleep.\n\nBut it’s an agent, not an autopilot: it waits for your yes before it acts.\n\nYou stay in control. It does the watching.\n\n$NOIRA',
      },
      {
        scene: 'platforms', kicker: 'GET THE AGENT', title: 'INSTALL IT ONCE.\nLET IT WORK.',
        caption: 'Noira runs where you do:\n\n🪟 Windows\n🍎 macOS\n🤖 Android (connects to your gateway)\n🌐 Web app\n⌨️ npm on Windows, macOS and Linux\n\nInstall once. Let it work the night.\n\nnoirarh.xyz',
      },
      {
        scene: 'terminal', kicker: 'ALREADY ON NPM', title: 'FOUR COMMANDS\nTO THE DARK', lines: INSTALL,
        caption: 'Four commands:\n\nnpm install -g @noirarh/noira\nnoira onboard\nnoira start\nnoira\n\nNeeds Node 22+. Full guide at noirarh.xyz/docs\n\n$NOIRA',
      },
      {
        scene: 'token', kicker: '04 · $NOIRA', title: 'HOLD THE TOKEN.\nUNLOCK THE FIELD.', focus: 0,
        caption: '$NOIRA opens the whole agent.\n\nHold 0.1% of supply and every detector unlocks.\nEveryone else still gets 3 free builds a day.\n\nNFA · DYOR',
      },
      {
        scene: 'burn', kicker: 'BUYBACK BURN', title: 'EVERY FEE FEEDS\nTHE SINGULARITY',
        caption: 'Everything Noira earns falls back into the token.\n\n🔥 Fees buy $NOIRA off the curve and send it to the dead address in one transaction\n👑 A share goes to the 5 heaviest wallets\n\nEvery tx gets posted.\n\nNFA · DYOR',
      },
      {
        scene: 'mark', title: 'THE FIELD\nOPENS SOON', sub: 'Launching on Pons.',
        caption: 'The field opens soon. 🌒\n\n$NOIRA launches on Pons.\n\nThe contract address will be posted here and on noirarh.xyz, nowhere else. Ignore DMs and copycats.\n\nTurn on notifications.',
      },
    ],
  },
  'after-launch': {
    phase: 'live',
    posts: [
      {
        scene: 'mark', title: '$NOIRA\nIS LIVE', sub: 'Now on Pons.',
        caption: '$NOIRA is live on Pons. 🌒\n\nCA: [CA]\n\nThe field is open → noirarh.xyz\n\nOnly trust the CA posted here and on the site.',
      },
      {
        scene: 'headline', kicker: 'THE FIELD IS OPEN', title: 'LET THE NOISE\nCOLLAPSE.',
        body: 'Keep what’s real. The scanner, the detectors and the agent are live at noirarh.xyz.',
        caption: 'The field is open.\n\nScanner, detectors, Ask Noira and the agent downloads are all live.\n\nLet the noise collapse. Keep what’s real.\n\nnoirarh.xyz',
      },
      {
        scene: 'token', kicker: 'HOLDER ACCESS', title: '0.1% OPENS\nEVERYTHING', focus: 0,
        caption: 'Holding $NOIRA?\n\nConnect a wallet with 0.1% of supply and every detector opens.\n\nNot holding? You still get 3 free builds a day.\n\nnoirarh.xyz\n\nNFA · DYOR',
      },
      {
        scene: 'scan', kicker: 'LAUNCH SCANNER', title: 'SEVEN OF SEVEN.\nSIGNAL.',
        ticker: '$NEKOAI', name: 'Neko AI', checks: ['pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass'],
        caption: 'When a launch passes all seven checks, the state collapses to signal.\n\nDev share, liquidity lock, holders, snipers, contract, volume, socials: all scored the second it lands.\n\n$NOIRA',
      },
      {
        scene: 'scan', kicker: 'LAUNCH SCANNER', title: 'MOST NEVER\nMAKE IT OUT',
        ticker: '$LUNARPUP', name: 'Lunar Pup', checks: ['fail', 'warn', 'fail', 'fail', 'pass', 'warn', 'fail'],
        caption: 'Most launches never make it out of the noise.\n\nThat’s the point.\n\nNoira scores every Pons launch on seven checks, so you only look at what survives.\n\n$NOIRA',
      },
      {
        scene: 'terminal', kicker: 'GET STARTED', title: 'FOUR COMMANDS.\nTHAT’S IT.', lines: INSTALL,
        caption: 'Run your own Noira:\n\nnpm install -g @noirarh/noira\nnoira onboard\nnoira start\n\nThen type `noira` to chat, or `noira panel` for the control panel.\n\nnoirarh.xyz/docs',
      },
      {
        scene: 'platforms', kicker: 'DOWNLOAD', title: 'WINDOWS. MACOS.\nANDROID.',
        caption: 'Prefer an installer?\n\nWindows (.exe) and macOS (.dmg) run the gateway for you from the tray or menu bar. Android connects to the gateway you run.\n\nnoirarh.xyz',
      },
      {
        scene: 'chat', kicker: 'ASK NOIRA', title: 'ASK ABOUT\nANY LAUNCH',
        q: 'Latest deployer?',
        a: 'Funded mostly by a fresh wallet and mixer-like hops. Two of its earlier launches failed the liquidity check. Risk: high.',
        caption: '“Latest deployer?”\n\nAsk Noira and it opens the wallet up: where the money came from, who it moves with, how its past launches went.\n\nTry it → noirarh.xyz\n\n$NOIRA',
      },
      {
        scene: 'xray', kicker: 'DETECTOR · WALLET X-RAY', title: 'FOLLOW\nTHE MONEY',
        caption: 'Wallet X-Ray 🩻\n\nThe latest deployer, opened up: where its money came from and who it moves with. Fresh wallets and mixer-like hops get flagged.\n\n$NOIRA',
      },
      {
        scene: 'burn', kicker: 'BUYBACK BURN', title: 'EVERY BURN\nPOSTED WITH ITS TX',
        caption: 'How the $NOIRA burn works:\n\n1. Fees buy $NOIRA off the curve\n2. Sent straight to the dead address\n3. In the same transaction\n4. Posted here with the tx\n\nCheck it on-chain.\n\nNFA · DYOR',
      },
      {
        scene: 'token', kicker: 'TOP ORBIT', title: 'THE 5 HEAVIEST\nWALLETS GET PAID', focus: 2,
        caption: 'Top orbit 👑\n\nA share of fees goes to the 5 largest $NOIRA holders, sent by hand and posted with the transactions.\n\nNFA · DYOR',
      },
      {
        scene: 'headline', kicker: 'WORKS WHILE YOU SLEEP', title: 'YOUR MORNING\nBRIEF, READY.',
        body: 'Put Noira on a schedule, weekdays at 08:00, and wake up to the night’s launches already scanned.',
        caption: 'Set it and sleep.\n\nPut Noira on a schedule and wake up to a brief of the night’s launches: scanned, sorted, waiting for you.\n\nIt still asks before it acts.\n\n$NOIRA',
      },
      {
        scene: 'terminal', kicker: 'SIMULATION', title: 'WATCH IT\nWORK', simulated: true,
        lines: [
          { out: '▸ schedule · weekdays 08:00', tone: 'muted' },
          { out: '▸ scanning overnight launches…' },
          { out: '▸ writing brief.md' },
          { out: '? send the brief — waiting for your yes', tone: 'warn' },
          { out: '✓ approved · sent', tone: 'ok' },
        ],
        caption: 'This is what a run looks like.\n\nA schedule fires. Noira calls its tools, writes its files, then stops and waits for your yes.\n\nWatch the full simulation on noirarh.xyz\n\n$NOIRA',
      },
      {
        scene: 'grid', kicker: '02 · DETECTORS', title: 'SIX INSTRUMENTS.\nONE DARK SKY.', items: DETECTORS,
        caption: 'Six instruments, one dark sky:\n\n01 Launch Scanner\n02 Wallet X-Ray\n03 Entanglement Map\n04 Sniper Radar\n05 Liquidity Pulse\n06 Ask Noira\n\nAll live → noirarh.xyz\n\n$NOIRA',
      },
      {
        scene: 'quote', title: 'LET THE NOISE\nCOLLAPSE.\nKEEP WHAT’S REAL.',
        caption: 'Thank you to everyone who stepped into the dark with us. 🌒\n\nWe’re just getting started.\n\nLet the noise collapse. Keep what’s real.\n\n$NOIRA',
      },
    ],
  },
};
