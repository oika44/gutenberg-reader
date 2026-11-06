// Gutenberg 読書記録アプリの Electron エントリ
// - ビルド済みの画面 (dist/gutenberg-reader/browser) を独自スキーム app://local/ で配信する
// - app://local/gutenberg/... を https://www.gutenberg.org/... に、
//   app://local/weblio/<単語> を https://ejje.weblio.jp/content/<単語> に中継する (CORS 回避)
// - 読書記録 CSV の読み込み・追記と、P-Study 用 CSV の保存を行う (preload.cjs 経由)
import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell } from 'electron';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isCatalogJson, readCatalogFile, writeCatalogFile } from './catalog-file.mjs';
import { buildAppend, decodeLogFile } from './log-file.mjs';
import {
  isCsvPath,
  isFromApp,
  relayTarget,
  resolveStaticFile,
  withCsvExtension,
} from './paths.mjs';
import { relay } from './relay.mjs';
import { CATALOG_WINDOW, isBookId, shouldReuseWindow } from './windows.mjs';

const ROOT = join(import.meta.dirname, '..', 'dist', 'gutenberg-reader', 'browser');
/** 開いている読書ウインドウ・一覧ウインドウ（閉じたら null） */
let readerWindow = null;
let catalogWindow = null;

const SETTINGS_FILE = join(app.getPath('userData'), 'settings.json');
const CATALOG_FILE = join(app.getPath('userData'), 'catalog.json');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function isFile(path) {
  return statSync(path, { throwIfNoEntry: false })?.isFile() ?? false;
}

function handleRequest(req) {
  const { pathname } = new URL(req.url);
  const target = relayTarget(pathname);
  if (target !== null) return relay((url) => net.fetch(url), target);

  const resolved = resolveStaticFile(ROOT, pathname, isFile);
  if ('status' in resolved) return new Response(null, { status: resolved.status });
  return net.fetch(pathToFileURL(resolved.file).toString());
}

/** 自アプリの画面以外からの呼び出しを拒否する */
function fromApp(event) {
  return isFromApp(event.senderFrame?.url);
}

/**
 * 設定（記録ファイルのパス）を読む。
 * 初回起動でファイルがない、または壊れているときは「未設定」として {} を返す。
 * 失われるのは記録ファイルのパスだけで、最初の記録のときに選び直せる（記録 CSV 自体は消えない）ため、
 * エラーにして起動を止めるより、選び直してもらうほうがよい。
 */
