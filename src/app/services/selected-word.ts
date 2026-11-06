/**
 * ダブルクリックで選ばれた文字列から、調べる単語を取り出す。
 * 前後の記号（引用符・句読点など）を落とす。空、または複数語なら null。
 */
export function normalizeSelectedWord(text: string): string | null {
  const word = text.trim().replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
  return word === '' || /\s/.test(word) ? null : word;
}
