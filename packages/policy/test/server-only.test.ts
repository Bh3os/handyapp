// The policy package is server-only (TSK-0006; HH-ARC-05, RULE-SERVER-AUTHZ): browser bundles resolve to a module
// that throws, and lint refuses the import in the frontends.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

describe('server-only import guard (TSK-0006, HH-ARC-05)', () => {
  it('maps the browser export condition first, to a module that throws on import', async () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      exports: Record<string, Record<string, string>>
    }
    const conditions = Object.keys(pkg.exports['.'] ?? {})
    expect(conditions[0]).toBe('browser')
    expect(pkg.exports['.']?.browser).toBe('./browser.js')
    await expect(import(new URL('../browser.js', import.meta.url).href)).rejects.toThrow(/server-only/)
  })

  it('lint refuses @handyhub/policy in the portal, staff app, site and ui, and allows it on the server', async () => {
    const eslint = new ESLint({ cwd: ROOT })
    const code = "import { decide } from '@handyhub/policy'\nexport const d = decide\n"
    for (const file of ['apps/portal/src/x.ts', 'apps/staff/src/x.tsx', 'apps/site/src/x.ts', 'packages/ui/src/x.ts']) {
      const [result] = await eslint.lintText(code, { filePath: `${ROOT}${file}` })
      expect(
        result?.messages.map((m) => m.ruleId),
        file,
      ).toContain('no-restricted-imports')
    }
    const [server] = await eslint.lintText(code, { filePath: `${ROOT}apps/server/src/x.ts` })
    expect(server?.messages.filter((m) => m.ruleId === 'no-restricted-imports')).toEqual([])
  }, 30_000)
})
