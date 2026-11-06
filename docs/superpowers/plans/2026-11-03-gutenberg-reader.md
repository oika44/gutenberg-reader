# gutenberg-reader 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Project Gutenberg の本を表示し、行番号で指定した範囲の語数・行数・調べた単語数を CSV に追記する Electron アプリを作る。

**Architecture:** Angular 22（Zoneless）の画面 1 つを Electron で動かす。本文と Weblio は Electron の main が `app://local/gutenberg/...` と `app://local/weblio/...` で中継する。Weblio 検索と P-Study 用 CSV 作成は、tsconfig の別名 `@pstudy/*` で `../pstudy-dict/src/app/services/*` を直接参照する。

**Tech Stack:** Angular 22、@angular/cdk（仮想スクロール）、TypeScript、Vitest（`@angular/build:unit-test`）、Electron、electron-builder、encoding-japanese、Prettier

**Spec:** `gutenberg-reader/docs/superpowers/specs/2026-11-03-gutenberg-reader-design.md`

## Global Constraints

- `pstudy-dict/` 配下のファイルは一切変更しない。
- バージョンは `pstudy-dict/package.json` に合わせる（`@angular/*` ^22.2.0、`@angular/build` / `@angular/cli` ^22.2.2、`typescript` ~6.0.2、`vitest` ^5.0.0、`electron` ^44.7.0、`electron-builder` ^26.15.3、`encoding-japanese` ^2.2.0、`rxjs` ~7.8.0）。`@angular/cdk` は ^22.2.0。
- 画面の状態は signal で持つ（Zoneless のため）。
- 文言は日本語。半角カナは使わない。
- 記録 CSV は UTF-8（BOM 付き）、改行 CRLF、見出し `記録日時,本番号,題名,著者,開始行,終了行,行数,語数,調べた単語数`、日時は `YYYY-MM-DD HH:mm`。
- 語の正規表現は `/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g`。行数は空白文字だけの行を除く。範囲は両端を含む。
- 各ファイルは保存前に `npx prettier --write` で整形する。
- テストを先に書き、失敗を確認してから実装する。
- `angular-play` は git 管理外のため、コミットの手順は置かない（ユーザーの指示があるまでコミットしない）。
- Windows でも動くこと（パスは `node:path` で組み立て、改行は CRLF を受け付ける）。

## Review Focus

1. **共有ファイルが `pstudy-dict/node_modules` の Angular を読み込む**: `../pstudy-dict/src/...` から見た `@angular/core` などが `pstudy-dict/node_modules` に解決されると、Angular が 2 つ読み込まれて DI が壊れる。そこで、別名で Angular・rxjs・encoding-japanese を `gutenberg-reader/node_modules` に固定する（Task 1 のスモークテストで確認する）。
2. **Gutenberg のテキストは CRLF**: `\r` が行末に残ると、空行の判定や表示が狂う。そのため `/\r?\n/` で分割する（Task 3 のテスト）。
3. **ダブルクリックで記号付きの語や空白が選ばれる**: `“Hello,”`、`Mr.`、空白だけの選択が起こりうる。前後の記号を落とし、空になったら調べない（Task 7 のテスト）。
4. **Excel などで保存し直した記録ファイルが改行で終わっていない**: そのまま追記すると前の行とつながってしまう。末尾が改行でなければ CRLF を足してから追記する（Task 5 の main と、Task 4 の `parseLog` のテスト）。
5. **しおりが本の行数を超える（読了済み、または版が違う）**: 開始行を設定せず「最後まで記録済みです」と表示する（Task 6 のテスト）。

---

### Task 1: プロジェクトの雛形と共有部品の参照

**Files:**
- Create: `gutenberg-reader/`（`ng new` の生成物）
- Modify: `gutenberg-reader/tsconfig.json`（`compilerOptions.paths`）、`gutenberg-reader/angular.json`（`serve.options.proxyConfig`）、`gutenberg-reader/package.json`
- Create: `gutenberg-reader/proxy.conf.json`、`gutenberg-reader/.prettierrc`（`pstudy-dict` のものをコピー。なければ作らない）
- Test: `gutenberg-reader/src/app/shared-imports.spec.ts`

