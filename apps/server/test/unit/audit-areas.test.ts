// The audit log's areas (TSK-0098; HH-SEC-06, HH-LANG-03): every area an audit action is recorded under has its staff
// label (family auditArea, EN and ES), so the audit screen's area filter and entries name it in words. Areas come from
// the routes' declared audit actions and from the action codes the modules record inside their handlers and jobs.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { LABEL_FAMILIES } from '@handyhub/i18n'
import { describe, expect, it } from 'vitest'
import { MODULES } from '../../src/modules/index.js'

const SRC = join(import.meta.dirname, '../../src')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return path.endsWith('.ts') ? [path] : []
  })
}

/** Action codes written literally as `audit: '<area>.<verb>'` or `action: '<area>.<verb>'` (or as a template). */
function recordedAreas(): Set<string> {
  const areas = new Set<string>()
  const literal = /\b(?:audit|action)\s*:\s*['`]([a-z][a-z0-9_]*)\.[a-z$]/g
  for (const file of sources(SRC))
    for (const m of readFileSync(file, 'utf8').matchAll(literal)) areas.add(m[1] as string)
  return areas
}

describe('audit areas (TSK-0098, HH-SEC-06)', () => {
  const labelled = new Set<string>(LABEL_FAMILIES.auditArea)

  it('[HH-SEC-06][HH-LANG-03] every route’s audit action has a labelled area', () => {
    const missing = MODULES.flatMap((m) => m.routes)
      .map((r) => r.audit)
      .filter((a) => a !== 'none')
      .map((a) => a.split('.', 1)[0] as string)
      .filter((area) => !labelled.has(area))
    expect([...new Set(missing)]).toEqual([])
  })

  it('[HH-SEC-06][HH-LANG-03] every action code the modules record has a labelled area', () => {
    const areas = recordedAreas()
    // The scan finds the modules' actions (a sanity check that it reads the sources at all).
    expect(areas).toContain('staff')
    expect(areas).toContain('deposit')
    expect([...areas].filter((a) => !labelled.has(a)).sort()).toEqual([])
  })
})
