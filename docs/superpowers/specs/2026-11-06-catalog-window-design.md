# 目録の一覧ウインドウの設計

## 目的

Project Gutenberg の目録を別のウインドウで一覧にし、分類・題名・著者で絞り込み、並べ替えて眺め、選んだ本を読書画面で開けるようにする。

## 決定事項

- 一覧は**別のウインドウ**に出す（読書画面と並べて使える）。
- 一覧の用途は「眺めて選んで開く」。書き出しはしない。
- 題名・著者・番号に加えて**分類（Category）**を使う。分類は目録 CSV の `Bookshelves` のうち `Category: ` で始まるもの（約 72 種類、1 冊に平均 2.6 個。2026-11-06 に確認）。
- ルーターは入れない。`App` が URL のパスで読書画面と一覧画面を出し分ける。
- ブラウザ版（`npm start`）では一覧ウインドウを開けないので、ボタンを出さない。
- ウインドウ間の目録の同期はしない（片方で更新しても、もう片方は開き直すまで古いまま）。

## ウインドウと画面の切り替え

- 読書画面のツールバーに「目録の一覧」ボタンを置く。押すと `openCatalogWindow()` で一覧ウインドウを開く。すでに開いていれば前に出す（2 枚目は作らない）。
- 一覧ウインドウは `app://local/catalog` を読み込む。`resolveStaticFile` は無いファイルに `index.html` を返し、`index.html` は `<base href="/">` なので、配信の仕組みは変えない。
- `App` は `location.pathname` が `/catalog` なら `CatalogListComponent`、それ以外は `ReaderComponent` を出す。
- 一覧ウインドウの大きさは 900×700（最小 640×480）、題名は「Gutenberg 目録」。preload と sandbox は読書ウインドウと同じ。

## 一覧から本を開く（IPC）

```
一覧ウインドウ ──openBookInReader(id)──> main ──webContents.send('reader:open-book', id)──> 読書ウインドウ
                                         └─ 読書ウインドウを前に出す
```

画面向けの API（`GutenbergDesktop`）に 3 つ足す。4 か所（型・`preload.cjs`・`main.mjs`・`preload.test.mjs`）をそろえる。

| API                                                                             | 向き        | 内容                                                                                                                                                    |
| ------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openCatalogWindow(): Promise<void>`                                            | 画面 → main | 一覧ウインドウを開くか前に出す（チャンネル `catalog:open-window`）                                                                                      |
| `openBookInReader(id: number): Promise<{ ok: true } \| { ok: false, message }>` | 画面 → main | 読書ウインドウに本を開かせ、前に出す（チャンネル `reader:request-open`）。読書ウインドウが無ければ `{ ok: false, message: '読書画面が開いていません' }` |
| `onOpenBook(callback: (id: number) => void): () => void`                        | main → 画面 | 読書画面が `reader:open-book` を受け取る。戻り値で登録を解除する                                                                                        |

- ハンドラーは呼び出し元（`fromApp`）を確かめ、`id` は正の整数だけを受け付ける。違えば `{ ok: false, message: '不正な呼び出しです' }`。
- `onOpenBook` の preload 側は、受け取った値が正の整数のときだけ callback を呼ぶ。
- 判断（`id` の検査、既存のウインドウを再利用するか）は `electron/windows.mjs` の純粋な関数にしてテストする。

## 分類のデータ

- `CatalogEntry` に `categories: string[]` を足す（`Category: Adventure` → `Adventure`。並びは CSV のまま、重複なし）。
- 保存する JSON の `entries` の各要素にも `categories` を入れる。
- `parseSavedCatalog` は `categories` が無い要素を壊れたものとせず、`categories: []` として読む（前の形式の保存データ）。`categories` があるのに文字列の配列でなければ壊れたものとする。
- 一覧画面は、全部の本の `categories` が空なら「分類を使うには目録を更新してください」と出す。

## 一覧画面（`CatalogListComponent`）

- 上部に、絞り込みの入力欄（題名・著者。今の `searchCatalog` と同じ語の一致）、分類の選択（「すべて」と各分類。冊数の多い順で「Adventure（2569）」のように冊数を添える）、並べ替え（番号・題名・著者）、件数（「◯冊」）を並べる。
- 一覧は仮想スクロール（`@angular/cdk/scrolling`）で描く。1 行に題名・著者・分類（「, 」区切り）・番号と「開く」ボタンを出す。件数の上限は設けない。
- 「開く」を押すと `openBookInReader(id)` を呼ぶ。失敗したら理由を出す。一覧ウインドウは閉じない。
- 目録の取得・更新・状態の表示は `CatalogService` を使う（目録が空なら「目録を取得」を出す）。
- 判断（絞り込み・分類・並べ替え・分類ごとの冊数）は `src/app/services/catalog-list.ts` の純粋な関数に置く。

## 読書画面の変更

- 「目録の一覧」ボタン（デスクトップ版だけ）。
- 起動時に `onOpenBook` を登録し、受け取った番号を番号の入力欄に入れて `openBook` を呼ぶ（目録の検索欄から選んだときと同じ動き）。

## 目録が途中で切れたときの扱い（あわせて直す）

- 2026-11-06 の調査で、目録のダウンロードが途中で切れることがあった。今のままでは、欠けた目録を保存してしまうおそれがある。
- `parseCatalog` で読めた英語の本が `MIN_CATALOG_ENTRIES`（10000）冊未満なら `CatalogFormatError` にする（実物は約 6 万冊）。

## エラー処理

- 一覧ウインドウを開けないときは、読書画面に理由を出す。
- 「開く」が `{ ok: false }` を返したら、一覧画面に理由を出す。
- 古い保存データは分類なしとして使い、更新を促す。

## テスト

- `catalog.spec.ts`: 分類の取り出し、古い保存データ（`categories` なし）を `[]` で読むこと、`categories` の形が違えば `null`、`MIN_CATALOG_ENTRIES` 未満は `CatalogFormatError`。
- `catalog-list.spec.ts`: 絞り込み、分類、並べ替え（番号・題名・著者。大文字・小文字を区別しない）、分類ごとの冊数（多い順）。
- `electron/windows.test.mjs`: `id` の検査、既存のウインドウを再利用するかの判断。
- `electron/preload.test.mjs`: 3 つの API のチャンネルと引数、`onOpenBook` の登録と解除、不正な値で callback を呼ばないこと。
- `catalog-list.component.spec.ts`: 絞り込み・分類・並べ替え・件数、「開く」で `openBookInReader` を呼ぶこと、失敗の表示、分類の無い古いデータの案内。
- `app.spec.ts`: パスが `/catalog` なら一覧画面、それ以外は読書画面。
- 読書画面の spec: 「目録の一覧」ボタン（デスクトップ版だけ）、`onOpenBook` で本を開くこと。
