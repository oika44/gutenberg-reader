---
name: run-gutenberg-reader
description: GutenbergReader のデスクトップ版（Electron）をビルド・起動し、画面を操作・スクリーンショットする。デスクトップ版を起動して確かめる、本を開く・本文を検索する・行へ飛ぶ動きを実際の画面で見る、スクリーンショットを撮る、テストを回すときに使う。Build, run, start, drive, screenshot or test the gutenberg-reader desktop app.
---

GutenbergReader の動作確認は、`.claude/skills/run-gutenberg-reader/driver.mjs` で行う。このドライバーは、xvfb の仮の画面で Electron を起動し、Chrome DevTools Protocol（CDP）で画面を操作する。コマンドは標準入力からヒアドキュメントで流し込む。入力が終わると Electron を閉じ、後片付けをして終了する。

パスはすべてリポジトリの直下（`gutenberg-reader/`）から書く。

## 前提

- Node 22 以降（組み込みの `fetch`・`WebSocket` を使う。このセッションでは v24.22.2）。Playwright は不要で、入っていない。
- `xvfb-run`（`/usr/bin/xvfb-run`）。
- 本を開くには `www.gutenberg.org` につながること。

```bash
git submodule update --init
npm install
```

## ビルド

デスクトップ版は `dist/gutenberg-reader/browser/` を読み込む。画面を変えたら、起動の前に必ずビルドし直す（ドライバーは、ビルドが無いことは検出するが、古いことは検出しない）。

```bash
npm run build
```

## 起動と操作（エージェント用）

```bash
SCREENSHOT_DIR=/tmp/gutenberg-reader-shots timeout 170 node .claude/skills/run-gutenberg-reader/driver.mjs <<'EOF'
launch catalog
open 1342
press ctrl+f
type Darcy
press Enter
hits 3
jump 5
range
search zzzqqq
search Elizabeth
search
ss search
EOF
```

出力の例（抜粋）:

```
driver> launch catalog
起動した（データ置き場: /tmp/gutenberg-reader-data-FpjfKz）
driver> open 1342
題名: Pride and Prejudice / Jane Austen
driver> press ctrl+f
フォーカス: 本文を検索
driver> hits 3
  138 | Darcy | natural occasions provided by the false account of Darcy’s conduct giv
driver> jump 5
押した行: 366 / 本文: {"line":"366","visible":true}
driver> search Elizabeth
検索結果 644 件（先頭 500 件を表示）
```

- 起動から画面が出るまでは約 5 秒かかる。毎回起動し直すので、確かめたいことは 1 回の流し込みにまとめる。
- スクリーンショットは `$SCREENSHOT_DIR/<name>.png` に保存される（既定は `/tmp/gutenberg-reader-shots/`）。**撮ったら Read で開いて目で見る。**
- 失敗したコマンドがあると、終了コードが 1 になる。`launch` に失敗したら、その場で止まる。
- 空の行と `#` で始まる行は読み飛ばす。

| コマンド                                       | すること                                                                                                                               |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `launch`                                       | 使い捨ての一時フォルダをデータ置き場にして起動する。記録ファイルは未設定で、しおりも無い。本物のデータには触れない                     |
| `launch catalog`                               | 上と同じ。ただし本物の目録（`~/.config/gutenberg-reader/catalog.json`、約 21MB）を一時フォルダにコピーし、目録の検索を使えるようにする |
| `launch real`                                  | 本物のデータ置き場（`~/.config/gutenberg-reader`）で起動する。記録ファイルとしおりを読む。**記録すると本物の CSV に書き込む**          |
| `open <番号か URL>`                            | 本を開き、読み込みが終わるまで待つ。題名とメッセージを出す                                                                             |
| `search <語>`                                  | 本文を検索し、見出し（件数）と先頭 5 件を出す。語を付けないと、一覧が消えることを確かめられる                                          |
| `hits [n]`                                     | 検索結果の先頭 n 件（既定は 10）を「行番号 \| 強調した語 \| 文」で出す                                                                 |
| `jump <k>`                                     | 検索結果の k 件目（1 から数える）を押す。本文で色の付いた行と、その行が画面内に見えているかを出す                                      |
| `range`                                        | 読んだ範囲の欄（開始行・終了行・行数・語数）を出す                                                                                     |
| `press <キー>`                                 | キーを押す（例: `ctrl+f`・`meta+f`・`Enter`）。押したあとにフォーカスのある要素を出す                                                  |
| `type <文字>`                                  | フォーカスのある所に文字を入れる                                                                                                       |
| `click <CSS セレクター>` / `click-text <文字>` | DOM の `click()` で押す                                                                                                                |
| `wait <CSS セレクター>`                        | 要素が出るまで待つ（10 秒）                                                                                                            |
| `text [CSS セレクター]` / `eval <JS の式>`     | 文字列を出す / 画面の中で式を評価して JSON で出す                                                                                      |
| `ss [名前]`                                    | スクリーンショットを撮る                                                                                                               |
| `sleep [ミリ秒]` / `quit`                      | 待つ / 閉じて終わる                                                                                                                    |

画面の主な目印: 本の番号の欄は `input[aria-label="本の番号か URL"]`、本文の検索欄は `input[aria-label="本文を検索"]`、検索結果は `.search-hit`、検索から飛んだ本文の行は `.line.hit`。

## 起動（人が使うとき）

```bash
npm run desktop   # ビルドしてからウインドウを開く。閉じれば終わる
```

## テスト

```bash
npm test -- --watch=false 2>&1 | grep -E "Test Files|Tests |FAIL|×"   # 画面: 23 ファイル・270 件
npm run test:electron 2>&1 | grep -E "Test Files|Tests |FAIL"         # Electron: 6 ファイル・95 件
npm run test:scripts 2>&1 | grep -E "Test Files|Tests "               # scripts: 1 ファイル・3 件
```

## 注意

- **何もしないと本物のデータ置き場を使う。** Electron の userData は `~/.config/gutenberg-reader` なので、そのまま起動すると本物の記録 CSV としおりを読む。しおりが付くと開始行も変わる（例: 1342 で開始行 112）。そのためドライバーの `launch` は、`--user-data-dir` で一時フォルダを使う。
- **画面の更新は少し遅れて起きる。** 検索した直後や行へ飛んだ直後に DOM を読むと、前の状態が見える。特に仮想スクロールは、scroll イベントの後で行を描き直す。そこでドライバーは、決まった時間だけ待つのではなく、期待する状態になるまで繰り返し確かめる（`settle`）。新しいコマンドを足すときも同じようにする。
- **`xvfb-run` のプロセスグループに SIGTERM を送ると、Xvfb が残る。** xvfb-run が後片付けをしないまま終わり、`Xvfb :99` と `/tmp/xvfb-run.*` が残る。ドライバーは CDP の `Browser.close` で Electron を正常に閉じる。残っていないかは次で確かめる: `ps -eo pid,comm | awk '$2 ~ /electron|Xvfb|xvfb-run/'`。
- **`pkill -f "remote-debugging-port=…"` で止めない。** そのコマンドを実行したシェル自身のコマンド行にも一致し、シェルごと止まる（終了コード 144）。
- **tmux はこのマシンに無い。** そのため、REPL を tmux で動かし続ける形ではなく、ヒアドキュメントでまとめて流し込む形にしている。
- **`--no-sandbox` を付けて起動する**（README にあるとおり。Linux では chrome-sandbox の権限が無いと起動しないため）。付けない場合は試していない。
- **記録する・CSV 保存は試していない。** 一時フォルダで起動したときは記録ファイルが未設定なので、保存先を選ぶダイアログが出て止まるはず。
