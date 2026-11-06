# GutenbergReader

英語の多読の記録を取るアプリ。Project Gutenberg の本を表示し、行番号で指定した範囲の**語数・行数**と、その間に**調べた単語数**を CSV に 1 行ずつ追記する。調べた単語は P-Study System 用の CSV（`pstudy-dict` と同じ形式）として書き出せる。

デスクトップ版（Electron、Windows / Linux）として動かす。

## 使い方

1. **本を探す**（任意）: 最初に「目録を取得」を押して、Project Gutenberg の目録をダウンロードする（約 21MB。押したときだけ取得する）。取得すると取得日と冊数が出て、題名・著者で英語の本を検索できる。日本語の題名（例: `若草物語`）を入れて Enter を押すと、Weblio で英語に訳してから検索し（訳は要約欄と、説明文の【単語】【英訳】【対訳】の両方から取る）、「「若草物語」→ Little Women で検索しました」のように使った訳語を出す（誤訳されたときは英語の題名で入れ直す）。結果を押すとその本を開く。「更新」で目録を取り直せる。目録は `userData/catalog.json` に保存するので、次に起動したときは取得せずに検索できる。
   - **目録の一覧**: ツールバーの「目録の一覧」を押すと、別のウインドウで目録の全体を一覧にする（もう一度押すと前に出す）。分類・題名・著者で絞り込み、番号・題名・著者で並べ替えができる。「開く」を押すと読書画面にその本を開く（読書画面を閉じると目録の一覧も閉じる）。前の形式で保存した目録は分類を持たないので、「更新」すると分類が使える。目録が 10000 冊未満しか読めなかったときは、途中で切れたものとして保存しない。
2. **本を開く**: 本の番号（例: `1342`）か URL（例: `https://www.gutenberg.org/ebooks/1342`）を入れて「開く」。記録 CSV に同じ本の記録があれば、前回の終了行の次の行までスクロールし、そこを開始行にする（しおり）。
3. **範囲を指定する**: 行番号の 1 回目のクリックで開始行、2 回目で終了行を決める。開始行より前をクリックすると開始行を選び直す。右の欄に行数（空行を除く）と語数が出る。
4. **単語を調べる**: 本文の単語をダブルクリックすると Weblio で調べ、訳と発音記号を表示する。見つかった単語は P-Study リストに入る（× で外せる）。前回の記録以降に調べた単語を、大文字・小文字を区別せずに重複を除いて数える。見つからなかった単語も数え、通信に失敗した単語は数えない。調べている間は「「◯◯」を調べています…」と出る。Weblio に接続できないときは「Weblio に接続できません（ネットワークを確認してください）」と出る。
5. **記録する**: 「記録する」を押すと記録 CSV に 1 行追記する。調べた単語数は 0 に戻り、次の開始行は終了行の次の行になる。最初の記録のときに保存先を選ぶ（あとから「変更」で選び直せる）。同じ範囲が記録済みなら確認を出す。書き込めなかったとき（Excel で開いているなど）は、入力を残したまま理由を表示する。
6. **P-Study 用 CSV を保存する**: 「CSV 保存（Shift_JIS / UTF-8）」で保存先を選んで保存する。

## 記録 CSV の形式

UTF-8（BOM 付き）・改行 CRLF。Windows の Excel でそのまま開ける。

```
記録日時,本番号,題名,著者,開始行,終了行,行数,語数,調べた単語数
2026-11-03 15:30,1342,Pride and Prejudice,Jane Austen,1,120,104,1532,7
```

- 行番号は本文（`*** START OF THE PROJECT GUTENBERG EBOOK ...` の次の行）を 1 行目として数える。目印が見つからない本はテキスト全体を本文にする。
- 語は `[A-Za-z0-9]+` を基本に、`don't`・`well-known` のように `'` `’` `-` でつながった語を 1 語と数える。
- カンマや `"` を含む値は `"` で囲む。Excel で保存し直して末尾が改行でなくなっても、追記した行は前の行とつながらない。
- Excel で「CSV（コンマ区切り）」（Shift_JIS）のまま保存し直したファイルには追記しない（文字コードが混ざるため）。画面に理由が出るので、Excel では「CSV UTF-8（コンマ区切り）」で保存し直す。
- 記録ファイルを読めなくても本は開く（しおりは使わない）。
- 読めない行があっても記録は続け、画面に「記録ファイルの◯行目を読めませんでした」と表示する。

## 起動と配布物の作成

