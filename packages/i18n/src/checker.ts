// Catalog checker (HH-LANG-02; TSK-0008). Pure functions; test/repository.test.ts runs them over the real catalogs and
// the repository's source in CI, so a problem fails the `test` check.
//
// Problems it reports:
// - syntax:      a message that is not valid ICU MessageFormat;
// - missing:     a key the code asks for (a `t('...')` call or a declared label family) that a catalog lacks;
// - unused:      a catalog key that no source file names and no label family declares;
// - parity:      a key present in one catalog of a parity pair (staff.en, staff.es) and absent from the other;
// - placeholder: a key whose placeholders (names, argument types, select options, exact plural selectors, tags)
//                differ between the two catalogs of a pair.
import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser'

export type ProblemKind = 'syntax' | 'missing' | 'unused' | 'parity' | 'placeholder'

export interface CatalogProblem {
  readonly kind: ProblemKind
  readonly catalog: string
  readonly key: string
  readonly detail: string
}

export interface CheckInput {
  /** Catalogs by name, e.g. `staff.es`. */
  readonly catalogs: Readonly<Record<string, Readonly<Record<string, string>>>>
  /** Pairs of catalog names that must have identical keys and placeholders. */
  readonly parity: readonly (readonly [string, string])[]
  /** Keys the code requires, with the catalogs that must hold each one (by name prefix, e.g. `staff.`). */
  readonly required: readonly { readonly key: string; readonly catalogs: readonly string[] }[]
  /** Every string literal found in the source; a catalog key not among them (or `required`) is unused. */
  readonly literals: ReadonlySet<string>
}

/**
 * The placeholder signature of one ICU message: a sorted list such as `count:plural{=0}`, `kind:select{a,b,other}`,
 * `name:argument` or `<b>`. Plural categories (one, many, other) are language-specific and are not compared; exact
 * selectors such as `=0` are.
 */
export function placeholderSignature(message: string): string[] {
  const out = new Set<string>()
  const walk = (elements: MessageFormatElement[]): void => {
    for (const el of elements) {
      switch (el.type) {
        case TYPE.argument:
          out.add(`${el.value}:argument`)
          break
        case TYPE.number:
          out.add(`${el.value}:number`)
          break
        case TYPE.date:
          out.add(`${el.value}:date`)
          break
        case TYPE.time:
          out.add(`${el.value}:time`)
          break
        case TYPE.select:
          out.add(`${el.value}:select{${Object.keys(el.options).sort().join(',')}}`)
          for (const option of Object.values(el.options)) walk(option.value)
          break
        case TYPE.plural: {
          const exact = Object.keys(el.options)
            .filter((k) => k.startsWith('='))
            .sort()
          out.add(`${el.value}:${el.pluralType === 'ordinal' ? 'selectordinal' : 'plural'}{${exact.join(',')}}`)
          for (const option of Object.values(el.options)) walk(option.value)
          break
        }
        case TYPE.tag:
          out.add(`<${el.value}>`)
          walk(el.children)
          break
        default:
          break
      }
    }
  }
  walk(parse(message))
  return [...out].sort()
}

export function checkCatalogs(input: CheckInput): CatalogProblem[] {
  const problems: CatalogProblem[] = []
  const signatures = new Map<string, Map<string, string[]>>()

  for (const [name, catalog] of Object.entries(input.catalogs)) {
    const sigs = new Map<string, string[]>()
    signatures.set(name, sigs)
    for (const [key, message] of Object.entries(catalog)) {
      try {
        sigs.set(key, placeholderSignature(message))
      } catch (error) {
        problems.push({ kind: 'syntax', catalog: name, key, detail: `not valid ICU: ${(error as Error).message}` })
      }
    }
  }

  for (const { key, catalogs } of input.required) {
    for (const name of catalogs) {
      const catalog = input.catalogs[name]
      if (!catalog || !Object.hasOwn(catalog, key)) {
        problems.push({
          kind: 'missing',
          catalog: name,
          key,
          detail: 'the code uses this key but the catalog lacks it',
        })
      }
    }
  }

  const required = new Set(input.required.map((r) => r.key))
  for (const [name, catalog] of Object.entries(input.catalogs)) {
    for (const key of Object.keys(catalog)) {
      if (!input.literals.has(key) && !required.has(key)) {
        problems.push({ kind: 'unused', catalog: name, key, detail: 'no source file uses this key' })
      }
    }
  }

  for (const [a, b] of input.parity) {
    const ca = input.catalogs[a] ?? {}
    const cb = input.catalogs[b] ?? {}
    for (const [from, to, cFrom, cTo] of [
      [a, b, ca, cb],
      [b, a, cb, ca],
    ] as const) {
      for (const key of Object.keys(cFrom)) {
        if (!Object.hasOwn(cTo, key)) {
          problems.push({ kind: 'parity', catalog: to, key, detail: `present in ${from}, missing from ${to}` })
        }
      }
    }
    for (const key of Object.keys(ca)) {
      const sa = signatures.get(a)?.get(key)
      const sb = signatures.get(b)?.get(key)
      if (!sa || !sb) continue
      if (sa.join('|') !== sb.join('|')) {
        problems.push({
          kind: 'placeholder',
          catalog: b,
          key,
          detail: `${a} has [${sa.join(', ')}] but ${b} has [${sb.join(', ')}]`,
        })
      }
    }
  }

  return problems
}

export interface SourceScan {
  /** Every quoted dotted literal, such as `'app.title'`. */
  readonly literals: Set<string>
  /** Keys passed directly to a translator: `t('app.title')` or `tr.t("app.title", ...)`. */
  readonly translated: Set<string>
}

const LITERAL = /(['"`])([A-Za-z][\w-]*(?:\.[\w-]+)+)\1/g
const T_CALL = /\bt\(\s*(['"`])([A-Za-z][\w-]*(?:\.[\w-]+)+)\1/g

/** Finds key-like literals and translator calls in one source file (TypeScript, TSX, Astro or JavaScript). */
export function scanSource(text: string): SourceScan {
  return {
    literals: new Set([...text.matchAll(LITERAL)].map((m) => m[2] as string)),
    translated: new Set([...text.matchAll(T_CALL)].map((m) => m[2] as string)),
  }
}
