# 目録の一覧ウインドウ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 目録を別のウインドウで一覧にし、分類・題名・著者で絞り込み・並べ替えて、選んだ本を読書ウインドウで開けるようにする。

**Architecture:** 目録の 1 冊に分類（`categories`）を足し、絞り込み・並べ替えは純粋な関数 `catalog-list.ts` に置く。Electron は 2 枚目のウインドウで `app://local/catalog` を読み込み、`App` がパスで `CatalogListComponent` と `ReaderComponent` を出し分ける。一覧の「開く」は IPC で main に送り、main が読書ウインドウに `reader:open-book` を送る。

**Tech Stack:** Angular（standalone・signal・`@angular/cdk/scrolling`）、Electron 44（ESM の main、CommonJS の preload）、Vitest

**Spec:** `docs/superpowers/specs/2026-11-06-catalog-window-design.md`

## Global Constraints

- 一覧ウインドウ: `app://local/catalog`、900×700（最小 640×480）、題名「Gutenberg 目録」、preload と sandbox は読書ウインドウと同じ。開いていれば前に出し、2 枚目は作らない。
- 追加する API（`GutenbergDesktop`）: `openCatalogWindow(): Promise<void>`（`catalog:open-window`）、`openBookInReader(id: number): Promise<{ ok: true } | { ok: false; message: string }>`（`reader:request-open`）、`onOpenBook(callback: (id: number) => void): () => void`（main → 画面 `reader:open-book`）。4 か所（型・`preload.cjs`・`main.mjs`・`preload.test.mjs`）をそろえる。
- 文言: `'不正な呼び出しです'`、`'読書画面が開いていません'`、`'分類を使うには目録を更新してください'`、ボタン「目録の一覧」、件数「◯冊」（例 `62114 冊`）、分類の選択肢「Adventure（2569）」、先頭の選択肢「すべて」。
- 分類は `Bookshelves` を `;` で区切り、`Category: ` で始まるものから接頭辞を外す（並びは CSV のまま、重複なし）。
- 読めた英語の本が `MIN_CATALOG_ENTRIES`（10000）冊未満なら `CatalogFormatError`。
- ルーターは入れない。ブラウザ版（`DesktopBridgeService.api` が `null`）では「目録の一覧」ボタンを出さない。
- パスは `node:path`、インデントは半角空白 2 個、変数名は camelCase、半角カナは使わない。テストを先に書き、失敗を確かめてから実装する。共通データは `*.testing.ts`。
- 保存の前に `npx prettier --write <変更したファイル>`。ただし `docs/superpowers/2026-11-03-implementation-log.md` には prettier をかけない（`*` が `_` に化ける）。
- `npx ng test` の前に `npm run sync:pstudy`。git 管理外のためコミットの手順は置かない。

## Review Focus

1. **一覧ウインドウを閉じてからもう一度「目録の一覧」を押す** → 破棄済みのウインドウを使い回さず、新しく開く（Task 3: `shouldReuseWindow` が破棄済みに `false`）。
2. **読書ウインドウを閉じたあとで一覧の「開く」を押す** → 例外にせず「読書画面が開いていません」と出す（Task 3・Task 4）。
3. **前の形式で保存した目録（`categories` なし）で起動する** → 壊れたものとせず一覧を出し、「分類を使うには目録を更新してください」と出す（Task 1・Task 4）。
4. **絞り込みで 0 冊になる／目録を更新したら選んでいた分類が無くなった** → 「0 冊」と「見つかりません」を出す。無くなった分類は「すべて」に戻す（Task 4）。
5. **読書画面を作り直す（テストやホットリロード）** → `onOpenBook` の登録を `DestroyRef` で解除し、二重に本を開かない（Task 5）。

---

### Task 1: 分類のデータと、途中で切れた目録の扱い

**Files:**

