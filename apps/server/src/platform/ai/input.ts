// What a model would be given, and how (TSK-0116; HH-AUTO-04, OWN-DEC-15, RULE-AI-WAVE2). Nothing calls a model: this
// prepares and checks the envelope so the guardrails are tested while AI stays disabled.
// - Data minimisation: only the use's declared inputs are kept; every other field is dropped and named (names only).
//   An input that may never reach a model (registry.ts isForbiddenInput) is dropped even if a use declared it.
// - Redaction: free text is scrubbed of card numbers, phone numbers, email addresses, street addresses and anything
//   written after a code, PIN or password word, in English or Spanish (worker notes are Spanish, OWN-DEC-211), before
//   it could leave the server (PROPOSED patterns, OQ-AI-GUARDRAILS-DETAILS). TSK-0109 (docs/security/review-2026.md
//   AI-2, AI-3): a code a few words after its word ("the code to the gate is 4821", "el código de la puerta es 4821")
//   and street addresses written in free text were kept before.
// - Untrusted input: every input is data, labelled with its provenance, and never joins the instructions. The
//   instructions are the use's fixed text only (NOT CONFIGURED until TSK-0117), so customer text cannot become one.
import { aiUse, type AiNotConfigured, type AiProvenance, isForbiddenInput } from './registry.js'

export const AI_REDACTED = '[REDACTED]'

/** A field's value: text, a number, or a list of texts. Objects are not accepted: inputs are named, flat fields. */
export type AiInputValue = string | number | readonly string[]

export type AiDataItem = {
  readonly field: string
  readonly provenance: AiProvenance
  /** Customer text is untrusted evidence, never instructions (OWN-DEC-15). */
  readonly untrusted: boolean
  readonly value: string | number | readonly string[]
}

export type AiEnvelope = {
  readonly use: string
  /** The use's fixed instructions; never built from the data. */
  readonly instructions: string | AiNotConfigured
  readonly data: readonly AiDataItem[]
  /** The field names minimisation dropped (names only; their values are never kept). */
  readonly dropped: readonly string[]
  /** How many pieces of text redaction replaced. */
  readonly redactions: number
}

// The words a written code or password follows, in English and Spanish (accents optional).
const SECRET_WORDS = [
  'code',
  'pin',
  'passcode',
  'password',
  'lockbox',
  'combo',
  'combination',
  'c[oó]digo',
  'clave',
  'contrase[nñ]a',
  'combinaci[oó]n',
  'candado',
].join('|')

// Order matters: card numbers before phone numbers, so a 16-digit number is not read as a phone number.
const PATTERNS: readonly RegExp[] = [
  // Card-like numbers: 13 to 19 digits, optionally grouped by spaces or dashes.
  /\b\d(?:[ -]?\d){12,18}\b/g,
  // North American phone numbers, with or without +1, brackets, dots, dashes or spaces.
  /(?:\+?1[ .-]?)?\(?\b\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b/g,
  // Email addresses.
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  // Street addresses: a house number, one to four capitalised words and a street type ("4821 Old Henry Rd").
  /\b\d{1,6}\s+(?:[A-Z][A-Za-z0-9.'-]*\s+){1,4}(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Boulevard|Ct|Court|Way|Pl|Place|Cir|Circle|Pkwy|Parkway|Ter|Terrace|Trl|Trail|Hwy|Highway|Pike)\b\.?/g,
  // A value with a digit written in the same clause after a code, PIN or password word, in English or Spanish:
  // "the code to the gate is 4821", "el código de la puerta es 4821", "clave del candado 1234".
  new RegExp(`\\b(?:${SECRET_WORDS})(?![\\wÀ-ÿ])[^\\n.,;]{0,40}?\\d[^\\s,.;]*`, 'gi'),
  // Otherwise the word after it: "gate code 4821", "lockbox: 1234", "password is hunter2", "contraseña: perro".
  new RegExp(`\\b(?:${SECRET_WORDS})(?![\\wÀ-ÿ])(?:\\s*(?:is|es|:|=|#))?\\s*[^\\s,.;]+`, 'gi'),
]

/** Free text with card numbers, phone numbers, emails, street addresses and written codes replaced, with the count. */
export function redactText(text: string): { readonly text: string; readonly redactions: number } {
  let redactions = 0
  let out = text
  for (const pattern of PATTERNS) {
    out = out.replace(pattern, () => {
      redactions += 1
      return AI_REDACTED
    })
  }
  return { text: out, redactions }
}

export class AiInputError extends Error {
  override name = 'AiInputError'
}

/**
 * The envelope for `useId` from `inputs`: declared, permitted fields only, every text redacted, all of it data. An
 * unknown use is refused. This never sends anything anywhere.
 */
export function prepareEnvelope(useId: string, inputs: Readonly<Record<string, AiInputValue>>): AiEnvelope {
  const use = aiUse(useId)
  if (!use) throw new AiInputError(`unknown AI use ${useId}`)
  const data: AiDataItem[] = []
  const dropped: string[] = []
  let redactions = 0
  const scrub = (text: string): string => {
    const r = redactText(text)
    redactions += r.redactions
    return r.text
  }
  for (const [field, value] of Object.entries(inputs)) {
    const provenance = Object.hasOwn(use.inputs, field) ? use.inputs[field] : undefined
    if (provenance === undefined || isForbiddenInput(field)) {
      dropped.push(field)
      continue
    }
    let clean: AiDataItem['value']
    if (typeof value === 'string') clean = scrub(value)
    else if (typeof value === 'number' && Number.isFinite(value)) clean = value
    else if (Array.isArray(value) && value.every((v) => typeof v === 'string')) clean = value.map(scrub)
    else {
      dropped.push(field)
      continue
    }
    data.push(Object.freeze({ field, provenance, untrusted: provenance === 'customer', value: clean }))
  }
  return Object.freeze({ use: use.id, instructions: use.instructions, data, dropped, redactions })
}
