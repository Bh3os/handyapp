// Component gallery (TSK-0018): a static page of every component and state in both themes, built to gallery/dist.
// The e2e suite serves it with `vite preview`, scans it with axe and compares it with the committed screenshots.
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defaultClientConditions, defineConfig } from 'vite'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  resolve: { conditions: ['@handyhub/source', ...defaultClientConditions] },
  build: { outDir: 'dist', emptyOutDir: true },
  preview: { host: '127.0.0.1', strictPort: true },
})
