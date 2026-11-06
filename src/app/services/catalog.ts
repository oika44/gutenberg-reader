/** Project Gutenberg の目録 CSV（中継先は /gutenberg/ のまま） */
export const CATALOG_URL = '/gutenberg/cache/epub/feeds/pg_catalog.csv';

/** 目録の 1 冊 */
export interface CatalogEntry {
  id: number;
  title: string;
  author: string;
  /** Bookshelves の Category: から接頭辞を外したもの（CSV の並び、重複なし） */
  categories: string[];
}

/** 保存する目録 */
export interface CatalogData {
  /** 取得した日（YYYY-MM-DD） */
  fetchedAt: string;
  entries: CatalogEntry[];
}

export class CatalogFormatError extends Error {
  constructor() {
    super('目録の形式が想定と違います');
    this.name = 'CatalogFormatError';
  }
}

/** CSV 全体を行と値に分ける（" で囲まれた中のカンマ・改行・"" を扱う） */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** 目録として十分な冊数の目安。これ未満は途中で切れたものとみなす */
export const MIN_CATALOG_ENTRIES = 10000;

const CATEGORY_PREFIX = 'Category: ';

/** Bookshelves の値から分類を取り出す */
function parseCategories(bookshelves: string): string[] {
  const categories: string[] = [];
  for (const part of bookshelves.split(';')) {
    const shelf = part.trim();
    if (!shelf.startsWith(CATEGORY_PREFIX)) continue;
    const name = shelf.slice(CATEGORY_PREFIX.length).trim();
    if (name !== '' && !categories.includes(name)) categories.push(name);
  }
  return categories;
}

/** 読めた本が min 冊未満なら CatalogFormatError（途中で切れた目録を保存しない） */
export function assertCompleteCatalog(
  entries: readonly CatalogEntry[],
  min = MIN_CATALOG_ENTRIES,
): void {
  if (entries.length < min) throw new CatalogFormatError();
}

const REQUIRED_COLUMNS = ['Text#', 'Type', 'Title', 'Language', 'Authors'];

/**
 * 目録 CSV から、Type が Text で Language に en を含む本だけを読む。
 * 列は見出しの名前で探す。必要な見出しが無ければ CatalogFormatError
 */
export function parseCatalog(csv: string): CatalogEntry[] {
  const [header, ...rows] = parseCsvRows(csv.replace(/^\uFEFF/, ''));
  if (!header) throw new CatalogFormatError();
  const index = Object.fromEntries(REQUIRED_COLUMNS.map((name) => [name, header.indexOf(name)]));
  if (REQUIRED_COLUMNS.some((name) => index[name] < 0)) throw new CatalogFormatError();

  const bookshelvesIndex = header.indexOf('Bookshelves');
  const entries: CatalogEntry[] = [];
  for (const row of rows) {
    if (row[index['Type']] !== 'Text') continue;
    const languages = (row[index['Language']] ?? '').split(';').map((v) => v.trim());
    if (!languages.includes('en')) continue;
    const idText = (row[index['Text#']] ?? '').trim();
    if (!/^\d+$/.test(idText) || Number(idText) < 1) continue;
    entries.push({
      id: Number(idText),
      title: (row[index['Title']] ?? '').replace(/\s*\r?\n\s*/g, ' ').trim(),
      author: (row[index['Authors']] ?? '').trim(),
      categories: bookshelvesIndex < 0 ? [] : parseCategories(row[bookshelvesIndex] ?? ''),
    });
  }
  return entries;
}

/** 空白で分けた語がすべて題名か著者に含まれる本を、目録の順に limit 件まで返す */
export function searchCatalog(
  entries: readonly CatalogEntry[],
  query: string,
  limit = 50,
): CatalogEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const result: CatalogEntry[] = [];
  for (const entry of entries) {
    const text = `${entry.title} ${entry.author}`.toLowerCase();
    if (words.every((w) => text.includes(w))) {
      result.push(entry);
      if (result.length >= limit) break;
    }
  }
  return result;
}

/** 保存した 1 冊。categories が無い（前の形式）ものも受け付ける */
type SavedEntry = Omit<CatalogEntry, 'categories'> & { categories?: string[] };

function isEntry(value: unknown): value is SavedEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['id'] === 'number' &&
    Number.isInteger(v['id']) &&
    v['id'] > 0 &&
    typeof v['title'] === 'string' &&
    typeof v['author'] === 'string' &&
    (v['categories'] === undefined ||
      (Array.isArray(v['categories']) && v['categories'].every((c) => typeof c === 'string')))
  );
}

/** 保存した目録の JSON を読む。読めない・形が違うなら null */
export function parseSavedCatalog(json: string | null): CatalogData | null {
  if (json === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v['fetchedAt'] !== 'string' || !Array.isArray(v['entries'])) return null;
  if (!v['entries'].every(isEntry)) return null;
  return {
    fetchedAt: v['fetchedAt'],
    entries: v['entries'].map((e) => ({
      id: e.id,
      title: e.title,
      author: e.author,
      categories: e.categories ? [...e.categories] : [],
    })),
  };
}
