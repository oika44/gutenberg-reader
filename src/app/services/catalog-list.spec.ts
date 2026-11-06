import { CatalogEntry } from './catalog';
import { countCategories, filterCatalog, hasAnyCategory, sortCatalog } from './catalog-list';

const entries: CatalogEntry[] = [
  { id: 3, title: 'b Tale', author: 'Zed', categories: ['Novels'] },
  { id: 1, title: 'A Tale', author: 'amy', categories: ['Novels', 'Poetry'] },
  { id: 2, title: 'c Poems', author: 'Bob', categories: ['Poetry'] },
  { id: 4, title: 'Old', author: 'Old', categories: [] },
];

const ids = (list: readonly CatalogEntry[]) => list.map((e) => e.id);

describe('filterCatalog', () => {
  it('語も分類も指定しなければ全部を返す', () => {
    expect(filterCatalog(entries, '', null)).toHaveLength(4);
  });

  it('語で絞る（入力の順を保つ）', () => {
    expect(ids(filterCatalog(entries, 'tale', null))).toEqual([3, 1]);
  });

  it('分類で絞る', () => {
    expect(ids(filterCatalog(entries, '', 'Poetry'))).toEqual([1, 2]);
  });

  it('語と分類の両方で絞る', () => {
    expect(ids(filterCatalog(entries, 'tale', 'Poetry'))).toEqual([1]);
  });

  it('一致が無ければ空の配列', () => {
    expect(filterCatalog(entries, 'zzz', null)).toEqual([]);
  });
});

describe('sortCatalog', () => {
  it('番号順', () => {
    expect(ids(sortCatalog(entries, 'id'))).toEqual([1, 2, 3, 4]);
  });

  it('題名順（大文字・小文字を区別しない）', () => {
    expect(ids(sortCatalog(entries, 'title'))).toEqual([1, 3, 2, 4]);
  });

  it('著者順', () => {
    expect(ids(sortCatalog(entries, 'author'))).toEqual([1, 2, 4, 3]);
  });

  it('同じ題名なら番号の小さい順', () => {
    const same: CatalogEntry[] = [
      { id: 9, title: 'Same', author: 'x', categories: [] },
      { id: 5, title: 'same', author: 'y', categories: [] },
    ];
    expect(ids(sortCatalog(same, 'title'))).toEqual([5, 9]);
  });

  it('元の配列を変えない', () => {
    const before = ids(entries);
    sortCatalog(entries, 'id');
    expect(ids(entries)).toEqual(before);
  });
});

describe('countCategories', () => {
  it('冊数の多い順、同じなら名前の順', () => {
    expect(countCategories(entries)).toEqual([
      { name: 'Novels', count: 2 },
      { name: 'Poetry', count: 2 },
    ]);
  });

  it('冊数の多いものが先に来る', () => {
    const list: CatalogEntry[] = [
      { id: 1, title: 'a', author: 'a', categories: ['Art'] },
      { id: 2, title: 'b', author: 'b', categories: ['Zoo'] },
      { id: 3, title: 'c', author: 'c', categories: ['Zoo'] },
    ];
    expect(countCategories(list).map((c) => c.name)).toEqual(['Zoo', 'Art']);
  });
});

describe('hasAnyCategory', () => {
  it('分類を持つ本があれば true', () => {
    expect(hasAnyCategory(entries)).toBe(true);
  });

  it('分類を持つ本が無ければ false', () => {
    expect(hasAnyCategory([entries[3]])).toBe(false);
  });
});
