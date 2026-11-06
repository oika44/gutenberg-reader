// 読書記録 CSV の読み書きで使う純粋な関数（electron/main.mjs から使う。テストは log-file.test.mjs）

const UTF8_ONLY_MESSAGE =
  '記録ファイルが UTF-8 ではないため読み書きしませんでした。' +
  'Excel で保存し直した場合は「CSV UTF-8（コンマ区切り）」で保存してください';

/**
 * 記録ファイルの中身（Buffer）を文字列にする。ファイルがなければ text: null。
 * UTF-8 として正しくなければ（Excel で Shift_JIS のまま保存し直したなど）ok: false を返す。
 * そのまま追記すると 1 つのファイルに文字コードが混ざるため。
 * @param {Uint8Array | null} buf
 * @returns {{ ok: true, text: string | null } | { ok: false, message: string }}
 */
export function decodeLogFile(buf) {
  if (buf === null) return { ok: true, text: null };
  try {
    // ignoreBOM: true で BOM を文字として残す（画面側の parseLog が取り除く）
    return {
      ok: true,
      text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buf),
    };
  } catch {
    return { ok: false, message: UTF8_ONLY_MESSAGE };
  }
}

/**
 * 1 行追記するときに書く内容を決める。
 * - ファイルがない、または中身が空（BOM・空白だけ）なら、見出し付きで書き直す（mode: 'write'）
 * - 末尾が改行でなければ（Excel などで保存し直した場合）、前の行とつながらないよう改行を足す
 * @param {string | null} current 今の中身。ファイルがなければ null
 * @param {string} header 見出し行（BOM 付き）
 * @param {string} line 追記する 1 行（改行なし）
 * @returns {{ mode: 'write' | 'append', text: string }}
 */
export function buildAppend(current, header, line) {
  if (current === null || current.replace(/^\uFEFF/, '').trim() === '') {
    return { mode: 'write', text: `${header}\r\n${line}\r\n` };
  }
  const prefix = current.endsWith('\n') ? '' : '\r\n';
  return { mode: 'append', text: `${prefix}${line}\r\n` };
}
