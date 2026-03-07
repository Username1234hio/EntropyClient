const { app, BrowserWindow, ipcMain, session } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    frame: false,
    resizable: true,
    minWidth: 400,
    minHeight: 300,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
    },
  });

  win.loadFile('overlay.html');

  // ── Auto updater ──────────────────────────────────
  autoUpdater.checkForUpdates();

  autoUpdater.on('update-available', () => {
    win.webContents.send('update-status', 'available');
  });
  autoUpdater.on('update-not-available', () => {
    win.webContents.send('update-status', 'uptodate');
  });
  autoUpdater.on('download-progress', (info) => {
    win.webContents.send('update-status', 'downloading', Math.floor(info.percent));
  });
  autoUpdater.on('update-downloaded', () => {
    win.webContents.send('update-status', 'ready');
  });
  autoUpdater.on('error', (err) => {
    win.webContents.send('update-status', 'error');
  });
}

ipcMain.on('win-minimize', (e) => BrowserWindow.fromWebContents(e.sender).minimize());
ipcMain.on('win-maximize', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  win.isMaximized() ? win.unmaximize() : win.maximize();
});
ipcMain.on('win-close', (e) => BrowserWindow.fromWebContents(e.sender).close());

// Updater IPC
ipcMain.on('update-check',   () => autoUpdater.checkForUpdates());
ipcMain.on('update-install', () => autoUpdater.quitAndInstall());

app.whenReady().then(() => {
  const ses = session.fromPartition('persist:main');
  ses.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });