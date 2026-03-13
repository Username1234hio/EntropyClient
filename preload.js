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

  // Emoji stash
  emojiSave:       (data)   => ipcRenderer.invoke('emoji-save', data),
  emojiList:       ()       => ipcRenderer.invoke('emoji-list'),
  emojiDelete:     (id)     => ipcRenderer.invoke('emoji-delete', id),
  emojiRename:     (id, n)  => ipcRenderer.invoke('emoji-rename', { id, newName: n }),
  emojiOpenFolder: ()       => ipcRenderer.invoke('emoji-open-folder'),


  // Profile API (proxied through main to avoid file:// CORS restrictions)
  profileApi: (opts) => ipcRenderer.invoke('profile-api', opts),

  // Splash GIF folder
  splashSaveGif:    (data)     => ipcRenderer.invoke('splash-save-gif', data),
  splashDeleteGif:  (filePath) => ipcRenderer.invoke('splash-delete-gif', filePath),
  splashOpenFolder: ()         => ipcRenderer.invoke('splash-open-folder'),
  splashFetchUrl:   (url)      => ipcRenderer.invoke('splash-fetch-url', url),
  splashScanFolder: ()         => ipcRenderer.invoke('splash-scan-folder'),

  // Addons
  addonsList:       ()     => ipcRenderer.invoke('addons-list'),
  addonsOpenFolder: ()     => ipcRenderer.invoke('addons-open-folder'),

  // Key intercepts (keys Electron swallows before the renderer sees them)
  onKeyF2: (cb) => ipcRenderer.on('key-f2', () => cb()),

  // Window fullscreen
  setFullScreen: (val) => ipcRenderer.send('win-set-fullscreen', val),

  // Account switcher
  switchAccount: (partition) => ipcRenderer.invoke('switch-account', { partition }),
});