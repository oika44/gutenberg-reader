# 目録検索の設計

## 目的

本の番号を知らなくても、題名・著者名から Project Gutenberg の本を探して開けるようにする。

## 決定事項

- 目録には Project Gutenberg が公開する `https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv`（約 21MB、週 1 回程度更新）を使う。
- 検索対象は題名と著者だけとする（Subjects・Bookshelves は対象外）。
- 英語の本（`Language` に `en` を含む）かつ `Type` が `Text` の行だけを扱う。
- 検索欄は今の画面（`ReaderComponent`）の上部に置く。
- 目録は「目録を取得」ボタンを押したときだけダウンロードする（起動時に勝手に 21MB を取りに行かない）。
- 取得した目録は絞り込んだ JSON として userData に保存し、次回起動時から使う。

## 構成とデータの流れ

```
[目録を取得]
  CatalogService ── HttpClient ──> /gutenberg/cache/epub/feeds/pg_catalog.csv（既存の中継）
     │ parseCatalog(csv)
     ├─> signal に保持する
     └─> desktop.writeCatalog(json) ─IPC─> main ─> userData/catalog.json

[起動時]
  CatalogService ── desktop.readCatalog() ─IPC─> userData/catalog.json（無ければ null）
```

- 中継先は増やさない（`/gutenberg/` の既存の中継で取得できる）。
- 保存する JSON の形は `{ "fetchedAt": "2026-11-06", "entries": [{ "id": 1342, "title": "...", "author": "..." }] }` とする。
- ブラウザ版（`DesktopBridgeService.api` が `null`）では保存・読み込みをせず、取得した目録をその起動中だけ使う。

## 部品

| ファイル                                            | 役割                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/services/catalog.ts`                       | 純粋な関数。`parseCatalog(csv): CatalogEntry[]` は引用符付きの値（中の改行・`""`）に対応し、英語・Text の行だけを `{ id, title, author }` にする。題名の中の改行は空白 1 つにする。`searchCatalog(entries, query, limit = 50)` は空白で区切った語がすべて題名か著者に含まれる本を返す（大文字・小文字を区別しない。空の入力なら空の配列） |
| `src/app/services/catalog.service.ts`               | 取得・保存・読み込みと状態（`entries`・`fetchedAt`・`loading`・`error`）を signal で持つ                                                                                                                                                                                                                                                  |
| `src/app/components/catalog-search/`                | 検索欄・結果一覧・取得／更新ボタン。結果を選ぶと `bookSelected` に本の番号を出す                                                                                                                                                                                                                                                          |
| `electron/catalog-file.mjs`                         | 純粋な関数。保存データの検証（`isCatalogJson`）と、ファイルの読み書き                                                                                                                                                                                                                                                                     |
| `electron/main.mjs`                                 | `catalog:read`・`catalog:write` のハンドラー（Electron API の呼び出しだけ）                                                                                                                                                                                                                                                               |
| `electron/preload.cjs`・`desktop-bridge.service.ts` | `readCatalog()`・`writeCatalog(json)` を追加する                                                                                                                                                                                                                                                                                          |
| `ReaderComponent`                                   | 上部に検索部品を置き、`bookSelected` を受けて既存の `openBook` を呼ぶ                                                                                                                                                                                                                                                                     |

## IPC

- `readCatalog(): Promise<string | null>` — 保存した JSON の文字列。ファイルが無ければ `null`。
- `writeCatalog(json: string): Promise<{ ok: true } | { ok: false, message }>`
- 保存先は `userData/catalog.json` に固定し、画面からパスは受け取らない。
- ハンドラーは呼び出し元（`isFromApp`）と引数の型を確かめ、失敗は例外ではなく `{ ok: false, message }` で返す。

## 画面

- ツールバーの上に検索欄を置く。入力のたびに最大 50 件の結果（題名・著者・番号）を一覧で出す。
- 結果をクリックするとその本を開き、検索欄を空にして一覧を閉じる。
- 目録が無いときは「目録を取得」ボタンを出す。取得中は「目録を取得しています…」と出す。
- 目録があるときは「目録: 2026-11-06 取得（◯冊）」と「更新」ボタンを出す。

## エラー処理

- 取得に失敗したら「目録を取得できません（ネットワークを確認してください）」と出す。手元の目録があればそれを使い続ける。
- 保存に失敗しても、取得した目録はその起動中は使い、理由を表示する。
- 保存データが壊れている（JSON として読めない・形が違う）ときは、目録が無いものとして扱い、取得し直しを促す。

## テスト

- `src/app/services/catalog.spec.ts`: 引用符付きの改行、`""` のエスケープ、英語・Text 以外の除外、複数の語での検索、大文字・小文字の無視、件数の上限、空の入力。
- `src/app/services/catalog.service.spec.ts`: 取得→保存、起動時の読み込み、取得失敗、保存失敗、壊れた保存データ、ブラウザ版。
- `src/app/components/catalog-search/catalog-search.component.spec.ts`: 入力で結果が出る、クリックで `bookSelected` が出る、取得ボタンの表示切り替え。
- `electron/catalog-file.test.mjs`: 検証と読み書き（無いファイルは `null`）。
- `electron/preload.test.mjs`: 追加した 2 つの API。
- テストの共通データ（目録 CSV の見本など）は `*.testing.ts` に置く。
