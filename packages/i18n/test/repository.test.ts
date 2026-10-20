// CI catalog check (HH-LANG-02, RULE-LANGUAGES; TSK-0008): runs the checker over the real catalogs and every app and
// package source file. Any problem (syntax, missing, unused, parity or placeholder) fails the `test` check.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CATALOGS, checkCatalogs, LABEL_FAMILIES, labelFamilyKeys, PARITY_PAIRS, scanSource } from '../src/index.js'

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
