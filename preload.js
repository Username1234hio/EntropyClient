const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('win-minimize'),
  maximize: () => ipcRenderer.send('win-maximize'),
  close:    () => ipcRenderer.send('win-close'),

  // Updater
  checkForUpdate:  () => ipcRenderer.send('update-check'),
  installUpdate:   () => ipcRenderer.send('update-install'),
  onUpdateStatus:  (cb) => ipcRenderer.on('update-status', (_e, status, progress) => cb(status, progress)),
});