- Modify: `src/app/services/catalog.ts`（`CatalogEntry`・`parseCatalog`・`parseSavedCatalog`、`MIN_CATALOG_ENTRIES`・`assertCompleteCatalog` を追加）
- Modify: `src/app/services/catalog.testing.ts`（`Bookshelves` 列の値）
- Modify: `src/app/services/catalog.service.ts`（取得時に `assertCompleteCatalog`、最小冊数は注入トークン）
- Modify: `src/app/components/reader/reader.testing.ts`（`provideFakeCatalog` の entries に `categories: []`）
- Test: `src/app/services/catalog.spec.ts`、`src/app/services/catalog.service.spec.ts`

**Interfaces:**

- Produces:
  - `CatalogEntry { id: number; title: string; author: string; categories: string[] }`
  - `export const MIN_CATALOG_ENTRIES = 10000`
  - `export function assertCompleteCatalog(entries: readonly CatalogEntry[], min = MIN_CATALOG_ENTRIES): void` — `min` 未満なら `CatalogFormatError`
  - `export const CATALOG_MIN_ENTRIES = new InjectionToken<number>('CATALOG_MIN_ENTRIES', { factory: () => MIN_CATALOG_ENTRIES })`（`catalog.service.ts`。テストで小さい値に差し替える）

**判断（spec との違い）:** spec は「`parseCatalog` で」冊数を確かめるとしている。しかし、見本の CSV は 3 冊なので、`parseCatalog` の中で確かめると既存のテストと見本がすべて使えなくなる。そこで冊数の確認は `assertCompleteCatalog` に分け、`CatalogService.fetch` が `parseCatalog` の直後に呼ぶ。動き（切れた目録を保存しない）は spec と同じにする。

- [ ] **Step 1: 見本を書き換える**

  `CATALOG_CSV` の `Bookshelves` 列を次の値にする。
  - 1342: `"Best Books Ever Listings; Category: Novels; Category: British Literature; Category: Novels"`（重複を含む）
  - 2: `US Civil War`（分類なし）
  - 100: `Category: Plays/Films/Dramas`

- [ ] **Step 2: 失敗するテストを書く**

  `catalog.spec.ts`:
  - `parseCatalog(CATALOG_CSV).map((e) => e.categories)` が `[['Novels', 'British Literature'], [], ['Plays/Films/Dramas']]` になる。
  - 既存の `toEqual({ id: 2, ... })` などの期待値に `categories` を足す。
  - `parseSavedCatalog` について、次の 3 つを確かめる。
    - `categories` が無い要素（前の形式）は `categories: []` として読む。
    - `categories` が `'Novels'` や `[1]` の要素を含むなら `null` を返す。
    - `categories` 付きの保存データを読み戻せる。
  - `assertCompleteCatalog`: 3 冊で `min = 3` なら投げない。`min = 4` なら `CatalogFormatError`。既定値の `MIN_CATALOG_ENTRIES` は `10000`。

  `catalog.service.spec.ts`:
  - 既存のテストは `{ provide: CATALOG_MIN_ENTRIES, useValue: 1 }` を足して通す。
  - 新しいテストを足す。`CATALOG_MIN_ENTRIES` が `4` で `CATALOG_CSV`（3 冊）を返したら、次のようになること。
    - `error()` は `'目録の形式が想定と違います'`。
    - 前の `entries` を残す。
    - `writeCatalog` を呼ばない。

- [ ] **Step 3: 失敗を確かめる**

  Run: `npm run sync:pstudy && npx ng test --watch=false --include src/app/services/catalog.spec.ts --include src/app/services/catalog.service.spec.ts 2>&1 | grep -E "Test Files|Tests |FAIL|×"`
  Expected: 新しいテストが FAIL

- [ ] **Step 4: 実装する**

  - `parseCatalog` に `Bookshelves` 列を足す。この列は必須の見出しにはしない。無ければ全部の本を `categories: []` にする。
  - `parseSavedCatalog` を、`categories` が無い場合と、文字列の配列の場合の両方を受け付けるようにする。
  - `CatalogService.fetch` で、`parseCatalog` の直後に `assertCompleteCatalog(entries, inject(CATALOG_MIN_ENTRIES))` を呼ぶ。
  - `catalog-search` のテストや `reader.testing.ts` の見本で、型エラーになる所に `categories` を足す。

