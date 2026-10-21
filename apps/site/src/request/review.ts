// The final review of the request wizard (TSK-0030; HH-INT-19, OWN-DEC-93, OWN-DEC-92). Pure functions, shared by the
// React island and its unit tests: the summary of everything the customer is about to send, in six sections
// (services, about the job, photos, property, preferred timing, contact), each owned by the step its Edit action
// returns to. Every row is the customer's own value or a catalog label for a coded choice; the summary never shows a
// price, a fee or a confirmed time (preferences only, HH-INT-02). English only (RULE-LANGUAGES).
import { customerTranslator, type CustomerKey } from '@handyhub/i18n'
import {
  answerKey,
  CONTACT_CHANNELS,
  ESTIMATE_PREFERENCES,
  formatClock,
  PROPERTY_TYPES,
  questionPlan,
  TIME_WINDOWS,
  type FormService,
  type FormValues,
  type OfferedWindow,
  type StepId,
} from './form.js'

const t = (key: CustomerKey, values?: Record<string, string | number>) => customerTranslator().t(key, values)

// Every label by code, written out so the catalog check sees each key (RULE-LANGUAGES).
export const PROPERTY_LABEL: Record<(typeof PROPERTY_TYPES)[number], CustomerKey> = {
  house: 'request.property.house',
  apartment_condo: 'request.property.apartment_condo',
  townhouse: 'request.property.townhouse',
  rental_short_term: 'request.property.rental_short_term',
}
export const WINDOW_LABEL: Record<(typeof TIME_WINDOWS)[number], CustomerKey> = {
  mornings: 'request.timing.mornings',
  afternoons: 'request.timing.afternoons',
  evenings: 'request.timing.evenings',
  weekends: 'request.timing.weekends',
  any_time: 'request.timing.any_time',
}
export const CHANNEL_LABEL: Record<(typeof CONTACT_CHANNELS)[number], CustomerKey> = {
  email: 'request.contact.email_channel',
  call: 'request.contact.call',
  text: 'request.contact.text',
}
export const ESTIMATE_LABEL: Record<(typeof ESTIMATE_PREFERENCES)[number], CustomerKey> = {
  online: 'request.estimate.online',
  site_visit: 'request.estimate.site_visit',
  let_handyhub_decide: 'request.estimate.let_handyhub_decide',
}
/** The label of a coded choice; an unknown or empty code shows nothing (it is never guessed). */
export const labelOf = <T extends string>(map: Record<T, CustomerKey>, code: string): string =>
  Object.hasOwn(map, code) ? t(map[code as T]) : ''

export const REVIEW_SECTIONS = ['services', 'job', 'photos', 'property', 'timing', 'contact'] as const
export type ReviewSectionId = (typeof REVIEW_SECTIONS)[number]

/** The step each section's Edit action opens; the photos are added on the About the job step. */
export const SECTION_STEP: Record<ReviewSectionId, StepId> = {
  services: 'services',
  job: 'job',
  photos: 'job',
  property: 'property',
  timing: 'property',
  contact: 'contact',
}
export const SECTION_TITLE: Record<ReviewSectionId, CustomerKey> = {
  services: 'request.step.services',
  job: 'request.step.job',
  photos: 'request.review.photos',
  property: 'request.review.property',
  timing: 'request.review.timing',
  contact: 'request.step.contact',
}

/** One line of the summary; a value with several lines (an address) is a list. */
export type ReviewRow = { label: string; value: string | readonly string[] }
/** Rows under an optional sub-heading (shared questions, or one service's questions and notes). */
export type ReviewGroup = { title?: string; rows: ReviewRow[] }
export type ReviewSection = { id: ReviewSectionId; step: StepId; title: string; groups: ReviewGroup[] }

/** A preferred date (YYYY-MM-DD) in words, for example "Saturday, October 31, 2026"; anything else as typed. */
export function dateText(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12))
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: 'UTC' }).format(date)
}

