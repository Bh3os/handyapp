// Public site build: static, pre-rendered HTML; URLs without a trailing slash. React islands (TSK-0026) for the request
// wizard; workspace packages resolve to their TypeScript source (the "@handyhub/source" export condition).
import react from '@astrojs/react'
import { defineConfig } from 'astro/config'

export default defineConfig({
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [react()],
  vite: { resolve: { conditions: ['@handyhub/source'] }, ssr: { resolve: { conditions: ['@handyhub/source'] } } },
})
