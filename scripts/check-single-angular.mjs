// 開発ビルドのソースマップを調べ、pstudy-dict/node_modules のパッケージが同梱されていないか確認する。
// 同梱されていると Angular が 2 つ読み込まれ、共有部品の DI が壊れる。
// 使い方: npx ng build --configuration development && node scripts/check-single-angular.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(import.meta.dirname, '..', 'dist', 'gutenberg-reader', 'browser');
const leaked = new Set();
for (const name of readdirSync(dir).filter((f) => f.endsWith('.js.map'))) {
  const { sources } = JSON.parse(readFileSync(join(dir, name), 'utf8'));
  for (const src of sources) if (src.includes('pstudy-dict/node_modules')) leaked.add(src);
}
if (leaked.size > 0) {
  console.error(`pstudy-dict/node_modules から ${leaked.size} 個のファイルが同梱されています:`);
  for (const src of [...leaked].slice(0, 5)) console.error(`  ${src}`);
  process.exit(1);
}
console.log('OK: pstudy-dict/node_modules のパッケージは同梱されていません');
