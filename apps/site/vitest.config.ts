import { defineConfig } from 'vitest/config'

// Workspace packages resolve to their TypeScript source in tests (the "@handyhub/source" export condition).
const conditions = ['@handyhub/source', 'node', 'import', 'default']

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: { environment: 'node' },
})
