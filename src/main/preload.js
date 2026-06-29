const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('trackDesk', {
  bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    hide: () => ipcRenderer.invoke('window:hide')
  },
  auth: {
    sendOtp: (email) => ipcRenderer.invoke('auth:send-otp', email),
    resendOtp: (email) => ipcRenderer.invoke('auth:resend-otp', email),
    verifyOtp: (payload) => ipcRenderer.invoke('auth:verify-otp', payload),
    logout: () => ipcRenderer.invoke('auth:logout')
  },
  tasks: {
    refresh: () => ipcRenderer.invoke('tasks:refresh')
  },
  timer: {
    start: (taskId) => ipcRenderer.invoke('timer:start', taskId),
    pause: () => ipcRenderer.invoke('timer:pause'),
    stop: () => ipcRenderer.invoke('timer:stop'),
    onUpdated: (callback) => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on('timer:updated', listener);
      return () => ipcRenderer.removeListener('timer:updated', listener);
    }
  },
  sync: {
    run: () => ipcRenderer.invoke('sync:run'),
    onUpdated: (callback) => {
      const listener = (_event, status) => callback(status);
      ipcRenderer.on('sync:updated', listener);
      return () => ipcRenderer.removeListener('sync:updated', listener);
    }
  },
  admin: {
    exit: (password) => ipcRenderer.invoke('admin:exit', password)
  }
});
