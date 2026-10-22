// Deploy configuration (TSK-0003; INT-Render, RULE-SYNTHETIC-DATA): render.yaml and the Dockerfile carry names and
// non-secret settings only, use the public health check and match the variables the server reads.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ENV_VARS } from '../../src/config.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const render = readFileSync(join(ROOT, 'render.yaml'), 'utf8')
const dockerfile = readFileSync(join(ROOT, 'Dockerfile'), 'utf8')

/** The envVars entries of render.yaml: key and the line that follows it. */
function envVars(): { key: string; next: string }[] {
  const lines = render.split('\n')
  return lines.flatMap((line, i) => {
    const m = /^\s+- key: (\w+)$/.exec(line)
    return m ? [{ key: m[1] as string, next: (lines[i + 1] ?? '').trim() }] : []
  })
}

describe('Render deploy configuration (TSK-0003, INT-Render, RULE-SYNTHETIC-DATA)', () => {
  it('[RULE-SYNTHETIC-DATA] secrets are never written: they are sync: false or come from the database', () => {
    const vars = Object.fromEntries(envVars().map((v) => [v.key, v.next]))
    expect(vars['ACCESS_GATE_USERS']).toBe('sync: false')
    expect(vars['DATABASE_URL']).toBe('fromDatabase:')
    expect(render).not.toMatch(/postgres(ql)?:\/\//)
    expect(dockerfile).not.toMatch(/ACCESS_GATE_USERS|DATABASE_URL=|postgres:\/\//)
  })

  it('[RULE-SYNTHETIC-DATA] every variable in render.yaml is one the server reads; staging is declared', () => {
    for (const { key } of envVars()) expect(Object.keys(ENV_VARS), key).toContain(key)
    expect(render).toMatch(/- key: HANDYHUB_ENV\n\s+value: staging/)
  })

  it('[RULE-SYNTHETIC-DATA] Render polls the public /healthz; the service and database match the existing staging names', () => {
    expect(render).toMatch(/healthCheckPath: \/healthz/)
    expect(render).toMatch(/name: handyhub-staging\n/)
    expect(render).toMatch(/name: handyhub-staging-db/)
    expect(render).toMatch(/postgresMajorVersion: '16'/)
  })

  it('the container migrates, loads the services, SOPs and loadouts, then serves the built server', () => {
    expect(dockerfile).toContain('FROM node:24-slim')
    // A fresh database has no services until the registry is synced (TSK-0019); each sync is safe to repeat.
    expect(dockerfile).toContain(
      'node packages/db/dist/cli/migrate.js && node packages/db/dist/cli/services.js && ' +
        'node packages/db/dist/cli/sops.js && node packages/db/dist/cli/loadouts.js && exec node apps/server/dist/main.js',
    )
  })
})