/** The full property address in two lines: street and unit, then city, state and ZIP. */
export function addressLines(v: Pick<FormValues, 'street' | 'unit' | 'city' | 'state' | 'zip'>): string[] {
  const first = [v.street.trim(), v.unit.trim()].filter(Boolean).join(', ')
  const place = [v.city.trim(), [v.state.trim(), v.zip.trim()].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  return [first, place].filter(Boolean)
}

/** A window as offered: its label, with its configured hours when there are any (HH-INT-02). */
function windowText(code: string, offered: readonly OfferedWindow[]): string {
  const w = offered.find((x) => x.code === code)
  const name = labelOf(WINDOW_LABEL, code)
  return w?.start && w.end
    ? t('request.timing.windowHours', { window: name, start: formatClock(w.start), end: formatClock(w.end) })
    : name
}

const yesNo = (on: boolean) => t(on ? 'request.review.yes' : 'request.review.no')
/** Rows without a value are left out: the summary shows what will be sent, nothing invented. */
const rows = (...list: (ReviewRow | null)[]): ReviewRow[] =>
  list.filter((r): r is ReviewRow => r !== null && (typeof r.value === 'string' ? r.value !== '' : r.value.length > 0))

/** The summary of everything the request will send, section by section (HH-INT-19). */
export function reviewSections(
  v: FormValues,
  services: readonly FormService[],
  opts: { windows: readonly OfferedWindow[] },
): ReviewSection[] {
  const nameOf = (id: string) => services.find((s) => s.id === id)?.name ?? id
  const selected = v.services.flatMap((id) => services.filter((s) => s.id === id))
  const plan = questionPlan(selected)
  const answer = (serviceId: string | undefined, q: { key: string; label: string }): ReviewRow | null => {
    const a = v.answers[answerKey(serviceId, q.key)]
    if (!a) return null
    return { label: q.label, value: a.unknown ? t('request.questions.unknown') : a.text.trim() }
  }
  const job: ReviewGroup[] = [{ rows: rows({ label: t('request.job.description'), value: v.description.trim() }) }]
  const shared = rows(...plan.shared.map((q) => answer(undefined, q)))
  if (shared.length) job.push({ title: t('request.questions.shared'), rows: shared })
  for (const g of plan.perService) {
    const notes = (v.notes[g.serviceId] ?? '').trim()
    const list = rows(...g.questions.map((q) => answer(g.serviceId, q)), {
      label: t('request.questions.notes', { service: nameOf(g.serviceId) }),
      value: notes,
    })
    if (list.length) job.push({ title: nameOf(g.serviceId), rows: list })
  }
  const groups: Record<ReviewSectionId, ReviewGroup[]> = {
    services: [
      {
        rows: rows(
          { label: t('request.services.select'), value: v.services.map(nameOf) },
          v.notSure ? { label: t('request.services.notSure'), value: yesNo(true) } : null,
          { label: t('request.services.other'), value: v.otherServicesText.trim() },
        ),
      },
    ],
    job,
    // The photos are shown as their previews with their states (photos.tsx), not as rows.
    photos: [],
    property: [
      {
        rows: rows(
          { label: t('request.review.address'), value: addressLines(v) },
          { label: t('request.property.type'), value: labelOf(PROPERTY_LABEL, v.propertyType) },
        ),
      },
    ],
    timing: [
      {
        rows: rows(
          {
            label: t('request.timing.date'),
            value: v.flexible ? t('request.timing.flexible') : dateText(v.preferredDate),
          },
          v.needHelpToday ? { label: t('request.timing.needHelpToday'), value: yesNo(true) } : null,
          { label: t('request.timing.windows'), value: v.windows.map((w) => windowText(w, opts.windows)) },
        ),
      },
    ],
    contact: [
      {
        rows: rows(
          { label: t('request.contact.fullName'), value: v.fullName.trim() },
          { label: t('request.contact.email'), value: v.email.trim() },
          { label: t('request.contact.phone'), value: v.phone.trim() },
          { label: t('request.contact.channel'), value: labelOf(CHANNEL_LABEL, v.preferredChannel) },
          { label: t('request.review.sms'), value: yesNo(v.smsOptIn) },
          { label: t('request.review.marketing'), value: yesNo(v.marketingOptIn) },
          { label: t('request.estimate.title'), value: labelOf(ESTIMATE_LABEL, v.estimatePreference) },
        ),
      },
    ],
  }
  return REVIEW_SECTIONS.map((id) => ({
    id,
    step: SECTION_STEP[id],
    title: t(SECTION_TITLE[id]),
    groups: groups[id].filter((g) => g.rows.length > 0),
  }))
}
