const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  login: (email, password) => ipcRenderer.invoke('do-login', { email, password }),
  onLoginError: (cb) => ipcRenderer.on('login-error', cb),
});

