import antfu from '@antfu/eslint-config'

export default antfu({
  typescript: true,
  vue: false,
  jsonc: false,
  yaml: false,
  toml: false,
  markdown: false,
  ignores: ['dist', 'node_modules', 'coverage'],
  rules: {
    'node/prefer-global/buffer': 'off',
    'node/prefer-global/process': 'off',
    'no-template-curly-in-string': 'off',
  },
})