**Interfaces:**
- Produces: `@pstudy/word-lookup.service`（`WordLookupService.lookup(word): Observable<DictionaryResult>`、`WordNotFoundError`、`DictionaryResult`）、`@pstudy/pstudy-builder.service`（`PStudyBuilderService`、`CsvEncoding`）を import できる状態

- [ ] **Step 1: 雛形を作る**

既存の `gutenberg-reader/docs` があるため、別名で作ってから移す。

```bash
cd /home/oika/angular-play
npx @angular/cli@22.2.2 new gutenberg-reader-new --style=css --ssr=false --routing=false --skip-git
mv gutenberg-reader/docs gutenberg-reader-new/ && rmdir gutenberg-reader && mv gutenberg-reader-new gutenberg-reader
cd gutenberg-reader
npm i @angular/cdk@^22.2.0 encoding-japanese@^2.2.0
npm i -D @types/encoding-japanese@^2.2.1 electron@^44.7.0 electron-builder@^26.15.3 prettier@^3.8.1 jsdom@^30.0.0
```

確認: `angular.json` の `test.builder` が `@angular/build:unit-test`、`package.json` の `name` が `gutenberg-reader`、`angular.json` の `polyfills` に `zone.js` が無い（Zoneless）こと（違えば直す。出力先は `dist/gutenberg-reader/browser`）。

- [ ] **Step 2: 失敗するスモークテストを書く**

```ts
// src/app/shared-imports.spec.ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WordLookupService } from '@pstudy/word-lookup.service';
import { PStudyBuilderService } from '@pstudy/pstudy-builder.service';

describe('pstudy-dict の共有部品', () => {
  it('WordLookupService が同じ Angular の HttpClient で /weblio/ に問い合わせる', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const service = TestBed.inject(WordLookupService);
    service.lookup('apple').subscribe();
    TestBed.inject(HttpTestingController).expectOne('/weblio/apple');
  });

  it('PStudyBuilderService に単語を追加できる', () => {
    const builder = TestBed.inject(PStudyBuilderService);
    expect(builder.addEntry('apple', 'りんご')).toBe(true);
    expect(builder.count()).toBe(1);
  });
});
```

- [ ] **Step 3: 失敗を確認する**

Run: `npx ng test --watch=false`
Expected: FAIL（`Cannot find module '@pstudy/word-lookup.service'`）

- [ ] **Step 4: 別名と中継設定を追加する**

`tsconfig.json` の `compilerOptions` に追加する（Angular などの固定は Review Focus 1 のため）:

```json
"paths": {
  "@pstudy/*": ["../pstudy-dict/src/app/services/*"],
  "@angular/*": ["./node_modules/@angular/*"],
  "rxjs": ["./node_modules/rxjs"],
  "rxjs/*": ["./node_modules/rxjs/*"],
  "encoding-japanese": ["./node_modules/encoding-japanese"]
}
```

`proxy.conf.json`: `pstudy-dict/proxy.conf.json` の `/weblio` の設定に、`/gutenberg`（`target: https://www.gutenberg.org`、`pathRewrite: { "^/gutenberg": "" }`、`secure`・`changeOrigin` は true）を足したもの。`angular.json` の `serve.options.proxyConfig` に `proxy.conf.json` を指定する。

- [ ] **Step 5: 通過を確認する**

Run: `npx ng test --watch=false`
Expected: PASS（2 件）。`NG0201` や `No provider for HttpClient` が出る場合は Angular が二重に読み込まれているので、`paths` の固定を見直す。

---

### Task 2: 語数と行数を数える

**Files:**
- Create: `gutenberg-reader/src/app/services/text-count.ts`
- Test: `gutenberg-reader/src/app/services/text-count.spec.ts`

