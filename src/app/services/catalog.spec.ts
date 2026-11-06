import { CATALOG_CSV } from './catalog.testing';
import {
  CatalogData,
  CatalogEntry,
  CatalogFormatError,
  MIN_CATALOG_ENTRIES,
  assertCompleteCatalog,
  parseCatalog,
  parseSavedCatalog,
  searchCatalog,
} from './catalog';

describe('parseCatalog', () => {
  it('英語の Text の行だけを、見本の順に { id, title, author } にする', () => {
    expect(parseCatalog(CATALOG_CSV).map((e) => e.id)).toEqual([1342, 2, 100]);
  });

  it('題名の中の改行は空白 1 つにし、著者が空なら空文字にする', () => {
    expect(parseCatalog(CATALOG_CSV)[1]).toEqual({
      id: 2,
      title: 'The United States Bill of Rights The Ten Original Amendments',
      author: '',
      categories: [],
    });
  });

  it('Bookshelves から Category: だけを、重複なしで CSV の順に取り出す', () => {
    expect(parseCatalog(CATALOG_CSV).map((e) => e.categories)).toEqual([
      ['Novels', 'British Literature'],
      [],
      ['Plays/Films/Dramas'],
    ]);
  });

  it('Bookshelves の見出しが無ければ全部 categories は空', () => {
    const csv = ['Text#,Type,Title,Language,Authors', '1,Text,A,en,B'].join('\r\n');
    expect(parseCatalog(csv)[0].categories).toEqual([]);
  });

  it('"" を " に戻し、Language が "en; fr" の本も含める', () => {
    expect(parseCatalog(CATALOG_CSV)[2].title).toBe('The "Complete" Works');
  });

  it('列の並びが変わっても見出しの名前で読む', () => {
    const csv = [
      'Title,Type,Language,Authors,Text#',
      'Pride and Prejudice,Text,en,"Austen, Jane",1342',
      'Audio Book,Sound,en,,200',
    ].join('\r\n');
    expect(parseCatalog(csv)).toEqual([
      { id: 1342, title: 'Pride and Prejudice', author: 'Austen, Jane', categories: [] },
    ]);
  });

  it.each([['<html><body>Error</body></html>'], ['a,b,c\r\n1,2,3'], ['']])(
    '見出しが違う（%j）なら CatalogFormatError',
    (csv) => {
      expect(() => parseCatalog(csv)).toThrow(CatalogFormatError);
    },
  );

  it('CatalogFormatError のメッセージは固定', () => {
    expect(() => parseCatalog('')).toThrow('目録の形式が想定と違います');
  });
});

describe('searchCatalog', () => {
  const entries = parseCatalog(CATALOG_CSV);

  it('語がすべて題名か著者に含まれる本を返す（大文字・小文字を区別しない）', () => {
    expect(searchCatalog(entries, 'PRIDE austen').map((e) => e.id)).toEqual([1342]);
  });

  it('題名と著者にまたがる語でも見つける', () => {
    expect(searchCatalog(entries, 'works shakespeare').map((e) => e.id)).toEqual([100]);
  });

  it('前後や間の余分な空白を無視する', () => {
    expect(searchCatalog(entries, '  pride   austen ').map((e) => e.id)).toEqual([1342]);
  });

  it.each([[''], ['   ']])('空の入力（%j）なら空の配列', (q) => {
    expect(searchCatalog(entries, q)).toEqual([]);
  });

  it('limit 件で打ち切る', () => {
    const many: CatalogEntry[] = Array.from({ length: 60 }, (_, i) => ({
      id: i + 1,
      title: `Book a${i + 1}`,
      categories: [],
      author: 'A',
    }));
    expect(searchCatalog(many, 'a')).toHaveLength(50);
    expect(searchCatalog(many, 'a', 3).map((e) => e.id)).toEqual([1, 2, 3]);
  });
});

describe('parseSavedCatalog', () => {
  it('保存した形を読み戻す', () => {
    const data: CatalogData = {
      fetchedAt: '2026-11-06',
      entries: [
        {
          id: 1342,
          title: 'Pride and Prejudice',
          author: 'Austen, Jane',
          categories: ['Novels'],
        },
      ],
    };
    expect(parseSavedCatalog(JSON.stringify(data))).toEqual(data);
  });

  it.each([
    [null],
    ['{'],
    ['[]'],
    ['{"fetchedAt":1,"entries":[]}'],
    ['{"fetchedAt":"2026-11-06","entries":{}}'],
    ['{"fetchedAt":"2026-11-06","entries":[{"id":"1","title":"a","author":"b"}]}'],
    ['{"fetchedAt":"2026-11-06","entries":[{"id":0,"title":"a","author":"b"}]}'],
    ['{"fetchedAt":"2026-11-06","entries":[{"id":1,"title":1,"author":"b"}]}'],
    ['{"fetchedAt":"2026-11-06","entries":[{"id":1,"title":"a","author":null}]}'],
    ['{"fetchedAt":"2026-11-06","entries":[null]}'],
    [
      '{"fetchedAt":"2026-11-06","entries":[{"id":1,"title":"a","author":"b","categories":"Novels"}]}',
    ],
    ['{"fetchedAt":"2026-11-06","entries":[{"id":1,"title":"a","author":"b","categories":[1]}]}'],
  ])('壊れた保存データ（%j）は null', (json) => {
    expect(parseSavedCatalog(json)).toBeNull();
  });
});

describe('parseSavedCatalog（前の形式）', () => {
  it('categories が無い要素は categories: [] として読む', () => {
    const json = '{"fetchedAt":"2026-11-06","entries":[{"id":1,"title":"a","author":"b"}]}';
    expect(parseSavedCatalog(json)?.entries).toEqual([
      { id: 1, title: 'a', author: 'b', categories: [] },
    ]);
  });
});

describe('assertCompleteCatalog', () => {
  const entries = parseCatalog(CATALOG_CSV);

  it('min 冊以上なら投げない', () => {
    expect(() => assertCompleteCatalog(entries, 3)).not.toThrow();
  });

  it('min 冊未満なら CatalogFormatError', () => {
    expect(() => assertCompleteCatalog(entries, 4)).toThrow(CatalogFormatError);
  });

  it('既定の最小冊数は 10000', () => {
    expect(MIN_CATALOG_ENTRIES).toBe(10000);
    expect(() => assertCompleteCatalog(entries)).toThrow(CatalogFormatError);
  });
});
