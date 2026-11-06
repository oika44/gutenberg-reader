import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, throwError } from 'rxjs';

export interface Book {
  id: number;
  title: string;
  author: string;
  /** 本文の行（1 行目 = lines[0]） */
  lines: string[];
  /** START / END の目印が見つかったか。false ならテキスト全体を本文にしている */
  markersFound: boolean;
}

/** 本のテキストを取得できなかったときのエラー */
export class BookFetchError extends Error {
  constructor(readonly id: number) {
    super(`本を取得できませんでした（番号${id}）`);
  }
}

const START_MARK = '*** START OF THE PROJECT GUTENBERG EBOOK';
const END_MARK = '*** END OF THE PROJECT GUTENBERG EBOOK';

/** 本の番号、または gutenberg.org の URL から番号を取り出す。読み取れなければ null */
export function parseBookId(input: string): number | null {
  const text = input.trim();
  const match = /^\d+$/.test(text)
    ? [text, text]
    : /gutenberg\.org\/(?:ebooks|cache\/epub|files)\/(\d+)/.exec(text);
  if (!match) return null;
  const id = Number(match[1]);
  return id > 0 ? id : null;
}

/** Gutenberg のプレーンテキストから本文・題名・著者を取り出す */
export function parseBook(id: number, raw: string): Book {
  const all = raw.split(/\r?\n/);
  const start = all.findIndex((line) => line.includes(START_MARK));
  const end = all.findIndex((line, i) => i > start && line.includes(END_MARK));
  const markersFound = start >= 0 && end >= 0;
  const header = start >= 0 ? all.slice(0, start) : [];
  const field = (name: string) =>
    header
      .find((line) => line.startsWith(`${name}:`))
      ?.slice(name.length + 1)
      .trim() ?? '';
  return {
    id,
    title: field('Title'),
    author: field('Author'),
    lines: markersFound ? all.slice(start + 1, end) : all,
    markersFound,
  };
}

/**
 * Project Gutenberg のプレーンテキスト版を取得する。
 * CORS 回避のため、中継役（Electron の main、開発時は proxy.conf.json）の /gutenberg/ 経由で取得する。
 */
@Injectable({ providedIn: 'root' })
export class BookService {
  private readonly http = inject(HttpClient);

  load(id: number): Observable<Book> {
    return this.http.get(`/gutenberg/cache/epub/${id}/pg${id}.txt`, { responseType: 'text' }).pipe(
      map((raw) => parseBook(id, raw)),
      catchError(() => throwError(() => new BookFetchError(id))),
    );
  }
}