- [ ] **Step 5: 成功を確かめる**

  Run: `npm test -- --watch=false 2>&1 | grep -E "Test Files|Tests |FAIL|×"`
  Expected: 全件 PASS

---

### Task 2: 一覧の絞り込み・並べ替え（純粋な関数）

**Files:**

- Create: `src/app/services/catalog-list.ts`
- Test: `src/app/services/catalog-list.spec.ts`

**Interfaces:**

- Consumes: Task 1 の `CatalogEntry`、既存の `searchCatalog(entries, query, limit)`
- Produces:
  - `export type CatalogSort = 'id' | 'title' | 'author'`
  - `export interface CategoryCount { name: string; count: number }`
  - `export function filterCatalog(entries: readonly CatalogEntry[], query: string, category: string | null): CatalogEntry[]` — `query` が空なら語で絞らない。空でなければ `searchCatalog(entries, query, Infinity)` と同じ一致のしかた。`category` が `null` なら分類で絞らない
  - `export function sortCatalog(entries: readonly CatalogEntry[], sort: CatalogSort): CatalogEntry[]` — 新しい配列を返す。`title`・`author` は `localeCompare(..., 'en', { sensitivity: 'base' })` で比べ、同じなら番号の小さい順
  - `export function countCategories(entries: readonly CatalogEntry[]): CategoryCount[]` — 冊数の多い順、同じなら名前の順
  - `export function hasAnyCategory(entries: readonly CatalogEntry[]): boolean`

- [ ] **Step 1: 失敗するテストを書く**

  見本はテストの中で作る（4 冊）。
  - `{ id: 3, title: 'b Tale', author: 'Zed', categories: ['Novels'] }`
  - `{ id: 1, title: 'A Tale', author: 'amy', categories: ['Novels', 'Poetry'] }`
  - `{ id: 2, title: 'c Poems', author: 'Bob', categories: ['Poetry'] }`
  - `{ id: 4, title: 'Old', author: 'Old', categories: [] }`

  確かめること:
  - `filterCatalog(e, '', null)` は 4 冊すべてを返す。
  - `filterCatalog(e, 'tale', null)` の番号は `[3, 1]` になる。
  - `filterCatalog(e, '', 'Poetry')` の番号は `[1, 2]` になる。
  - `filterCatalog(e, 'tale', 'Poetry')` の番号は `[1]` になる。
  - `filterCatalog(e, 'zzz', null)` は `[]` を返す。
  - `sortCatalog` の結果（番号の並び）
    - `'id'` → `[1, 2, 3, 4]`
    - `'title'` → `[1, 3, 2, 4]`（大文字・小文字を区別しない）
    - `'author'` → `[1, 2, 4, 3]`
  - `sortCatalog` は元の配列を変えない。
  - `countCategories(e)` は `[{ name: 'Novels', count: 2 }, { name: 'Poetry', count: 2 }]` を返す。
  - `hasAnyCategory(e)` は `true`、`hasAnyCategory([e[3]])` は `false`。

- [ ] **Step 2: 失敗を確かめる**

  Run: `npx ng test --watch=false --include src/app/services/catalog-list.spec.ts 2>&1 | grep -E "Test Files|Tests |FAIL|×"`
  Expected: FAIL（モジュールが無い）

- [ ] **Step 3: `catalog-list.ts` を実装する**

- [ ] **Step 4: 成功を確かめる**

  Run: Step 2 と同じ
  Expected: 全件 PASS

---

### Task 3: 一覧ウインドウと本を開く IPC（Electron）

**Files:**

- Create: `electron/windows.mjs`
- Test: `electron/windows.test.mjs`
- Modify: `electron/main.mjs`（`createWindow` を `createReaderWindow`・`createCatalogWindow` に分け、2 つのハンドラーを足す）
- Modify: `electron/preload.cjs`、`electron/preload.test.mjs`
- Modify: `src/app/services/desktop-bridge.service.ts`（型）と、`satisfies GutenbergDesktop` の偽物（型エラーになる所）

**Interfaces:**

