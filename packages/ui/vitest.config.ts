import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { conditions: ['@handyhub/source'] },
  test: { environment: 'jsdom', include: ['test/**/*.test.{ts,tsx}'] },
})
