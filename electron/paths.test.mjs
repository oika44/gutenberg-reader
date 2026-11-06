// electron/paths.mjs のテスト（npm run test:electron）
// パスは node:path で組み立て、Windows でも Linux でも同じように通るようにする
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isCsvPath,
  isFromApp,
  relayTarget,
  resolveStaticFile,
  withCsvExtension,
} from './paths.mjs';

describe('isFromApp', () => {
  it.each(['app://local/', 'app://local/index.html'])('自アプリの画面（%s）なら true', (url) => {
    expect(isFromApp(url)).toBe(true);
  });

  it.each(['https://evil.example/', 'app://localhost/', 'file:///index.html', '', undefined])(
    '自アプリ以外（%j）なら false',
    (url) => {
      expect(isFromApp(url)).toBe(false);
    },
  );
});

describe('isCsvPath', () => {
  it.each([resolve('log.csv'), resolve('LOG.CSV'), resolve('記録', '読書.csv')])(
    '.csv で終わる絶対パス（%s）なら true',
    (path) => {
      expect(isCsvPath(path)).toBe(true);
    },
  );

  it.each([
    ['相対パス', 'log.csv'],
    ['拡張子が違う', resolve('log.txt')],
    ['.csv の後ろに拡張子がある', resolve('log.csv.exe')],
    ['拡張子がない', resolve('log')],
    ['文字列でない（null）', null],
    ['文字列でない（数値）', 1],
    ['文字列でない（undefined）', undefined],
  ])('%s なら false', (_label, path) => {
    expect(isCsvPath(path)).toBe(false);
  });
});

describe('withCsvExtension', () => {
  it('拡張子がなければ .csv を付ける', () => {
    expect(withCsvExtension(resolve('log'))).toBe(resolve('log') + '.csv');
  });

  it.each([resolve('log.csv'), resolve('log.CSV')])('.csv（%s）ならそのまま', (path) => {
    expect(withCsvExtension(path)).toBe(path);
  });

  it('別の拡張子なら後ろに .csv を足す', () => {
    expect(withCsvExtension(resolve('log.txt'))).toBe(resolve('log.txt') + '.csv');
  });
});

describe('relayTarget', () => {
  it.each([
    [
      '/gutenberg/cache/epub/1342/pg1342.txt',
      'https://www.gutenberg.org/cache/epub/1342/pg1342.txt',
    ],
    ['/weblio/apple', 'https://ejje.weblio.jp/content/apple'],
    ["/weblio/don't", "https://ejje.weblio.jp/content/don't"],
  ])('%s → %s', (pathname, url) => {
    expect(relayTarget(pathname)).toBe(url);
  });

  it.each(['/', '/index.html', '/gutenbergx/1342', '/weblio'])(
    '中継しないパス（%s）は null',
    (pathname) => {
      expect(relayTarget(pathname)).toBeNull();
    },
  );
});

describe('resolveStaticFile', () => {
  const ROOT = resolve('dist', 'browser');
  const INDEX = join(ROOT, 'index.html');
  const files = new Set([INDEX, join(ROOT, 'main.js'), join(ROOT, 'media', 'font.woff2')]);
  const isFile = (path) => files.has(path);

  it('ある画面のファイルを返す', () => {
    expect(resolveStaticFile(ROOT, '/main.js', isFile)).toEqual({ file: join(ROOT, 'main.js') });
    expect(resolveStaticFile(ROOT, '/media/font.woff2', isFile)).toEqual({
      file: join(ROOT, 'media', 'font.woff2'),
    });
  });

  it('URL エンコードされた名前を戻してから探す', () => {
    files.add(join(ROOT, 'a b.js'));
    expect(resolveStaticFile(ROOT, '/a%20b.js', isFile)).toEqual({ file: join(ROOT, 'a b.js') });
  });

  it.each(['/', '/reader', '/media', '/media/'])(
    'ファイルでないパス（%s）は index.html を返す（画面の中のページ扱い）',
    (pathname) => {
      expect(resolveStaticFile(ROOT, pathname, isFile)).toEqual({ file: INDEX });
    },
  );

  it.each(['/..%2F..%2Fetc%2Fpasswd', '/%2E%2E/secret.txt', '/media/..%2F..%2Fa.js'])(
    'ROOT の外（%s）は 403',
    (pathname) => {
      expect(resolveStaticFile(ROOT, pathname, isFile)).toEqual({ status: 403 });
    },
  );

  it('ROOT と同じ名前で始まる隣のフォルダも 403（前方一致のすり抜けを防ぐ）', () => {
    // ROOT が .../browser のとき .../browser-old/a.js を読ませない
    expect(resolveStaticFile(ROOT, '/..%2Fbrowser-old%2Fa.js', isFile)).toEqual({ status: 403 });
  });

  it('壊れた URL エンコード（%E0 など）は例外にせず 400', () => {
    expect(resolveStaticFile(ROOT, '/%E0%A4%A.js', isFile)).toEqual({ status: 400 });
  });
});