**Interfaces:**
- Produces:
  - `countWords(text: string): number`
  - `countRange(lines: readonly string[], start: number, end: number): RangeStats`（`start` と `end` は 1 始まりで両端を含む）
  - `interface RangeStats { lines: number; words: number }`

- [ ] **Step 1: 失敗するテストを書く**

```ts
describe('countWords', () => {
  it.each([
    ['The quick brown fox', 4],
    ["don't stop", 2],
    ['don’t stop', 2],
    ['a well-known man', 3],
    ['in 1813 there', 3],
    ['*** -- ***', 0],
    ['', 0],
    ['“Hello,” she said.', 3],
  ])('%s → %i 語', (text, n) => expect(countWords(text)).toBe(n));
});

describe('countRange', () => {
  const lines = ['It is a truth', '', '   ', 'universally acknowledged,', 'that a single man'];
  it('両端を含み、空白だけの行を数えない', () => {
    expect(countRange(lines, 1, 4)).toEqual({ lines: 2, words: 6 });
  });
  it('1 行だけの範囲', () => {
    expect(countRange(lines, 5, 5)).toEqual({ lines: 1, words: 4 });
  });
});
```

- [ ] **Step 2: 失敗を確認する** — Run: `npx ng test --watch=false` / Expected: FAIL（モジュールが見つからない）
- [ ] **Step 3: `countWords` と `countRange` を実装する**（正規表現は Global Constraints のもの。`countRange` は `lines.slice(start - 1, end)`）
- [ ] **Step 4: 通過を確認する** — Run: `npx ng test --watch=false` / Expected: PASS

---

### Task 3: 本の取得と本文の切り出し

**Files:**
- Create: `gutenberg-reader/src/app/services/book.service.ts`
- Test: `gutenberg-reader/src/app/services/book.service.spec.ts`

**Interfaces:**
- Produces:
  - `parseBookId(input: string): number | null`（数字だけ、または `gutenberg.org/ebooks/<番号>`・`/cache/epub/<番号>/`・`/files/<番号>/` を含む URL。それ以外は null）
  - `parseBook(id: number, raw: string): Book`
  - `interface Book { id: number; title: string; author: string; lines: string[]; markersFound: boolean }`
  - `class BookFetchError extends Error`（メッセージ `本を取得できませんでした（番号${id}）`、`readonly id: number`）
  - `BookService.load(id: number): Observable<Book>`（`providedIn: 'root'`、GET `/gutenberg/cache/epub/${id}/pg${id}.txt`、`responseType: 'text'`。HTTP エラーはすべて `BookFetchError` にする）

- [ ] **Step 1: 失敗するテストを書く**

テスト用テキスト（CRLF で連結する）:

```ts
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
```

テスト:
- `parseBookId`: `'1342'`→1342、`' 1342 '`→1342、`'https://www.gutenberg.org/ebooks/1342'`→1342、`'https://www.gutenberg.org/cache/epub/1342/pg1342.txt'`→1342、`'abc'`→null、`''`→null、`'0'`→null
- `parseBook(1342, RAW)`: `title` は `'Pride and Prejudice'`、`author` は `'Jane Austen'`、`lines` は `['Chapter 1', 'It is a truth universally acknowledged,']`（`\r` が残らない）、`markersFound` は true
- 目印がない場合: `parseBook(1, 'line a\r\nline b')` の `lines` は `['line a', 'line b']`、`markersFound` は false、`title` と `author` は `''`
- `BookService.load(1342)`: `HttpTestingController` で `/gutenberg/cache/epub/1342/pg1342.txt` に RAW を返すと、`Book` が流れる
- `BookService.load(99999999)`: 404 を返すと、`BookFetchError` が流れ、メッセージが `本を取得できませんでした（番号99999999）` になる

- [ ] **Step 2: 失敗を確認する** — Run: `npx ng test --watch=false` / Expected: FAIL
- [ ] **Step 3: 実装する**（START / END は `includes('*** START OF THE PROJECT GUTENBERG EBOOK')` と `includes('*** END OF THE PROJECT GUTENBERG EBOOK')` で探す。`Title:` と `Author:` は START より前の行から取る）
- [ ] **Step 4: 通過を確認する** — Run: `npx ng test --watch=false` / Expected: PASS

