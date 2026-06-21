const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  openOutputFolder: () => ipcRenderer.invoke('open-output-folder'),
  onUpdateReady: (callback) => ipcRenderer.on('update-ready', (_e, info) => callback(info)),
  restartAndInstallUpdate: () => ipcRenderer.send('restart-and-install-update'),
});
