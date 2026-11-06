# SDD ledger — plan: /home/oika/angular-play/gutenberg-reader/docs/superpowers/plans/2026-11-03-gutenberg-reader.md
Setup: Ruling: git 管理外のため worktree・コミット・task-start/task-done スクリプトを使わず、この台帳に手動記録する — ユーザー指示（コミットは指示時のみ）— 誤りなら後で git init して初回コミットするだけ
Pre-flight: T2→T6 countRange/RangeStats 一致; T3→T6 Book/BookFetchError 一致; T4→T5/T6/T8 一致; T5→T7 saveFile / T5→T8 LogPathNotSetError・LogWriteError 一致; T1→T7 一致。衝突なし
Task 1: Ruling: tsconfig paths で @angular/*・rxjs・encoding-japanese を固定すると逆に app.spec まで壊れた（getDefaultDocument null / NG0203）ため固定を外し、@pstudy/* のみ残した — 固定なしで共有部品の DI テストが通る — 誤りなら本番ビルドで Angular が二重化する（Task 7 で stats.json を見て確認する）
Task 1: Ruling: ng new に --zoneless は付けず --defaults で生成（v22 は既定で Zoneless、polyfills なしを確認）
Task 1: Ruling: Electron 本体（dist）が npm の install-scripts 制限で未取得。Task 5 で対応
Task 1: complete (tests: npx ng test --watch=false → 4/4 pass)
Task 2: complete (tests: npx ng test --watch=false → 14/14 pass)
Task 3: Ruling: parseBookId の不正例に URL 以外のサイト、正常例に /files/<番号>/ を追加 — 計画の Produces に記載の形式をテストで固定するため — 影響なし
Task 3: complete (tests: npx ng test --watch=false → 27/27 pass)
Task 4: Ruling: テストに「値の中の改行」「本番号が数字でない行」「空ファイル」を追加 — 仕様 7 章・9 章の範囲 — 影響なし
Task 4: complete (tests: npx ng test --watch=false → 37/37 pass)
Task 5: Ruling: electron を 44.7.0 に固定（npm i -D electron@44.7.0）— 44.10.1 の本体ダウンロードが失敗し、~/.cache/electron にある 44.7.0 を使うため。^44.7.0 の制約内 — 誤りなら後で更新するだけ
Task 5: Ruling: Linux の chrome-sandbox は root 所有化に sudo が要るため実行せず、起動確認は --no-sandbox で実施（8 秒間エラーなしで起動）。devtools での getLogPath 確認は Task 9 の手動確認に回す — sudo はユーザー判断
Task 5: Ruling: ReadingLogService のテストに init・changeLogPath・パス未設定時の load を追加 — Produces の全メソッドを覆うため
Task 5: complete (tests: npx ng test --watch=false → 47/47 pass; electron 起動確認済み)
Task 6: Ruling: 雛形の app.html/app.css を削除し、App はインラインテンプレートで <app-reader /> を置くだけにした。app.spec も置き換え — 計画の「<app-reader> を 1 つ置く」に沿う
Task 6: Ruling: 案内が複数あるとき（目印なし＋読めない行など）は全角空白で連結して message に出す — 計画は message を 1 つに統一と規定 — 影響小
Task 6: Ruling: テストに「開始行と同じ行で終了（1 行範囲）」を追加
Task 6: complete (tests: npx ng test --watch=false → 57/57 pass)
Task 7: Ruling: 【設計変更】@pstudy/* の直接参照では本番ビルドに pstudy-dict/node_modules の Angular・encoding-japanese が同梱され Angular が二重化した（テストビルドでは再現しない）。scripts/sync-pstudy.mjs で build/test/start 前に 2 ファイルを src/app/pstudy/ へ自動コピーし、@pstudy/* をそこへ向けた（.gitignore 済み）。scripts/check-single-angular.mjs（npm run check:angular）で RED→GREEN を確認 — 元ファイルは pstudy-dict の 1 か所のまま、Windows でも動く — 誤りなら（ユーザーが直接参照を強く望むなら）ワークスペース化が必要
Task 7: Ruling: テストは npx ng test ではなく npm test（pretest で同期）で実行する
Task 7: Ruling: lookupWord は void ではなく Promise<void>（テストで完了を待つため）
Task 7: Ruling: angular.json に allowedCommonJsDependencies: encoding-japanese と予算 700kB/1MB・4kB/8kB を pstudy-dict と同じに設定（ビルド警告の解消）
Task 7: Ruling: デスクトップ版でない時の savePStudy は「デスクトップ版でのみ保存できます」と表示
Task 7: complete (tests: npm test -- --watch=false → 73/73 pass; npm run check:angular → OK; ng build 警告 0)
Task 8: Ruling: 最終行まで記録したら次の開始行は未定（null）にする、記録成功時に「記録しました（…）」を表示、起動時 init を確かめるテストを追加 — 仕様の範囲内の補完
Task 8: complete (tests: npm test -- --watch=false → 81/81 pass; npm run build 警告 0)
Task 9: Ruling: 手動確認（画面操作）と Windows 版ビルドは作業環境から GitHub・Weblio に接続できず（ENETUNREACH / Could not connect）実施できなかった。代わりに実物の pg1342.txt の目印形式、ng serve 中継で gutenberg 200 を確認。dist:win と画面操作の確認はユーザーに依頼 — 誤りなら実機で不具合が見つかる
Task 9: complete (README 作成; tests: npm test → 81/81 pass)
Final review: opus の code-reviewer サブエージェント
Final: fixed I-1 記録ボタン連打で二重追記 — 「記録する」の連打では 1 回しか追記しない RED→GREEN, suite 87/87
Final: fixed I-2 Shift_JIS で保存し直したファイルへの UTF-8 追記 — decodeLogFile「Shift_JIS など UTF-8 でないファイルは…」RED→GREEN, electron 11/11
Final: fixed I-3 main の追記分岐にテストなし — electron/log-file.mjs に buildAppend を切り出し 7 ケース RED→GREEN（M-1 の BOM だけのファイルも同じ関数のテストに含む）
Final: fixed M-4（Important に格上げ: 記録ファイルを読めないと本が開けない）— 記録ファイルを読めなくても本は開き… RED→GREEN
Final: fixed M-6（Important に格上げ: エラー握りつぶしは CLAUDE.md 違反）— P-Study 用 CSV の保存で例外… RED→GREEN
Final: Ruling: 保留点「本を切り替えても調べた単語数が残る」— 別の本の記録に混ざり記録が不正確になるため、別の本を開いたら 0 に戻す（同じ本の開き直しは残す）。RED→GREEN — 誤りならユーザーが本をまたいで数えたい場合に不便
Final: Ruling: 保留点「行番号のダブルクリックで数字を調べる」— 調べた単語数が水増しされるため .line-no 内のダブルクリックは無視。RED→GREEN — 影響小
Final: Ruling: 保留点「しおりスクロールの時機」「THIS PROJECT 表記」「複数行 Title」— 現状のまま（実物 pg1342 で目印形式確認済み、目印なしでも全体表示の逃げ道あり）— 誤りなら古い本で行番号がずれる
Final: minor (deferred): M-2 記録ファイルのパスを設定値と照合していない
Final: minor (deferred): M-3 setWindowOpenHandler が https 以外も外部で開く・will-navigate 未対策
Final: minor (deferred): M-5 Enter キーなら読み込み中でも開け、遅い方の本が表示されうる
Final: minor (deferred): M-7 単語検索の成功で大事な案内まで消える
Final: minor (deferred): M-8 前後の記号を落とすときアクセント付き文字（café）まで削る・naïve を 2 語と数える
Final: minor (deferred): M-9 npx ng を直接使うと共有部品が同期されない（README に注記のみ）
Final: minor (deferred): M-10 最小幅 640px では本文が「…」で切れる
After: Ruling: electron-builder を 26.15.3 に固定（pstudy-dict と同じ。26.18.0 はキャッシュにない道具を取りに行くため）— ^26.15.3 の範囲内
After: Windows 版は GitHub に接続できず SHASUMS256.txt の取得で失敗。キャッシュの electron-v44.7.0-win32-x64.zip の sha256 が node_modules/electron/checksums.json と一致することを確認し、-c.electronDist で作成 → dist/widget/GutenbergReader-Windows-0.0.0.zip（同梱物を確認済み）。手順は README に記載
After: 不具合「ダブルクリックしても反応しない」— 原因: この PC から ejje.weblio.jp に接続できない（ERR_ADDRESS_UNREACHABLE、curl でも同じ）。アプリ側の欠陥として、調べ中の表示がない・失敗が英語の生メッセージ・中継が例外を投げるだけ、の 3 点を修正（electron/relay.mjs で 502 を返す、lookingUp 表示、接続エラーを日本語で表示）。テスト RED→GREEN（画面 90/90、electron 13/13）
2026-11-04 テスト追加: main.mjs の判断部分（isFromApp・isCsvPath・withCsvExtension・relayTarget・resolveStaticFile）を electron/paths.mjs に切り出してテスト（RED→GREEN）。preload.cjs・DesktopBridgeService のテストを新設し、既存テストに境界ケースを追加（画面 110/110、electron 61/61）
2026-11-04 Ruling: 壊れた URL エンコード（%E0 など）で decodeURIComponent が例外を投げ、要求ごと失敗していた → 400 を返す。存在するフォルダのパス（末尾 / なし）を file:// で取りに行っていた → existsSync を statSync().isFile() に変え、index.html を返す — 画面の通常操作には影響しない
2026-11-04 Ruling: src/app/pstudy/ は pstudy-dict からの自動コピーなのでテストを書かない（元の pstudy-dict 側で書く）
2026-11-04 テストの説明を docs/testing.md に作成
2026-11-04 docs/coding-standards.md（品質とコンテキスト節約の規約）と、要点だけの CLAUDE.md を作成。tsconfig の strict 未設定（有効にしても型エラー 0 件）と reader.component.spec.ts の 640 行超えは規約に「次に直す」と記載し、今回は変更しない
2026-11-04 規約に合わせて修正: tsconfig に strict を追加（型エラー 0）、reader.component.spec.ts（642 行）を操作ごとの 5 ファイル＋共通データ reader.testing.ts に分割（tsconfig.app.json で *.testing.ts を除外。110/110）、main.mjs の loadSettings に {} を返す理由を JSDoc で記載
2026-11-04 lint を追加: ng add angular-eslint@22.6.0（eslint 10・typescript-eslint 8）＋ globals。対象を electron/・scripts/ に広げ、src/app/pstudy/ は除外。テストのファイルだけ no-empty-function を外す（偽物の空関数）。指摘の修正: 目に見えない BOM 文字を '\uFEFF' に（6 ファイル）、sync-pstudy.mjs の未使用 import。テンプレートのアクセシビリティ規則は既存の 9 件の問題を検出しない（div のクリックなどを見る規則のため）
2026-11-06 目録検索は pg_catalog.csv を手動取得し、英語・Text の題名と著者だけを userData/catalog.json に保存して検索する（docs/superpowers/specs/2026-11-06-catalog-search-design.md）。
2026-11-06 目録検索を読書画面に組み込んだ（app-catalog-search の bookSelected で番号欄に入れて openBook）。reader の spec は provideFakeCatalog() で目録を偽物にする（画面 160・Electron 77）。
2026-11-06 目録検索で日本語の題名を Enter で英訳して検索する: Weblio（既存の中継 /weblio/）の和英の .content-explanation を「、」で区切り、かっこ書きと重複を除いた候補ごとに検索して合わせる。Weblio に無い語（404）は英訳なし、通信エラーの文は weblio-error.ts に共通化（画面 196・Electron 77）。
2026-11-06 「宝島」が Weblio の要約欄で Takarashima Island と誤訳され見つからなかったため、meta description の【単語】【英訳】【対訳】も英訳の候補にし、先頭の a・an・the を外す（画面 203）。
2026-11-06 目録の一覧を別ウインドウ（app://local/catalog、App がパスで出し分け、ルーターなし）に出し、分類（Bookshelves の Category:）で絞り込む設計にする。一覧から開く本は main 経由で読書ウインドウに送る（docs/superpowers/specs/2026-11-06-catalog-window-design.md）。
