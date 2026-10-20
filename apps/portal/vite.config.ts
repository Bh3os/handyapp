// HandyHub customer portal build (React + Vite). Served under /portal/ on the public host (TSK-0017).
import react from '@vitejs/plugin-react'
import { defaultClientConditions, defineConfig } from 'vite'

export default defineConfig({
  base: '/portal/',
  plugins: [react()],
  // Workspace packages resolve to their TypeScript source (the "@handyhub/source" export condition).
  resolve: { conditions: ['@handyhub/source', ...defaultClientConditions] },
  build: { sourcemap: true },
})