---

### Task 4: 記録 CSV の作成と読み取り

**Files:**
- Create: `gutenberg-reader/src/app/services/reading-log.ts`（純粋関数）
- Test: `gutenberg-reader/src/app/services/reading-log.spec.ts`

**Interfaces:**
- Produces:
  - `interface ReadingRecord { recordedAt: string; bookId: number; title: string; author: string; startLine: number; endLine: number; lines: number; words: number; lookups: number }`
  - `const LOG_HEADER = '記録日時,本番号,題名,著者,開始行,終了行,行数,語数,調べた単語数'`
  - `formatTimestamp(date: Date): string`（ローカル時刻の `YYYY-MM-DD HH:mm`）
  - `formatLogLine(r: ReadingRecord): string`（改行を含まない 1 行）
  - `parseLog(text: string): { records: ReadingRecord[]; badLines: number[] }`（`badLines` はファイル上の 1 始まりの行番号）
  - `findBookmark(records: readonly ReadingRecord[], bookId: number): number | null`（同じ本の最後の記録の `endLine + 1`。記録がなければ null）
  - `isDuplicate(records: readonly ReadingRecord[], bookId: number, startLine: number, endLine: number): boolean`

- [ ] **Step 1: 失敗するテストを書く**

```ts
const rec: ReadingRecord = {
  recordedAt: '2026-11-03 15:30', bookId: 1342, title: 'Pride and Prejudice', author: 'Jane Austen',
  startLine: 1, endLine: 120, lines: 104, words: 1532, lookups: 7,
};

it('formatLogLine: 仕様書の例と同じ行を作る', () => {
  expect(formatLogLine(rec)).toBe('2026-11-03 15:30,1342,Pride and Prejudice,Jane Austen,1,120,104,1532,7');
});
it('formatLogLine: カンマや " を含む値を引用符で囲む', () => {
  expect(formatLogLine({ ...rec, title: 'Alice, "the" Girl' })).toContain(',"Alice, ""the"" Girl",');
});
it('formatTimestamp: ローカル時刻を YYYY-MM-DD HH:mm にする', () => {
  expect(formatTimestamp(new Date(2026, 0, 5, 9, 7))).toBe('2026-01-05 09:07');
});
it('parseLog: BOM・見出し・CRLF・引用符付きの値を読み、往復で同じ記録に戻る', () => {
  const text = '﻿' + LOG_HEADER + '\r\n' + formatLogLine({ ...rec, title: 'A, "B"' }) + '\r\n';
  expect(parseLog(text)).toEqual({ records: [{ ...rec, title: 'A, "B"' }], badLines: [] });
});
it('parseLog: 列数や数値がおかしい行を飛ばして行番号を返す', () => {
  const text = [LOG_HEADER, formatLogLine(rec), 'broken,line', formatLogLine({ ...rec, endLine: 200 })].join('\r\n');
  const result = parseLog(text);
  expect(result.records.map((r) => r.endLine)).toEqual([120, 200]);
  expect(result.badLines).toEqual([3]);
});
it('parseLog: 末尾に改行がない・空行があっても読める', () => {
  expect(parseLog(LOG_HEADER + '\n\n' + formatLogLine(rec)).records).toHaveLength(1);
});
it('findBookmark: 同じ本の最後の記録の次の行', () => {
  const records = [rec, { ...rec, bookId: 11, endLine: 50 }, { ...rec, startLine: 121, endLine: 300 }];
  expect(findBookmark(records, 1342)).toBe(301);
  expect(findBookmark(records, 84)).toBeNull();
});
it('isDuplicate: 同じ本・同じ範囲だけ true', () => {
  expect(isDuplicate([rec], 1342, 1, 120)).toBe(true);
  expect(isDuplicate([rec], 1342, 1, 121)).toBe(false);
  expect(isDuplicate([rec], 11, 1, 120)).toBe(false);
});
```

