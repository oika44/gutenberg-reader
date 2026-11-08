# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Project Gutenberg の本を読み、行番号で指定した範囲の語数・行数と、調べた単語数を記録 CSV に追記する Electron + Angular のアプリ。調べた単語は P-Study System 用の CSV に書き出せる。

詳しい約束は [docs/coding-standards.md](docs/coding-standards.md)（規約）と [docs/testing.md](docs/testing.md)（テスト）にある。ファイルの索引は README の「プログラムの構造」の表。

## 前提

`pstudy-dict` は git submodule として `pstudy-dict/` に入っている（取得していなければ `git submodule update --init`）。`npm start`・`npm test`・`npm run build` の前に `scripts/sync-pstudy.mjs` が `pstudy-dict/src/app/services/` の 2 ファイルを `src/app/pstudy/` にコピーし、`@pstudy/*` で読み込む。`npx ng …` を直接実行すると同期されないので、先に `npm run sync:pstudy` を実行する。

## コマンド

| 用途                                   | コマンド                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------- |
| 画面のテスト（全部）                   | `npm test -- --watch=false`                                               |
| 画面のテスト（1 ファイル）             | `npx ng test --watch=false --include src/app/services/text-count.spec.ts` |
| 画面のテスト（名前で絞る）             | `npx ng test --watch=false --filter "countRange"`                         |
| Electron のテスト（全部 / 1 ファイル） | `npm run test:electron` / `npx vitest run electron/paths.test.mjs`        |
| scripts のテスト                       | `npm run test:scripts`                                                    |
| デスクトップ版を起動                   | `npm run desktop`（ビルドしてから Electron を起動する）                   |
| 画面だけをブラウザで確認               | `npm start`（記録・CSV 保存はできない）                                   |
| Angular の二重同梱の確認               | `npm run check:angular`                                                   |
| 配布物                                 | `npm run dist:win`（zip）/ `npm run dist:linux`（deb）→ `dist/widget/`    |
| lint                                   | `npm run lint`（= `ng lint`。`src/`・`electron/`・`scripts/` が対象）     |
| 整形                                   | `npx prettier --write <変更したファイル>`                                 |

テストの結果は `2>&1 | grep -E "Test Files|Tests |FAIL|×"` で件数と失敗だけを見る。

## 仕組み（複数のファイルにまたがるもの）

- **外部サイトへの中継が 2 か所にある。** 画面は CORS を避けるため `/gutenberg/...` と `/weblio/...` という相対 URL だけを使う。開発時（`npm start`）は `proxy.conf.json` が、デスクトップ版は `electron/main.mjs` の `app://local/` のプロトコルハンドラー（`paths.mjs` の `relayTarget`）が外部サイトに送る。中継先を足す・変えるときは両方を直す。
- **ファイルの読み書きは IPC だけで行う。** 流れは `ReadingLogService` → `DesktopBridgeService.api`（`window.gutenbergDesktop`）→ `electron/preload.cjs` → `main.mjs` の `ipcMain.handle` → `log-file.mjs`・`paths.mjs`。API を足すときは、`desktop-bridge.service.ts` の型 `GutenbergDesktop`・`preload.cjs`・`main.mjs` のハンドラー・`preload.test.mjs` の 4 か所をそろえる。ブラウザでは `api` が `null` になる。
- **IPC の入口で絞り込む。** ハンドラーでは、呼び出し元（`isFromApp`）・引数の型・パスの範囲（`isCsvPath`）を確かめ、失敗は例外ではなく `{ ok: false, message }` で返す。
- **`main.mjs` はテストできない。** 判断は `paths.mjs`・`log-file.mjs`・`relay.mjs` のような純粋な関数に切り出してテストし、`main.mjs` には Electron の API の呼び出しだけを残す。画面側も同じで、判断は `src/app/services/*.ts`（`Service` が付かないファイル）に置き、`ReaderComponent` は薄くする。
- **記録 CSV の形式は画面と Electron で分担している。** 列と見出しは `reading-log.ts`（`LOG_HEADER`・`formatLogLine`・`parseLog`）、BOM の付加は `ReadingLogService`、新規作成か追記か・末尾の改行の補い・UTF-8 以外の拒否は `electron/log-file.mjs` が受け持つ。形式は UTF-8（BOM 付き）・CRLF。
- **行番号は本文の 1 行目から数える。** 本文は `parseBook` が `*** START OF THE PROJECT GUTENBERG EBOOK` の次の行から END の前までを切り出したもの。しおりは同じ本の最後の終了行の次の行。
- 本文は仮想スクロールで描くので、1 行の高さ `LINE_HEIGHT`（`reader.component.ts`）と CSS の `.line` の高さをそろえる。
- デスクトップ版は `dist/gutenberg-reader/browser/` のビルド結果を読み込む。画面を変えたら、ビルドし直してから起動する。

## 守ること

- `src/app/pstudy/`・`node_modules/`・`.angular/`・`dist/` は読まない・編集しない。共有部品を直すときはサブモジュール `pstudy-dict/` 側で直してコミットし、このリポジトリで参照コミットを更新する。
- パスは `node:path` で扱う（Windows 版も作るため）。
- テストは先に書き、失敗→成功を確かめてから実装する。テストの共通データは `*.testing.ts` に置く（`tsconfig.app.json` でアプリのビルドから外している）。
- 外から見える動きを変えたら README を、重要な決定をしたら `docs/superpowers/2026-11-03-implementation-log.md` に 1 行で追記する。
