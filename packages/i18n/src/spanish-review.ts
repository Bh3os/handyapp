// Spanish staff catalog review (HH-LANG-02, HH-LANG-04, OWN-DEC-79; TSK-0102). The Spanish staff messages are AI
// translations made during development; the product has no runtime AI (OWN-DEC-74).
//
// - Safety messages (Stop Work, hazards, escalation, Call 911...) are released only after the separate comparison of
//   tools/compare-staff-safety-es.mjs, whose record is staff-es-safety.json: "ai_reviewed" (shown as AI-reviewed, never
//   human-reviewed) or "owner_wording" (the owner's own Spanish, OWN-DEC-172 item 6). Any other safety message is not
//   released: the Spanish staff translator shows its approved English instead. The repository test fails while a
//   record is missing or stale, so an unreviewed safety message cannot be merged.
// - Every other Spanish message must differ from its English unless all its words read the same in Spanish
//   (`untranslatedKeys`): a message left in English fails the repository test.
import review from './staff-es-safety.json' with { type: 'json' }

export type SpanishSafetyStatus = 'ai_reviewed' | 'owner_wording' | 'pending'

export interface SpanishSafetyRecord {
  readonly status: SpanishSafetyStatus
  /** First 16 hex characters of the SHA-256 of the English message compared, and of the Spanish message. */
  readonly en: string
  readonly es: string
  readonly tool: string
  readonly checkedOn: string
  readonly source?: string
  readonly results?: Readonly<Record<string, 'pass' | 'fail'>>
  readonly problems: readonly { readonly category: string; readonly detail: string }[]
}

/** The release record of each Spanish safety message, by key. */
export const STAFF_ES_SAFETY = review.keys as unknown as Readonly<Record<string, SpanishSafetyRecord>>

/** Statuses under which a Spanish safety message is shown. */
export const RELEASED_SPANISH_SAFETY: readonly SpanishSafetyStatus[] = ['ai_reviewed', 'owner_wording']

/**
 * The Spanish catalog as staff read it: every safety message whose Spanish is not released is replaced by its approved
 * English (the placeholders are the same, so it renders with the same values).
 */
export function releasedSpanish(
  en: Readonly<Record<string, string>>,
  es: Readonly<Record<string, string>>,
  safety: Readonly<Record<string, SpanishSafetyRecord>> = STAFF_ES_SAFETY,
): Record<string, string> {
  const out: Record<string, string> = { ...es }
  for (const [key, record] of Object.entries(safety)) {
    const english = en[key]
    if (english !== undefined && !RELEASED_SPANISH_SAFETY.includes(record.status)) out[key] = english
  }
  return out
}

/**
 * Words that read the same in Spanish: names, abbreviations, units and Spanish words spelled like the English. A
 * Spanish message identical to its English is accepted only when every word it shows is one of these. "English" is
 * the language picker's own name for English (each language is named in itself).
 */
export const SAME_IN_SPANISH = new Set([
  'App',
  'Cash',
  'Chime',
  'English',
  'Error',
  'Español',
  'Flexible',
  'HandyHub',
  'KB',
  'Legal',
  'No',
  'PDF',
  'Provisional',
  'Roles',
  'SHA',
  'Square',
  'Subtotal',
  'Total',
  'UTC',
  'Zelle',
  'bytes',
  'h',
  'min',
  'no',
])

/** The words a message shows, outside its ICU arguments. */
function shownWords(message: string): string[] {
  return message.replace(/\{\s*\w+\s*(?:,[^{}]*(?:\{[^{}]*\}[^{}]*)*)?\}/g, ' ').match(/\p{L}+/gu) ?? []
}

/** Keys whose Spanish message is the English one, unless every word it shows reads the same in Spanish. */
export function untranslatedKeys(
  en: Readonly<Record<string, string>>,
  es: Readonly<Record<string, string>>,
  same: ReadonlySet<string> = SAME_IN_SPANISH,
): string[] {
  return Object.keys(en).filter((key) => es[key] === en[key] && !shownWords(en[key] ?? '').every((w) => same.has(w)))
}
