# テストの説明

GutenbergReader のテストの構成・実行方法・書き方の約束をまとめる。テストはすべて Vitest で書く。

## 実行方法

| 対象            | コマンド                    | 中身                                                                         |
| --------------- | --------------------------- | ---------------------------------------------------------------------------- |
| 画面（Angular） | `npm test -- --watch=false` | `src/**/*.spec.ts`。`@angular/build:unit-test` が jsdom 上で Vitest を動かす |
| Electron        | `npm run test:electron`     | `electron/*.test.mjs`。Node 上で Vitest を直接動かす                         |

- 画面のテストは `npx ng test` ではなく `npm test` で実行する。`pretest` で `pstudy-dict` の共有部品（`src/app/pstudy/`）がコピーされ、これがないとビルドに失敗する。
- `--watch=false` を付けないと変更を待ち続ける（開発中はそのほうが便利）。
- 2026-11-06 時点の件数は、画面 203 件・Electron 77 件（`it.each` の 1 行ずつを 1 件と数える）。

## 方針

- **画面から切り離せる処理は純粋な関数にし、関数単位でテストする。** CSV の行の作成と読み取り、語数の数え方、本文の切り出し、パスの判定などがこれにあたる。DOM も通信も使わないので、速く、壊れにくい。
- **サービスとコンポーネントは、外とのやり取りを偽物に差し替えてテストする。** 偽物は TestBed の `providers` で `useValue` に渡す。HTTP は `provideHttpClientTesting()`、Electron の API は `DesktopBridgeService` の `api` を差し替える。
- **失敗する場合も必ずテストする。** 通信の失敗、書き込みの失敗、キャンセル、壊れた入力のそれぞれで、例外を握りつぶさずに理由が画面に出ることを確かめる。
- **Electron の main（`electron/main.mjs`）は Electron の中でしか動かないので、判断の部分を別の `.mjs` に切り出してテストする。** `main.mjs` には、Electron の API を呼ぶ処理と、切り出した関数を組み合わせる処理だけを残す。
- テスト名は日本語で、**何をしたら何が起きるか**を書く（例: 「記録ファイルを選ばなかったら記録せず、入力を残す」）。テストが失敗したとき、名前だけで壊れた仕様が分かるようにする。

## テストファイルと確かめていること

### 画面（`src/`）

