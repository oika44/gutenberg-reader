# 目録検索 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Project Gutenberg の目録（pg_catalog.csv）を取り込み、読書画面の上部で題名・著者から英語の本を検索して開けるようにする。

**Architecture:** 画面が既存の中継 `/gutenberg/` で目録 CSV を取得し、純粋な関数 `parseCatalog` で `{ id, title, author }` に絞る。結果は `CatalogService` が signal で持ち、デスクトップ版では新しい IPC（`readCatalog`・`writeCatalog`）で `userData/catalog.json` に保存する。検索欄は新しい `CatalogSearchComponent` として `ReaderComponent` の上部に置き、選ばれた本の番号を既存の `openBook` に渡す。

**Tech Stack:** Angular（standalone・signal）、Electron 44（ESM の main、CommonJS の preload）、Vitest（画面は `ng test`、Electron は `vitest run --dir electron`）

**Spec:** `docs/superpowers/specs/2026-11-06-catalog-search-design.md`

## Global Constraints

- 目録の URL は `/gutenberg/cache/epub/feeds/pg_catalog.csv`（中継先は増やさない）。
- 対象は `Type` が `Text` で、`Language`（`;` 区切り）に `en` を含む行だけ。検索対象は題名と著者だけ。
- 保存先は `userData/catalog.json` に固定し、画面からパスを受け取らない。形は `{ "fetchedAt": "YYYY-MM-DD", "entries": [{ "id", "title", "author" }] }`。
- 検索結果は最大 50 件。
- 目録は「目録を取得」「更新」ボタンを押したときだけダウンロードする。
- IPC のハンドラーは `fromApp(event)` と引数の型を確かめ、失敗は `{ ok: false, message }` で返す。API を足すときは `desktop-bridge.service.ts` の `GutenbergDesktop`・`preload.cjs`・`main.mjs`・`preload.test.mjs` の 4 か所をそろえる。
- パスは `node:path` で扱う。インデントは半角空白 2 個、変数名は camelCase、半角カナは使わない。
- テストを先に書き、失敗を確かめてから実装する。テストの共通データは `*.testing.ts` に置く。
- 保存の前に `npx prettier --write <変更したファイル>` で整形する。
- `npx ng test` を直接使う前に `npm run sync:pstudy` を実行しておく。
- このフォルダは git 管理外のため、コミットの手順は置かない（コミットは指示があったときだけ行う）。

## Review Focus

1. **中継が 200 で HTML（エラーページ）や見出しの違う CSV を返す** → 目録として読まず「目録の形式が想定と違います」と出し、手元の目録はそのまま残す（Task 1・Task 3）。
2. **題名に改行や `""` を含む行・著者が空の行・`Language` が `en; fr` の行** → それぞれ 1 冊として正しく読む（Task 1）。
3. **保存中にアプリが落ちる／保存した JSON が壊れている** → 一時ファイルに書いてから置き換え、壊れた保存データは「無いもの」として取得し直しを促す（Task 2・Task 3）。
4. **取得中に「更新」を何度も押す** → 二重に取得しない（Task 3・Task 4）。
5. **検索語の大文字・前後や間の余分な空白・空白だけの入力** → 大文字・小文字と余分な空白を無視し、空白だけなら結果を出さない（Task 1）。

---

### Task 1: 目録の読み取りと検索（純粋な関数）

**Files:**

- Create: `src/app/services/catalog.ts`
- Create: `src/app/services/catalog.testing.ts`（目録 CSV の見本 `CATALOG_CSV`）
- Test: `src/app/services/catalog.spec.ts`

**Interfaces:**

- Produces:
  - `export const CATALOG_URL = '/gutenberg/cache/epub/feeds/pg_catalog.csv'`
  - `export interface CatalogEntry { id: number; title: string; author: string }`
  - `export interface CatalogData { fetchedAt: string; entries: CatalogEntry[] }`
  - `export class CatalogFormatError extends Error`（メッセージ `'目録の形式が想定と違います'`）
  - `export function parseCatalog(csv: string): CatalogEntry[]` — 見出しに `Text#`・`Type`・`Title`・`Language`・`Authors` のどれかが無ければ `CatalogFormatError` を投げる
  - `export function searchCatalog(entries: readonly CatalogEntry[], query: string, limit = 50): CatalogEntry[]`
  - `export function parseSavedCatalog(json: string | null): CatalogData | null` — `null`・JSON として読めない・形が違う（`fetchedAt` が文字列でない、`entries` が配列でない、要素の `id` が正の整数でない・`title`/`author` が文字列でない）なら `null`

