// The receipt of a saved request (TSK-0032; HH-INT-12, HH-INT-07, OWN-DEC-94, RULE-SERVER-AUTHZ, RULE-LANGUAGES).
// Pure functions, shared by the React islands and their unit tests.
// - The receipt is shown only after the server confirmed the save (a 201 with the reference): the wizard builds this
//   record from that response and from what the customer just sent, keeps it in this browser tab (sessionStorage) and
//   moves to /request/received/<ref>. Reloading that page shows the same record; anywhere else (another browser, a
//   guessed or shared reference) the page has no record and says the receipt is not available here. The reference
//   grants nothing and the server answers the page identically for every reference, so the page can neither confirm
//   that a request exists nor show anything about one.
// - "Your project at a glance" is the customer's own submission (services, description, property address, preferred
//   timing, contact details); it never shows existing customer history, an account or earlier projects.
// - "What happens next?" comes from configuration through the same lines as the receipt email (nextStepsLines).
// - The photo counts are written back to the tab's record whenever the page learns new ones (a Retry, a processing
//   photo settling), with the time they were taken. A reload has no upload capability (it is never stored), so it
//   cannot check again: it shows the counts as of that time instead of presenting them as current (T13).
// - A key that had already created a request (TSK-0030: a 409 naming its reference) gets a receipt with that reference
//   and the "already received" sentence only: what that request holds is not known here, so neither the project at a
//   glance nor any photo count is shown for it.
import { customerTranslator, type CustomerKey } from '@handyhub/i18n'
import { nextStepsLines, REFERENCE_PATTERN, type VisitHours } from '@handyhub/domain/request-form'
import type { FormService, FormValues, OfferedWindow } from './form.js'
import { addressLines, CHANNEL_LABEL, dateText, labelOf, windowText } from './review.js'

const t = (key: CustomerKey, values?: Record<string, string | number>) => customerTranslator().t(key, values)

/** Photo outcomes as the server recorded them, plus photos that never reached it (failed). */
export type PhotoCounts = { received: number; processing: number; failed: number }

export const GLANCE = ['services', 'description', 'address', 'timing', 'contact'] as const
export type GlanceEntry = { id: (typeof GLANCE)[number]; label: string; lines: string[] }

/** The facts the "What happens next?" wording is built from (GET /api/v1/public/request-form). */
export type ResponseFacts = { visitHours: VisitHours | null; responseMinutes: number | null }

export type ReceiptRecord = {
  v: 1
  reference: string
  /** When the server saved the request; null when the answer did not say (a key that had already created it). */
  submittedAt: string | null
  /** Empty for a request received earlier under the same key: what it holds is not known here. */
  glance: GlanceEntry[]
  /** Null when the request was sent without photos, or when its photos are not known here. */
  photos: PhotoCounts | null
  /** When the photo counts were taken (ISO time); set whenever `photos` is. */
  photosCheckedAt?: string
  /** The key had already created this request with other details (TSK-0030): changes since were not included. */
  already?: boolean
  facts: ResponseFacts
}

/** One receipt per tab: the latest saved request. PROPOSED key name. */
export const RECEIPT_STORAGE_KEY = 'hh.request-receipt'

/** "Your project at a glance": what the customer sent, section by section; empty sections are left out. */
export function receiptGlance(
  v: FormValues,
  services: readonly FormService[],
  windows: readonly OfferedWindow[],
): GlanceEntry[] {
  const nameOf = (id: string) => services.find((s) => s.id === id)?.name ?? id
  const yes = t('request.review.yes')
  const entries: GlanceEntry[] = [
    {
      id: 'services',
      label: t('request.step.services'),
      lines: [
        ...v.services.map(nameOf),
        ...(v.notSure ? [t('request.services.notSure')] : []),
        v.otherServicesText.trim(),
      ],
    },
    { id: 'description', label: t('request.job.description'), lines: [v.description.trim()] },
    { id: 'address', label: t('request.review.address'), lines: addressLines(v) },
    {
      id: 'timing',
      label: t('request.review.timing'),
      lines: [
        v.flexible ? t('request.timing.flexible') : dateText(v.preferredDate),
        ...v.windows.map((w) => windowText(w, windows)),
        v.needHelpToday ? `${t('request.timing.needHelpToday')} ${yes}` : '',
      ],
    },
    {
      id: 'contact',
      label: t('request.receipt.contact'),
      lines: [
        v.fullName.trim(),
        v.email.trim(),
        v.phone.trim(),
        v.preferredChannel
          ? t('request.receipt.preferredMethod', { method: labelOf(CHANNEL_LABEL, v.preferredChannel) })
          : '',
      ],
    },
  ]
  return entries.map((e) => ({ ...e, lines: e.lines.filter((l) => l !== '') })).filter((e) => e.lines.length > 0)
}

/** What the wizard knows when the server confirms a save, from which the receipt record is built. */
export type SavedSend = {
  reference: string
  /** 'already': the key had already created this request (a 409 naming it); nothing of this send was saved. */
  kind: 'sent' | 'already'
  submittedAt: string | null
  /** The server's counts of the photos it bound to the request; null when none were bound or not known. */
  photos: PhotoCounts | null
  /** Photos that failed in the browser and never reached the server. */
  notStored: number
  glance: GlanceEntry[]
  facts: ResponseFacts
  now: Date
}

