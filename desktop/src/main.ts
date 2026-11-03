import { app, BrowserWindow, Menu, nativeImage, shell, Tray } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, paths, startGateway, type Gateway } from 'noira';

const here = path.dirname(fileURLToPath(import.meta.url));
const icon = nativeImage.createFromPath(path.join(here, 'icon.png'));

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let gateway: Gateway | null = null;
let panelUrl = '';
let quitting = false;

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => show());

/** Uses a gateway already started from the terminal, or runs one inside the app. */
async function ensureGateway(): Promise<string> {
  const cfg = loadConfig();
  const url = `http://127.0.0.1:${cfg.port}`;
  try {
    const res = await fetch(`${url}/api/status`, { headers: { 'x-noira-token': cfg.token }, signal: AbortSignal.timeout(1500) });
    if (res.ok) return url;
  } catch { /* nothing running yet */ }
  gateway = await startGateway({
    panelDir: path.join(here, 'panel'),
    log: line => console.log(line),
    onShutdown: () => { quitting = true; app.quit(); },
  });
  return gateway.url;
}

function show() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 380,
    minHeight: 560,
    title: 'Noira',
    icon,
    backgroundColor: '#07040f',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  void win.loadURL(`${panelUrl}/panel.html`);
  // links that leave the panel open in the normal browser
  win.webContents.setWindowOpenHandler(({ url }) => { void shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(panelUrl)) { e.preventDefault(); void shell.openExternal(url); } });
  // closing the window keeps the agent working; Quit lives in the tray / menu bar
  win.on('close', e => { if (!quitting) { e.preventDefault(); win?.hide(); } });
  win.on('closed', () => { win = null; });
}

function buildTray() {
  const image = nativeImage.createFromPath(path.join(here, 'tray.png'));
  tray = new Tray(process.platform === 'darwin' ? image.resize({ width: 18, height: 18 }) : image);
  tray.setToolTip('Noira is working');
  const menu = () => Menu.buildFromTemplate([
    { label: 'Open Noira', click: show },
    { label: gateway ? `Gateway on ${panelUrl}` : `Using the gateway on ${panelUrl}`, enabled: false },
    { type: 'separator' },
    {
      label: 'Start when I log in',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: item => { app.setLoginItemSettings({ openAtLogin: item.checked, openAsHidden: true }); },
    },
    { label: 'Open the workspace folder', click: () => void shell.openPath(paths.workspace) },
    { type: 'separator' },
    { label: 'Quit Noira', click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu());
  tray.on('click', show);
}

app.whenReady().then(async () => {
  app.setAppUserModelId('app.noira.desktop');
  try {
    panelUrl = await ensureGateway();
  } catch (err) {
    const { dialog } = await import('electron');
    dialog.showErrorBox('Noira could not start', err instanceof Error ? err.message : String(err));
    app.quit();
    return;
  }
  buildTray();
  // started at login: stay in the tray until someone opens the window
  if (!app.getLoginItemSettings().wasOpenedAsHidden) createWindow();
  app.on('activate', show);
});

app.on('window-all-closed', () => { /* keep running in the tray / menu bar */ });
app.on('before-quit', () => { quitting = true; void gateway?.stop(); });
