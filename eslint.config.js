// ESLint flat config. Module-boundary rule: a module may not import another module's internals; it imports a
// module or package only through its public index.
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.astro/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'reports/**',
      'kg/**',
      'sources/**',
      'tools/kg.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'no-console': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/modules/*/internal/**', '**/modules/*/repository*', '@handyhub/*/src/**'],
              message: 'Import another module or package only through its public index.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
)
