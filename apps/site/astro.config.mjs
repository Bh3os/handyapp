// Public site build: static, pre-rendered HTML; URLs without a trailing slash.
import { defineConfig } from 'astro/config'

export default defineConfig({
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
})
