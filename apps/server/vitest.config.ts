import { defaultServerConditions } from 'vite'
import { defineConfig } from 'vitest/config'

// Workspace packages resolve to their TypeScript source in tests (the "@handyhub/source" export condition). The
// bundler-only "module" condition is left out, as Node leaves it out: the AWS SDK's "module" build (dist-es) uses
// extension-less imports that only a bundler resolves (TSK-0013).
const conditions = ['@handyhub/source', ...defaultServerConditions.filter((c) => c !== 'module')]

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: { environment: 'node', testTimeout: 20_000 },
})
