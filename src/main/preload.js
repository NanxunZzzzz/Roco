const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getWindowList: () => ipcRenderer.invoke('get-window-list'),
    getWindowInfo: (hwnd) => ipcRenderer.invoke('get-window-info', hwnd),
    captureRegion: (region) => ipcRenderer.invoke('capture-region', region),
    getScreenSize: () => ipcRenderer.invoke('get-screen-size'),
    startRegionSelection: (targetWindow) => ipcRenderer.invoke('start-region-selection', targetWindow),
    autoCalculateRegions: (windowInfo) => ipcRenderer.invoke('auto-calculate-regions', windowInfo),
    openRegionEditor: (regions, windowInfo) => ipcRenderer.invoke('open-region-editor', regions, windowInfo),
    getTemplateDir: () => ipcRenderer.invoke('get-template-dir'),
    getTemplateList: () => ipcRenderer.invoke('get-template-list'),
    openTemplateDir: () => ipcRenderer.invoke('open-template-dir'),
    recognizeText: (imageBase64) => ipcRenderer.invoke('recognize-text', imageBase64),
    sendSelectionComplete: (region) => ipcRenderer.send('selection-complete', region),
    sendSelectionCancelled: () => ipcRenderer.send('selection-cancelled'),
    requestRegions: () => ipcRenderer.send('request-regions'),
    receiveRegions: (callback) => ipcRenderer.on('send-regions', callback),
    confirmRegions: (regions) => ipcRenderer.send('confirm-regions', regions),
    cancelRegions: () => ipcRenderer.send('cancel-regions'),
    resetRegions: () => ipcRenderer.send('reset-regions'),
    sendRegionEditorReady: () => ipcRenderer.send('region-editor-ready')
});