/**
 * The receipt record for a confirmed save. Only what is known is recorded: for a request received earlier under the
 * same key there is no glance and no photo count (nothing is invented, HH-INT-12, RULE-NO-INVENTED-FACTS).
 */
export function receiptRecord(saved: SavedSend): ReceiptRecord {
  const base = { v: 1 as const, reference: saved.reference, submittedAt: saved.submittedAt, facts: saved.facts }
  if (saved.kind === 'already') return { ...base, glance: [], photos: null, already: true }
  const photos = saved.photos
    ? { ...saved.photos, failed: saved.photos.failed + saved.notStored }
    : saved.notStored
      ? { received: 0, processing: 0, failed: saved.notStored }
      : null
  return {
    ...base,
    glance: saved.glance,
    photos,
    // The server took its counts when it saved the request.
    ...(photos ? { photosCheckedAt: saved.submittedAt ?? saved.now.toISOString() } : {}),
  }
}

/** The record with the counts this page has just learned, so a reload shows them with the time they were taken. */
export function withPhotoCounts(record: ReceiptRecord, photos: PhotoCounts, checkedAt: string): ReceiptRecord {
  return { ...record, photos, photosCheckedAt: checkedAt }
}

/** The time photo counts were taken, for "as of" wording; '' when it is not a readable time. */
export function checkedAtText(iso: string | undefined, zone?: string): string {
  const at = iso ? new Date(iso) : null
  if (!at || Number.isNaN(at.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(zone ? { timeZone: zone } : {}),
  }).format(at)
}

/** The response sentences of "What happens next?", as one paragraph; only the first while the facts are unknown. */
export function nextStepsText(facts: ResponseFacts): string {
  return nextStepsLines(facts)
    .map((l) => t(l.key as CustomerKey, l.values as Record<string, string | number> | undefined))
    .join(' ')
}

/** The reference of a receipt URL (/request/received/<ref>), or null when it is not a well-formed reference. */
export function referenceFromPath(pathname: string): string | null {
  const m = /^\/request\/received\/([^/]+)\/?$/.exec(pathname)
  if (!m) return null
  let ref: string
  try {
    ref = decodeURIComponent(m[1] ?? '')
  } catch {
    return null
  }
  return REFERENCE_PATTERN.test(ref) ? ref : null
}

const isCount = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0
const isClock = (s: unknown) => typeof s === 'string' && /^\d{2}:\d{2}$/.test(s)

/** Reads a stored record defensively: anything that is not the shape written by saveReceipt is no receipt. */
export function parseReceipt(raw: unknown): ReceiptRecord | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (r['v'] !== 1 || typeof r['reference'] !== 'string' || !REFERENCE_PATTERN.test(r['reference'])) return null
  if (r['submittedAt'] !== null && typeof r['submittedAt'] !== 'string') return null
  if (r['photosCheckedAt'] !== undefined && typeof r['photosCheckedAt'] !== 'string') return null
  if (r['already'] !== undefined && typeof r['already'] !== 'boolean') return null
  const glance = r['glance']
  if (
    !Array.isArray(glance) ||
    !glance.every(
      (e: unknown) =>
        typeof e === 'object' &&
        e !== null &&
        (GLANCE as readonly unknown[]).includes((e as GlanceEntry).id) &&
        typeof (e as GlanceEntry).label === 'string' &&
        Array.isArray((e as GlanceEntry).lines) &&
        (e as GlanceEntry).lines.every((l) => typeof l === 'string'),
    )
  )
    return null
  const photos = r['photos'] as Record<string, unknown> | null
  if (
    photos !== null &&
    !(typeof photos === 'object' && ['received', 'processing', 'failed'].every((k) => isCount(photos[k])))
  )
    return null
  // Counts are always kept with the time they were taken, so a reload never shows them as current.
  if (photos !== null && typeof r['photosCheckedAt'] !== 'string') return null
  const facts = r['facts'] as Record<string, unknown> | null
  if (typeof facts !== 'object' || facts === null) return null
  const hours = facts['visitHours'] as Record<string, unknown> | null
  if (hours !== null && !(typeof hours === 'object' && isClock(hours['open']) && isClock(hours['close']))) return null
  const minutes = facts['responseMinutes']
  if (minutes !== null && !(isCount(minutes) && (minutes as number) > 0)) return null
  return raw as ReceiptRecord
}

/** Keeps the receipt in this tab; a browser without storage simply cannot show it again after a reload. */
export function saveReceipt(storage: Storage | null, record: ReceiptRecord): void {
  try {
    storage?.setItem(RECEIPT_STORAGE_KEY, JSON.stringify(record))
  } catch {
    // Storage full or blocked: the receipt is still shown now.
  }
}

/** The receipt this tab saved for the reference, or null (none, another reference, or unreadable). */
export function loadReceipt(storage: Storage | null, reference: string): ReceiptRecord | null {
  let raw: string | null
  try {
    raw = storage?.getItem(RECEIPT_STORAGE_KEY) ?? null
  } catch {
    return null
  }
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  const record = parseReceipt(parsed)
  return record && record.reference === reference ? record : null
}

/** The counts from the server's list of the request's photos, plus the photos that never reached it. */
export function countsFromServer(photos: readonly { state: string }[], notStored: number): PhotoCounts {
  return {
    received: photos.filter((p) => p.state === 'ready').length,
    processing: photos.filter((p) => p.state === 'quarantined').length,
    failed: photos.filter((p) => p.state === 'rejected').length + notStored,
  }
}
