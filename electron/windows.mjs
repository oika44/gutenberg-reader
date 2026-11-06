// ウインドウまわりの判断（Electron に依存しない純粋な関数と定数）

/** 一覧ウインドウの設定 */
export const CATALOG_WINDOW = {
  url: 'app://local/catalog',
  width: 900,
  height: 700,
  minWidth: 640,
  minHeight: 480,
  title: 'Gutenberg 目録',
};

/** 本の番号（正の整数）か。preload.cjs の onOpenBook も同じ条件で確かめている */
export function isBookId(value) {
  return Number.isSafeInteger(value) && value >= 1;
}

/** 開いているウインドウを使い回せるか（無い・破棄済みなら false） */
export function shouldReuseWindow(win) {
  return win != null && !win.isDestroyed();
}
