// HandyHub customer portal build (React + Vite). Its host and base path are set in TSK-0017; until then it builds for "/".
import react from '@vitejs/plugin-react'
import { defaultClientConditions, defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // Workspace packages resolve to their TypeScript source (the "@handyhub/source" export condition).
  resolve: { conditions: ['@handyhub/source', ...defaultClientConditions] },
  build: { sourcemap: true },
})
