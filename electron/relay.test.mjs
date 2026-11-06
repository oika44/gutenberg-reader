// electron/relay.mjs のテスト（npm run test:electron）
import { describe, expect, it, vi } from 'vitest';
import { relay } from './relay.mjs';

describe('relay', () => {
  it('取得できたらその応答を返す', async () => {
    const ok = new Response('<html></html>', { status: 200 });
    const fetchFn = vi.fn(async () => ok);
    expect(await relay(fetchFn, 'https://ejje.weblio.jp/content/apple')).toBe(ok);
    expect(fetchFn).toHaveBeenCalledWith('https://ejje.weblio.jp/content/apple');
  });

  it('接続できなければ 502 と理由を返す（例外にしない）', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('net::ERR_ADDRESS_UNREACHABLE');
    });
    const res = await relay(fetchFn, 'https://ejje.weblio.jp/content/apple');
    expect(res.status).toBe(502);
    expect(await res.text()).toContain('ERR_ADDRESS_UNREACHABLE');
  });
});
