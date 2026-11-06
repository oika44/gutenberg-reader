// 外部サイト（Gutenberg・Weblio）への中継（electron/main.mjs から使う。テストは relay.test.mjs）

/**
 * url を取得して応答を返す。接続できないときは例外にせず 502 と理由を返す。
 * 例外のままだと画面側には原因の分からない失敗しか届かないため。
 * @param {(url: string) => Promise<Response>} fetchFn
 * @param {string} url
 * @returns {Promise<Response>}
 */
export async function relay(fetchFn, url) {
  try {
    return await fetchFn(url);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return new Response(`接続できませんでした: ${url}（${reason}）`, {
      status: 502,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
}
