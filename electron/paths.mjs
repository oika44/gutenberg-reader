// URL・ファイルパスの判定（electron/main.mjs から使う純粋な関数。テストは paths.test.mjs）
import { extname, isAbsolute, join, normalize, sep } from 'node:path';

const APP_ORIGIN = 'app://local/';

/** 中継先。app://local/<前置き><残り> を <転送先><残り> に送る */
const RELAYS = [
  { prefix: '/gutenberg/', target: 'https://www.gutenberg.org/' },
  { prefix: '/weblio/', target: 'https://ejje.weblio.jp/content/' },
];

/**
 * 呼び出し元のフレームの URL が自アプリの画面か。
 * @param {string | undefined} url
 */
export function isFromApp(url) {
  return typeof url === 'string' && url.startsWith(APP_ORIGIN);
}

/**
 * 画面から任意のファイルを書き換えられないよう、対象は .csv で終わる絶対パスに限る。
 * @param {unknown} path
 */
export function isCsvPath(path) {
  return typeof path === 'string' && isAbsolute(path) && extname(path).toLowerCase() === '.csv';
}

/**
 * 保存ダイアログで拡張子を付けずに名前を入れたときに .csv を付ける。
 * @param {string} filePath
 */
export function withCsvExtension(filePath) {
  return extname(filePath).toLowerCase() === '.csv' ? filePath : filePath + '.csv';
}

/**
 * 中継する外部サイトの URL。中継しないパスなら null。
 * @param {string} pathname app://local/ の URL のパス部分
 * @returns {string | null}
 */
export function relayTarget(pathname) {
  const relay = RELAYS.find(({ prefix }) => pathname.startsWith(prefix));
  return relay ? relay.target + pathname.slice(relay.prefix.length) : null;
}

/**
 * app://local/ の URL のパスから、返す画面のファイルを決める。
 * - ROOT の外を指すなら 403（..%2F などで外のファイルを読ませない）
 * - URL エンコードが壊れていれば 400（decodeURIComponent の例外で要求ごと失敗させない）
 * - ファイルが無ければ index.html（画面の中のページとして Angular に任せる）
 * @param {string} root 画面のビルド結果のフォルダ（絶対パス）
 * @param {string} pathname
 * @param {(path: string) => boolean} isFile
 * @returns {{ file: string } | { status: 400 | 403 }}
 */
export function resolveStaticFile(root, pathname, isFile) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return { status: 400 };
  }
  const file = normalize(join(root, decoded));
  if (!file.startsWith(root + sep)) return { status: 403 };
  return { file: isFile(file) ? file : join(root, 'index.html') };
}