- [ ] **Step 2: 失敗を確認する** — Run: `npx ng test --watch=false` / Expected: FAIL
- [ ] **Step 3: 実装する**（CSV の行の分解は `"` で囲まれた中のカンマと `""` を扱う小さな状態機械で書く。値の中の改行は `formatLogLine` が空白に置き換えるので、行は `/\r?\n/` で分割してよい）
- [ ] **Step 4: 通過を確認する** — Run: `npx ng test --watch=false` / Expected: PASS

---

### Task 5: Electron の main・preload と画面側のブリッジ

**Files:**
- Create: `gutenberg-reader/electron/main.mjs`、`gutenberg-reader/electron/preload.cjs`
- Create: `gutenberg-reader/src/app/services/desktop-bridge.service.ts`、`gutenberg-reader/src/app/services/reading-log.service.ts`
- Modify: `gutenberg-reader/package.json`（`main`、`scripts`、`build`）
- Test: `gutenberg-reader/src/app/services/reading-log.service.spec.ts`

**Interfaces:**
- Consumes: Task 4 の `LOG_HEADER`・`formatLogLine`・`parseLog`・`ReadingRecord`
- Produces:
  - `window.gutenbergDesktop`（型は `desktop-bridge.service.ts` の `interface GutenbergDesktop`）:
    - `getLogPath(): Promise<string | null>`
    - `chooseLogPath(): Promise<string | null>`
    - `readLog(path: string): Promise<string | null>`（ファイルが無ければ null）
    - `appendLog(path: string, header: string, line: string): Promise<{ ok: true } | { ok: false; message: string }>`
    - `saveFile(defaultName: string, data: Uint8Array): Promise<{ ok: true; path: string } | { ok: false; message: string } | null>`（キャンセルなら null）
  - `DesktopBridgeService`（`providedIn: 'root'`）: `readonly api: GutenbergDesktop | null`（`window.gutenbergDesktop` が無ければ null）
  - `ReadingLogService`（`providedIn: 'root'`）:
    - `readonly logPath: Signal<string | null>`
    - `init(): Promise<void>`（`getLogPath` を読み込む）
    - `changeLogPath(): Promise<void>`（`chooseLogPath`。キャンセルなら変更しない）
    - `load(): Promise<{ records: ReadingRecord[]; badLines: number[] }>`（パス未設定・ファイル無しなら空）
    - `append(r: ReadingRecord): Promise<void>`（パス未設定なら先に `chooseLogPath`。キャンセルされたら `LogPathNotSetError`、書き込み失敗なら `LogWriteError(message)` を投げる）
    - `api` が null（ブラウザで動かしている）なら、`load` は空を返し、`append` は `DesktopUnavailableError` を投げる

- [ ] **Step 1: 失敗するテストを書く**（`DesktopBridgeService` を偽物に差し替える: `{ provide: DesktopBridgeService, useValue: { api: fake } }`。`fake` は `vi.fn()` で作った `GutenbergDesktop`）

テスト:
- `append`: パスが設定済みなら `appendLog(path, '﻿' + LOG_HEADER, formatLogLine(rec))` を 1 回呼ぶ
- `append`: パスが未設定なら `chooseLogPath` を呼び、返ってきたパスに追記し、`logPath()` も更新される
- `append`: `chooseLogPath` が null を返したら `LogPathNotSetError` を投げ、`appendLog` は呼ばない
- `append`: `appendLog` が `{ ok: false, message: 'EBUSY' }` を返したら、`LogWriteError` を投げ、メッセージに `EBUSY` を含む
- `load`: `readLog` が null なら `{ records: [], badLines: [] }` を返す。文字列なら `parseLog` の結果を返す
- `api` が null なら、`append` は `DesktopUnavailableError` を投げる

