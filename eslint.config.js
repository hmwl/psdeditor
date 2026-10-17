

import globals from 'globals';

const correctness = {
  'no-undef': 'error',
  'no-dupe-keys': 'error',
  'no-dupe-args': 'error',
  'no-dupe-else-if': 'error',
  'no-duplicate-case': 'error',
  'no-func-assign': 'error',
  'no-import-assign': 'error',
  'no-const-assign': 'error',
  'no-unreachable': 'error',
  'no-unsafe-finally': 'error',
  'no-self-assign': 'error',
  'no-unsafe-negation': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error',
  'no-obj-calls': 'error',
  'getter-return': 'error',
  'no-setter-return': 'error',
  'no-class-assign': 'error',
  'no-compare-neg-zero': 'error',
  'no-invalid-regexp': 'error',
};

export default [
  { ignores: ['**/node_modules/**', 'web/dist/**', 'server/engine/**', 'server/data/**', 'web/.dist-tmp/**', 'web/.obf-runtime-dist/**', '_xfer/**', 'corpus/**', 'docs/**', 'web/vendor/**'] },
  {
    files: ['web/**/*.js', 'core/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser, ...globals.worker, __PSD_EDITOR_VERSION__: 'readonly' } },
    rules: correctness,
  },
  {
    

    files: ['web/editor/**/*.js'],
    rules: { 'no-restricted-globals': ['error', 'GPU', 'name', 'status', 'event', 'length', 'origin', 'top', 'parent', 'external', 'closed', 'frames', 'opener'] },
  },
  {
    files: ['core/**/*.js'],   
    languageOptions: { globals: { ...globals.browser, ...globals.worker, ...globals.node } },
  },
  {
    files: ['server/**/*.js', 'tools/**/*.js', 'tools/**/*.mjs', 'build.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node } },
    rules: correctness,
  },
  {
    files: ['tools/test/**/*.mjs'],   
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
