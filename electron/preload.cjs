// 画面 (Angular) から記録ファイルの読み書きを呼び出すための窓口
// 型は src/app/services/desktop-bridge.service.ts の GutenbergDesktop
// sandbox 有効のプリロードは ESM が使えないため CommonJS で書く
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gutenbergDesktop', {
  getLogPath: () => ipcRenderer.invoke('log:get-path'),
  chooseLogPath: () => ipcRenderer.invoke('log:choose'),
  // 読めないとき（UTF-8 でないなど）は理由をメッセージにした Error を投げる
  readLog: async (path) => {
    const result = await ipcRenderer.invoke('log:read', path);
    if (!result.ok) throw new Error(result.message);
    return result.text;
  },
  appendLog: (path, header, line) => ipcRenderer.invoke('log:append', path, header, line),
  // 目録（catalog.json）。ファイルが無ければ null。読めないときは理由をメッセージにした Error を投げる
  readCatalog: async () => {
    const result = await ipcRenderer.invoke('catalog:read');
    if (!result.ok) throw new Error(result.message);
    return result.text;
  },
  writeCatalog: (json) => ipcRenderer.invoke('catalog:write', json),
  saveFile: (defaultName, data) => ipcRenderer.invoke('file:save', defaultName, data),
  openCatalogWindow: () => ipcRenderer.invoke('catalog:open-window'),
  openBookInReader: (id) => ipcRenderer.invoke('reader:request-open', id),
  // main から届く本の番号を受け取る。戻り値の関数で購読を解除する
  onOpenBook: (callback) => {
    const listener = (_event, id) => {
      // electron/windows.mjs の isBookId と同じ条件（preload は ESM を import できない）
      if (Number.isSafeInteger(id) && id >= 1) callback(id);
    };
    ipcRenderer.on('reader:open-book', listener);
    return () => ipcRenderer.removeListener('reader:open-book', listener);
  },
});
