'use strict';

const {
  app, BrowserWindow, ipcMain, session,
  Tray, Menu, nativeImage, shell, Notification,
} = require('electron');
const { autoUpdater } = require('electron-updater');
const { globalShortcut } = require('electron');
const path = require('path');
const fs   = require('fs');

// ── Constants ─────────────────────────────────────────────────────────────────
const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');
const THEMES_DIR = path.join(app.getPath('userData'), 'themes');
const ICON_ICO   = path.join(__dirname, 'icon.ico');
const ICON_PNG   = path.join(__dirname, 'icon.png');

// ── Globals ───────────────────────────────────────────────────────────────────
let win  = null;
let tray = null;

// ══════════════════════════════════════════════════════════════════════════════
// WINDOW STATE
// ══════════════════════════════════════════════════════════════════════════════
function loadWindowState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { width: 1280, height: 800, x: undefined, y: undefined }; }
}

function saveWindowState(w) {
  if (w.isMaximized() || w.isMinimized()) return;
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(w.getBounds())); } catch {}
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN WINDOW
// ══════════════════════════════════════════════════════════════════════════════
function createWindow() {
  const state = loadWindowState();

  win = new BrowserWindow({
    width:     state.width  || 1280,
    height:    state.height || 800,
    x:         state.x,
    y:         state.y,
    frame:     false,
    resizable: true,
    minWidth:  400,
    minHeight: 300,
    show:      false,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      nodeIntegration:  false,
      contextIsolation: true,
      webviewTag:       true,
    },
  });

  win.loadFile('overlay.html');
  win.once('ready-to-show', () => win.show());
  win.on('resize', () => saveWindowState(win));
  win.on('move',   () => saveWindowState(win));

  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
      if (process.platform === 'darwin') app.dock.hide();
    }
  });

  // Auto-updater events
  autoUpdater.checkForUpdates().catch(() => {});
  autoUpdater.on('update-available',     ()     => win.webContents.send('update-status', 'available'));
  autoUpdater.on('update-not-available', ()     => win.webContents.send('update-status', 'uptodate'));
  autoUpdater.on('download-progress',    (info) => win.webContents.send('update-status', 'downloading', Math.floor(info.percent)));
  autoUpdater.on('update-downloaded',    ()     => win.webContents.send('update-status', 'ready'));
  autoUpdater.on('error',                ()     => win.webContents.send('update-status', 'error'));

  createTray();
}

// ══════════════════════════════════════════════════════════════════════════════
// TRAY
// ══════════════════════════════════════════════════════════════════════════════
function createTray() {
  const iconFile = fs.existsSync(ICON_ICO) ? ICON_ICO
                 : fs.existsSync(ICON_PNG) ? ICON_PNG
                 : null;
  const img = iconFile
    ? nativeImage.createFromPath(iconFile).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();

  tray = new Tray(img);
  tray.setToolTip('Entropy Client');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Entropy Client', click: () => { win.show(); win.focus(); } },
    { type: 'separator' },
    { label: 'Check for updates',   click: () => { win.show(); autoUpdater.checkForUpdates().catch(() => {}); } },
    { type: 'separator' },
    { label: 'Quit',                click: () => { app.isQuitting = true; app.quit(); } },
  ]));
  tray.on('double-click', () => { win.show(); win.focus(); });
}