- [ ] **Step 2: 失敗を確認する** — Run: `npx ng test --watch=false` / Expected: FAIL
- [ ] **Step 3: `DesktopBridgeService` と `ReadingLogService` を実装する**
- [ ] **Step 4: 通過を確認する** — Run: `npx ng test --watch=false` / Expected: PASS
- [ ] **Step 5: `electron/main.mjs` と `preload.cjs` を書く**

`pstudy-dict/electron/main.mjs` の構造（`app://local/` スキーム、`handleRequest`、ROOT の外を読ませない処理、`fromApp` による呼び出し元の確認、`sandbox: true` の preload）を踏襲する。違う点は次のとおり。
- `ROOT` は `dist/gutenberg-reader/browser`
- `/gutenberg/*` は `https://www.gutenberg.org/*` に、`/weblio/*` は `https://ejje.weblio.jp/content/*` に中継する
- 設定は `userData/settings.json` の `{ logPath }` に保存する
- `log:append`: 対象は `.csv` で終わる絶対パスに限る。ファイルが無ければ `header + '\r\n' + line + '\r\n'` で作る。あれば、末尾が `\n` でないときに `'\r\n'` を先に足してから `line + '\r\n'` を追記する（Review Focus 4）。エラーは `{ ok: false, message: '書き込めませんでした（' + err.code + '）' }` で返す
- `log:choose`: `showSaveDialog`（既定は `documents/gutenberg-reading-log.csv`、`csv` で絞る）。選ばれたら設定に保存する
- `file:save`: `showSaveDialog` で選ばせ、`.csv` に限って上書き保存する
- 窓は通常の窓にする（大きさは 1100×800、最前面にしない）

`package.json`: `"main": "electron/main.mjs"`、`"scripts"` に `"desktop": "ng build && electron ."`、`"dist:win": "ng build && electron-builder --win"`、`"dist:linux": "ng build && electron-builder --linux"`。`build` は `pstudy-dict` を参考にする（`appId: jp.oika.gutenberg-reader`、`productName: GutenbergReader`、`files: ["electron/**", "dist/gutenberg-reader/browser/**", "!node_modules/**"]`、`directories.output: dist/widget`、win は zip、linux は deb）。

- [ ] **Step 6: 動作を手動で確認する** — Run: `npm run desktop` / Expected: 空の画面が開き、開発者ツールのコンソールで `await window.gutenbergDesktop.getLogPath()` が `null` を返す

---

### Task 6: 画面 その 1（本を開く・表示・範囲指定・しおり）

**Files:**
- Create: `gutenberg-reader/src/app/components/reader/reader.component.ts`・`.html`・`.css`
- Modify: `gutenberg-reader/src/app/app.ts`・`app.html`（`<app-reader>` を 1 つ置く）、`app.config.ts`（`provideHttpClient()`）
- Test: `gutenberg-reader/src/app/components/reader/reader.component.spec.ts`

**Interfaces:**
- Consumes: `BookService.load`、`parseBookId`、`BookFetchError`、`Book`（Task 3）、`countRange`、`RangeStats`（Task 2）、`findBookmark`（Task 4）、`ReadingLogService.load`（Task 5）
- Produces（Task 7 と 8 で使う。ReaderComponent の public signal とメソッド）:
  - `book: Signal<Book | null>`、`startLine: Signal<number | null>`、`endLine: Signal<number | null>`、`stats: Signal<RangeStats | null>`（両方の行が決まったときだけ）
  - `message: Signal<string>`（エラーや案内の表示用。`errorMessage` と `notice` には分けない）
  - `openBook(input: string): Promise<void>`
  - `clickLine(n: number): void`

範囲指定のルール:
- 開始行が未定なら、開始行を n にする
- 開始行が決まっていて終了行が未定のとき: n が開始行以上なら終了行を n にし、開始行より前なら開始行を n にし直す
- 両方決まっているときは、開始行を n にして終了行を未定に戻す

- [ ] **Step 1: 失敗するテストを書く**（`BookService` と `ReadingLogService` は偽物にする。本は 10 行の `Book`）

