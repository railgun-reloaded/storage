module.exports = [
  {
    ignores: ['dist/**', 'test/**', 'drizzle/**', 'config/**']
  },
  ...require('@railgun-reloaded/eslint-config')(),
  {
    rules: {
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-description': 'off',
      'jsdoc/require-param-description': 'off',
      'jsdoc/require-returns': 'off',
      'jsdoc/check-tag-names': 'off',
      'import-x/group-exports': 'off',
      'import-x/exports-last': 'off',
    }
  }
]
