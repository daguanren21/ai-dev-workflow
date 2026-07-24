import { defineConfig } from 'wxt'

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'ONES Task Splitter',
    description: 'Parse and review ONES task trees before creation',
    permissions: ['storage'],
    host_permissions: ['https://*/*', 'http://*/*'],
    action: { default_title: 'ONES Task Splitter' },
  },
})
