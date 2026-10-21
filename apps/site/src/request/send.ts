// "Send Estimate Request" and its outcome (TSK-0030; HH-INT-10, HH-INT-12, T11).
// - The exact body of a send whose outcome is not known (a lost answer, a timeout, a closed connection) is kept for this
//   tab in sessionStorage under its idempotency key, never in the 7-day draft: it holds the two consents and the photo
//   draft capability, which the draft never keeps (draft.ts). A send after a reload and Resume posts it unchanged, so
//   the server returns the request it may already have saved with the same reference instead of a conflict.
// - Every answer is classified once (sendOutcome): a conflict on a key that already created a request names that
//   request's reference, so the customer gets their reference back and is never told to start a second request.
import type { DraftStorage } from './draft.js'

const PREFIX = 'hh.request-send:'

export function sendKey(idempotencyKey: string): string {
  return `${PREFIX}${idempotencyKey}`
}

/** The body of this tab's latest send per idempotency key, kept only while its outcome is not known. */
export class SendStore {
  constructor(private readonly storage: DraftStorage | null) {}

  save(idempotencyKey: string, body: string): void {
    try {
      this.storage?.setItem(sendKey(idempotencyKey), body)
    } catch {
      // Storage full or blocked: a retry on this page still sends the same body; only a reload loses it.
    }
  }

  load(idempotencyKey: string): string | null {
    try {
      return this.storage?.getItem(sendKey(idempotencyKey)) ?? null
    } catch {
      return null
    }
  }

  clear(idempotencyKey: string): void {
    try {
      this.storage?.removeItem(sendKey(idempotencyKey))
    } catch {
      // Nothing to clear.
    }
  }
}

/** What a resumed send gives back to the form, so the review shows what the kept body sends. */
export type ResumedSend = { smsOptIn: boolean; marketingOptIn: boolean; photoDraft: string | null }

/** The consents and the photo draft of a kept body; null when it is not a body the wizard wrote. */
export function resumedFrom(body: string): ResumedSend | null {
  try {
    const b = JSON.parse(body) as Record<string, unknown> | null
    if (!b || typeof b !== 'object' || Array.isArray(b) || typeof b['formVersion'] !== 'string') return null
    return {
      smsOptIn: b['smsOptIn'] === true,
      marketingOptIn: b['marketingOptIn'] === true,
      photoDraft: typeof b['photoDraft'] === 'string' ? b['photoDraft'] : null,
    }
  } catch {
    return null
  }
}

export type PhotoSummary = { received: number; processing: number; failed: number }
type FieldProblem = { field: string; code: string }
/** The JSON of an answer, as far as the wizard reads it; null when it could not be read. */
export type SendData = {
  reference?: unknown
  /** When the server saved the request (TSK-0032: the time the photo counts were taken). */
  submittedAt?: unknown
  photos?: PhotoSummary
  error?: { code?: string; message?: string; fieldErrors?: FieldProblem[]; existing?: { reference?: unknown } }
} | null
/** The answer to a send: its status and parsed JSON, or 'network' when no answer arrived. */
export type SendReply = { status: number; data: SendData } | 'network'

export type SendOutcome =
  /** Saved (or saved before and returned again): the receipt. */
  | { kind: 'sent'; reference: string; photos: PhotoSummary | null }
  /** The key already created a request, sent with other details: that request's receipt, changes not included. */
  | { kind: 'already'; reference: string }
  /** The server refused fields: nothing was saved for this body. */
  | { kind: 'fields'; fieldErrors: FieldProblem[] }
  /** No readable answer: the request may have been saved. The same body again settles it. */
  | { kind: 'uncertain' }
  /** A conflict that names no request: an earlier send under this key may have arrived. Sending again checks. */
  | { kind: 'conflict' }
  /** Any other answer from the server: nothing was saved for this body. */
  | { kind: 'refused'; message: string | null }

export function sendOutcome(reply: SendReply): SendOutcome {
  if (reply === 'network') return { kind: 'uncertain' }
  const { status, data } = reply
  const error = data?.error
  if (status === 201) {
    // Saved, but the answer was cut short: the same key and body return it.
    if (typeof data?.reference !== 'string') return { kind: 'uncertain' }
    return { kind: 'sent', reference: data.reference, photos: data.photos ?? null }
  }
  if (error?.code === 'IDEMPOTENCY_CONFLICT') {
    const reference = error.existing?.reference
    return typeof reference === 'string' ? { kind: 'already', reference } : { kind: 'conflict' }
  }
  if (error?.code === 'VALIDATION_FAILED' && error.fieldErrors?.length)
    return { kind: 'fields', fieldErrors: error.fieldErrors }
  // A failure without the API's own answer (a gateway timing out in front of it) says nothing about the request.
  if (!error?.code && status >= 500) return { kind: 'uncertain' }
  return { kind: 'refused', message: error?.message ?? null }
}

/** Whether the body sent is kept for this tab: only while the outcome of the send is not known. */
export function keepsBody(outcome: SendOutcome): boolean {
  return outcome.kind === 'uncertain' || outcome.kind === 'conflict'
}