- [ ] **Step 1: 見本データ `catalog.testing.ts` を書く**

  `CATALOG_CSV` は見出し `Text#,Type,Issued,Title,Language,Authors,Subjects,LoCC,Bookshelves` と、次の行を CRLF で並べたもの。
  - `1342,Text,1998-06-01,Pride and Prejudice,en,"Austen, Jane, 1775-1817",...`
  - `2,Text,...,"The United States Bill of Rights` + 改行 + `The Ten Original Amendments",en,,...`（題名に改行、著者が空）
  - `100,Text,...,"The ""Complete"" Works",en; fr,"Shakespeare, William, 1564-1616",...`
  - `200,Sound,...,Audio Book,en,...`（除く）
  - `300,Text,...,Les Misérables,fr,"Hugo, Victor",...`（除く）

- [ ] **Step 2: 失敗するテストを書く（`catalog.spec.ts`）**

  ```ts
  describe('parseCatalog', () => {
    it('英語の Text の行だけを、見本の順に { id, title, author } にする', () => {
      expect(parseCatalog(CATALOG_CSV).map((e) => e.id)).toEqual([1342, 2, 100]);
    });
    it('題名の中の改行は空白 1 つにし、著者が空なら空文字にする', () => {
      expect(parseCatalog(CATALOG_CSV)[1]).toEqual({
        id: 2,
        title: 'The United States Bill of Rights The Ten Original Amendments',
        author: '',
      });
    });
    it('"" を " に戻し、Language が "en; fr" の本も含める', () => {
      expect(parseCatalog(CATALOG_CSV)[2].title).toBe('The "Complete" Works');
    });
    it('列の並びが変わっても見出しの名前で読む', () => {
      /* Title と Text# を入れ替えた CSV でも同じ結果 */
    });
    it.each([['<html><body>Error</body></html>'], ['a,b,c\r\n1,2,3'], ['']])(
      '見出しが違う（%j）なら CatalogFormatError',
      (csv) => {
        expect(() => parseCatalog(csv)).toThrow(CatalogFormatError);
      },
    );
  });

  describe('searchCatalog', () => {
    // entries = parseCatalog(CATALOG_CSV)
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
      /* id 1..60 の 60 件に 'a' で検索 → 50 件、limit=3 なら 3 件 */
    });
  });

  describe('parseSavedCatalog', () => {
    it('保存した形を読み戻す', () => {
      /* JSON.stringify(data) → toEqual(data) */
    });
    it.each([
      [null],
      ['{'],
      ['[]'],
      ['{"fetchedAt":1,"entries":[]}'],
      ['{"fetchedAt":"2026-11-06","entries":{}}'],
      ['{"fetchedAt":"2026-11-06","entries":[{"id":"1","title":"a","author":"b"}]}'],
      ['{"fetchedAt":"2026-11-06","entries":[{"id":0,"title":"a","author":"b"}]}'],
    ])('壊れた保存データ（%j）は null', (json) => {
      expect(parseSavedCatalog(json)).toBeNull();
    });
  });
  ```

- [ ] **Step 3: 失敗を確かめる**

  Run: `npm run sync:pstudy && npx ng test --watch=false --include src/app/services/catalog.spec.ts 2>&1 | grep -E "Test Files|Tests |FAIL|×"`
  Expected: `catalog` が見つからずに FAIL

- [ ] **Step 4: `catalog.ts` を実装する**

  CSV は 1 文字ずつ読む状態機械で、引用符の中の `,`・改行・`""` を扱う（外部のライブラリは足さない）。行の終わりは `\r\n` と `\n` の両方。言語は `Language.split(';').map(trim)` に `'en'` を含むかで判定する。題名は `/\s*\r?\n\s*/g` を空白 1 つにして `trim` する。

- [ ] **Step 5: 成功を確かめる**

  Run: Step 3 と同じ
  Expected: 全件 PASS

---

### Task 2: 目録の保存（Electron・IPC）

**Files:**

