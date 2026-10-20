// HandyHub staff build (React + Vite). Served by the server under /staff/ until host routing exists (TSK-0017).
import react from '@vitejs/plugin-react'
import { defaultClientConditions, defineConfig } from 'vite'

export default defineConfig({
  base: '/staff/',
  plugins: [react()],
  // Workspace packages resolve to their TypeScript source (the "@handyhub/source" export condition).
  resolve: { conditions: ['@handyhub/source', ...defaultClientConditions] },
  build: { sourcemap: true },
})
