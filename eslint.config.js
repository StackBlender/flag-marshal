// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Architecture boundaries are enforced twice, deliberately:
 *   - here, for fast editor and CI feedback;
 *   - in test/architecture/boundaries.test.ts, which is authoritative and cannot
 *     be silenced with an inline disable comment.
 * See docs/design.md, "Reuse across frontends".
 */
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'artifacts/**',
      // A downloaded VS Code, cached by the integration runner.
      '.vscode-test/**',
      'coverage/**',
      'node_modules/**',
      // Fixture repositories are sample code for the analyzer to read. They are
      // deliberately not part of this project's compilation or style rules.
      'fixtures/**',
      // Generated from schema/v1. Regenerate rather than edit.
      'src/core/api/generated/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // The core is platform-free and network-free.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/frontends/**', '**/frontends', 'vscode'],
              message:
                'core must not import frontends or editor APIs. The core emits structured data; frontends render it.',
            },
            {
              group: [
                'http',
                'https',
                'node:http',
                'node:https',
                'net',
                'node:net',
                'tls',
                'node:tls',
                'dgram',
                'node:dgram',
                'undici',
                'axios',
                'node-fetch',
                'got',
              ],
              message:
                'core must make zero network calls. Analysis is local-only. See docs/design.md, section 9.',
            },
          ],
        },
      ],
    },
  },
  {
    // Frontends consume the published core API and nothing deeper.
    files: ['src/frontends/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/core/**', '!**/core/api', '!**/core/api/**'],
              message:
                'frontends may import core/api only. Reaching into core internals is what makes frontends drift apart.',
            },
          ],
        },
      ],
    },
  },
  {
    // Shared wording. Between core and the frontends: it reads the published core
    // API and produces strings, and knows nothing about any editor or terminal.
    files: ['src/present/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/core/**', '!**/core/api', '!**/core/api/**'],
              message: 'the presentation layer may import core/api only, like any frontend.',
            },
            {
              group: ['**/frontends/**', '**/frontends', 'vscode'],
              message:
                'shared wording must not depend on a frontend or an editor API, or it stops being shared.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['test/**/*.ts', '*.config.ts', 'eslint.config.js'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // Build scripts are plain Node ESM, outside the TypeScript program.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly' },
      parserOptions: { projectService: false },
    },
    rules: { 'no-restricted-imports': 'off' },
  },
);