`gutenberg-reader` と `pstudy-dict` を同じフォルダに並べて置く（共有部品をコピーするため。下の「pstudy-dict との共有」を参照）。

| 用途                                                       | コマンド                              |
| ---------------------------------------------------------- | ------------------------------------- |
| デスクトップ版を起動                                       | `npm run desktop`                     |
| 画面だけを確認（ブラウザ、記録の保存は不可）               | `npm start`                           |
| テスト（画面）                                             | `npm test`                            |
| テスト（Electron の記録ファイル処理・パスの判定・preload） | `npm run test:electron`               |
| lint（ESLint。画面・Electron・scripts）                    | `npm run lint`                        |
| Windows 版（zip）を作る                                    | `npm run dist:win` → `dist/widget/`   |
| Linux 版（deb）を作る                                      | `npm run dist:linux` → `dist/widget/` |
| Angular が二重に同梱されていないか確認                     | `npm run check:angular`               |

テストの構成と書き方は [docs/testing.md](docs/testing.md)、コーディング規約は [docs/coding-standards.md](docs/coding-standards.md) にまとめている。

GitHub に接続できない環境で `npm run dist:win` が `ENETUNREACH` で失敗するときは、キャッシュ済みの Electron の zip を使う。electron-builder は、キャッシュにある zip を確かめるための `SHASUMS256.txt` を GitHub から取りに行くため、接続できないと失敗する。先に zip を `node_modules/electron/checksums.json`（公式の値）と照合し、一致したら `electronDist` で zip のあるフォルダを指定する。

```sh
sha256sum ~/.cache/electron/*/electron-v44.7.0-win32-x64.zip
node -p "require('./node_modules/electron/checksums.json')['electron-v44.7.0-win32-x64.zip']"
# 一致したら（<フォルダ> は zip のあるフォルダ）
npm run build && npx electron-builder --win -c.electronDist=<フォルダ>
```

Linux で `npm run desktop` が sandbox のエラーで起動しないときは、`node_modules/electron/dist/chrome-sandbox` を root 所有・モード 4755 にする（`sudo chown root node_modules/electron/dist/chrome-sandbox && sudo chmod 4755 node_modules/electron/dist/chrome-sandbox`）か、`npm run build && npx electron . --no-sandbox` で起動する。

## プログラムの構造

```
                ┌──────────── Angular の画面 (src/) ─────────────┐
                │  ReaderComponent（画面は 1 つ）                 │
                │    ├ CatalogSearchComponent … 題名・著者で検索  │
                │    ├ CatalogService      … 目録の取得・保存    │
                │    ├ BookService         … 本文の取得と切り出し │
                │    ├ text-count          … 語数・行数          │
                │    ├ ReadingLogService   … 記録 CSV の読み書き │
                │    ├ WordLookupService   … Weblio で訳を取得 (*) │
                │    └ PStudyBuilderService … P-Study 用 CSV (*)  │
                └───────────────┬────────────────────────────────┘
                                │ /gutenberg/... と /weblio/... にアクセス
              ┌─────────────────┴──────────────────┐
         開発 (npm start)                 デスクトップ版 (Electron)
         proxy.conf.json                  electron/main.mjs
              └─────────────────┬──────────────────┘
                                ▼
       https://www.gutenberg.org/cache/epub/<番号>/pg<番号>.txt
       https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv
       https://ejje.weblio.jp/content/<単語>
```

(*) `pstudy-dict` の部品。

