import { CatalogEntry, searchCatalog } from './catalog';

/** ひらがな・カタカナ・漢字（々を含む） */
const JAPANESE = /[々぀-ヿ㐀-䶿一-鿿]/;

/** かっこ書き（例: " (1933 film)"・"（映画）"） */
const PARENTHESES = /\s*[(（][^)）]*[)）]/g;

/** 説明文（meta description）の訳の欄。【例文】などは使わない */
const DESCRIPTION_SECTION = /【(?:単語|英訳|対訳)】([^【]*)/g;

/** 先頭の冠詞（例: "a treasure island" の a。残すと題名に a が無い本に当たらない） */
const LEADING_ARTICLE = /^(?:a|an|the)\s+/i;

/** 説明文の訳の欄の中身。欄は "..." で終わるので、その手前で切って「, 」で区切る */
function descriptionCandidates(description: string): string[] {
  return [...description.matchAll(DESCRIPTION_SECTION)].flatMap(([, body]) =>
    body.split('...')[0].split(', '),
  );
}

/** 入力に日本語が含まれるか。含まれるなら英訳してから目録を検索する */
export function hasJapanese(text: string): boolean {
  return JAPANESE.test(text);
}

/**
 * Weblio の和英のページから、英訳の候補を取り出す。
 * 要約（.content-explanation、「、」区切り）のあとに、説明文の【単語】【英訳】【対訳】（「, 」区切り）を並べる。
 * 要約は固有名詞の辞書から取られ、「宝島」が Takarashima Island になるような誤訳があるため、説明文の訳も使う。
 * かっこ書きと先頭の冠詞を外し、大文字・小文字の違いだけの重複を 1 つにする。訳が無ければ空の配列。
 */
export function parseTranslations(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const summary = doc.querySelector('.content-explanation')?.textContent ?? '';
  const description = doc.querySelector('meta[name="description"]')?.getAttribute('content') ?? '';
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const part of [...summary.split('、'), ...descriptionCandidates(description)]) {
    const candidate = part
      .replace(PARENTHESES, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(LEADING_ARTICLE, '');
    const key = candidate.toLowerCase();
    if (candidate === '' || seen.has(key)) continue;
    seen.add(key);
    candidates.push(candidate);
  }
  return candidates;
}

/** 英訳の候補ごとに目録を検索し、見つかった本を候補の順に重複なしで合わせる */
export function searchByTranslations(
  entries: readonly CatalogEntry[],
  candidates: readonly string[],
  limit = 50,
): CatalogEntry[] {
  const found = new Map<number, CatalogEntry>();
  for (const candidate of candidates) {
    for (const entry of searchCatalog(entries, candidate, limit)) {
      if (found.size >= limit) return [...found.values()];
      found.set(entry.id, entry);
    }
  }
  return [...found.values()];
}