// ══════════════════════════════════════════════════════════════════════════════
// THEMES FOLDER
// ══════════════════════════════════════════════════════════════════════════════
function ensureThemesFolder() {
  if (!fs.existsSync(THEMES_DIR)) fs.mkdirSync(THEMES_DIR, { recursive: true });

  const write = (filename, content) => {
    const dest = path.join(THEMES_DIR, filename);
    if (!fs.existsSync(dest)) fs.writeFileSync(dest, content, 'utf8');
  };

  write('ember.css', [
    '/* @name Ember',
    '   @description A warm red-orange theme with four variations */',
    '',
    '/* Root-Colors */',
    ':root {',
    '  --primary:   #ff4400;',
    '  --secondary: #ff8800;',
    '  --hover:     #ff6622;',
    '  --green:     #44cc66;',
    '  --yellow:    #ffcc00;',
    '  --red:       #ff3333;',
    '  --link:      #ff6600;',
    '  --live:      #ff4400;',
    '  --offline:   #884400;',
    '}',
    '',
    '/* Root-Background */',
    'html, body, #root,',
    '.flex-1.h-full.bg-layout-chat.overflow-y-auto.w-full.flex.items-center.justify-center.relative.min-h-0.py-3 {',
    '  background: #1a0800 !important;',
    '}',
    '',
    '/* Root-DMBackground */',
    '/* Defaults to same as Root-Background — change to make DMs a different colour */',
    '[class*="bg-layout-chat"] {',
    '  background: #1a0800 !important;',
    '}',
    '',
    '/* Root-Channels */',
    '[class*="channel"] { color: var(--secondary) !important; }',
    '[class*="channel"]:hover { color: var(--primary) !important; }',
    '',
    '/* Root-ChannelsBG */',
    '[class*="bg-layout-sidebar-secondary"] {',
    '  background: #110500 !important;',
    '}',
    '',
    '/* Root-ChannelText */',
    '[class*="message"], [class*="content"] {',
    '  color: #ffd0b0 !important;',
    '  font-weight: 400;',
    '}',
    'h1, h2, h3 { color: var(--primary) !important; }',
    'a { color: var(--link) !important; }',
    '',
    '/* Root-ChannelText-BG */',
    '[class*="bg-background"] {',
    '  background: #1a0800 !important;',
    '}',
    '',
    '/* Root-AccountText */',
    '.text-sm.font-medium.text-foreground.truncate {',
    '  color: #ffd0b0 !important;',
    '  font-weight: 500;',
    '}',
    '',
    '/* Root-UsernameColor */',
    '/* Gradient text effect on usernames — clip a gradient to the text shape */',
    '.text-sm.font-medium.text-foreground.truncate {',
    '  background: linear-gradient(135deg, #ff8800, #ff4400) !important;',
    '  -webkit-background-clip: text !important;',
    '  -webkit-text-fill-color: transparent !important;',
    '  color: transparent !important;',
    '  display: inline-block !important;',
    '}',
    '/* Root-MembersBG */',
    '[class*="bg-layout-members"] {',
    '  background: #110500 !important;',
    '}',
    '',
    '/* Theme-Light */',
    'html, body { background: #fff5f0 !important; color: #331100 !important; }',
    '[class*="sidebar"] { background: #ffe8d8 !important; }',
    '.text-sm.font-medium.text-foreground.truncate { color: #331100 !important; }',
    '[class*="bg-layout-members"] { background: #f5d0b8 !important; }',
    '[class*="bg-layout-sidebar-secondary"] { background: #ffe0cc !important; }',
    '[class*="bg-background"] { background: #fff5f0 !important; }',
    '',
    '/* Theme-Dark */',
    'html, body { background: #1a0800 !important; color: #ffd0b0 !important; }',
    '[class*="sidebar"] { background: #110500 !important; }',
    '',
    '/* Theme-Darker */',
    'html, body { background: #0d0400 !important; color: #ffc090 !important; }',
    '[class*="sidebar"] { background: #080200 !important; }',
    '',
    '/* Theme-Midnight */',
    'html, body { background: #000000 !important; color: #ff8844 !important; }',
    '[class*="sidebar"] { background: #080300 !important; }',
  ].join('\n'));

  write('sapphire.css', [
    '/* @name Sapphire',
    '   @description A cool blue theme with four variations */',
    '',
    '/* Root-Colors */',
    ':root {',
    '  --primary:   #3b82f6;',
    '  --secondary: #60a5fa;',
    '  --hover:     #2563eb;',
    '  --green:     #22c55e;',
    '  --yellow:    #eab308;',
    '  --red:       #ef4444;',
    '  --link:      #60a5fa;',
    '  --live:      #3b82f6;',
    '  --offline:   #1e3a5f;',
    '}',
    '',
    '/* Root-Background */',
    'html, body, #root,',
    '.flex-1.h-full.bg-layout-chat.overflow-y-auto.w-full.flex.items-center.justify-center.relative.min-h-0.py-3 {',
    '  background: #040e1e !important;',
    '}',
    '',
    '/* Root-DMBackground */',
    '/* Defaults to same as Root-Background — change to make DMs a different colour */',
    '[class*="bg-layout-chat"] {',
    '  background: #040e1e !important;',
    '}',
    '',
    '/* Root-Channels */',
    '[class*="channel"] { color: var(--secondary) !important; }',
    '[class*="channel"]:hover { color: var(--primary) !important; }',
    '',
    '/* Root-ChannelsBG */',
    '[class*="bg-layout-sidebar-secondary"] {',
    '  background: #020a14 !important;',
    '}',
    '',
    '/* Root-ChannelText */',
    '[class*="message"], [class*="content"] { color: #bae6fd !important; }',
    'a { color: var(--link) !important; }',
    '',
    '/* Root-ChannelText-BG */',
    '[class*="bg-background"] {',
    '  background: #040e1e !important;',
    '}',
    '',
    '/* Root-AccountText */',
    '.text-sm.font-medium.text-foreground.truncate {',
    '  color: #bae6fd !important;',
    '  font-weight: 500;',
    '}',
    '',
    '/* Root-UsernameColor */',
    '/* Gradient text effect on usernames — clip a gradient to the text shape */',
    '.text-sm.font-medium.text-foreground.truncate {',
    '  background: linear-gradient(135deg, #a8edeaf0, #fed6e3) !important;',
    '  -webkit-background-clip: text !important;',
    '  -webkit-text-fill-color: transparent !important;',
    '  color: transparent !important;',
    '  display: inline-block !important;',
    '}',
    '/* Root-MembersBG */',
    '[class*="bg-layout-members"] {',
    '  background: #020a14 !important;',
    '}',
    '',
    '/* Theme-Light */',
    'html, body { background: #eff6ff !important; color: #1e3a5f !important; }',
    '[class*="sidebar"] { background: #dbeafe !important; }',
    '.text-sm.font-medium.text-foreground.truncate { color: #1e3a5f !important; }',
    '[class*="bg-layout-members"] { background: #bfdbfe !important; }',
    '[class*="bg-layout-sidebar-secondary"] { background: #dbeafe !important; }',
    '[class*="bg-background"] { background: #eff6ff !important; }',
    '',
    '/* Theme-Dark */',
    'html, body { background: #040e1e !important; color: #bae6fd !important; }',
    '[class*="sidebar"] { background: #020a14 !important; }',
    '',
    '/* Theme-Darker */',
    'html, body { background: #020810 !important; color: #93c5fd !important; }',
    '[class*="sidebar"] { background: #010508 !important; }',
    '',
    '/* Theme-Midnight */',
    'html, body { background: #000000 !important; color: #60a5fa !important; }',
    '[class*="sidebar"] { background: #020610 !important; }',
  ].join('\n'));

  write('README.txt', [
    'Entropy Client - Custom Themes',
    '================================',
    'Sections are marked with /* SectionName */ comments.',
    '',
    'ROOT sections (applied to every variation):',
    '  /* Root-Colors */      - :root CSS variables:',
    '                           --primary, --secondary, --hover,',
    '                           --green, --yellow, --red,',
    '                           --link, --live, --offline',
    '  /* Root-Background */  - page/layout backgrounds (url() images work here)',
    '  /* Root-DMBackground */ - DM area background (.bg-layout-chat) — defaults to Root-Background',
    '  /* Root-Channels */    - channel list text & colours',
    '  /* Root-ChannelsBG */    - channel sidebar background (.bg-layout-sidebar-secondary)',
    '  /* Root-ChannelText-BG */ - channel header/topbar background (.bg-background)',
    '  /* Root-ChannelText */ - message area: colour, font, weight, headings',
    '  /* Root-AccountText */   - account name text colour',
    '  /* Root-UsernameColor */ - gradient/colour effect on username text',
    '  /* Root-MembersBG */   - members panel background (.bg-layout-members)',
    '',
    'THEME variations (pick one in the popup):',
    '  /* Theme-Light */      - light mode',
    '  /* Theme-Dark */       - dark mode (default)',
    '  /* Theme-Darker */     - darker variant',
    '  /* Theme-Midnight */   - full black',
    '',
    'File metadata (optional, put at the very top):',
    '  /* @name My Theme',
    '     @description One line description */',
  ].join('\n'));

  // Write tutorial file if it doesn't exist
  if (!fs.existsSync(path.join(THEMES_DIR, 'TUTORIAL.txt'))) {
    const tutorialSrc = path.join(__dirname, 'TUTORIAL.txt');
    if (fs.existsSync(tutorialSrc)) {
      fs.copyFileSync(tutorialSrc, path.join(THEMES_DIR, 'TUTORIAL.txt'));
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// IPC HANDLERS
// ══════════════════════════════════════════════════════════════════════════════

// Window controls
ipcMain.on('win-minimize', (e) => BrowserWindow.fromWebContents(e.sender).minimize());
ipcMain.on('win-maximize', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  w.isMaximized() ? w.unmaximize() : w.maximize();
});
ipcMain.on('win-close', () => { if (win) win.hide(); });

// Updater
ipcMain.on('update-check',   () => autoUpdater.checkForUpdates().catch(() => {}));
ipcMain.on('update-install', () => { app.isQuitting = true; autoUpdater.quitAndInstall(); });

// Navigation
ipcMain.on('nav-back',    (e) => BrowserWindow.fromWebContents(e.sender).webContents
  .executeJavaScript("document.getElementById('site').goBack()").catch(() => {}));
ipcMain.on('nav-forward', (e) => BrowserWindow.fromWebContents(e.sender).webContents
  .executeJavaScript("document.getElementById('site').goForward()").catch(() => {}));
ipcMain.on('nav-reload',  (e) => BrowserWindow.fromWebContents(e.sender).webContents
  .executeJavaScript("document.getElementById('site').reload()").catch(() => {}));

// Zoom
ipcMain.on('zoom-in',    (e) => BrowserWindow.fromWebContents(e.sender).webContents
  .executeJavaScript("document.getElementById('site').setZoomLevel(document.getElementById('site').getZoomLevel()+0.5)").catch(() => {}));
ipcMain.on('zoom-out',   (e) => BrowserWindow.fromWebContents(e.sender).webContents
  .executeJavaScript("document.getElementById('site').setZoomLevel(document.getElementById('site').getZoomLevel()-0.5)").catch(() => {}));
ipcMain.on('zoom-reset', (e) => BrowserWindow.fromWebContents(e.sender).webContents
  .executeJavaScript("document.getElementById('site').setZoomLevel(0)").catch(() => {}));

// External links
ipcMain.on('open-external', (_e, url) => shell.openExternal(url));

// Notifications
ipcMain.on('show-notification', (_e, title, body) => {
  const iconFile = fs.existsSync(ICON_ICO) ? ICON_ICO
                 : fs.existsSync(ICON_PNG) ? ICON_PNG
                 : undefined;
  const n = new Notification({ title, body, ...(iconFile ? { icon: iconFile } : {}) });
  n.on('click', () => { if (win) { win.show(); win.focus(); } });
  n.show();
});

// Login startup
ipcMain.handle('get-login-startup', () => app.getLoginItemSettings().openAtLogin);
ipcMain.on('set-login-startup', (_e, val) => {
  app.setLoginItemSettings({ openAtLogin: val, path: app.getPath('exe') });
});

// App version
ipcMain.handle('get-version', () => app.getVersion());

// Custom themes — list
ipcMain.handle('themes-list', () => {
  try {
    if (!fs.existsSync(THEMES_DIR)) fs.mkdirSync(THEMES_DIR, { recursive: true });
    return fs.readdirSync(THEMES_DIR)
      .filter(f => f.endsWith('.css'))
      .map(f => ({ name: f.replace(/\.css$/i, ''), file: f }));
  } catch { return []; }
});

// Custom themes — read (path-traversal safe)
ipcMain.handle('themes-read', (_e, file) => {
  try {
    return fs.readFileSync(path.join(THEMES_DIR, path.basename(file)), 'utf8');
  } catch { return null; }
});

// Custom themes — open folder
ipcMain.handle('themes-open-folder', () => {
  if (!fs.existsSync(THEMES_DIR)) fs.mkdirSync(THEMES_DIR, { recursive: true });
  return shell.openPath(THEMES_DIR);
});

// ══════════════════════════════════════════════════════════════════════════════
// APP LIFECYCLE
// ══════════════════════════════════════════════════════════════════════════════
app.whenReady().then(() => {
  session.fromPartition('persist:main').setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  globalShortcut.register('CommandOrControl+Shift+K', () => {
    if (!win) return;
    win.isVisible() ? win.hide() : (win.show(), win.focus());
  });

  try { ensureThemesFolder(); } catch (err) { console.error('ensureThemesFolder failed:', err); }

  createWindow();
});

app.on('window-all-closed', () => { /* stay alive in tray on all platforms */ });
app.on('activate', () => { if (win) { win.show(); win.focus(); } });
app.on('will-quit', () => globalShortcut.unregisterAll());