| テスト                                                       | 対象                                                       | 確かめていること                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/app.spec.ts`                                            | `App`                                                      | 読書画面（`app-reader`）を 1 つ置く                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `app/shared-imports.spec.ts`                                 | `@pstudy/*`                                                | `pstudy-dict` からコピーした部品が、このアプリの Angular（同じ `HttpClient`・DI）で動く。Angular が二重に読み込まれると DI が壊れるため、その確認を兼ねる                                                                                                                                                                                                                                                                                                |
| `services/book.service.spec.ts`                              | `parseBookId`・`parseBook`・`BookService`                  | 番号・3 種類の URL から本の番号を取り出す。0・負の数・小数・他のサイトの URL は受け付けない。START と END の間を本文にし、`\r` を残さない。目印がない・END がない・START より前にしか END がない本は全体を本文にする。題名と著者は START より前の見出しからだけ取る。取得は中継（`/gutenberg/...`）経由で行い、失敗したら `BookFetchError` を流す                                                                                                        |
| `services/text-count.spec.ts`                                | `countWords`・`countRange`                                 | `don't`・`don’t`・`well-known` を 1 語と数え、記号だけの文字列は 0 語にする。範囲は両端を含み、空白だけの行を数えない。本の行数を超える範囲でも落ちない                                                                                                                                                                                                                                                                                                  |
| `services/selected-word.spec.ts`                             | `normalizeSelectedWord`                                    | ダブルクリックで選ばれた文字列から前後の引用符・句読点を落とす。空・複数語・記号だけなら `null`                                                                                                                                                                                                                                                                                                                                                          |
| `services/reading-log.spec.ts`                               | 記録 CSV の関数                                            | 記録の行が README の例と同じ形式になる。カンマ・`"` を引用符で囲み、改行を空白にする。BOM・見出し・CRLF を読み飛ばし、書いた行を読むと元の記録に戻る。列数がおかしい・数値が負や小数や空の行は読めない行として行番号を返す。しおり（同じ本の最後の終了行の次）と重複の判定                                                                                                                                                                               |
| `services/reading-log.service.spec.ts`                       | `ReadingLogService`                                        | 保存先の読み込み・変更。保存先が未設定なら最初の記録で選ばせ、キャンセルなら `LogPathNotSetError` にする。書き込みの失敗は `LogWriteError`（理由を含む）。ブラウザ版では読み込みは空、追記は `DesktopUnavailableError`                                                                                                                                                                                                                                   |
| `services/desktop-bridge.service.spec.ts`                    | `DesktopBridgeService`                                     | `window.gutenbergDesktop` があればそれを `api` にし、なければ `null`（ブラウザ版）                                                                                                                                                                                                                                                                                                                                                                       |
| `services/catalog.spec.ts`                                   | `parseCatalog`・`searchCatalog`・`parseSavedCatalog`       | 目録 CSV から英語（`Language` に `en` を含む）の `Text` だけを `{ id, title, author }` にする。題名の改行は空白にし、`""` を戻し、列の並びが変わっても見出しの名前で読む。HTML などの CSV でないものは `CatalogFormatError`。検索は語がすべて題名か著者に含まれる本を返し（大文字・小文字・余分な空白を無視）、空の入力は空、`limit` 件で打ち切る。保存した形を読み戻し、壊れた形は `null`                                                               |
| `services/catalog.service.spec.ts`                           | `CatalogService`                                           | 保存した目録の読み込み（なし・壊れた JSON・読み込み失敗・ブラウザ版）。取得して保存し、取得中は `loading`。通信の失敗や HTML が返ったときは前の目録を残してエラーにする。保存に失敗しても今回の結果を使う。取得中の二重呼び出しは要求 1 回                                                                                                                                                                                                               |
| `services/title-translation.spec.ts`                         | `hasJapanese`・`parseTranslations`・`searchByTranslations` | かな・漢字を含む入力だけを日本語とする。Weblio のページから訳を取り出し、「、」で区切ってかっこ書き（`(1933 film)` など）と大文字・小文字だけの重複を除く。説明文の【単語】【英訳】【対訳】も「, 」で区切って要約のあとに並べ（【例文】は使わない）、先頭の a・an・the を外し、`&#039;` を戻す（実物の「宝島」「不思議の国のアリス」「白鯨」「若草物語」の形で確かめる）。訳が無いページは空。候補ごとの検索結果を重複なしで合わせ、`limit` 件で打ち切る |
| `services/title-translation.service.spec.ts`                 | `TitleTranslationService`                                  | 題名をエンコードして `/weblio/...` から取得する。Weblio に無い語（404）は空。接続できない（0・502）・エラー（500）は理由付きの `TitleTranslationError`                                                                                                                                                                                                                                                                                                   |
| `components/catalog-search/catalog-search.component.spec.ts` | `CatalogSearchComponent`                                   | 生成時に `load` を呼ぶ。目録が空なら「目録を取得」、あれば取得日・冊数と「更新」を出す。検索結果（題名・著者・番号）、見つからない場合、結果を押すと `bookSelected` に番号を出して検索欄を空にする。`error` を `role="status"` で出す。日本語の題名は Enter を押したときだけ英訳し、訳語・英訳中・英訳なし・通信の失敗をそれぞれ表示する。入力を変えたら英訳を取り消し、英訳の途中で入力が変わったら遅れて届いた英訳を使わない。英語の入力では英訳しない |
| `components/reader/reader.*.spec.ts`                         | `ReaderComponent`                                          | 下の「読書画面のテスト」を参照                                                                                                                                                                                                                                                                                                                                                                                                                           |

#### 読書画面のテスト

読書画面のテストは、操作ごとにファイルを分けている。どのファイルでも使う本と記録のデータ（`LINES`・`BOOK`・`record`）は `reader.testing.ts` に置く。目録の偽物は `provideFakeCatalog()`（1342 の 1 冊だけ）で、`ReaderComponent` を作るすべての spec の `providers` に入れる。このファイルはテストからだけ読み込み、`tsconfig.app.json` でアプリのビルドから外している。

| ファイル                      | `describe`                           | 確かめていること                                                                                                                                                                                                                 |
| ----------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reader.open.spec.ts`         | 本を開く・範囲指定                   | 目録の結果を押すと番号の入力欄に入れて本を開く。不正な入力の案内、取得の失敗、目印がない本の案内、しおりの位置への移動、最後まで記録済みの本、記録ファイルの読めない行の警告。行番号のクリックで開始行・終了行を決め、選び直せる |
| `reader.lookup.spec.ts`       | 単語を調べる・P-Study 用 CSV         | 調べた単語の表示と P-Study リストへの追加。大文字・小文字の違いを同じ単語として数える。見つからない単語は数え、通信の失敗は数えない。CSV の保存と、保存できないときの理由の表示                                                  |
| `reader.record.spec.ts`       | 記録する                             | 記録の行の中身（日時・範囲・行数・語数・調べた単語数）。記録後に調べた単語数を 0 に戻し、次の開始行を進める。重複の確認。書き込めないとき・保存先を選ばなかったときは入力を残す                                                  |
| `reader.review-fixes.spec.ts` | レビュー指摘の修正                   | 記録ボタンの連打で二重に追記しない。記録ファイルを読めなくても本は開く。別の本を開いたら調べた単語数を 0 に戻す。行番号のダブルクリックでは単語を調べない                                                                        |
| `reader.lookup.spec.ts`       | 単語を調べているときの表示           | 調べている間は対象の単語を出す。Weblio に接続できないとき（status 0・502）は日本語で理由を出す                                                                                                                                   |
| `reader.errors.spec.ts`       | エラー表示・デスクトップ版でないとき | 起動時に設定を読めないとき、「変更」で保存先を選べないときに理由を出す。ブラウザ版では P-Study 用 CSV を保存せず案内を出す。保存先の選択をキャンセルしたら何も表示しない                                                         |

### Electron（`electron/`）

| テスト                  | 対象               | 確かめていること                                                                                                                                                                                                                                                                                                        |
| ----------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `paths.test.mjs`        | `paths.mjs`        | 下の「Electron の安全チェック」を参照                                                                                                                                                                                                                                                                                   |
| `log-file.test.mjs`     | `log-file.mjs`     | 記録ファイルが UTF-8 でなければ（Excel で Shift_JIS のまま保存し直したなど）読み書きしない。ファイルがない・中身が空なら見出しから書き、末尾が改行でなければ改行を足してから追記する                                                                                                                                    |
| `catalog-file.test.mjs` | `catalog-file.mjs` | 目録 JSON の形（`fetchedAt`・`entries`）を確かめ、壊れた形は拒否する。ファイルがなければ `null`。書いた内容を読み戻せ、置き換えのあとに `.tmp` を残さない。`ENOENT` 以外のエラーは投げる                                                                                                                                |
| `relay.test.mjs`        | `relay.mjs`        | 外部サイトの応答をそのまま返す。接続できなければ例外にせず、理由付きの 502 を返す                                                                                                                                                                                                                                       |
| `preload.test.mjs`      | `preload.cjs`      | `window.gutenbergDesktop` の名前だけで公開し、画面の型 `GutenbergDesktop` と同じ関数をそろえる。各関数が main の正しいチャンネルに引数を渡す。`readLog` は読めないときに理由をメッセージにした `Error` を投げる。目録の `readCatalog`・`writeCatalog` も同様に正しいチャンネル（`catalog:read`・`catalog:write`）へ渡す |

#### Electron の安全チェック

`main.mjs` は画面からの要求を受けてファイルを読み書きするので、画面が乗っ取られた場合を考えて入口で絞り込んでいる。`paths.test.mjs` はその判定を確かめる。

| 関数                | 確かめていること                                                                                                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isFromApp`         | IPC の呼び出し元が `app://local/` の画面のときだけ受け付ける。`app://localhost/` のような似た名前は受け付けない                                                                                             |
| `isCsvPath`         | 読み書きできるのは `.csv` で終わる絶対パスだけ。相対パス・別の拡張子・`log.csv.exe`・文字列でない値は拒否する                                                                                               |
| `withCsvExtension`  | 保存ダイアログで拡張子なしの名前を入れたら `.csv` を付ける                                                                                                                                                  |
| `relayTarget`       | `/gutenberg/...` と `/weblio/...` だけを外部サイトに中継する                                                                                                                                                |
| `resolveStaticFile` | `..%2F` などで画面のフォルダの外を指すパスは 403、壊れた URL エンコードは 400 にする。隣の `browser-old` のような、名前の前方が同じフォルダもすり抜けさせない。フォルダや無いファイルは `index.html` を返す |

## 偽物の作り方

### Electron の API（`window.gutenbergDesktop`）

画面のテストでは本物の Electron は動かない。`DesktopBridgeService` を差し替えて、`api` に偽物を入れる。`satisfies GutenbergDesktop` を付けると、preload 側の API が変わったときに型の違いでテストのビルドが失敗し、偽物の古さに気づける。

```ts
const api = {
  getLogPath: vi.fn(async () => '/home/u/log.csv'),
  chooseLogPath: vi.fn(async (): Promise<string | null> => '/home/u/new.csv'),
  readLog: vi.fn(async (): Promise<string | null> => null),
  appendLog: vi.fn(async () => ({ ok: true }) as const),
  saveFile: vi.fn(async () => null),
} satisfies GutenbergDesktop;

TestBed.configureTestingModule({
  providers: [{ provide: DesktopBridgeService, useValue: { api } }],
});
```

ブラウザ版の動きを確かめるときは `useValue: { api: null }` にする。

### HTTP

`BookService` と `WordLookupService` のテストは `provideHttpClient()` と `provideHttpClientTesting()` を使い、`HttpTestingController` で要求の URL を確かめてから応答を返す。

```ts
service.load(1342).subscribe((b) => (book = b));
http.expectOne('/gutenberg/cache/epub/1342/pg1342.txt').flush(RAW);
```

### 画面から使うサービス

`ReaderComponent` のテストでは、`BookService`・`ReadingLogService`・`WordLookupService` を、使う関数だけを持つオブジェクトに差し替える。こうすると、通信やファイルの状態を 1 つずつ作り分けられる。

### preload.cjs

`preload.cjs` は `require('electron')` を使う CommonJS ファイルなので、ファイルの中身を `new Function('require', 中身)` で実行し、`contextBridge` と `ipcRenderer` の偽物を返す `require` を渡す。実行するのはリポジトリ内の `preload.cjs` だけで、外から来た文字列は使わない。

## 注意点

- **時刻**: 記録日時を確かめるテストは `vi.useFakeTimers({ toFake: ['Date'] })` と `vi.setSystemTime(...)` で時刻を固定し、`afterEach` で `vi.useRealTimers()` に戻す。`Date` だけを偽物にし、`setTimeout` などのタイマーは本物のまま残して、Angular の描画待ち（`whenStable`）に影響させない。
- **仮想スクロール**: jsdom には `Element.prototype.scrollTo` がないため、しおりの位置への移動を通るテストでは `Element.prototype.scrollTo ??= () => {}` を用意する。
- **確認ダイアログ**: 重複の確認は `vi.spyOn(window, 'confirm')` で OK・キャンセルを返す。
- **`window` を書き換えたら戻す**: `window.gutenbergDesktop` を設定したテストは、`afterEach` で `delete` して次のテストに残さない。
- **Windows でも通るようにする**: Electron のテストのパスは `node:path` の `resolve`・`join` で組み立て、`/` や `C:\` を直接書かない。
- **`src/app/pstudy/` のテストは書かない**: `pstudy-dict` からの自動コピーなので、テストは元の `pstudy-dict` に書く。このアプリでは、部品が同じ Angular で動くことだけを `shared-imports.spec.ts` で確かめる。

## テストしていないこと

次は自動テストの対象外なので、変更したらデスクトップ版を起動して手で確かめる。

- `electron/main.mjs` の、Electron の API を直接呼ぶ部分（ウィンドウ・メニュー・保存ダイアログ・`settings.json` の読み書き・`protocol.handle` の登録）
- 実際の Project Gutenberg・Weblio との通信（テストは偽物の応答で確かめる）
- 見た目（CSS）と、仮想スクロールの実際のスクロール位置
- Windows 版・Linux 版の配布物（`npm run dist:win`・`npm run dist:linux`）
