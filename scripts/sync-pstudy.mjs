// pstudy-dict の共有部品（Weblio 検索・P-Study 用 CSV 作成）を src/app/pstudy/ にコピーする。
// 元のファイルは git submodule の pstudy-dict/src/app/services/ の 1 か所だけ。コピーは build・test・start の前に自動で作り直す。
// 直接参照しないのは、pstudy-dict 側の node_modules の Angular が同梱され、Angular が 2 つになるのを防ぐため。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILES = ['word-lookup.service.ts', 'pstudy-builder.service.ts'];

/** サブモジュール pstudy-dict の共有部品のフォルダ。取得されていなければ null。 */
export function findPstudySource(root) {
  const from = join(root, 'pstudy-dict', 'src', 'app', 'services');
  return existsSync(from) ? from : null;
}

function sync(root) {
  const from = findPstudySource(root);
  if (from === null) {
    console.error(`pstudy-dict が見つかりません: ${join(root, 'pstudy-dict')}`);
    console.error('サブモジュールを取得してください: git submodule update --init');
    process.exit(1);
  }
  const to = join(root, 'src', 'app', 'pstudy');
  mkdirSync(to, { recursive: true });
  for (const file of FILES) {
    const header = `// 自動生成: pstudy-dict/src/app/services/${file} のコピー。直接編集しない（npm run sync:pstudy で作り直す）\n`;
    writeFileSync(join(to, file), header + readFileSync(join(from, file), 'utf8'));
  }
  console.log(`pstudy-dict の共有部品をコピーしました: ${FILES.join(', ')}`);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  sync(join(import.meta.dirname, '..'));
}
