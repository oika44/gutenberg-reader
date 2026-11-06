// 読書画面のテスト（reader.*.spec.ts）で共通に使う本と記録のデータ。テストからだけ読み込む
import { Provider, signal } from '@angular/core';
import { CatalogService } from '../../services/catalog.service';
import { Book } from '../../services/book.service';
import { ReadingRecord } from '../../services/reading-log';

export const LINES = [
  'Chapter 1',
  '',
  'It is a truth universally acknowledged,',
  'that a single man in possession',
  'of a good fortune, must be in want of a wife.',
  '',
  'However little known the feelings',
  'or views of such a man may be',
  'on his first entering a neighbourhood,',
  'this truth is so well fixed.',
];

export const BOOK: Book = {
  id: 1342,
  title: 'Pride and Prejudice',
  author: 'Jane Austen',
  lines: LINES,
  markersFound: true,
};

export const record = (endLine: number): ReadingRecord => ({
  recordedAt: '2026-11-03 15:30',
  bookId: 1342,
  title: BOOK.title,
  author: BOOK.author,
  startLine: 1,
  endLine,
  lines: 1,
  words: 1,
  lookups: 0,
});

/** CatalogService の偽物（1342 の 1 冊だけ。load・fetch は何もしない） */
export function provideFakeCatalog(): Provider {
  return {
    provide: CatalogService,
    useValue: {
      entries: signal([
        { id: 1342, title: 'Pride and Prejudice', author: 'Austen, Jane', categories: [] },
      ]),
      fetchedAt: signal<string | null>('2026-11-06'),
      loading: signal(false),
      error: signal<string | null>(null),
      load: async () => {},
      fetch: async () => {},
    },
  };
}
