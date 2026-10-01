// SPDX-License-Identifier: AGPL-3.0-or-later
// typescript-eslint does not support TypeScript 7.0 (pinned in BUILD-BRIEF section 4), so ESLint lints
// JS/JSX only and `tsc -b` is the TypeScript gate (strict, noUnusedLocals, noUnusedParameters).
import js from '@eslint/js'

export default [
  { ignores: ['dist/**', 'node_modules/**', 'public/tesseract/**', '.claude/worktrees/**', '.vercel/**', '**/*.ts', '**/*.tsx'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { window: 'readonly', document: 'readonly', localStorage: 'readonly', console: 'readonly', process: 'readonly', URL: 'readonly', matchMedia: 'readonly' } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  // theme-init.js is the designer skill's no-flash script, copied verbatim (CLAUDE.md): not edited to satisfy lint
  { files: ['public/theme-init.js'], rules: { 'no-unused-vars': 'off', 'no-empty': 'off' } },
  { files: ['public/share-target-sw.js'], languageOptions: { globals: { self: 'readonly', File: 'readonly', Response: 'readonly', crypto: 'readonly', navigator: 'readonly' } } },
]
