// @handyhub/i18n: ICU message catalogs (RULE-LANGUAGES, HH-LANG-02, HH-LANG-03; TSK-0008).
//
// - Customer-facing output (public site, portal, documents, messages) has one catalog, `customer.en`. It is always
//   rendered in English, chosen explicitly by the audience, never from the sender's interface or browser locale.
// - Staff screens have `staff.en` and `staff.es` with full key and placeholder parity (checked by `checkCatalogs`).
// - Records store canonical codes; labels are resolved at render time and never written back.
import { IntlMessageFormat } from 'intl-messageformat'
import customerEn from './catalogs/customer.en.json' with { type: 'json' }
import staffEn from './catalogs/staff.en.json' with { type: 'json' }
import staffEs from './catalogs/staff.es.json' with { type: 'json' }
import { labelKey, type LabelCode, type LabelFamily } from './labels.js'
import { releasedSpanish } from './spanish-review.js'

export const PACKAGE_NAME = '@handyhub/i18n'

export { LABEL_FAMILIES, labelFamilyKeys, labelKey, type LabelCode, type LabelFamily } from './labels.js'
export {
  checkCatalogs,
  placeholderSignature,
  scanSource,
  type CatalogProblem,
  type CheckInput,
  type SourceScan,
} from './checker.js'
export { GLOSSARY, glossaryProblems, type GlossaryProblem, type GlossaryTerm } from './glossary.js'
export {
  RELEASED_SPANISH_SAFETY,
  releasedSpanish,
  SAME_IN_SPANISH,
  STAFF_ES_SAFETY,
  untranslatedKeys,
  type SpanishSafetyRecord,
  type SpanishSafetyStatus,
} from './spanish-review.js'

/** Staff interface locales. Customer output has no locale choice: it is English. */
export const STAFF_LOCALES = ['en', 'es'] as const
export type StaffLocale = (typeof STAFF_LOCALES)[number]
export const CUSTOMER_LOCALE = 'en' as const
export type Locale = StaffLocale | typeof CUSTOMER_LOCALE

export type Catalog = Readonly<Record<string, string>>
export type CustomerKey = keyof typeof customerEn
export type StaffKey = keyof typeof staffEn
export type MessageValues = Readonly<Record<string, string | number | boolean | Date>>

/**
 * The catalogs by name, for the checker. There is deliberately no `customer.es` (RULE-LANGUAGES, OWN-DEC-45). The
 * translators reference their catalogs directly, so a customer bundle that never imports this leaves staff text out.
 */
export const CATALOGS = {
  'customer.en': customerEn,
  'staff.en': staffEn,
  'staff.es': staffEs satisfies Record<StaffKey, string>,
} as const satisfies Record<string, Catalog>
export type CatalogName = keyof typeof CATALOGS

/** Catalog pairs that must have the same keys and placeholders. */
export const PARITY_PAIRS: readonly (readonly [CatalogName, CatalogName])[] = [['staff.en', 'staff.es']]

/** ICU locale used for number, date and plural rules. ASSUMPTION: US formatting for the Kentuckiana business. */
const INTL_LOCALE: Record<Locale, string> = { en: 'en-US', es: 'es-US' }

export class MissingMessageError extends Error {
  constructor(
    readonly catalog: string,
    readonly key: string,
  ) {
    super(`Message "${key}" is missing from catalog "${catalog}".`)
    this.name = 'MissingMessageError'
  }
}

export interface Translator<K extends string = string> {
  readonly audience: 'customer' | 'staff'
  readonly locale: Locale
  readonly catalog: string
  /** Formats one ICU message. Throws on an unknown key or a missing placeholder value. */
  t(key: K, values?: MessageValues): string
}

/** Builds a translator over any catalog; the customer and staff translators below are the ones apps use. */
export function createTranslator<K extends string>(
  audience: 'customer' | 'staff',
  locale: Locale,
  catalogName: string,
  catalog: Catalog,
): Translator<K> {
  const compiled = new Map<string, IntlMessageFormat>()
  return {
    audience,
    locale,
    catalog: catalogName,
    t(key, values) {
      let format = compiled.get(key)
      if (!format) {
        const message = Object.hasOwn(catalog, key) ? catalog[key] : undefined
        if (message === undefined) throw new MissingMessageError(catalogName, key)
        format = new IntlMessageFormat(message, INTL_LOCALE[locale])
        compiled.set(key, format)
      }
      return String(format.format(values))
    },
  }
}

let customer: Translator<CustomerKey> | undefined
const staff = new Map<StaffLocale, Translator<StaffKey>>()

/** The customer translator: always English. It takes no locale, so a staff or browser locale cannot reach it. */
export function customerTranslator(): Translator<CustomerKey> {
  customer ??= createTranslator<CustomerKey>('customer', CUSTOMER_LOCALE, 'customer.en', customerEn)
  return customer
}

/**
 * The staff translator for a staff member's stored interface locale. In Spanish, a safety message whose Spanish is not
 * released (TSK-0102, HH-LANG-04: no current passing comparison) shows its approved English instead.
 */
export function staffTranslator(locale: StaffLocale): Translator<StaffKey> {
  if (!isStaffLocale(locale)) throw new RangeError(`Unsupported staff locale "${String(locale)}".`)
  let tr = staff.get(locale)
  if (!tr) {
    const catalog = locale === 'es' ? releasedSpanish(staffEn, staffEs) : staffEn
    tr = createTranslator<StaffKey>('staff', locale, `staff.${locale}`, catalog)
    staff.set(locale, tr)
  }
  return tr
}

export function isStaffLocale(value: unknown): value is StaffLocale {
  return typeof value === 'string' && (STAFF_LOCALES as readonly string[]).includes(value)
}

/** A stored staff locale, or English when none is stored or the value is not supported. */
export function resolveStaffLocale(stored: string | null | undefined): StaffLocale {
  return isStaffLocale(stored) ? stored : 'en'
}

/** Who will read a rendered text. The audience alone decides the language (HH-LANG-03). */
export type Audience = { readonly kind: 'customer' } | { readonly kind: 'staff'; readonly locale: StaffLocale }

/** The language for an audience. A customer always gets English, whatever the sender's interface locale. */
export function audienceLocale(audience: Audience): Locale {
  return audience.kind === 'customer' ? CUSTOMER_LOCALE : audience.locale
}

/**
 * The staff label for a stored canonical code. The code is read, never changed; an unknown code throws instead of
 * showing a guessed label.
 */
export function staffLabel<F extends LabelFamily>(locale: StaffLocale, family: F, code: LabelCode<F>): string {
  return staffTranslator(locale).t(labelKey(family, code) as StaffKey)
}
