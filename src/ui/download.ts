import { $, $$ } from './dom';

type Os = 'windows' | 'mac' | 'android' | 'linux';
interface DownloadInfo { file: string; os: string; available: boolean; size: number }

const COMMANDS = {
  win: 'npm.cmd install -g @noirarh/noira\nnoira.cmd onboard    # pick Claude, an OpenAI-compatible model or Ollama\nnoira.cmd start      # the gateway, in the background\nnoira.cmd            # chat with it · noira.cmd panel opens the control panel',
  unix: 'npm install -g @noirarh/noira\nnoira onboard        # pick Claude, an OpenAI-compatible model or Ollama\nnoira start          # the gateway, in the background\nnoira                # chat with it · noira panel opens the control panel',
};

function detectOs(): Os {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  if (/windows/i.test(ua)) return 'windows';
  if (/mac os|macintosh|iphone|ipad/i.test(ua)) return 'mac';
  return 'linux';
}

const mb = (n: number) => `${Math.max(1, Math.round(n / 1024 / 1024))} MB`;

/** Installers are served by this site at /downloads/<file>; ask which ones it has right now. */
async function available(): Promise<Map<string, DownloadInfo>> {
  try {
    const r = await fetch('/api/downloads');
    const d = (await r.json()) as { files: DownloadInfo[] };
    return new Map(d.files.map(f => [f.file, f]));
  } catch {
    return new Map();
  }
}

/** Points the download buttons at this site's installers and fits the commands to the visitor's OS. */
export function setupDownloads() {
  const os = detectOs();
  const shell = os === 'windows' ? 'win' : 'unix';
  $$('.dl-card').forEach(c => c.classList.toggle('is-yours', c.dataset.os === os));

  const hero = $<HTMLAnchorElement>('#heroDownload');
  const label = { windows: 'Download for Windows', mac: 'Download for macOS', android: 'Download for Android', linux: 'Install with npm' }[os];
  const heroAsset = { windows: 'Noira-Setup.exe', mac: 'Noira-mac.dmg', android: 'Noira-android.apk', linux: '' }[os];
  hero.firstChild!.textContent = `${label} `;

  void available().then(files => {
    for (const a of $$<HTMLAnchorElement>('.dl-btn')) {
      const f = files.get(a.dataset.asset!);
      if (f?.available) {
        a.href = `/downloads/${f.file}`;
        a.setAttribute('download', f.file);
        a.removeAttribute('aria-disabled');
        a.firstChild!.textContent = `${a.firstChild!.textContent!.replace(/\s*\(.*\)\s*$/, '').trim()} (${mb(f.size)}) `;
      } else {
        a.setAttribute('aria-disabled', 'true');
        a.removeAttribute('href');
        a.title = 'This installer is being built';
        a.firstChild!.textContent = 'Coming soon ';
      }
    }
    const h = heroAsset ? files.get(heroAsset) : undefined;
    if (h?.available) { hero.href = `/downloads/${h.file}`; hero.setAttribute('download', h.file); }
  });

  // PowerShell blocks npm.ps1 on many machines, so Windows gets npm.cmd
  if (os === 'windows') {
    $$('.npm-cmd').forEach(c => { c.textContent = 'npm.cmd install -g @noirarh/noira'; });
    $$<HTMLButtonElement>('.npm-copy').forEach(b => { b.dataset.copy = 'npm.cmd install -g @noirarh/noira'; });
  }

  const code = $('#startCode');
  const copy = $<HTMLButtonElement>('#startCopy');
  const tabs = $$<HTMLButtonElement>('.os-tabs button');
  const pick = (s: 'win' | 'unix') => {
    code.textContent = COMMANDS[s];
    copy.dataset.copy = COMMANDS[s].split('\n').map(l => l.replace(/\s+#.*$/, '')).join('\n');
    tabs.forEach(t => t.setAttribute('aria-selected', String(t.dataset.shell === s)));
  };
  tabs.forEach(t => t.addEventListener('click', () => pick(t.dataset.shell as 'win' | 'unix')));
  pick(shell);
}
