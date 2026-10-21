// Unfinished request drafts in the same browser (TSK-0026; HH-INT-08, FACT-SESSION-TIMINGS, OWN-DEC-93).
// - Kept for the configured period (session.timings.requestDraftDays, read from the API); while that value is not
//   known nothing is stored at all, so no retention period is ever guessed.
// - Only the form's own text and choices are stored: never passwords, codes, payment details or access secrets, and
//   never the spam-control fields. Expired drafts are removed when read; a successful send clears the draft.
// - The key carries the identity (guest now; an account later), so switching identity never shows another person's
//   draft.
import { EMPTY_VALUES, STEPS, type FormValues, type StepId } from './form.js'

export const DRAFT_VERSION = 1
const PREFIX = 'hh.request-draft'

export type Draft = {
  version: typeof DRAFT_VERSION
  values: FormValues
  step: StepId
  savedAt: number
  expiresAt: number
}

export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Field names that may never be written to browser storage, whatever a later step adds. */
const NEVER_STORED = /password|code|token|secret|card|cvv|cvc|iban|account_?number/i
/**
 * PROPOSED (TSK-0029): the SMS opt-in and the marketing permission are not kept in the draft. A consent is given with
 * its disclosure in view when the request is sent, so a resumed draft always shows both boxes unchecked.
 */
const CONSENTS: ReadonlySet<string> = new Set(['smsOptIn', 'marketingOptIn'])

export function draftKey(identity: string): string {
  return `${PREFIX}.v${DRAFT_VERSION}:${identity}`
}

function sanitize(values: FormValues): FormValues {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(values))
    if (!NEVER_STORED.test(k) && !CONSENTS.has(k) && k in EMPTY_VALUES) out[k] = v
  return { ...EMPTY_VALUES, ...(out as Partial<FormValues>) }
}

export class DraftStore {
  constructor(
    private readonly storage: DraftStorage | null,
    private readonly identity: string,
    private readonly draftDays: number | null,
  ) {}

  get enabled(): boolean {
    return this.storage !== null && this.draftDays !== null && this.draftDays > 0
  }

  save(values: FormValues, step: StepId, now = Date.now()): void {
    if (!this.enabled || !this.storage) return
    const draft: Draft = {
      version: DRAFT_VERSION,
      values: sanitize(values),
      step,
      savedAt: now,
      expiresAt: now + (this.draftDays as number) * 86_400_000,
    }
    try {
      this.storage.setItem(draftKey(this.identity), JSON.stringify(draft))
    } catch {
      // Storage full or blocked: the form keeps working; only the draft is not kept.
    }
  }

  load(now = Date.now()): Draft | null {
    if (!this.storage) return null
    let raw: string | null
    try {
      raw = this.storage.getItem(draftKey(this.identity))
    } catch {
      return null
    }
    if (!raw) return null
    try {
      const d = JSON.parse(raw) as Partial<Draft>
      if (d.version !== DRAFT_VERSION || typeof d.expiresAt !== 'number' || d.expiresAt <= now) {
        this.clear()
        return null
      }
      const step = STEPS.includes(d.step as StepId) ? (d.step as StepId) : 'services'
      return {
        version: DRAFT_VERSION,
        values: sanitize(d.values ?? EMPTY_VALUES),
        step,
        savedAt: d.savedAt ?? now,
        expiresAt: d.expiresAt,
      }
    } catch {
      this.clear()
      return null
    }
  }

  clear(): void {
    try {
      this.storage?.removeItem(draftKey(this.identity))
    } catch {
      // Nothing to clear.
    }
  }
}
