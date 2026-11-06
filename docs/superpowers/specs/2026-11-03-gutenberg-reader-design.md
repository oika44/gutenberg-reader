# gutenberg-reader 設計書

- 作成日: 2026-11-03
- 状態: レビュー待ち

## 1. 目的

英語学習のため、Project Gutenberg の本を読んだ記録（多読の記録）を取る。
読んだ範囲の語数・行数と、その間に調べた単語数を、ローカルの CSV に 1 行ずつ追記する。
調べた単語は P-Study System 用の CSV として書き出し、`pstudy-dict` と同じ形式で復習に使えるようにする。

## 2. 決定事項

| 項目 | 決定 |
|---|---|
| 範囲の指定方法 | 自作アプリ内に本文を表示し、行番号をクリックして指定する |
| アプリの形 | `angular-play/gutenberg-reader/` に新しいアプリとして作る |
| `pstudy-dict` との連携 | 読書アプリ内で単語を Weblio で調べ、P-Study 用 CSV を書き出す |
| 部品の共有方法 | tsconfig のパスの別名 `@pstudy/*` で `pstudy-dict` のサービスを直接参照する。`pstudy-dict` 側は変更しない |
| 記録の保存形式 | CSV に 1 行ずつ追記する（UTF-8・BOM 付き） |
| 起動方法 | デスクトップ版（Electron、Windows / Linux）のみ。`ng serve` は画面確認用 |
| 範囲の細かさ | 行単位 |
| 行数の数え方 | 範囲内の空行を除いた行数 |

採用しなかった案と理由:

- Angular ワークスペース化して共通ライブラリを作る案は、`pstudy-dict` のビルド・配布・Electron 設定の移行が必要で、目的に対して作業と危険が大きいため採用しない。
- ファイルをコピーする案は、Weblio のページ構成が変わったときに 2 か所の修正が必要になるため採用しない。
- zip 配布版（ブラウザ版）は、ブラウザが決まったファイルへ追記できないため作らない。

## 3. 構成

```
angular-play/
├ pstudy-dict/            … 変更しない
└ gutenberg-reader/       … Angular 22・Zoneless・Vitest・Electron
    ├ src/app/
    │   ├ components/reader/          画面（本の読み込み・本文・範囲指定・調べた単語・記録）
    │   └ services/
    │       ├ book.service.ts            本文の取得、前後の説明の除去、題名・著者の抽出
    │       ├ text-count.ts              語数・行数を数える純粋関数
    │       ├ reading-log.service.ts     記録行の作成・CSV の読み取り・しおりの計算・重複判定
    │       └ desktop-bridge.service.ts  Electron の preload（window.gutenbergDesktop）を包む
    ├ electron/
    │   ├ main.mjs        /gutenberg/... と /weblio/... の中継、ファイルの読み書き、設定の保存
    │   └ preload.cjs     画面に公開する API
    └ proxy.conf.json     ng serve 用の中継設定（/gutenberg と /weblio）
```

共有する部品（`tsconfig.json` の `paths` に `"@pstudy/*": ["../pstudy-dict/src/app/services/*"]` を追加する）:

- `@pstudy/word-lookup.service` … `WordLookupService`、`WordNotFoundError`
- `@pstudy/pstudy-builder.service` … `PStudyBuilderService`

これらが依存する `encoding-japanese` と `rxjs` は `gutenberg-reader` 側にも入れる。
`gutenberg-reader` と `pstudy-dict` は `angular-play/` の下に隣り合わせで置く前提とする。

画面の状態は Zoneless モードに合わせて signal で持つ。

## 4. 本文の取得と表示

### 4.1 取得

- 入力は本の番号（例: `1342`）か URL（例: `https://www.gutenberg.org/ebooks/1342`）とし、番号を取り出す。
- 画面は `/gutenberg/cache/epub/<番号>/pg<番号>.txt` を取得する。中継役（Electron の main、開発時は `proxy.conf.json`）が `https://www.gutenberg.org` に取りに行く。
- テキストから `*** START OF THE PROJECT GUTENBERG EBOOK` を含む行と `*** END OF THE PROJECT GUTENBERG EBOOK` を含む行を探し、その間を本文とする。
- 題名は `Title:` 行、著者は `Author:` 行から取り出す。見つからなければ空欄とする。
- 行番号は本文の先頭を 1 行目として数える。

### 4.2 表示

- `@angular/cdk` の仮想スクロールで、見えている行だけを描画する。
- 各行の左に行番号を表示する。
- 単語ごとの要素は作らない。本文のダブルクリックで、ブラウザが選択した単語（`window.getSelection()`）を取り出して調べる。前後の記号は取り除く。

## 5. 数え方（`text-count.ts`）

- 単語: 正規表現 `[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*` に一致する数。`don't`、`well-known` は 1 語とする。
- 行: 範囲内（開始行から終了行まで、両端を含む）で、空白文字だけの行を除いた行数。

## 6. 画面の流れ

