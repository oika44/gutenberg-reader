// electron/catalog-file.mjs のテスト（npm run test:electron）
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  isCatalogJson,
  MAX_CATALOG_LENGTH,
  readCatalogFile,
  writeCatalogFile,
} from './catalog-file.mjs';

const VALID = JSON.stringify({
  fetchedAt: '2026-11-06',
  entries: [{ id: 1, title: 'a', author: 'b' }],
});

describe('isCatalogJson', () => {
  it('正しい形は true', () => {
    expect(isCatalogJson(VALID)).toBe(true);
  });

  it.each([
    ['壊れた JSON', '{'],
    ['配列', '[]'],
    ['entries が無い', '{"fetchedAt":"x"}'],
    ['fetchedAt が文字列でない', '{"fetchedAt":1,"entries":[]}'],
    ['entries が配列でない', '{"fetchedAt":"x","entries":{}}'],
    ['文字列でない（数値）', 123],
    ['文字列でない（null）', null],
    ['大きすぎる', 'x'.repeat(MAX_CATALOG_LENGTH + 1)],
  ])('%s は false', (_name, value) => {
    expect(isCatalogJson(value)).toBe(false);
  });
});

describe('readCatalogFile / writeCatalogFile', () => {
  let dir;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'catalog-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('ファイルが無ければ null', async () => {
    expect(await readCatalogFile(join(dir, 'catalog.json'))).toBeNull();
  });

  it('書いた内容を読み戻せる', async () => {
    const path = join(dir, 'catalog.json');
    await writeCatalogFile(path, VALID);
    expect(await readCatalogFile(path)).toBe(VALID);
  });

  it('既にあるファイルを置き換え、.tmp を残さない', async () => {
    const path = join(dir, 'catalog.json');
    await writeFile(path, 'old', 'utf8');
    await writeCatalogFile(path, VALID);
    expect(await readCatalogFile(path)).toBe(VALID);
    expect(existsSync(`${path}.tmp`)).toBe(false);
  });

  it('ENOENT 以外のエラーは投げる', async () => {
    // ディレクトリを読もうとすると EISDIR
    await expect(readCatalogFile(dir)).rejects.toThrow();
  });
});