テスト:
- `openBook('abc')`: `message()` が `本の番号か URL を入力してください`、`BookService.load` は呼ばれない
- `openBook('1342')`: `book()` が設定される。記録が無ければ `startLine()` は null
- `load` が `BookFetchError` を流したら、`message()` がそのメッセージになり、`book()` は null のまま
- `markersFound: false` の本を開いたら、`message()` が `本文の範囲を判別できなかったため全体を表示しています`
- しおり: 記録の `endLine` が 4 なら、`startLine()` は 5 になり、その行までスクロールする（`CdkVirtualScrollViewport.scrollToIndex(4)` が呼ばれたことをスパイで確かめる）
- しおりが本の行数を超える（`endLine` が 10）なら、`startLine()` は null、`message()` が `最後まで記録済みです`（Review Focus 5）
- 記録ファイルに読めない行があれば（`badLines: [3]`）、`message()` に `記録ファイルの3行目を読めませんでした` を含む
- `clickLine`: 3→7 で `stats()` が `countRange(lines, 3, 7)` と等しい。3→1 で開始行が 1、終了行が null。3→7→5 で開始行が 5、終了行が null

- [ ] **Step 2: 失敗を確認する** — Run: `npx ng test --watch=false` / Expected: FAIL
- [ ] **Step 3: 実装する**（本文は `cdk-virtual-scroll-viewport`（`itemSize` は 24、行は 1 行に収める `white-space: pre`）で描く。行番号は `<button>` にし、範囲内の行には `in-range` クラスを付ける。上部に番号の入力欄・「開く」ボタン・`message()` の表示、横の欄に開始行・終了行・語数・行数を出す）
- [ ] **Step 4: 通過を確認する** — Run: `npx ng test --watch=false` / Expected: PASS

---

### Task 7: 画面 その 2（単語を調べる・調べた単語数・P-Study 用 CSV）

**Files:**
- Create: `gutenberg-reader/src/app/services/selected-word.ts`
- Modify: `gutenberg-reader/src/app/components/reader/reader.component.*`
- Test: `gutenberg-reader/src/app/services/selected-word.spec.ts`、`reader.component.spec.ts`（追加）

**Interfaces:**
- Consumes: `WordLookupService`、`WordNotFoundError`、`DictionaryResult`、`PStudyBuilderService`、`CsvEncoding`（Task 1）、`DesktopBridgeService.api.saveFile`（Task 5）
- Produces:
  - `normalizeSelectedWord(text: string): string | null`（前後の英数字以外を落とす。空、または空白を含むなら null）
  - ReaderComponent: `lookupWord(raw: string): void`、`lookedUp: Signal<ReadonlySet<string>>`（小文字で持つ）、`lookupCount: Signal<number>`、`lastResult: Signal<DictionaryResult | null>`、`savePStudy(encoding: CsvEncoding): Promise<void>`
  - テンプレートでは本文の `(dblclick)` で `window.getSelection()?.toString()` を `lookupWord` に渡す

- [ ] **Step 1: 失敗するテストを書く**

`normalizeSelectedWord`: `'“Hello,”'`→`'Hello'`、`'Mr.'`→`'Mr'`、`"don't"`→`"don't"`、`'well-known'`→`'well-known'`、`'  '`→null、`'two words'`→null、`'—'`→null

ReaderComponent（`WordLookupService` を偽物にする）:
- `lookupWord('Apple')` が成功すると、`lastResult()` が設定され、P-Study リストに 1 件入り、`lookupCount()` が 1 になる
- `lookupWord('apple')` を続けると、`lookupCount()` は 1 のままで、リストも 1 件のまま
- `WordNotFoundError` なら、`message()` が `「qwzx」は見つかりませんでした` になり、`lookupCount()` は 1 増える。リストには入らない
- それ以外のエラー（通信の失敗）なら、`message()` にエラーを出し、`lookupCount()` は増えない
- `lookupWord('  ')` では `lookup` を呼ばない
- `savePStudy('SJIS')`: `saveFile('pstudy_words.csv', <Uint8Array>)` を呼ぶ。`{ ok: false, message }` なら `message()` にそれを出す

