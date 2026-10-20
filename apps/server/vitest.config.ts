import { defaultServerConditions } from 'vite'
import { defineConfig } from 'vitest/config'

// Workspace packages resolve to their TypeScript source in tests (the "@handyhub/source" export condition).
const conditions = ['@handyhub/source', ...defaultServerConditions]

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: { environment: 'node', testTimeout: 20_000 },
})