- Produces（Electron）:
  - `export function isBookId(value: unknown): boolean` — 正の整数（`Number.isSafeInteger` かつ 1 以上）
  - `export function shouldReuseWindow(win: { isDestroyed(): boolean } | null | undefined): boolean`
  - `export const CATALOG_WINDOW = { url: 'app://local/catalog', width: 900, height: 700, minWidth: 640, minHeight: 480, title: 'Gutenberg 目録' }`
- Produces（画面の型）: Global Constraints の 3 つの API

- [ ] **Step 1: 失敗するテストを書く**

  `windows.test.mjs`:
  - `isBookId` が `1`・`1342` で `true`、`0`・`-1`・`1.5`・`'1342'`・`NaN`・`null`・`2 ** 60` で `false`。
  - `shouldReuseWindow` が `null`・`undefined`・`{ isDestroyed: () => true }` で `false`、`{ isDestroyed: () => false }` で `true`。
  - `CATALOG_WINDOW` の値。

  `preload.test.mjs`:
  - `loadPreload` の偽物の `ipcRenderer` に `on`・`removeListener`（`vi.fn`）を足す。
  - 関数名の配列に `'openCatalogWindow'`・`'openBookInReader'`・`'onOpenBook'` を足す。
  - `openCatalogWindow()` が `invoke('catalog:open-window')` を呼ぶ。
  - `openBookInReader(1342)` が `invoke('reader:request-open', 1342)` の結果をそのまま返す。
  - `onOpenBook(cb)` が `on('reader:open-book', listener)` を登録する。
    - listener に `(event, 1342)` を渡すと `cb(1342)` が呼ばれる。
    - `(event, '1342')` や `(event, -1)` では `cb` を呼ばない。
    - 戻り値の関数を呼ぶと、同じ listener で `removeListener('reader:open-book', listener)` を呼ぶ。

- [ ] **Step 2: 失敗を確かめる**

  Run: `npx vitest run electron/windows.test.mjs electron/preload.test.mjs 2>&1 | grep -E "Test Files|Tests |FAIL|×"`
  Expected: FAIL

- [ ] **Step 3: 実装する**

  - `main.mjs` では、`readerWindow`・`catalogWindow` をモジュールの変数で持つ。2 つのウインドウの作り方は、共通の関数（メニュー・`setWindowOpenHandler`・preload）にまとめる。
  - `catalog:open-window`:
    - `fromApp` でなければ何もしない。
    - `shouldReuseWindow(catalogWindow)` なら、最小化を戻して `focus()` する。そうでなければ作る。
  - `reader:request-open`:
    - `fromApp` でない、または `!isBookId(id)` なら `{ ok: false, message: '不正な呼び出しです' }` を返す。
    - `!shouldReuseWindow(readerWindow)` なら `{ ok: false, message: '読書画面が開いていません' }` を返す。
    - それ以外なら `readerWindow.webContents.send('reader:open-book', id)` を送り、最小化を戻して `focus()` し、`{ ok: true }` を返す。
  - `activate` で作るのは読書ウインドウにする。
  - `preload.cjs` の `onOpenBook` は、受け取った値を `isBookId` と同じ条件で確かめてから `cb` を呼ぶ。preload は ESM を import できないので、条件をそこに書き、コメントで `windows.mjs` の `isBookId` と同じであることを示す。
  - `GutenbergDesktop` に 3 つの関数を足し、JSDoc を付ける。

- [ ] **Step 4: 成功を確かめる**

  Run: `npm run test:electron 2>&1 | grep -E "Test Files|Tests |FAIL|×"` と `npm test -- --watch=false 2>&1 | grep -E "Test Files|Tests |FAIL|×"`
  Expected: どちらも全件 PASS

---

### Task 4: 一覧画面（CatalogListComponent）と目録の状態欄の共通化

**Files:**

- Create: `src/app/components/catalog-status/catalog-status.component.{ts,html,css}`（目録の取得・更新ボタン、取得日と冊数、取得中、エラー。今の `catalog-search.component.html` から切り出す）
- Modify: `src/app/components/catalog-search/catalog-search.component.{ts,html}`（`<app-catalog-status />` を使う）
- Create: `src/app/components/catalog-list/catalog-list.component.{ts,html,css}`、`catalog-list.component.spec.ts`
- Test: `src/app/components/catalog-search/catalog-search.component.spec.ts`（変えずに通ることを確かめる）

