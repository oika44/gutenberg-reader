// electron/windows.mjs のテスト（npm run test:electron）
import { describe, expect, it } from 'vitest';
import { CATALOG_WINDOW, isBookId, shouldReuseWindow } from './windows.mjs';

describe('isBookId', () => {
  it.each([1, 1342])('%s は本の番号', (value) => {
    expect(isBookId(value)).toBe(true);
  });

  it.each([0, -1, 1.5, '1342', Number.NaN, null, 2 ** 60])('%s は本の番号ではない', (value) => {
    expect(isBookId(value)).toBe(false);
  });
});

describe('shouldReuseWindow', () => {
  it.each([null, undefined, { isDestroyed: () => true }])('%s は使い回さない', (win) => {
    expect(shouldReuseWindow(win)).toBe(false);
  });

  it('破棄されていなければ使い回す', () => {
    expect(shouldReuseWindow({ isDestroyed: () => false })).toBe(true);
  });
});

describe('CATALOG_WINDOW', () => {
  it('一覧ウインドウの設定', () => {
    expect(CATALOG_WINDOW).toEqual({
      url: 'app://local/catalog',
      width: 900,
      height: 700,
      minWidth: 640,
      minHeight: 480,
      title: 'Gutenberg 目録',
    });
  });
});
