import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'coverage/**', 'test-results/**', 'playwright-report/**'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: 'error',
      'prefer-const': 'error',
    },
  },

  /*
   * Constitution Principle I — `core/` is the sole arithmetic authority and MUST be
   * pure. This rule is what makes that structural rather than a convention: core/
   * cannot reach the DOM, Web Audio, storage, or any impure global, so musical
   * arithmetic physically cannot be re-derived inside a view.
   */
  {
    files: ['src/core/**/*.js'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/ui/**', '**/audio/**', '**/storage/**', '**/export/**', '../ui/*', '../audio/*', '../storage/*', '../export/*'],
              message:
                'core/ must stay pure (Constitution Principle I). It may not import from ui/, audio/, storage/, or export/.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'core/ must stay pure — no DOM access (Constitution Principle I).' },
        { name: 'document', message: 'core/ must stay pure — no DOM access (Constitution Principle I).' },
        { name: 'localStorage', message: 'core/ must stay pure — no persistence (Constitution Principle I).' },
        { name: 'AudioContext', message: 'core/ must stay pure — no Web Audio (Constitution Principle I).' },
        { name: 'fetch', message: 'core/ must stay pure — no I/O (Constitution Principle I).' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: 'core/ must be deterministic (Constitution Principle I).' },
        { object: 'Math', property: 'random', message: 'core/ must be deterministic (Constitution Principle I).' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'core/ must be deterministic — no clock reads (Constitution Principle I).',
        },
      ],
    },
  },

  prettier,
];
