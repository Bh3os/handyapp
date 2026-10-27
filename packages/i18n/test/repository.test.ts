// CI catalog check (HH-LANG-02, RULE-LANGUAGES; TSK-0008): runs the checker over the real catalogs and every app and
// package source file. Any problem (syntax, missing, unused, parity or placeholder) fails the `test` check.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CATALOGS,
  checkCatalogs,
  glossaryProblems,
  LABEL_FAMILIES,
  labelFamilyKeys,
  PARITY_PAIRS,
  RELEASED_SPANISH_SAFETY,
  scanSource,
  STAFF_ES_SAFETY,
  staffTranslator,
  untranslatedKeys,
  type StaffKey,
} from '../src/index.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const SOURCE = /\.(ts|tsx|astro|js|mjs)$/
// The i18n package's own source names catalogs and examples, not keys; its label families are added explicitly.
const SELF = join(ROOT, 'packages', 'i18n', 'src')

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir) || dir === SELF) return []
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) return name === 'node_modules' || name === 'dist' ? [] : sourceFiles(p)
      return SOURCE.test(name) ? [p] : []
    })
}

function repositorySources(): string[] {
  return ['apps', 'packages'].flatMap((group) =>
    readdirSync(join(ROOT, group))
      .sort()
      .flatMap((pkg) => sourceFiles(join(ROOT, group, pkg, 'src'))),
  )
}

describe('repository catalog check (TSK-0008, HH-LANG-02, RULE-LANGUAGES)', () => {
  it('[HH-LANG-02] catalogs have no syntax, missing, unused, parity or placeholder problems', () => {
    const files = repositorySources()
    expect(files.map((f) => relative(ROOT, f))).toContain('apps/staff/src/App.tsx')

    const literals = new Set<string>()
    const translated = new Set<string>()
    for (const file of files) {
      const scan = scanSource(readFileSync(file, 'utf8'))
      scan.literals.forEach((l) => literals.add(l))
      scan.translated.forEach((k) => translated.add(k))
    }

    const has = (name: keyof typeof CATALOGS, key: string) => Object.hasOwn(CATALOGS[name], key)
    const required = [
      ...labelFamilyKeys().map((key) => ({ key, catalogs: ['staff.en', 'staff.es'] })),
      ...[...translated].map((key) => ({
        key,
        catalogs: has('customer.en', key)
          ? ['customer.en']
          : has('staff.en', key)
            ? ['staff.en', 'staff.es']
            : ['customer.en', 'staff.en'],
      })),
    ]

    expect(checkCatalogs({ catalogs: CATALOGS, parity: PARITY_PAIRS, required, literals })).toEqual([])
  })

  it('[HH-SVC-01] service codes and staff labels match the generated service registry seed', () => {
    const seed = JSON.parse(readFileSync(join(ROOT, 'packages', 'db', 'seed', 'services.json'), 'utf8')) as {
      services: { code: string; category: string; staffLabel: { en: string; es: string } }[]
    }
    expect(seed.services.map((s) => s.code)).toEqual([...LABEL_FAMILIES.service])
    for (const s of seed.services) {
      expect(CATALOGS['staff.en'][`enum.service.${s.code}` as keyof (typeof CATALOGS)['staff.en']]).toBe(
        s.staffLabel.en,
      )
      expect(CATALOGS['staff.es'][`enum.service.${s.code}` as keyof (typeof CATALOGS)['staff.es']]).toBe(
        s.staffLabel.es,
      )
      expect(LABEL_FAMILIES.serviceCategory).toContain(s.category)
    }
  })

  it('[RULE-LANGUAGES][T04] there is no Spanish customer catalog', () => {
    expect(Object.keys(CATALOGS).sort()).toEqual(['customer.en', 'staff.en', 'staff.es'])
    const files = readdirSync(join(ROOT, 'packages', 'i18n', 'src', 'catalogs')).sort()
    expect(files).toEqual(['customer.en.json', 'staff.en.json', 'staff.es.json'])
  })
})

