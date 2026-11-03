import { $, $$ } from './dom';

/** "owner/repo" on GitHub whose Releases hold the installers built by .github/workflows/release.yml. */
export const GITHUB_REPO = '';

type Os = 'windows' | 'mac' | 'android' | 'linux';

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

const assetUrl = (file: string) => (GITHUB_REPO ? `https://github.com/${GITHUB_REPO}/releases/latest/download/${file}` : '');

/** Points the download buttons at the latest release and fits the commands to the visitor's OS. */
export function setupDownloads() {
  const os = detectOs();
  const shell = os === 'windows' ? 'win' : 'unix';

  for (const a of $$<HTMLAnchorElement>('.dl-btn')) {
    const url = assetUrl(a.dataset.asset!);
    if (url) { a.href = url; a.setAttribute('download', ''); }
    else {
      a.setAttribute('aria-disabled', 'true');
      a.title = 'Installers appear here after the first release';
      a.firstChild!.textContent = 'Coming soon ';
    }
  }
  $$('.dl-card').forEach(c => c.classList.toggle('is-yours', c.dataset.os === os));

  const hero = $<HTMLAnchorElement>('#heroDownload');
  const label = { windows: 'Download for Windows', mac: 'Download for macOS', android: 'Download for Android', linux: 'Install with npm' }[os];
  const asset = { windows: 'Noira-Setup.exe', mac: 'Noira-mac.dmg', android: 'Noira-android.apk', linux: '' }[os];
  hero.firstChild!.textContent = `${label} `;
  if (asset && assetUrl(asset)) hero.href = assetUrl(asset);

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
