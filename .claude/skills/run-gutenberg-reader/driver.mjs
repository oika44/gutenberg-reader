// GutenbergReader のデスクトップ版（Electron）を操作するドライバー。エージェント用。
//
// xvfb の仮の画面で Electron を --remote-debugging-port 付きで起動し、Chrome DevTools Protocol（CDP）で操作する。
// Playwright などは使わず、Node 22 以降に組み込みの fetch・WebSocket だけで動く。
// コマンドは標準入力から 1 行ずつ読む（ヒアドキュメントで流し込む）。入力が終わると Electron を閉じて終了する。
//
//   node .claude/skills/run-gutenberg-reader/driver.mjs <<'EOF'
//   launch
//   open 1342
//   search Darcy
//   ss search
//   EOF
//
// データ置き場（userData）は既定で使い捨ての一時フォルダにする。本物の記録ファイル・しおり・設定には触れない。
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as readline from 'node:readline';

const APP_DIR = resolve(import.meta.dirname, '../../..');
const SHOT_DIR = process.env.SCREENSHOT_DIR || join(tmpdir(), 'gutenberg-reader-shots');
const PORT = Number(process.env.CDP_PORT || 9333);
const REAL_USER_DATA = join(homedir(), '.config', 'gutenberg-reader');
mkdirSync(SHOT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let child = null;
let userDataDir = null;
let ws = null;
let seq = 0;
const pending = new Map();

function send(method, params = {}) {
  if (!ws) throw new Error('launch を先に実行する');
  return new Promise((resolveSend, reject) => {
    const id = ++seq;
    pending.set(id, (msg) =>
      msg.error ? reject(new Error(msg.error.message)) : resolveSend(msg.result),
    );
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  }
  return r.result.value;
}

async function waitFor(expression, label, ms = 30_000) {
  for (let t = 0; t < ms; t += 300) {
    if (await evaluate(expression).catch(() => false)) return;
    await sleep(300);
  }
  throw new Error(`待ちきれなかった（${ms / 1000} 秒）: ${label}`);
}

/** 描画が追いつくまで待つ。決まった時間ではなく、条件が満たされるまで確かめる（満たされなくても先へ進む） */
async function settle(expression, ms = 5_000) {
  for (let t = 0; t < ms; t += 100) {
    if (await evaluate(expression).catch(() => false)) return true;
    await sleep(100);
  }
  return false;
}

/** 検索した語の結果が描かれたか（前の検索の一覧を読まないため、強調した語で見分ける） */
const searchRendered = (query) => {
  const q = JSON.stringify(query.trim().toLowerCase());
  return `(() => {
    const q = ${q};
    if (q === '') return !document.querySelector('.search');
    const h = document.querySelector('.search h2');
    if (!h) return false;
    if (document.querySelector('.search .hint')) return true;
    const m = document.querySelector('.search-hit mark');
    return !!m && m.textContent.toLowerCase() === q;
  })()`;
};

/** 入力欄に値を入れて Enter を押す（Angular の (keydown.enter) が拾う） */
const enterInto = (selector, value) =>
  evaluate(`(() => {
    const i = document.querySelector(${JSON.stringify(selector)});
    if (!i) return 'NOT_FOUND';
    i.value = ${JSON.stringify(value)};
    i.dispatchEvent(new Event('input', { bubbles: true }));
    i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return 'OK';
  })()`);

const squash = (expr) => `(${expr}).replace(/\\s+/g, ' ').trim()`;

/** "ctrl+f"・"Enter"・"meta+f" のような表記をキーイベントにする */
async function pressKey(spec) {
  const parts = spec.split('+');
  const key = parts.pop();
  const mods = { alt: 1, ctrl: 2, meta: 4, shift: 8 };
  const modifiers = parts.reduce((m, p) => m | (mods[p.toLowerCase()] ?? 0), 0);
  const named = { Enter: 13, Escape: 27, Tab: 9, Backspace: 8, ArrowDown: 40, ArrowUp: 38 };
  const single = key.length === 1;
  const keyCode = named[key] ?? (single ? key.toUpperCase().charCodeAt(0) : 0);
  const code = single ? (/[a-z]/i.test(key) ? `Key${key.toUpperCase()}` : key) : key;
  for (const type of ['rawKeyDown', 'keyUp']) {
    await send('Input.dispatchKeyEvent', {
      type,
      key,
      code,
      windowsVirtualKeyCode: keyCode,
      modifiers,
    });
  }
}

const COMMANDS = {
  /** 起動する。"launch real" で本物のデータ置き場、"launch catalog" で一時フォルダに本物の目録だけをコピー */
  async launch(mode) {
    if (child) return console.log('起動済み');
    const distIndex = join(APP_DIR, 'dist/gutenberg-reader/browser/index.html');
    if (!existsSync(distIndex)) throw new Error('ビルドがない。先に npm run build を実行する');
    const args = ['.', '--no-sandbox', `--remote-debugging-port=${PORT}`];
    if (mode !== 'real') {
      userDataDir = mkdtempSync(join(tmpdir(), 'gutenberg-reader-data-'));
      args.push(`--user-data-dir=${userDataDir}`);
      const catalog = join(REAL_USER_DATA, 'catalog.json');
      if (mode === 'catalog' && existsSync(catalog))
        copyFileSync(catalog, join(userDataDir, 'catalog.json'));
    }
    const electron = join(APP_DIR, 'node_modules/.bin/electron');
    // detached にしてプロセスグループごと止める（pkill -f だと自分のシェルにも当たる）
    child = spawn('xvfb-run', ['-a', '-s', '-screen 0 1400x900x24', electron, ...args], {
      cwd: APP_DIR,
      detached: true,
      stdio: 'ignore',
    });
    let target = null;
    for (let i = 0; i < 60 && !target; i++) {
      await sleep(500);
      try {
        const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
        target = list.find((t) => t.type === 'page' && t.url === 'app://local/');
      } catch {
        /* まだ起動していない */
      }
    }
    if (!target) throw new Error('読書画面（app://local/）が出ない');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, j) => {
      ws.addEventListener('open', r);
      ws.addEventListener('error', j);
    });
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    });
    await send('Page.enable');
    await waitFor(`!!document.querySelector('input[aria-label="本の番号か URL"]')`, '画面の表示');
    console.log(`起動した（データ置き場: ${userDataDir ?? REAL_USER_DATA}）`);
  },

  /** 本を開く（番号か URL）。読み込み完了まで待ち、題名とメッセージを出す */
  async open(id) {
    console.log(await enterInto('input[aria-label="本の番号か URL"]', id));
    await waitFor(
      `!!document.querySelector('.book-title') && !document.querySelector('.toolbar .status')`,
      '本の読み込み',
      60_000,
    );
    console.log(
      '題名:',
      await evaluate(squash(`document.querySelector('.book-title').textContent`)),
    );
    console.log(
      'メッセージ:',
      await evaluate(`document.querySelector('.message')?.textContent ?? ''`),
    );
  },

  /** 本文を検索し、見出しと先頭 5 件を出す */
  async search(query) {
    console.log(await enterInto('input[aria-label="本文を検索"]', query));
    await settle(searchRendered(query));
    const head = await evaluate(`document.querySelector('.search h2')?.textContent ?? null`);
    if (head === null)
      return console.log(
        '検索結果の欄が無い（空の検索語か、本が無い）',
        await evaluate(`document.querySelector('.message')?.textContent ?? ''`),
      );
    console.log(head.replace(/\s+/g, ' ').trim());
    await COMMANDS.hits('5');
  },

  /** 検索結果の先頭 n 件（既定 10）を「行番号 | 強調した語 | 文」で出す */
  async hits(n) {
    // press Enter で検索した直後にも使うので、一覧か「見つかりませんでした」が出るまで待つ
    await settle(`!!document.querySelector('.search-hit, .search .hint')`);
    const rows =
      await evaluate(`[...document.querySelectorAll('.search-hit')].slice(0, ${Number(n) || 10}).map(b =>
      b.querySelector('.hit-no').textContent.trim() + ' | ' +
      [...b.querySelectorAll('mark')].map(m => m.textContent).join(',') + ' | ' +
      b.querySelector('.hit-text').textContent.replace(/\\s+/g, ' ').trim().slice(0, 70))`);
    for (const r of rows) console.log(' ', r);
    if (rows.length === 0) console.log('  （一覧なし）');
  },

  /** 検索結果の k 件目（1 から）を押し、本文で色が付いた行と、それが画面内かを出す */
  async jump(k) {
    const line = await evaluate(`(() => {
      const b = document.querySelectorAll('.search-hit')[${Number(k) - 1}];
      if (!b) return null;
      b.click();
      return b.querySelector('.hit-no').textContent.trim();
    })()`);
    if (line === null) return console.log('その番号の検索結果が無い');
    // 仮想スクロールは scroll イベントの後で行を描き直すので、その行が描かれるまで待つ
    await settle(
      `document.querySelector('.line.hit .line-no')?.textContent.trim() === ${JSON.stringify(line)}`,
    );
    console.log(
      `押した行: ${line} / 本文:`,
      JSON.stringify(
        await evaluate(`(() => {
          const hit = document.querySelector('.line.hit');
          if (!hit) return null;
          const vp = document.querySelector('cdk-virtual-scroll-viewport').getBoundingClientRect();
          const r = hit.getBoundingClientRect();
          return { line: hit.querySelector('.line-no').textContent.trim(), visible: r.top >= vp.top && r.bottom <= vp.bottom };
        })()`),
      ),
    );
  },

  /** 読んだ範囲の欄（開始行・終了行・行数・語数） */
  async range() {
    console.log(await evaluate(squash(`document.querySelector('.range dl').innerText`)));
  },

  /** 画面全体のスクリーンショット → $SCREENSHOT_DIR/<name>.png */
  async ss(name) {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    const f = join(SHOT_DIR, `${name || `ss-${Date.now()}`}.png`);
    writeFileSync(f, Buffer.from(r.data, 'base64'));
    console.log('screenshot:', f);
  },

  async click(selector) {
    console.log(
      await evaluate(
        `(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return 'NOT_FOUND'; e.click(); return 'OK'; })()`,
      ),
    );
  },

  async 'click-text'(text) {
    console.log(
      await evaluate(`(() => {
        const t = ${JSON.stringify(text)};
        const els = [...document.querySelectorAll('button, a')];
        const e = els.find(x => x.textContent.trim() === t) ?? els.find(x => x.textContent.includes(t));
        if (!e) return 'NOT_FOUND';
        e.click(); return 'OK';
      })()`),
    );
  },

  /** フォーカスのある所に文字を入れる */
  async type(text) {
    await send('Input.insertText', { text });
  },

  /** キーを押す。例: press ctrl+f / press Enter */
  async press(spec) {
    await pressKey(spec);
    console.log(
      'フォーカス:',
      await evaluate(
        `document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName`,
      ),
    );
  },

  async wait(selector) {
    await waitFor(`!!document.querySelector(${JSON.stringify(selector)})`, selector, 10_000);
    console.log('found:', selector);
  },

  /** 画面の中で JavaScript を評価する。標準入力に書いた式（エージェント自身が書く）を、手元で起動したアプリにだけ送る */
  async eval(expression) {
    console.log(JSON.stringify(await evaluate(expression)));
  },

  async text(selector) {
    console.log(
      await evaluate(
        `(${selector ? `document.querySelector(${JSON.stringify(selector)})` : 'document.body'})?.innerText ?? '(null)'`,
      ),
    );
  },

  async sleep(ms) {
    await sleep(Number(ms) || 1000);
  },

  async quit() {
    ws?.close();
    ws = null;
    if (child) {
      // Electron を CDP で正常に閉じる。xvfb-run は Electron が終わると Xvfb と一時フォルダを自分で片付ける。
      // 先に SIGTERM でプロセスグループを止めると、xvfb-run が片付けないまま終わり、Xvfb が残る
      const exited = new Promise((r) => child.once('exit', r));
      try {
        const { webSocketDebuggerUrl } = await (
          await fetch(`http://127.0.0.1:${PORT}/json/version`)
        ).json();
        const browser = new WebSocket(webSocketDebuggerUrl);
        await new Promise((r, j) => {
          browser.addEventListener('open', r);
          browser.addEventListener('error', j);
        });
        browser.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
      } catch {
        /* もう終わっている */
      }
      const done = await Promise.race([exited.then(() => true), sleep(5_000).then(() => false)]);
      if (!done) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          /* もう終わっている */
        }
        console.log('5 秒で終わらなかったので止めた（Xvfb が残っていないか確かめる）');
      }
      child = null;
    }
    if (userDataDir) rmSync(userDataDir, { recursive: true, force: true });
    userDataDir = null;
  },

  help() {
    console.log('commands:', Object.keys(COMMANDS).join(', '));
  },
};

const rl = readline.createInterface({ input: process.stdin });
let failed = false;
for await (const raw of rl) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  const [cmd, ...rest] = line.split(/\s+/);
  console.log(`driver> ${line}`);
  const fn = COMMANDS[cmd];
  if (!fn) {
    console.log('unknown:', cmd, '- help で一覧');
    continue;
  }
  try {
    await fn(rest.join(' '));
  } catch (e) {
    failed = true;
    console.log('ERROR:', e.message);
    if (cmd === 'launch') break;
  }
  if (cmd === 'quit') break;
}
await COMMANDS.quit();
process.exit(failed ? 1 : 0);
