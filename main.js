const { app, BrowserWindow, ipcMain, session, Tray, Menu, nativeImage, shell, Notification } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs   = require('fs');

// ── Persist window bounds ─────────────────────────────────────────────────────
const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { width: 1280, height: 800, x: undefined, y: undefined }; }
}

function saveWindowState(win) {
  if (win.isMaximized() || win.isMinimized()) return;
  const b = win.getBounds();
  fs.writeFileSync(STATE_FILE, JSON.stringify(b));
}

// ── Globals ───────────────────────────────────────────────────────────────────
let win  = null;
let tray = null;

// ── Create main window ────────────────────────────────────────────────────────
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
    show:      false, // show after splash
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      nodeIntegration:  false,
      contextIsolation: true,
      webviewTag:       true,
    },
  });

  win.loadFile('overlay.html');

  // Show after load (no white flash)
  win.once('ready-to-show', () => win.show());

  // Save bounds on resize/move
  win.on('resize', () => saveWindowState(win));
  win.on('move',   () => saveWindowState(win));

  // Minimize to tray instead of closing
  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
      if (process.platform === 'darwin') app.dock.hide();
    }
  });

  // ── Auto updater ────────────────────────────────
  autoUpdater.checkForUpdates().catch(() => {});

  autoUpdater.on('update-available',    ()     => win.webContents.send('update-status', 'available'));
  autoUpdater.on('update-not-available',()     => win.webContents.send('update-status', 'uptodate'));
  autoUpdater.on('download-progress',   (info) => win.webContents.send('update-status', 'downloading', Math.floor(info.percent)));
  autoUpdater.on('update-downloaded',   ()     => win.webContents.send('update-status', 'ready'));
  autoUpdater.on('error',               ()     => win.webContents.send('update-status', 'error'));

  // ── Tray ─────────────────────────────────────────
  createTray();
}

// ── Tray ──────────────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, 'icon.ico');
  const img      = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();

  tray = new Tray(img);
  tray.setToolTip('Entropy Client');

  const menu = Menu.buildFromTemplate([
    { label: 'Open Entropy Client',      click: () => { win.show(); win.focus(); } },
    { type: 'separator' },
    { label: 'Check for updates', click: () => { win.show(); autoUpdater.checkForUpdates().catch(() => {}); } },
    { type: 'separator' },
    { label: 'Quit',            click: () => { app.isQuitting = true; app.quit(); } },
  ]);

  tray.setContextMenu(menu);
  tray.on('double-click', () => { win.show(); win.focus(); });
}

// ── IPC: window controls ──────────────────────────────────────────────────────
ipcMain.on('win-minimize', (e) => BrowserWindow.fromWebContents(e.sender).minimize());
ipcMain.on('win-maximize', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  w.isMaximized() ? w.unmaximize() : w.maximize();
});
ipcMain.on('win-close', () => win.hide()); // hide to tray

// ── IPC: updater ──────────────────────────────────────────────────────────────
ipcMain.on('update-check',   () => autoUpdater.checkForUpdates().catch(() => {}));
ipcMain.on('update-install', () => { app.isQuitting = true; autoUpdater.quitAndInstall(); });

// ── IPC: navigation ───────────────────────────────────────────────────────────
ipcMain.on('nav-back',    (e) => BrowserWindow.fromWebContents(e.sender).webContents.executeJavaScript(`document.getElementById('site').goBack()`));
ipcMain.on('nav-forward', (e) => BrowserWindow.fromWebContents(e.sender).webContents.executeJavaScript(`document.getElementById('site').goForward()`));
ipcMain.on('nav-reload',  (e) => BrowserWindow.fromWebContents(e.sender).webContents.executeJavaScript(`document.getElementById('site').reload()`));

// ── IPC: zoom ─────────────────────────────────────────────────────────────────
ipcMain.on('zoom-in',    (e) => BrowserWindow.fromWebContents(e.sender).webContents.executeJavaScript(`document.getElementById('site').setZoomLevel(document.getElementById('site').getZoomLevel()+0.5)`));
ipcMain.on('zoom-out',   (e) => BrowserWindow.fromWebContents(e.sender).webContents.executeJavaScript(`document.getElementById('site').setZoomLevel(document.getElementById('site').getZoomLevel()-0.5)`));
ipcMain.on('zoom-reset', (e) => BrowserWindow.fromWebContents(e.sender).webContents.executeJavaScript(`document.getElementById('site').setZoomLevel(0)`));

// ── IPC: open external links ──────────────────────────────────────────────────
ipcMain.on('open-external', (_e, url) => shell.openExternal(url));

// ── IPC: notifications ────────────────────────────────────────────────────────
ipcMain.on('show-notification', (_e, title, body) => {
  const n = new Notification({ title, body, icon: path.join(__dirname, 'icon.ico') });
  n.on('click', () => { win.show(); win.focus(); });
  n.show();
});

// ── IPC: startup on login ─────────────────────────────────────────────────────
ipcMain.handle('get-login-startup', () => app.getLoginItemSettings().openAtLogin);
ipcMain.on('set-login-startup', (_e, val) => {
  app.setLoginItemSettings({ openAtLogin: val, path: app.getPath('exe') });
});

// ── IPC: get app version ──────────────────────────────────────────────────────
ipcMain.handle('get-version', () => app.getVersion());

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  const ses = session.fromPartition('persist:main');
  ses.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  // Register global shortcut Ctrl+Shift+K to toggle window
  const { globalShortcut } = require('electron');
  globalShortcut.register('CommandOrControl+Shift+K', () => {
    if (win.isVisible()) { win.hide(); }
    else { win.show(); win.focus(); }
  });

  createWindow();
});

app.on('window-all-closed', () => { /* keep alive in tray */ });
app.on('activate', () => { win.show(); });
app.on('will-quit', () => {
  const { globalShortcut } = require('electron');
  globalShortcut.unregisterAll();
});