- Create: `electron/catalog-file.mjs`
- Test: `electron/catalog-file.test.mjs`
- Modify: `electron/main.mjs`（import と `registerHandlers` に 2 つのハンドラー）
- Modify: `electron/preload.cjs`、`electron/preload.test.mjs`
- Modify: `src/app/services/desktop-bridge.service.ts`（型 `GutenbergDesktop`）
- Modify: `src/app/services/reading-log.service.spec.ts:30` など、`satisfies GutenbergDesktop` の偽物（型エラーになる所に `readCatalog`・`writeCatalog` を足す）

**Interfaces:**

- Produces（Electron）:
  - `export const MAX_CATALOG_LENGTH = 50 * 1024 * 1024`（文字数）
  - `export function isCatalogJson(text: unknown): boolean` — 文字列・`MAX_CATALOG_LENGTH` 以下・JSON として読める・`fetchedAt` が文字列で `entries` が配列のオブジェクト
  - `export async function readCatalogFile(path: string): Promise<string | null>` — ENOENT なら `null`、それ以外のエラーは投げる
  - `export async function writeCatalogFile(path: string, text: string): Promise<void>` — `path + '.tmp'` に書いてから `rename` で置き換える
  - IPC `catalog:read` → `{ ok: true, text: string | null } | { ok: false, message }`、`catalog:write`（引数 `text`）→ `{ ok: true } | { ok: false, message }`
- Produces（画面の型）:
  - `readCatalog(): Promise<string | null>` — 失敗なら理由をメッセージにした `Error` を投げる（`readLog` と同じ）
  - `writeCatalog(json: string): Promise<AppendResult>`

- [ ] **Step 1: 失敗するテストを書く**

  `catalog-file.test.mjs`（一時フォルダは `mkdtemp(join(tmpdir(), 'catalog-'))`）:
  - `isCatalogJson`: 正しい形は `true`。`'{'`・`'[]'`・`'{"fetchedAt":"x"}'`・`123`・`null`・`MAX_CATALOG_LENGTH + 1` 文字の文字列は `false`。
  - `readCatalogFile`: 無いファイルは `null`。書いた内容を読み戻せる。
  - `writeCatalogFile`: 既にあるファイルを置き換え、`.tmp` を残さない。

  `preload.test.mjs`:
  - 「画面の型と同じ関数をそろえる」の配列に `'readCatalog'`・`'writeCatalog'` を足す。
  - `readCatalog` は `'catalog:read'` を呼び、`{ ok: true, text: 'x' }` なら `'x'` を返す。`{ ok: false, message: 'm' }` なら `Error('m')` を投げる。
  - `writeCatalog('j')` は `invoke('catalog:write', 'j')` の結果をそのまま返す。

- [ ] **Step 2: 失敗を確かめる**

  Run: `npx vitest run electron/catalog-file.test.mjs electron/preload.test.mjs 2>&1 | grep -E "Test Files|Tests |FAIL|×"`
  Expected: FAIL

- [ ] **Step 3: 実装する**

  - `catalog-file.mjs` を書く。
  - `main.mjs` に、ファイルを定義する定数 `CATALOG_FILE = join(app.getPath('userData'), 'catalog.json')` とハンドラーを足す。
    - 呼び出し元が違うときや `!isCatalogJson(text)` のときは `{ ok: false, message: '不正な呼び出しです' }` を返す。
    - 読めないときは `` `目録を読み込めませんでした（${err.code ?? err.message}）` `` を返す。
    - 書けないときは `` `目録を保存できませんでした（${err.code ?? err.message}）` `` を返す。
  - `preload.cjs` と `GutenbergDesktop` に 2 つの関数を足し、JSDoc を付ける。

- [ ] **Step 4: 成功を確かめる**

  Run: `npm run test:electron 2>&1 | grep -E "Test Files|Tests |FAIL|×"` と `npm test -- --watch=false 2>&1 | grep -E "Test Files|Tests |FAIL|×"`
  Expected: どちらも全件 PASS（画面は偽物の型の更新でビルドが通る）

---

### Task 3: CatalogService

**Files:**

- Create: `src/app/services/catalog.service.ts`
- Test: `src/app/services/catalog.service.spec.ts`

**Interfaces:**

- Consumes: Task 1 の `CATALOG_URL`・`parseCatalog`・`parseSavedCatalog`・`CatalogFormatError`、Task 2 の `readCatalog`・`writeCatalog`
- Produces:

  ```ts
  @Injectable({ providedIn: 'root' })
  export class CatalogService {
    readonly entries: Signal<CatalogEntry[]>; // 初期値 []
    readonly fetchedAt: Signal<string | null>; // 初期値 null
    readonly loading: Signal<boolean>;
    readonly error: Signal<string | null>;
    /** 保存した目録を読む。ブラウザ版・保存なしなら何もしない */
    load(): Promise<void>;
    /** ダウンロードして保存する。loading 中なら何もしない */
    fetch(): Promise<void>;
  }
  ```

