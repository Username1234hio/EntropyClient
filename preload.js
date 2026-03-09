const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize:  () => ipcRenderer.send('win-minimize'),
  maximize:  () => ipcRenderer.send('win-maximize'),
  close:     () => ipcRenderer.send('win-close'),

  // Navigation
  navBack:    () => ipcRenderer.send('nav-back'),
  navForward: () => ipcRenderer.send('nav-forward'),
  navReload:  () => ipcRenderer.send('nav-reload'),

  // Zoom
  zoomIn:    () => ipcRenderer.send('zoom-in'),
  zoomOut:   () => ipcRenderer.send('zoom-out'),
  zoomReset: () => ipcRenderer.send('zoom-reset'),

  // Updater
  checkForUpdate: () => ipcRenderer.send('update-check'),
  installUpdate:  () => ipcRenderer.send('update-install'),
  onUpdateStatus: (cb) => ipcRenderer.on('update-status', (_e, status, progress) => cb(status, progress)),

  // Notifications
  showNotification: (title, body) => ipcRenderer.send('show-notification', title, body),

  // Startup
  getLoginStartup: ()    => ipcRenderer.invoke('get-login-startup'),
  setLoginStartup: (val) => ipcRenderer.send('set-login-startup', val),

  // App info
  getVersion: () => ipcRenderer.invoke('get-version'),

  // External links
  openExternal: (url) => ipcRenderer.send('open-external', url),

  // Custom themes folder
  themesList:       ()       => ipcRenderer.invoke('themes-list'),
  themesRead:       (file)   => ipcRenderer.invoke('themes-read', file),
  themesOpenFolder: ()       => ipcRenderer.invoke('themes-open-folder'),
});