import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['server.ts'],
  outDir: 'dist/server',
  format: ['esm'],
  dts: false,
  clean: true,
  deps: {
    neverBundle: ['vite'],
  },
})
