import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  banner: ({ format }) => {
    if (format === 'esm') {
      return { js: '#!/usr/bin/env node' }
    }
    return {}
  },
})
