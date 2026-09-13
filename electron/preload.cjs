const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('calil', {
  loadState: () => ipcRenderer.invoke('state:load'),
  setStar: (isbn, rate) => ipcRenderer.invoke('state:set-star', { isbn, rate }),
  saveOptions: (options) => ipcRenderer.invoke('state:save-options', options),
  clearLocalData: () => ipcRenderer.invoke('state:clear-local'),
  openLogin: () => ipcRenderer.invoke('calil:open-login'),
  checkLogin: () => ipcRenderer.invoke('calil:check-login'),
  syncWishlist: () => ipcRenderer.invoke('calil:sync-wishlist'),
  checkAvailability: (isbns, systemIds) =>
    ipcRenderer.invoke('calil:check-availability', { isbns, systemIds }),
  moveBooks: (isbns, destination) =>
    ipcRenderer.invoke('calil:move-books', { isbns, destination }),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  openReservePage: (isbn, systemId) => ipcRenderer.invoke('app:open-reserve', { isbn, systemId }),
  openLogs: () => ipcRenderer.invoke('app:open-logs'),
  logRendererError: (details) => ipcRenderer.send('log:renderer-error', details),
  onProgress: (callback) => {
    const listener = (_event, progress) => callback(progress)
    ipcRenderer.on('calil:progress', listener)
    return () => ipcRenderer.removeListener('calil:progress', listener)
  },
  onAvailabilityUpdate: (callback) => {
    const listener = (_event, update) => callback(update)
    ipcRenderer.on('calil:availability-update', listener)
    return () => ipcRenderer.removeListener('calil:availability-update', listener)
  },
  onNdcUpdate: (callback) => {
    const listener = (_event, update) => callback(update)
    ipcRenderer.on('calil:ndc-update', listener)
    return () => ipcRenderer.removeListener('calil:ndc-update', listener)
  },
})