**Interfaces:**

- Consumes: Task 2 の関数、Task 3 の `openBookInReader`、`CatalogService`、`DesktopBridgeService`
- Produces: `selector: 'app-catalog-list'`、`export const CATALOG_ROW_HEIGHT = 56`（CSS の `.catalog-row` の高さとそろえる）。公開する signal は `query`・`category: string | null`・`sort: CatalogSort`・`rows`（絞り込みと並べ替えの結果）・`categories`（`countCategories`）・`message: string | null`。メソッドは `open(id: number): Promise<void>`。

- [ ] **Step 1: 失敗するテストを書く（`catalog-list.component.spec.ts`）**

  `CatalogService` は `createFakeCatalog()`（`catalog-search.testing.ts`）を使う。`DesktopBridgeService` は `{ api: { openBookInReader } }` を渡す。

  jsdom では仮想スクロールの行がほとんど描かれないので、行の中身と並びは `rows()` で確かめる。件数・案内・選択肢は DOM で確かめる。
  - 生成時に `load` を 1 回呼ぶ。
  - 目録が空なら `app-catalog-status` の「目録を取得」を出す。
  - 見本（Task 2 と同じ 4 冊）のとき、次のようになること。
    - 件数は `4 冊`。
    - 分類の選択肢は `すべて`・`Novels（2）`・`Poetry（2）`。
    - `query` を `'tale'` にすると、`rows()` の番号が `[1, 3]`（既定の並べ替えは番号の順）になり、件数が `2 冊` になる。
  - 分類に `Poetry` を選ぶと、`rows()` の番号が `[1, 2]` になる。並べ替えを `title` にすると `[1, 2]`、`author` にすると `[1, 2]` になる。
  - `zzz` で絞ると `0 冊` と「見つかりません」を出す。
  - `Poetry` を選んだあとで、目録を Poetry の無いものに変えると、`category()` が `null` に戻る。
  - 全部の本の `categories` が空なら「分類を使うには目録を更新してください」を出す。
  - `open(1342)` で `openBookInReader(1342)` を呼ぶ。
    - `{ ok: false, message: '読書画面が開いていません' }` が返ったら、その文を `role="status"` で出す。
    - 例外が出たら、その理由を出す。

- [ ] **Step 2: 失敗を確かめる**

  Run: `npx ng test --watch=false --include src/app/components/catalog-list/catalog-list.component.spec.ts 2>&1 | grep -E "Test Files|Tests |FAIL|×"`
  Expected: FAIL

- [ ] **Step 3: 状態欄を切り出し、一覧画面を実装する**

  - `CatalogStatusComponent` は `CatalogService` を注入し、今の `catalog-search` と同じ文言と DOM を出す。
  - `CatalogSearchComponent` の検索欄と結果の一覧は、そのまま残す。
  - 一覧画面の構成
    - 上部に `app-catalog-status`、絞り込みの入力欄（`aria-label="題名・著者で絞り込む"`）、分類の `<select aria-label="分類">`、並べ替えの `<select aria-label="並べ替え">`（番号・題名・著者）、件数を並べる。
    - 下に `cdk-virtual-scroll-viewport`（`itemSize` は `CATALOG_ROW_HEIGHT`）を置く。
    - 1 行に題名・著者・分類（「, 」区切り）・`#番号` と「開く」ボタンを出す。
  - 無くなった分類を「すべて」に戻す処理は、`effect` ではなく `computed` で選択中の値を正規化して行う。

- [ ] **Step 4: 成功を確かめる**

  Run: `npm test -- --watch=false 2>&1 | grep -E "Test Files|Tests |FAIL|×"`
  Expected: 全件 PASS（`catalog-search` の既存のテストも変えずに通る）

---

### Task 5: 画面の出し分け・読書画面の変更・ドキュメント

**Files:**

