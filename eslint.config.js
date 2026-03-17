module.exports = [
  {
    ignores: ['dist/**', 'drizzle/**', 'config/**']
  },
  ...require('@railgun-reloaded/eslint-config')(),
]