- [ ] **Step 2: 失敗を確認する** — Run: `npx ng test --watch=false` / Expected: FAIL
- [ ] **Step 3: 実装する**（Blob は `new Uint8Array(await blob.arrayBuffer())` にして渡す。横の欄に訳・発音記号、P-Study リスト（削除ボタン付き）、Shift_JIS / UTF-8 の保存ボタンを置く）
- [ ] **Step 4: 通過を確認する** — Run: `npx ng test --watch=false` / Expected: PASS

---

### Task 8: 画面 その 3（記録する）

**Files:**
- Modify: `gutenberg-reader/src/app/components/reader/reader.component.*`
- Test: `reader.component.spec.ts`（追加）

**Interfaces:**
- Consumes: `ReadingLogService.append`・`load`・`logPath`・`changeLogPath`、`LogPathNotSetError`、`LogWriteError`（Task 5）、`formatTimestamp`、`isDuplicate`（Task 4）
- Produces: ReaderComponent: `canRecord: Signal<boolean>`（本・開始行・終了行がそろったときだけ true）、`record(): Promise<void>`

- [ ] **Step 1: 失敗するテストを書く**（`window.confirm` は `vi.spyOn` で差し替える）

テスト:
- 終了行が未定のとき、`canRecord()` は false
- 3→7 を指定して 2 語調べたあと `record()` を呼ぶと、`append` に `{ bookId, title, author, startLine: 3, endLine: 7, lines, words, lookups: 2, recordedAt: formatTimestamp(<現在時刻>) }` が渡る（時刻は `vi.setSystemTime` で固定する）。そのあと `lookupCount()` は 0、`startLine()` は 8、`endLine()` は null になる
- 同じ範囲がすでに記録済みで、`confirm` が false を返したら、`append` は呼ばない
- 同じ範囲がすでに記録済みで、`confirm` が true を返したら、`append` を呼ぶ
- `append` が `LogWriteError('書き込めませんでした（EBUSY）')` を投げたら、`message()` にそれを出し、`startLine()`・`endLine()`・`lookupCount()` はそのまま残る
- `append` が `LogPathNotSetError` を投げたら、`message()` が `記録ファイルが選ばれていないため記録しませんでした` になり、入力は残る

- [ ] **Step 2: 失敗を確認する** — Run: `npx ng test --watch=false` / Expected: FAIL
- [ ] **Step 3: 実装する**（重複の判定には、記録時点で `ReadingLogService.load()` を読み直した記録を使う。画面には「記録する」ボタン、記録ファイルのパス、「記録ファイルを変更」ボタンを置く。起動時に `ReadingLogService.init()` を呼ぶ）
- [ ] **Step 4: 通過を確認する** — Run: `npx ng test --watch=false` / Expected: PASS（全テスト）

---

### Task 9: README と配布物の確認

**Files:**
- Create/Modify: `gutenberg-reader/README.md`

- [ ] **Step 1: README を書く**（目的、使い方の流れ、記録 CSV の形式、`pstudy-dict` を隣に置く必要があること、起動方法 `npm run desktop`、配布物 `npm run dist:win` / `dist:linux`、構成表。`pstudy-dict/README.md` の書き方に合わせる）
- [ ] **Step 2: Linux で手動確認する** — `npm run desktop` で `1342` を開き、範囲指定、単語を調べる、記録、を一通り行う。記録 CSV を開き、BOM・CRLF・見出しを確認する。CSV を Excel 形式で改行なしに保存し直してから追記し、行がつながらないことを確かめる。アプリを再起動して同じ本を開き、しおりの位置から始まることを確かめる
- [ ] **Step 3: Windows 版をビルドする** — Run: `npm run dist:win` / Expected: `dist/widget/` に zip ができる。可能なら Windows 上で起動し、日本語を含むパスに記録ファイルを作れることを確かめる