- [ ] **Step 1: 失敗するテストを書く**

  HTTP には `provideHttpClientTesting()`、Electron の API には `DesktopBridgeService` の `api` の偽物（`satisfies GutenbergDesktop`）を使う。日付は `vi.setSystemTime(new Date(2026, 10, 6, 9, 0))` で固定する。
  - `load`: 保存した JSON を読み、`entries` と `fetchedAt`（`'2026-11-06'`）を設定する。
  - `load`: `readCatalog` が `null` なら `entries` は `[]`、`error` は `null`。
  - `load`: 壊れた JSON なら `entries` は `[]`、`error` は `'保存した目録が壊れています。「目録を取得」で取得し直してください'`。
  - `load`: `readCatalog` が `Error('目録を読み込めませんでした（EACCES）')` を投げたら、`error` にその理由のメッセージを入れる。
  - `fetch`: `CATALOG_URL` を `responseType: 'text'` で取得し、`entries` に `parseCatalog` の結果、`fetchedAt` に `'2026-11-06'` を入れる。`writeCatalog` に `JSON.stringify({ fetchedAt, entries })` を渡す。取得中は `loading()` が `true` で、終わると `false`。
  - `fetch`: 通信に失敗したら、`error` は `'目録を取得できません（ネットワークを確認してください）'`。前の `entries`・`fetchedAt` はそのまま残す。
  - `fetch`: HTML が返ったら、`error` は `'目録の形式が想定と違います'`。前の `entries` はそのまま残し、`writeCatalog` は呼ばない。
  - `fetch`: `writeCatalog` が `{ ok: false, message: '目録を保存できませんでした（ENOSPC）' }` を返したら、`entries` は今回の結果にする。`error` は `'目録を保存できませんでした（ENOSPC）。今回の起動中だけ使います'`。
  - `fetch`: 取得中にもう一度呼んでも、要求は 1 回だけ（`httpMock.match(CATALOG_URL).length === 1`）。
  - `fetch` 成功時は、前の `error` を `null` に戻す。
  - ブラウザ版（`api: null`）では、`load` は何もしない。`fetch` は取得して `entries` を設定し、保存はしない（`error` は `null`）。

- [ ] **Step 2: 失敗を確かめる**

  Run: `npx ng test --watch=false --include src/app/services/catalog.service.spec.ts 2>&1 | grep -E "Test Files|Tests |FAIL|×"`
  Expected: FAIL

- [ ] **Step 3: `catalog.service.ts` を実装する**

  - 状態は private な `signal` で持ち、`asReadonly()` で公開する。
  - `fetchedAt` はその日の日付を `YYYY-MM-DD` で入れる。
  - HTTP は `firstValueFrom` で待つ。

- [ ] **Step 4: 成功を確かめる**

  Run: Step 2 と同じ
  Expected: 全件 PASS

---

### Task 4: CatalogSearchComponent

**Files:**

- Create: `src/app/components/catalog-search/catalog-search.component.ts`・`.html`・`.css`
- Test: `src/app/components/catalog-search/catalog-search.component.spec.ts`

**Interfaces:**

- Consumes: Task 3 の `CatalogService`、Task 1 の `searchCatalog`
- Produces: `selector: 'app-catalog-search'`、`readonly bookSelected = output<number>()`。生成時に `catalog.load()` を 1 回呼ぶ。

- [ ] **Step 1: 失敗するテストを書く**

  `CatalogService` は、signal を書き換えられる偽物を `useValue` で渡す。偽物は `load`・`fetch` を `vi.fn()` にする。
  - 生成時に `load` を 1 回呼ぶ。
  - 目録が空なら、「目録を取得」ボタンを出す。押すと `fetch` を呼ぶ。検索欄は `disabled`。
  - `loading` が `true` なら「目録を取得しています…」を出し、ボタンは `disabled` にする。
  - 目録があれば「目録: 2026-11-06 取得（3 冊）」と「更新」ボタンを出す。
  - 検索欄に `pride` と入れると、結果に `Pride and Prejudice` / `Austen, Jane, 1775-1817` / `#1342` を出す。
  - 当てはまる本がなければ「見つかりません」を出す。入力が空なら、一覧も「見つかりません」も出さない。
  - 結果のボタンを押すと、`bookSelected` に `1342` を出し、検索欄を空にして一覧を閉じる。
  - `error` があれば、その文を `role="status"` で出す。

