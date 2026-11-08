// @ts-check
// ESLint の設定（npm run lint = ng lint。対象は angular.json の lint.options.lintFilePatterns）
const eslint = require('@eslint/js');
const { defineConfig, globalIgnores } = require('eslint/config');
const globals = require('globals');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

module.exports = defineConfig([
  // 生成物と外部の部品。src/app/pstudy/ はサブモジュール pstudy-dict/ からの自動コピーなので、元の側で lint する
  globalIgnores(['dist/', '.angular/', 'src/app/pstudy/', 'pstudy-dict/']),
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
    },
  },
  {
    // テストの偽物は「何もしない」関数（init: async () => {} など）をわざと使う
    files: ['**/*.spec.ts', '**/*.testing.ts', '**/*.test.mjs'],
    rules: {
      '@typescript-eslint/no-empty-function': 'off',
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
  {
    // Electron（main・中継・記録ファイル）と scripts/ は Node で動く ES モジュール
    files: ['electron/**/*.mjs', 'scripts/**/*.mjs'],
    extends: [eslint.configs.recommended],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  {
    // sandbox 有効のプリロードは ESM が使えないため CommonJS
    files: ['electron/**/*.cjs'],
    extends: [eslint.configs.recommended],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },
]);
