// electron/log-file.mjs のテスト（npm run test:electron）
import { describe, expect, it } from 'vitest';
import { buildAppend, decodeLogFile } from './log-file.mjs';

const HEADER = '\uFEFF記録日時,本番号';
const LINE = '2026-11-03 15:30,1342';

describe('buildAppend', () => {
  it('ファイルがなければ見出し付きで新しく作る', () => {
    expect(buildAppend(null, HEADER, LINE)).toEqual({
      mode: 'write',
      text: `${HEADER}\r\n${LINE}\r\n`,
    });
  });

  it.each([[''], ['\uFEFF'], ['\uFEFF\r\n'], ['  \r\n']])(
    '中身が空（%j）なら見出しから書き直す',
    (current) => {
      expect(buildAppend(current, HEADER, LINE).mode).toBe('write');
    },
  );

  it.each([['a\r\n'], ['a\n']])('末尾が改行（%j）ならそのまま追記する', (current) => {
    expect(buildAppend(current, HEADER, LINE)).toEqual({ mode: 'append', text: `${LINE}\r\n` });
  });

  it('末尾が改行でなければ改行を足してから追記する', () => {
    expect(buildAppend('a', HEADER, LINE)).toEqual({ mode: 'append', text: `\r\n${LINE}\r\n` });
  });
});

describe('decodeLogFile', () => {
  it('ファイルがなければ text は null', () => {
    expect(decodeLogFile(null)).toEqual({ ok: true, text: null });
  });

  it('UTF-8（BOM 付き）の日本語を読む', () => {
    const buf = Buffer.from('\uFEFF記録日時,本番号\r\n', 'utf8');
    expect(decodeLogFile(buf)).toEqual({ ok: true, text: '\uFEFF記録日時,本番号\r\n' });
  });

  it('Shift_JIS など UTF-8 でないファイルは読まずに理由を返す', () => {
    // 「記録日時」を Shift_JIS にしたもの（Excel の「CSV（コンマ区切り）」で保存し直した想定）
    const sjis = Buffer.from([0x8b, 0x4c, 0x98, 0x5e, 0x93, 0xfa, 0x8e, 0x9e]);
    const result = decodeLogFile(sjis);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('UTF-8');
  });
});
