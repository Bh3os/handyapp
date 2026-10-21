// ESLint flat config. Module-boundary rule: a module may not import another module's internals; it imports a
// module or package only through its public index.
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const MODULE_BOUNDARY = {
  group: ['**/modules/*/internal/**', '**/modules/*/repository*', '@handyhub/*/src/**'],
  message: 'Import another module or package only through its public index.',
}
const SERVER_ONLY = '@handyhub/policy is server-only: frontends call the server API (TSK-0006, HH-ARC-05).'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'coverage/**',
      'apps/*/coverage/**',
      'packages/*/coverage/**',
      '**/.astro/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'reports/**',
      'kg/**',
      'apps/site/src/request/validator.generated.ts',
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
      'no-restricted-imports': ['error', { patterns: [MODULE_BOUNDARY] }],
    },
  },
  {
    // Server-only packages never reach a frontend bundle (TSK-0006; HH-ARC-05): the policy package decides on the server.
    files: ['apps/portal/**', 'apps/staff/**', 'apps/site/**', 'packages/ui/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: '@handyhub/policy', message: SERVER_ONLY }],
          patterns: [MODULE_BOUNDARY, { group: ['@handyhub/policy/**'], message: SERVER_ONLY }],
        },
      ],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
)
