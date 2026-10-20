// HandyHub staff build (React + Vite). Built for /staff/; the server serves the same files under /staff on the single
// staging host and at the root of the staff host (TSK-0017), where /staff/assets/* still resolves.
import react from '@vitejs/plugin-react'
import { defaultClientConditions, defineConfig } from 'vite'

export default defineConfig({
  base: '/staff/',
  plugins: [react()],
  // Workspace packages resolve to their TypeScript source (the "@handyhub/source" export condition).
  resolve: { conditions: ['@handyhub/source', ...defaultClientConditions] },
  build: { sourcemap: true },
})
