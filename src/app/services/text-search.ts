/** 行の一部。match が true なら検索語に一致した部分 */
export interface TextPart {
  text: string;
  match: boolean;
}

/** 検索語を含む 1 行 */
export interface SearchHit {
  /** 本文の 1 行目を 1 とする行番号 */
  line: number;
  parts: TextPart[];
}

export interface SearchResult {
  /** 先頭から最大 MAX_HITS 行 */
  hits: SearchHit[];
  /** 検索語を含む行の本当の数 */
  total: number;
}

/** 一覧に出す行の上限。多すぎると画面が重くなるため */
export const MAX_HITS = 500;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 検索語を含む行を探す。大文字と小文字は区別せず、検索語は文字どおりに扱う */
export function searchLines(lines: readonly string[], query: string): SearchResult {
  const word = query.trim();
  if (word === '') return { hits: [], total: 0 };
  // test() 用は g を付けない。g 付きで test() すると lastIndex が進み、matchAll が先頭の一致を飛ばす
  const finder = new RegExp(escapeRegExp(word), 'iu');
  const pattern = new RegExp(finder.source, 'giu');
  const hits: SearchHit[] = [];
  let total = 0;
  lines.forEach((text, i) => {
    if (!finder.test(text)) return;
    total++;
    if (hits.length < MAX_HITS) hits.push({ line: i + 1, parts: splitByMatch(text, pattern) });
  });
  return { hits, total };
}

function splitByMatch(text: string, pattern: RegExp): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), match: false });
    parts.push({ text: m[0], match: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), match: false });
  return parts;
}