| ファイル                                        | 役割                                                                                                                                                                                                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/components/reader/`                    | 画面本体。本文は `@angular/cdk` の仮想スクロールで、見えている行だけを描く                                                                                                                                                                      |
| `src/app/services/book.service.ts`              | 番号・URL の読み取り（`parseBookId`）、START / END の間の切り出しと題名・著者の取り出し（`parseBook`）、取得（`BookService.load`。失敗は `BookFetchError`）                                                                                     |
| `src/app/components/catalog-list/`              | 目録の一覧ウインドウ（`app://local/catalog`）の画面。分類・題名・著者での絞り込み、並べ替え、「開く」で読書画面に本を送る                                                                                                                       |
| `src/app/components/catalog-status/`            | 目録の取得・更新ボタンと、取得日・冊数・取得中・エラーの表示（検索欄と一覧で共通）                                                                                                                                                              |
| `src/app/services/catalog-list.ts`              | 一覧の絞り込み（`filterCatalog`）、並べ替え（`sortCatalog`）、分類ごとの冊数（`countCategories`）、分類の有無（`hasAnyCategory`）                                                                                                               |
| `src/app/app.ts`                                | `APP_PATH`（既定は `location.pathname`）が `/catalog` なら目録の一覧、それ以外は読書画面を出す。ルーターは使わない                                                                                                                              |
| `src/app/components/catalog-search/`            | 目録の取得ボタンと、題名・著者の検索欄・結果の一覧。選んだ本の番号を `bookSelected` で読書画面に渡す                                                                                                                                            |
| `src/app/services/catalog.ts`                   | 目録 CSV の読み取り（`parseCatalog`。英語の Text だけ）、検索（`searchCatalog`。最大 50 件）、保存した JSON の読み取り（`parseSavedCatalog`）                                                                                                   |
| `src/app/services/title-translation.ts`         | 日本語の題名の判定（`hasJapanese`）、Weblio のページからの英訳の候補の取り出し（`parseTranslations`。要約欄と説明文の【単語】【英訳】【対訳】から取り、かっこ書き・先頭の冠詞・重複を除く）、候補ごとの検索結果の合成（`searchByTranslations`） |
| `src/app/services/title-translation.service.ts` | 日本語の題名を `/weblio/...` 経由で英訳する（`translate`）。Weblio に無い語は空、通信の失敗は `TitleTranslationError`                                                                                                                           |
| `src/app/services/weblio-error.ts`              | Weblio との通信エラーの理由の文（読書画面と目録検索で共通）                                                                                                                                                                                     |
| `src/app/services/catalog.service.ts`           | 目録のダウンロード、`userData/catalog.json` への保存と読み込み。状態は signal（`entries`・`fetchedAt`・`loading`・`error`）                                                                                                                     |
| `src/app/services/text-count.ts`                | 語数（`countWords`）と、範囲の行数・語数（`countRange`）                                                                                                                                                                                        |
| `src/app/services/reading-log.ts`               | 記録 CSV の行の作成・読み取り、しおりの計算、重複の判定                                                                                                                                                                                         |
| `src/app/services/reading-log.service.ts`       | 記録ファイルの保存先の管理、読み込み、追記                                                                                                                                                                                                      |
| `src/app/services/desktop-bridge.service.ts`    | Electron の preload が用意する `window.gutenbergDesktop` を包む                                                                                                                                                                                 |
| `src/app/services/selected-word.ts`             | ダブルクリックで選ばれた文字列から、前後の記号を除いた単語を取り出す                                                                                                                                                                            |
| `electron/main.mjs`                             | 画面の配信（`app://local/`）、中継、記録 CSV の読み書き、保存ダイアログ。設定（記録ファイルのパス）は userData の `settings.json`                                                                                                               |
| `electron/paths.mjs`                            | 安全チェックとパスの判定。IPC の呼び出し元が自アプリの画面か、読み書きできる `.csv` の絶対パスか、中継先、配信するファイル（画面のフォルダの外は 403、壊れた URL エンコードは 400、フォルダや無いファイルは `index.html`）                      |
| `electron/log-file.mjs`                         | 記録ファイルの文字コード判定（UTF-8 以外は拒否）と、追記内容の決定（空ファイル・末尾に改行がない場合の扱い）                                                                                                                                    |
| `electron/catalog-file.mjs`                     | 目録ファイル（`userData/catalog.json`）の形の確認、読み込み、一時ファイル経由の書き込み                                                                                                                                                         |
| `electron/windows.mjs`                          | 一覧ウインドウの設定（`CATALOG_WINDOW`）、本の番号の判定（`isBookId`）、開いているウインドウを使い回せるかの判定（`shouldReuseWindow`）                                                                                                         |
| `electron/preload.cjs`                          | 画面に公開する API                                                                                                                                                                                                                              |

### pstudy-dict との共有

Weblio 検索（`word-lookup.service.ts`）と P-Study 用 CSV 作成（`pstudy-builder.service.ts`）は、`../pstudy-dict/src/app/services/` のファイルを使う。`npm start`・`npm test`・`npm run build` の前に `scripts/sync-pstudy.mjs` が `src/app/pstudy/` へ自動でコピーし、`@pstudy/*` で読み込む。`src/app/pstudy/` は生成物なので直接編集しない（git にも入れない）。`npx ng …` を直接実行すると同期されないので、npm スクリプトを使う。

直接 `../pstudy-dict` を参照しないのは、その場合 `pstudy-dict/node_modules` の Angular も同梱されて Angular が 2 つになり、DI が壊れるため。