1. 本を開く: 番号か URL を入れて読み込む。記録 CSV に同じ本番号の行があれば、最後の行の終了行の次の行までスクロールし、そこを開始行にしておく（しおり）。
2. 範囲を指定する: 行番号の 1 回目のクリックで開始行、2 回目で終了行を決める。開始行より前をクリックした場合は、その行を新しい開始行とし、終了行を未定に戻す。範囲は色付きで表示し、語数・行数をその場で表示する。
3. 単語を調べる: ダブルクリックした単語を Weblio で調べ、訳と発音記号を横の欄に表示する。見つかった単語は P-Study リストに自動で追加する（削除ボタンで外せる）。前回の記録以降に調べた単語を、大文字・小文字を区別せずに重複を除いて数える。見つからなかった単語も数える。
4. 記録する: 終了行が決まっているときだけ押せる。CSV に 1 行追記し、調べた単語数を 0 に戻し、次の開始行を終了行の次の行にする。
5. P-Study 用 CSV を保存する: `PStudyBuilderService` で Shift_JIS / UTF-8 の CSV を作り、保存先をダイアログで選んで保存する。

## 7. 読書記録 CSV

- 文字コードは UTF-8（BOM 付き）、改行は CRLF とする（Windows の Excel で開くため）。
- 1 行目は見出し行とする。

```
記録日時,本番号,題名,著者,開始行,終了行,行数,語数,調べた単語数
2026-11-03 15:30,1342,Pride and Prejudice,Jane Austen,1,120,104,1532,7
```

- 記録日時はローカル時刻の `YYYY-MM-DD HH:mm` とする。
- カンマ・`"`・改行を含む値は `"` で囲み、`"` は `""` にする。
- 保存先: 最初に記録するときにダイアログでファイルを選ぶ。パスは Electron の userData にある設定ファイルに保存し、画面から変更できる。
- ファイルが無ければ見出し行を付けて作成し、あれば末尾に 1 行追記する。
- しおり: 本を開いたときに CSV を読み、同じ本番号の最後の行の終了行を使う。

## 8. Electron の API（preload が公開する `window.gutenbergDesktop`）

| 関数 | 役割 |
|---|---|
| `getLogPath(): Promise<string \| null>` | 設定済みの記録ファイルのパスを返す |
| `chooseLogPath(): Promise<string \| null>` | ダイアログで記録ファイルを選び、設定に保存する |
| `readLog(path): Promise<string \| null>` | 記録ファイルの内容を返す。無ければ `null` |
| `appendLog(path, header, line): Promise<void>` | ファイルが無ければ見出し付きで作成し、1 行追記する |
| `saveFile(defaultName, bytes): Promise<string \| null>` | ダイアログで保存先を選び、P-Study 用 CSV を保存する |

main は `/gutenberg/*` を `https://www.gutenberg.org/*` に、`/weblio/*` を `https://ejje.weblio.jp/content/*` に中継する（`pstudy-dict` の `electron/main.mjs` と同じ方式）。

## 9. エラー処理

エラーを握りつぶさず、原因と次の操作を画面に表示する。

| 状況 | 対応 |
|---|---|
| 本の番号が存在しない・通信に失敗した | 「本を取得できませんでした（番号◯◯）」と表示し、入力欄は残す |
| 番号・URL として読み取れない入力 | 「本の番号か URL を入力してください」と表示する |
| START / END の目印が見つからない | テキスト全体を本文とし、その旨を表示する |
| 終了行が未定 | 「記録する」ボタンを押せないようにする |
| 同じ本の同じ範囲が記録済み | 確認ダイアログを出し、記録するかを選ばせる |
| CSV に書き込めない | エラー内容を表示し、範囲と調べた単語数を保持する（再度押せる） |
| CSV の一部の行が読めない | その行を飛ばし、「記録ファイルの◯行目を読めませんでした」と警告する。追記は続ける |
| Weblio で単語が見つからない | `WordNotFoundError` を受けて「見つかりません」と表示する。調べた単語数には含める |
| Weblio の通信に失敗した | エラーを表示する。調べた単語数には含めない |

## 10. テスト（Vitest、テストを先に書く）

- `text-count.ts`: 語数（`'`・`-` でつながる語、数字、記号だけの行、`’`）と、空行を除いた行数。範囲の両端を含むこと。
- `book.service.ts`: 番号・URL の読み取りと不正な入力、START / END の切り出し、目印がない場合、題名・著者の抽出、取得失敗。
- `reading-log.service.ts`: 記録行の作成（引用符の処理）、CSV の読み取り（BOM、引用符付きの値、壊れた行）、しおりの計算、重複判定。
- `reader` コンポーネント: 範囲指定のクリック順、調べた単語数（重複を除く・見つからない単語を含む・通信失敗は含まない）、記録後のリセット、書き込み失敗時に入力が残ること。
- Electron の main と preload は手動で確認する（Linux で起動確認し、Windows 版をビルドする）。

## 11. 範囲外（今回は作らない）

- ブラウザ版・zip 配布版
- 記録の集計画面やグラフ（CSV を Excel などで見る）
- Gutenberg の HTML 版・EPUB 版の表示
- 本の検索（番号か URL を直接入れる）