- Modify: `src/app/app.ts`（`APP_PATH` トークンで出し分け）、`src/app/app.spec.ts`
- Modify: `src/app/components/reader/reader.component.{ts,html}`（「目録の一覧」ボタン、`onOpenBook` の登録）
- Modify: `ReaderComponent` を作る各 `reader.*.spec.ts` と `app.spec.ts` の偽の `api`（`onOpenBook: vi.fn(() => () => {})` などを足す）
- Test: `src/app/components/reader/reader.open.spec.ts`（または新しい `reader.catalog-window.spec.ts`）
- Modify: `README.md`、`docs/testing.md`、`docs/superpowers/2026-11-03-implementation-log.md`（追記だけ）

**Interfaces:**

- Consumes: Task 3 の `openCatalogWindow`・`onOpenBook`、Task 4 の `app-catalog-list`
- Produces: `export const APP_PATH = new InjectionToken<string>('APP_PATH', { factory: () => location.pathname })`（`app.ts`）

- [ ] **Step 1: 失敗するテストを書く**

  `app.spec.ts`:
  - `APP_PATH` が `'/catalog'` なら `app-catalog-list` を出し、`app-reader` は出さない。
  - `'/'` なら `app-reader` を出す。

  読書画面:
  - `api` に `openCatalogWindow` があれば「目録の一覧」ボタンを出し、押すと 1 回呼ぶ。
  - `openCatalogWindow` が例外を出したら、「目録の一覧を開けませんでした（<理由>）」を出す。
  - ブラウザ版（`api: null`）ではボタンを出さない。
  - 生成時に `onOpenBook` を 1 回登録する。登録した callback を `1342` で呼ぶと、番号の入力欄が `'1342'` になり、本を開く（`bookLoad` が 1342 で呼ばれる）。
  - `fixture.destroy()` で、`onOpenBook` が返した解除の関数が 1 回呼ばれる。

- [ ] **Step 2: 失敗を確かめる**

  Run: `npx ng test --watch=false --include src/app/app.spec.ts --include "src/app/components/reader/*.spec.ts" 2>&1 | grep -E "Test Files|Tests |FAIL|×"`
  Expected: 新しいテストが FAIL

- [ ] **Step 3: 実装する**

  - `App` は `inject(APP_PATH) === '/catalog'` で、2 つの画面のどちらを出すかを決める。
  - 読書画面の `onOpenBook` は、コンストラクターで登録し、`inject(DestroyRef).onDestroy(unsubscribe)` で解除する。callback では、番号の入力欄（`viewChild` で取る）に値を入れて `openBook(String(id))` を呼ぶ。今の `selectFromCatalog` と同じ処理なので、共通にする。
  - ボタンはツールバーに置く。

- [ ] **Step 4: 全体を確かめる**

  Run: `npm test -- --watch=false 2>&1 | grep -E "Test Files|Tests |FAIL|×"`、`npm run test:electron 2>&1 | grep -E "Test Files|Tests |FAIL|×"`、`npm run lint`、`npm run build`
  Expected: どれも失敗なし

- [ ] **Step 5: ドキュメントを更新する**

  - README の「使い方」に「目録の一覧」を足す。次のことを書く。
    - 別のウインドウで開く。
    - 分類・題名・著者で絞り込み、並べ替えができる。
    - 「開く」で読書画面に開く。
    - 前の形式の目録は「更新」すると分類が使える。
    - 目録が 10000 冊未満しか読めなかったときは、途中で切れたものとして保存しない。
  - 「プログラムの構造」の表に、新しいファイルを足す。CLAUDE.md の「仕組み」にある IPC の説明は、今の書き方のままで正しいので変えない。
  - `docs/testing.md` の表と件数を更新する。
  - 実装ログには、1 行を追記するだけにする（prettier はかけない）。

- [ ] **Step 6: デスクトップ版で確かめる**（コントローラーが行う）

  Run: `npm run desktop`
  Expected: 次のことを目で確かめる。
  - 「目録の一覧」で別のウインドウが開き、もう一度押すと前に出る。
  - 閉じてから押すと、また開く。
  - 分類と並べ替えが効く。
  - 「開く」で読書ウインドウに本が開き、前に出る。
