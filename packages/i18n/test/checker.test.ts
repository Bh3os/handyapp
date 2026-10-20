// Catalog checker unit tests (HH-LANG-02; TSK-0008). Fixture catalogs are synthetic.
import { describe, expect, it } from 'vitest'
import { checkCatalogs, placeholderSignature, scanSource, type CheckInput } from '../src/index.js'

const base = (catalogs: CheckInput['catalogs'], over: Partial<CheckInput> = {}): CheckInput => ({
  catalogs,
  parity: [['staff.en', 'staff.es']],
  required: [],
  literals: new Set(Object.values(catalogs).flatMap((c) => Object.keys(c))),
  ...over,
})

describe('catalog checker (TSK-0008, HH-LANG-02)', () => {
  it('[HH-LANG-02] a placeholder mismatch between staff.en and staff.es fails the checker', () => {
    const problems = checkCatalogs(
      base({
        'staff.en': { 'job.assigned': 'Assigned to {worker} on {day}.' },
        'staff.es': { 'job.assigned': 'Asignado a {trabajador} el {day}.' },
      }),
    )
    expect(problems).toEqual([
      {
        kind: 'placeholder',
        catalog: 'staff.es',
        key: 'job.assigned',
        detail: 'staff.en has [day:argument, worker:argument] but staff.es has [day:argument, trabajador:argument]',
      },
    ])
  })

  it('[HH-LANG-02] a changed argument type, select option, exact plural selector or tag is a mismatch', () => {
    const en = {
      a: '{n, number} items',
      b: '{kind, select, hold {On hold} other {Ready}}',
      c: '{count, plural, =0 {No visits} one {# visit} other {# visits}}',
      d: 'Read <b>this</b> first.',
    }
    const es = {
      a: '{n} artículos',
      b: '{kind, select, espera {En espera} other {Listo}}',
      c: '{count, plural, one {# visita} other {# visitas}}',
      d: 'Lea esto primero.',
    }
    const problems = checkCatalogs(base({ 'staff.en': en, 'staff.es': es }))
    expect(problems.map((p) => [p.kind, p.key])).toEqual([
      ['placeholder', 'a'],
      ['placeholder', 'b'],
      ['placeholder', 'c'],
      ['placeholder', 'd'],
    ])
  })

  it('[HH-LANG-02] plural categories may differ by language; the same placeholders pass', () => {
    const problems = checkCatalogs(
      base({
        'staff.en': { v: '{count, plural, one {# visit} other {# visits}} for {name}' },
        'staff.es': { v: '{count, plural, one {# visita} many {# visitas} other {# visitas}} para {name}' },
      }),
    )
    expect(problems).toEqual([])
  })

  it('[HH-LANG-02] a key in one staff language only fails parity', () => {
    const problems = checkCatalogs(base({ 'staff.en': { a: 'A', b: 'B' }, 'staff.es': { a: 'A', c: 'C' } }))
    expect(problems.map((p) => [p.kind, p.catalog, p.key])).toEqual([
      ['parity', 'staff.es', 'b'],
      ['parity', 'staff.en', 'c'],
    ])
  })

  it('[HH-LANG-02] reports missing keys, unused keys and invalid ICU', () => {
    const catalogs = { 'customer.en': { used: 'Used', stale: 'Stale', broken: 'Hello {name' } }
    const problems = checkCatalogs({
      catalogs,
      parity: [],
      required: [{ key: 'absent', catalogs: ['customer.en'] }],
      literals: new Set(['used', 'broken']),
    })
    expect(problems.map((p) => [p.kind, p.key])).toEqual([
      ['syntax', 'broken'],
      ['missing', 'absent'],
      ['unused', 'stale'],
    ])
  })

  it('builds a sorted placeholder signature including nested arguments', () => {
    expect(placeholderSignature('{who} has {count, plural, one {# hold on {job}} other {# holds}}')).toEqual([
      'count:plural{}',
      'job:argument',
      'who:argument',
    ])
  })

  it('finds key literals and translator calls in source', () => {
    const scan = scanSource(`const a = tr.t('app.title'); t("portal.title", { x }); const b = 'not a key'; get('x.y')`)
    expect([...scan.translated].sort()).toEqual(['app.title', 'portal.title'])
    expect([...scan.literals].sort()).toEqual(['app.title', 'portal.title', 'x.y'])
  })
})
