import { CatalogEntry, searchCatalog } from './catalog';

/** 一覧の並べ替えの種類 */
export type CatalogSort = 'id' | 'title' | 'author';

/** 分類ごとの冊数 */
export interface CategoryCount {
  name: string;
  count: number;
}

/**
 * 語（空なら絞らない）と分類（null なら絞らない）で絞る。入力の順を保つ。
 * 語の一致のしかたは searchCatalog と同じ
 */
export function filterCatalog(
  entries: readonly CatalogEntry[],
  query: string,
  category: string | null,
): CatalogEntry[] {
  const byQuery = query.trim() === '' ? [...entries] : searchCatalog(entries, query, Infinity);
  return category === null ? byQuery : byQuery.filter((e) => e.categories.includes(category));
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'en', { sensitivity: 'base' });
}

/** 新しい配列に並べ替える。題名・著者が同じなら番号の小さい順 */
export function sortCatalog(entries: readonly CatalogEntry[], sort: CatalogSort): CatalogEntry[] {
  return [...entries].sort((a, b) => {
    if (sort === 'title') return compareText(a.title, b.title) || a.id - b.id;
    if (sort === 'author') return compareText(a.author, b.author) || a.id - b.id;
    return a.id - b.id;
  });
}

/** 分類ごとの冊数を、多い順（同じなら名前の順）に返す */
export function countCategories(entries: readonly CatalogEntry[]): CategoryCount[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const name of entry.categories) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'en'));
}

/** 分類を持つ本が 1 冊でもあるか */
export function hasAnyCategory(entries: readonly CatalogEntry[]): boolean {
  return entries.some((e) => e.categories.length > 0);
}
