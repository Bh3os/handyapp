// Server entry point: node dist/main.js. The environment schema (config.ts) is validated at boot; a bad configuration
// prints the problem (never a value) and exits non-zero.
import { fileURLToPath } from 'node:url'
import { boot } from './boot.js'
import { ConfigError } from './config.js'

try {
  const { address, config } = await boot(process.env, {
    defaultSiteDir: fileURLToPath(new URL('../../site/dist', import.meta.url)),
    defaultStaffDir: fileURLToPath(new URL('../../staff/dist', import.meta.url)),
    defaultPortalDir: fileURLToPath(new URL('../../portal/dist', import.meta.url)),
    logger: true,
  })
  process.stdout.write(`server listening on ${address} (${config.env})\n`)
} catch (error) {
  if (error instanceof ConfigError) {
    process.stderr.write(`configuration error: ${error.message}\n`)
    process.exit(1)
  }
  throw error
}