describe('Spanish staff catalog review (TSK-0102, HH-LANG-02, HH-LANG-04, OWN-DEC-79, RULE-LANGUAGES)', () => {
  const en = CATALOGS['staff.en'] as Readonly<Record<string, string>>
  const es = CATALOGS['staff.es'] as Readonly<Record<string, string>>
  const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)

  it('[HH-LANG-02] no Spanish staff message is left in English', () => {
    expect(untranslatedKeys(en, es)).toEqual([])
  })

  it('[HH-LANG-02] every staff term uses its one glossary rendering in Spanish', () => {
    expect(glossaryProblems(en, es)).toEqual([])
  })

  it('[HH-LANG-04][T70] every Spanish safety message has a current comparison record (run tools/compare-staff-safety-es.mjs)', () => {
    const stale = Object.entries(STAFF_ES_SAFETY)
      .filter(([key, r]) => en[key] === undefined || sha(en[key]) !== r.en || sha(es[key] ?? '') !== r.es)
      .map(([key]) => key)
    expect(stale).toEqual([])
    // A message that tells a worker to call 911 is a safety message wherever it is.
    const emergency = Object.keys(en).filter((k) => /\b911\b/.test(en[k] ?? ''))
    expect(emergency.length).toBeGreaterThan(5)
    expect(emergency.filter((k) => !Object.hasOwn(STAFF_ES_SAFETY, k))).toEqual([])
    // The core safety families are covered.
    for (const key of ['stop.noPermission', 'escalation.procedure', 'enum.hazardGuidance.never_gas_repair'])
      expect(Object.hasOwn(STAFF_ES_SAFETY, key), key).toBe(true)
  })

  it("[HH-LANG-04][T70] released safety messages are AI-reviewed or the owner's own Spanish, never human-reviewed", () => {
    for (const [key, r] of Object.entries(STAFF_ES_SAFETY)) {
      expect(['ai_reviewed', 'owner_wording', 'pending'], key).toContain(r.status)
      if (r.status === 'ai_reviewed')
        expect(
          Object.values(r.results ?? {}).every((v) => v === 'pass'),
          key,
        ).toBe(true)
      if (r.status === 'owner_wording') expect(r.source, key).toBe('OWN-DEC-172 item 6')
      if (!RELEASED_SPANISH_SAFETY.includes(r.status))
        // Not released: a Spanish reader gets the approved English message.
        expect(staffTranslator('es').t(key as StaffKey, {} as never), key).toBe(en[key])
    }
    expect(Object.values(STAFF_ES_SAFETY).map((r) => r.status)).not.toContainEqual(
      expect.stringMatching(/human|certified/i),
    )
  })

  it('[RULE-LANGUAGES][HH-LANG-01][T04] customer surfaces are English only: no staff text, no Spanish, no switcher', () => {
    const customerApps = ['site', 'portal'].flatMap((app) => sourceFiles(join(ROOT, 'apps', app, 'src')))
    expect(customerApps.length).toBeGreaterThan(10)
    for (const file of customerApps) {
      const text = readFileSync(file, 'utf8')
      const where = relative(ROOT, file)
      expect(text, where).not.toMatch(/staffTranslator|staffLabel|staff\.(?:en|es)\.json|STAFF_LOCALES/)
      for (const m of text.matchAll(/\blang=["'{]?([\w-]+)/g)) expect(m[1], where).toBe('en')
    }
    // The customer catalog holds no Spanish.
    const spanish = Object.entries(CATALOGS['customer.en']).filter(([, v]) =>
      /[ñ¿¡áéíóúÁÉÍÓÚ]|\b(?:usted|presupuesto|cliente)\b/.test(v),
    )
    expect(spanish).toEqual([])
    // Customer documents and messages are rendered with the customer translator only.
    const customerOutput = [
      'modules/estimates/customer-pdf.ts',
      'modules/estimates/receipt.ts',
      'modules/estimates/approval.ts',
      'modules/finance/invoice-pdf.ts',
      'modules/finance/invoices.ts',
      'modules/notifications/values.ts',
      'modules/requests/receipt-email.ts',
    ]
    for (const file of customerOutput) {
      const text = readFileSync(join(ROOT, 'apps', 'server', 'src', file), 'utf8')
      expect(text, file).toMatch(/customerTranslator/)
      expect(text, file).not.toMatch(/staffTranslator|staffLabel/)
    }
  })
})
