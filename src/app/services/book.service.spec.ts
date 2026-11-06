import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Book, BookFetchError, BookService, parseBook, parseBookId } from './book.service';

const RAW = [
  'The Project Gutenberg eBook of Pride and Prejudice',
  'Title: Pride and Prejudice',
  'Author: Jane Austen',
  '*** START OF THE PROJECT GUTENBERG EBOOK PRIDE AND PREJUDICE ***',
  'Chapter 1',
  'It is a truth universally acknowledged,',
  '*** END OF THE PROJECT GUTENBERG EBOOK PRIDE AND PREJUDICE ***',
  'license text',
].join('\r\n');

describe('parseBookId', () => {
  it.each([
    ['1342', 1342],
    [' 1342 ', 1342],
    ['https://www.gutenberg.org/ebooks/1342', 1342],
    ['https://www.gutenberg.org/cache/epub/1342/pg1342.txt', 1342],
    ['https://www.gutenberg.org/files/1342/1342-0.txt', 1342],
  ])('%s → %i', (input, id) => expect(parseBookId(input)).toBe(id));

  it.each([
    'abc',
    '',
    '0',
    '-5',
    '1.5',
    'https://example.com/',
    'https://www.gutenberg.org/ebooks/0',
    'https://example.com/ebooks/1342',
  ])('%s → null', (input) => expect(parseBookId(input)).toBeNull());
});

describe('parseBook', () => {
  it('START と END の間を本文にし、題名と著者を取り出す（\\r を残さない）', () => {
    expect(parseBook(1342, RAW)).toEqual<Book>({
      id: 1342,
      title: 'Pride and Prejudice',
      author: 'Jane Austen',
      lines: ['Chapter 1', 'It is a truth universally acknowledged,'],
      markersFound: true,
    });
  });

  it('目印がなければ全体を本文にする', () => {
    expect(parseBook(1, 'line a\r\nline b')).toEqual<Book>({
      id: 1,
      title: '',
      author: '',
      lines: ['line a', 'line b'],
      markersFound: false,
    });
  });

  it('START だけあって END がなければ全体を本文にするが、題名と著者は取り出す', () => {
    const raw = RAW.split('\r\n')
      .filter((line) => !line.startsWith('*** END'))
      .join('\n');
    const book = parseBook(1342, raw);
    expect(book.markersFound).toBe(false);
    expect(book.lines).toEqual(raw.split('\n'));
    expect(book.title).toBe('Pride and Prejudice');
    expect(book.author).toBe('Jane Austen');
  });

  it('START より前の END は無視する。START の後ろに END がなければ目印なし', () => {
    const raw = ['*** END OF THE PROJECT GUTENBERG EBOOK X ***', RAW].join('\n');
    // 先頭の END は無視し、START の後ろの END で切り出す
    expect(parseBook(1342, raw).lines).toEqual([
      'Chapter 1',
      'It is a truth universally acknowledged,',
    ]);
    expect(parseBook(1, '*** END OF THE PROJECT GUTENBERG EBOOK X ***\nbody').markersFound).toBe(
      false,
    );
  });

  it('START の前にない Title: 行（本文中の Title:）は題名にしない', () => {
    const raw = [
      '*** START OF THE PROJECT GUTENBERG EBOOK X ***',
      'Title: 本文中の行',
      '*** END OF THE PROJECT GUTENBERG EBOOK X ***',
    ].join('\n');
    expect(parseBook(1, raw).title).toBe('');
  });
});

describe('BookService', () => {
  let service: BookService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BookService);
    http = TestBed.inject(HttpTestingController);
  });

  it('中継経由でテキストを取得して Book にする', () => {
    let book: Book | undefined;
    service.load(1342).subscribe((b) => (book = b));
    http.expectOne('/gutenberg/cache/epub/1342/pg1342.txt').flush(RAW);
    expect(book?.title).toBe('Pride and Prejudice');
    expect(book?.lines).toHaveLength(2);
  });

  it('取得に失敗したら BookFetchError を流す', () => {
    let error: unknown;
    service.load(99999999).subscribe({ error: (e) => (error = e) });
    http
      .expectOne('/gutenberg/cache/epub/99999999/pg99999999.txt')
      .flush('Not Found', { status: 404, statusText: 'Not Found' });
    expect(error).toBeInstanceOf(BookFetchError);
    expect((error as Error).message).toBe('本を取得できませんでした（番号99999999）');
  });
});
