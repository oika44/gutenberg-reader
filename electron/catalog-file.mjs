// 目録（catalog.json）の検査と読み書きで使う関数（electron/main.mjs から使う。テストは catalog-file.test.mjs）
import { readFile, rename, writeFile } from 'node:fs/promises';

/** 目録 JSON の最大文字数。想定より大きいものは書かない */
export const MAX_CATALOG_LENGTH = 50 * 1024 * 1024;

/**
 * 目録として保存してよい文字列か。
 * 文字列で、大きすぎず、JSON として読め、fetchedAt が文字列・entries が配列のオブジェクトであること。
 * @param {unknown} text
 * @returns {boolean}
 */
export function isCatalogJson(text) {
  if (typeof text !== 'string' || text.length > MAX_CATALOG_LENGTH) return false;
  try {
    const value = JSON.parse(text);
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof value.fetchedAt === 'string' &&
      Array.isArray(value.entries)
    );
  } catch {
    return false;
  }
}

/**
 * 目録ファイルの中身。ファイルがなければ null。それ以外のエラーは投げる。
 * @param {string} path
 * @returns {Promise<string | null>}
 */
export async function readCatalogFile(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * 目録を書く。途中で失敗しても元のファイルを壊さないよう、
 * 一時ファイルに書いてから置き換える。
 * @param {string} path
 * @param {string} text
 * @returns {Promise<void>}
 */
export async function writeCatalogFile(path, text) {
  const tmpPath = `${path}.tmp`;
  await writeFile(tmpPath, text, 'utf8');
  await rename(tmpPath, path);
}
