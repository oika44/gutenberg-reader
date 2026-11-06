// pstudy-dict の共有部品（Weblio 検索・P-Study 用 CSV 作成）を src/app/pstudy/ にコピーする。
// 元のファイルは ../pstudy-dict/src/app/services/ の 1 か所だけ。コピーは build・test・start の前に自動で作り直す。
// 直接参照しないのは、../pstudy-dict 側の node_modules の Angular が同梱され、Angular が 2 つになるのを防ぐため。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FILES = ['word-lookup.service.ts', 'pstudy-builder.service.ts'];
const root = join(import.meta.dirname, '..');
const from = join(root, '..', 'pstudy-dict', 'src', 'app', 'services');
const to = join(root, 'src', 'app', 'pstudy');

if (!existsSync(from)) {
  console.error(`pstudy-dict が見つかりません: ${from}`);
  console.error('gutenberg-reader と pstudy-dict を同じフォルダに並べて置いてください。');
  process.exit(1);
}
mkdirSync(to, { recursive: true });
for (const file of FILES) {
  const header = `// 自動生成: ../pstudy-dict/src/app/services/${file} のコピー。直接編集しない（npm run sync:pstudy で作り直す）\n`;
  writeFileSync(join(to, file), header + readFileSync(join(from, file), 'utf8'));
}
console.log(`pstudy-dict の共有部品をコピーしました: ${FILES.join(', ')}`);