function loadSettings() {
  try {
    return JSON.parse(readFileSync(SETTINGS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveSettings(settings) {
  writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

/** 記録ファイルの中身。ファイルがなければ null */
async function readLogBuffer(path) {
  try {
    return await readFile(path);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function errorMessage(err) {
  return `書き込めませんでした（${err.code ?? err.message}）`;
}

function registerHandlers() {
  ipcMain.handle('log:get-path', (event) => {
    if (!fromApp(event)) return null;
    const { logPath } = loadSettings();
    return isCsvPath(logPath) ? logPath : null;
  });

  ipcMain.handle('log:choose', async (event) => {
    if (!fromApp(event)) return null;
    const win = BrowserWindow.fromWebContents(event.sender);
    const current = loadSettings().logPath;
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: '読書記録の保存先',
      defaultPath: isCsvPath(current)
        ? current
        : join(app.getPath('documents'), 'gutenberg-reading-log.csv'),
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (canceled || !filePath) return null;
    const path = withCsvExtension(filePath);
    saveSettings({ ...loadSettings(), logPath: path });
    return path;
  });

  // 戻り値: { ok: true, text: string | null }（ファイルがなければ null）| { ok: false, message }
  ipcMain.handle('log:read', async (event, path) => {
    if (!fromApp(event) || !isCsvPath(path)) return { ok: false, message: '不正な呼び出しです' };
    try {
      return decodeLogFile(await readLogBuffer(path));
    } catch (err) {
      return { ok: false, message: `読み込めませんでした（${err.code ?? err.message}）` };
    }
  });

  ipcMain.handle('log:append', async (event, path, header, line) => {
    if (!fromApp(event) || typeof header !== 'string' || typeof line !== 'string') {
      return { ok: false, message: '不正な呼び出しです' };
    }
    if (!isCsvPath(path))
      return { ok: false, message: '記録ファイルは .csv の絶対パスにしてください' };
    try {
      const decoded = decodeLogFile(await readLogBuffer(path));
      if (!decoded.ok) return decoded;
      const { mode, text } = buildAppend(decoded.text, header, line);
      if (mode === 'write') await writeFile(path, text, 'utf8');
      else await appendFile(path, text, 'utf8');
      return { ok: true };
    } catch (err) {
      return { ok: false, message: errorMessage(err) };
    }
  });

  // 戻り値: { ok: true, text: string | null }（ファイルがなければ null）| { ok: false, message }
  ipcMain.handle('catalog:read', async (event) => {
    if (!fromApp(event)) return { ok: false, message: '不正な呼び出しです' };
    try {
      return { ok: true, text: await readCatalogFile(CATALOG_FILE) };
    } catch (err) {
      return { ok: false, message: `目録を読み込めませんでした（${err.code ?? err.message}）` };
    }
  });

  ipcMain.handle('catalog:write', async (event, text) => {
    if (!fromApp(event) || !isCatalogJson(text)) {
      return { ok: false, message: '不正な呼び出しです' };
    }
    try {
      await writeCatalogFile(CATALOG_FILE, text);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: `目録を保存できませんでした（${err.code ?? err.message}）` };
    }
  });

  ipcMain.handle('catalog:open-window', (event) => {
    if (!fromApp(event)) return;
    if (shouldReuseWindow(catalogWindow)) bringToFront(catalogWindow);
    else createCatalogWindow();
  });

  // 一覧から読書ウインドウに本を開かせる
  ipcMain.handle('reader:request-open', (event, id) => {
    if (!fromApp(event) || !isBookId(id)) return { ok: false, message: '不正な呼び出しです' };
    if (!shouldReuseWindow(readerWindow)) {
      return { ok: false, message: '読書画面が開いていません' };
    }
    readerWindow.webContents.send('reader:open-book', id);
    bringToFront(readerWindow);
    return { ok: true };
  });

  ipcMain.handle('file:save', async (event, defaultName, data) => {
    if (!fromApp(event) || typeof defaultName !== 'string' || !(data instanceof Uint8Array)) {
      return { ok: false, message: '不正な呼び出しです' };
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'P-Study 用 CSV の保存先',
      defaultPath: join(app.getPath('documents'), defaultName),
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (canceled || !filePath) return null;
    const path = withCsvExtension(filePath);
    try {
      await writeFile(path, data);
      return { ok: true, path };
    } catch (err) {
      return { ok: false, message: errorMessage(err) };
    }
  });
}

function buildMenu() {
  return Menu.buildFromTemplate([
    {
      label: '表示',
      submenu: [
        { role: 'reload', label: '再読み込み' },
        { role: 'toggleDevTools', label: '開発者ツール' },
        { type: 'separator' },
        { role: 'zoomIn', label: '拡大' },
        { role: 'zoomOut', label: '縮小' },
        { role: 'resetZoom', label: '元の大きさ' },
      ],
    },
    { role: 'quit', label: '終了' },
  ]);
}

/** 最小化を戻して前に出す */
function bringToFront(win) {
  if (win.isMinimized()) win.restore();
  win.focus();
}

/** 読書ウインドウと一覧ウインドウに共通の作り方 */
function createWindow({ url, title, width, height, minWidth, minHeight }) {
  const win = new BrowserWindow({
    width,
    height,
    minWidth,
    minHeight,
    title,
    autoHideMenuBar: true, // Alt キーでメニューを表示
    webPreferences: { sandbox: true, preload: join(import.meta.dirname, 'preload.cjs') },
  });
  win.setMenu(buildMenu());
  win.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    shell.openExternal(openUrl);
    return { action: 'deny' };
  });
  win.loadURL(url);
  return win;
}

function createReaderWindow() {
  const win = createWindow({
    url: 'app://local/',
    title: 'Gutenberg 読書記録',
    width: 1100,
    height: 800,
    minWidth: 640,
    minHeight: 480,
  });
  readerWindow = win;
  win.on('closed', () => {
    if (readerWindow === win) readerWindow = null;
  });
}

function createCatalogWindow() {
  const win = createWindow(CATALOG_WINDOW);
  catalogWindow = win;
  win.on('closed', () => {
    if (catalogWindow === win) catalogWindow = null;
  });
}

app.whenReady().then(() => {
  if (!existsSync(join(ROOT, 'index.html'))) {
    console.error(`画面のビルドが見つかりません: ${ROOT}\n先に npx ng build を実行してください。`);
    app.exit(1);
    return;
  }
  protocol.handle('app', handleRequest);
  registerHandlers();
  createReaderWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createReaderWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
