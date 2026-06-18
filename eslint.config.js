import railgunEslintConfig from '@railgun-reloaded/eslint-config'

export default [
  {
    ignores: ['dist/**', 'drizzle/**', 'config/**']
  },
  ...railgunEslintConfig(),
]