- [ ] **Step 2: 失敗を確かめる**

  Run: `npx ng test --watch=false --include src/app/components/catalog-search/catalog-search.component.spec.ts 2>&1 | grep -E "Test Files|Tests |FAIL|×"`
  Expected: FAIL

- [ ] **Step 3: 実装する**

  - `query` は `signal('')` で持ち、`results` は `computed(() => searchCatalog(catalog.entries(), query()))` にする。
  - 検索欄の `placeholder` と `aria-label` は「題名・著者で検索（英語の本）」にする。
  - 結果は `<ul>` の中に `<button type="button" class="catalog-result">` を並べる。
  - 一覧は `max-height` を付けてスクロールさせる。

- [ ] **Step 4: 成功を確かめる**

  Run: Step 2 と同じ
  Expected: 全件 PASS

---

### Task 5: 読書画面への組み込みとドキュメント

**Files:**

- Modify: `src/app/components/reader/reader.component.ts`（`imports` に `CatalogSearchComponent`）、`reader.component.html`（`<header class="toolbar">` の上に `<app-catalog-search>`）
- Modify: `src/app/components/reader/reader.testing.ts`（`provideFakeCatalog()` を追加）と、`ReaderComponent` を作る各 `reader.*.spec.ts` の `providers`
- Test: `src/app/components/reader/reader.open.spec.ts`
- Modify: `README.md`（使い方・プログラムの構造の表）、`docs/testing.md`（テストの表と件数）、`docs/superpowers/2026-11-03-implementation-log.md`

**Interfaces:**

- Consumes: Task 4 の `app-catalog-search`・`bookSelected`、Task 3 の `CatalogService`
- Produces: `export function provideFakeCatalog(): Provider`（`reader.testing.ts`）。`CatalogService` の偽物を渡す。偽物の `entries` は 1 冊（1342）、`load`・`fetch` は何もしない。

- [ ] **Step 1: 失敗するテストを書く（`reader.open.spec.ts`）**

  - 目録の結果（`#1342`）を押すと、`/gutenberg/cache/epub/1342/pg1342.txt` を要求し、本を開く（題名が出る）。
  - 番号の入力欄（`aria-label="本の番号か URL"`）の値も `'1342'` にする。

  あわせて、`ReaderComponent` を作るすべての spec の `providers` に `provideFakeCatalog()` を足す。

- [ ] **Step 2: 失敗を確かめる**

  Run: `npx ng test --watch=false --include src/app/components/reader/reader.open.spec.ts 2>&1 | grep -E "Test Files|Tests |FAIL|×"`
  Expected: 新しいテストだけ FAIL

- [ ] **Step 3: 組み込む**

  `bookSelected` を受けたら、番号の入力欄に番号を入れ、既存の `openBook(String(id))` を呼ぶ。

- [ ] **Step 4: 全体を確かめる**

  Run: `npm test -- --watch=false 2>&1 | grep -E "Test Files|Tests |FAIL|×"`、`npm run test:electron 2>&1 | grep -E "Test Files|Tests |FAIL|×"`、`npm run lint`
  Expected: どれも失敗なし

- [ ] **Step 5: ドキュメントを更新する**

  - README の「使い方」の 1 の前に「本を探す」を足す。次のことを書く。
    - 最初に「目録を取得」を押す（約 21MB）。
    - 題名・著者で英語の本を検索できる。
    - 結果を押すと本を開く。
    - 「更新」で目録を取り直せる。
  - 「プログラムの構造」の表に、新しいファイルを足す。
  - `docs/testing.md` の表と件数を更新する。
  - 実装ログに 1 行追記する。

  最後に、変更したファイルを `npx prettier --write` で整形する。

- [ ] **Step 6: デスクトップ版で確かめる**

  Run: `npm run desktop`
  Expected: 次のことを目で確かめる。
  - 「目録を取得」を押すと、取得日と冊数が出る。
  - `pride` で検索すると Pride and Prejudice が出て、押すと開く。
  - アプリを起動し直しても、取得せずに検索できる。
