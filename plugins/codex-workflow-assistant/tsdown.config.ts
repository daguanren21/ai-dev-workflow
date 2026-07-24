import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['scripts/src/workflow-cli.ts'],
  format: ['esm'],
  outDir: 'scripts/dist',
  clean: true,
  dts: false,
  banner: { js: '#!/usr/bin/env node' },
})
