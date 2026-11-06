// electron/preload.cjs のテスト（npm run test:electron）
// preload.cjs は require('electron') を使う CommonJS なので、偽の require を渡して実行する
// （new Function で実行するのはリポジトリ内の preload.cjs だけ。外から来た文字列は使わない）
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SOURCE = readFileSync(join(import.meta.dirname, 'preload.cjs'), 'utf8');

/** preload.cjs を実行し、画面に公開された API と ipcRenderer.invoke の偽物を返す */
function loadPreload() {
  const exposed = {};
  const invoke = vi.fn(async () => undefined);
  const on = vi.fn();
  const removeListener = vi.fn();
  const electron = {
    contextBridge: { exposeInMainWorld: (name, api) => (exposed[name] = api) },
    ipcRenderer: { invoke, on, removeListener },
  };
  new Function('require', SOURCE)((name) => {
    if (name !== 'electron') throw new Error(`想定外の require: ${name}`);
    return electron;
  });
  return { api: exposed.gutenbergDesktop, invoke, on, removeListener, exposed };
}

describe('preload.cjs', () => {
  let api;
  let invoke;
  let on;
  let removeListener;

  beforeEach(() => {
    ({ api, invoke, on, removeListener } = loadPreload());
  });

  it('window.gutenbergDesktop の名前だけで公開する', () => {
    expect(Object.keys(loadPreload().exposed)).toEqual(['gutenbergDesktop']);
  });

  it('画面の型（GutenbergDesktop）と同じ関数をそろえる', () => {
    expect(Object.keys(api).sort()).toEqual(
      [
        'appendLog',
        'chooseLogPath',
        'getLogPath',
        'onOpenBook',
        'openBookInReader',
        'openCatalogWindow',
        'readCatalog',
        'readLog',
        'saveFile',
        'writeCatalog',
      ].sort(),
    );
  });

  it.each([
    ['getLogPath', [], ['log:get-path']],
    ['chooseLogPath', [], ['log:choose']],
    ['appendLog', ['/a.csv', 'h', 'l'], ['log:append', '/a.csv', 'h', 'l']],
    ['writeCatalog', ['j'], ['catalog:write', 'j']],
    ['saveFile', ['p.csv', new Uint8Array([1])], ['file:save', 'p.csv', new Uint8Array([1])]],
  ])('%s は main のチャンネルに引数をそのまま渡す', async (name, args, expected) => {
    invoke.mockResolvedValue('結果');
    expect(await api[name](...args)).toBe('結果');
    expect(invoke).toHaveBeenCalledExactlyOnceWith(...expected);
  });

  it('readLog: 読めたら中身を返す', async () => {
    invoke.mockResolvedValue({ ok: true, text: '記録日時\r\n' });
    expect(await api.readLog('/a.csv')).toBe('記録日時\r\n');
    expect(invoke).toHaveBeenCalledWith('log:read', '/a.csv');
  });

  it('readLog: ファイルが無ければ null', async () => {
    invoke.mockResolvedValue({ ok: true, text: null });
    expect(await api.readLog('/a.csv')).toBeNull();
  });

  it('readLog: 読めなければ理由をメッセージにした Error を投げる', async () => {
    invoke.mockResolvedValue({ ok: false, message: '記録ファイルが UTF-8 ではないため…' });
    await expect(api.readLog('/a.csv')).rejects.toThrow('記録ファイルが UTF-8 ではないため…');
  });

  it('readCatalog: 読めたら中身を返す（無ければ null）', async () => {
    invoke.mockResolvedValue({ ok: true, text: 'x' });
    expect(await api.readCatalog()).toBe('x');
    expect(invoke).toHaveBeenCalledWith('catalog:read');
    invoke.mockResolvedValue({ ok: true, text: null });
    expect(await api.readCatalog()).toBeNull();
  });

  it('readCatalog: 読めなければ理由をメッセージにした Error を投げる', async () => {
    invoke.mockResolvedValue({ ok: false, message: 'm' });
    await expect(api.readCatalog()).rejects.toThrow('m');
  });

  it('openCatalogWindow: catalog:open-window を呼ぶ', async () => {
    await api.openCatalogWindow();
    expect(invoke).toHaveBeenCalledExactlyOnceWith('catalog:open-window');
  });

  it('openBookInReader: 結果をそのまま返す', async () => {
    invoke.mockResolvedValue({ ok: false, message: 'm' });
    expect(await api.openBookInReader(1342)).toEqual({ ok: false, message: 'm' });
    expect(invoke).toHaveBeenCalledExactlyOnceWith('reader:request-open', 1342);
  });

  describe('onOpenBook', () => {
    it('reader:open-book を購読し、本の番号だけ callback に渡す', () => {
      const callback = vi.fn();
      api.onOpenBook(callback);
      expect(on).toHaveBeenCalledExactlyOnceWith('reader:open-book', expect.any(Function));
      const listener = on.mock.calls[0][1];
      listener({}, 1342);
      expect(callback).toHaveBeenCalledExactlyOnceWith(1342);
      listener({}, '1342');
      listener({}, -1);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('戻り値の関数で購読を解除する', () => {
      const unsubscribe = api.onOpenBook(vi.fn());
      const listener = on.mock.calls[0][1];
      unsubscribe();
      expect(removeListener).toHaveBeenCalledExactlyOnceWith('reader:open-book', listener);
    });
  });
});
