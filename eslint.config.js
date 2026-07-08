import railgunEslintConfig from '@railgun-reloaded/eslint-config'

export default [
  {
    ignores: ['dist/**', 'drizzle/**', 'config/**', 'fixtures/**', 'src/browser/migration-catalog.generated.ts']
  },
  ...railgunEslintConfig(),
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', {
        name: 'Buffer',
        message: 'Use Uint8Array instead of Buffer so the package stays browser-safe.'
      }]
    }
  },
]
