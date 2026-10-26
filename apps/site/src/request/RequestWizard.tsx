// The request wizard shell (TSK-0026; HH-INT-01, HH-INT-08, HH-INT-09, C02, OWN-DEC-87, OWN-DEC-93). A React island on
// /request: the "How would you like to continue?" choice, five steps with progress, client validation with the
// server's own schema, an accessible error summary that receives focus, server field errors shown beside their
// fields without losing input, and the browser draft with Resume and Clear Draft. Every label comes from the
// customer catalog (English only, RULE-LANGUAGES). The step contents are deliberately plain; TSK-0027..0030 refine
// each step (category cards, service questions, photos, SMS opt-in and consent, the final review).
// TSK-0030 (HH-INT-19, HH-INT-10, OWN-DEC-93): the review summarizes every section with an Edit action that opens its
// step and keeps every other answer (Return to review comes straight back); the privacy policy is linked with the
// exact version sent; "Send Estimate Request" uses the draft's idempotency key and sends once while it is pending.
// TSK-0032 (HH-INT-12, OWN-DEC-94): only the server's confirmation of the save (a 201 with the reference, or a 409
// naming the request the key already created) shows the receipt. The wizard keeps it in this tab and moves to
// /request/received/<ref>, where the photos that failed can be retried under the request's own upload capability
// without a new request (HH-INT-07); the counts the page learns are written back to the tab's record.
// A send whose outcome is not known is kept for the tab (send.ts): after a reload and Resume the same body goes again,
// so the customer gets the request and reference already saved; a key that already created a request returns that
// reference; and nothing is sent while a photo is still uploading (HH-INT-10, HH-INT-07, T11).
// TSK-0125 (HH-EST-15, OWN-DEC-165): the contact step offers one reduction (military, senior or returning customer)
// with what each needs, from configuration; the customer picks at most one, and it is pending verification until
// staff confirm it. While the server's settings name none, none is offered.
// TSK-0113 (HH-ID-12, OWN-DEC-113): Request This Service Again (/request?again=<reference>) and a request at a saved
// property (/request?property=<id>) start from the signed-in account's own project (again.ts): the services still
// offered, the property address and type, and the contact details. The property step says where they came from and
// asks the customer to confirm they are still current; the request is sent with repeatOf, which links it to that
// project. Nothing else is reused. Such a start keeps no browser draft (the starting point is read again each time),
// and a link the server no longer accepts is dropped and said so, never sent silently as something else.
import { customerTranslator, type CustomerKey } from '@handyhub/i18n'
import { Button, Dialog, Field, StateView } from '@handyhub/ui'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { checkZip, takeRememberedZip, type CoverageCheck } from '../coverage/coverage.js'
import { zip5 } from '@handyhub/domain/coverage'
import { legalDocument, PRIVACY_NOTICE, SMS_DISCLOSURE } from '@handyhub/domain/legal'
import { contactDetails, parseSiteFacts, type ContactDetail } from '../site/facts.js'
import { asksForPrefill, parsePrefill, prefillUrl, prefillValues } from './again.js'
import { DraftStore, newSend, type DraftSend } from './draft.js'
import { PhotoReviewList, PhotoUploader, usePhotos, type PhotoLimits } from './photos.js'
import { Receipt, useReceiptPhotos } from './Receipt.tsx'
import { receiptGlance, receiptRecord, saveReceipt, withPhotoCounts, type ReceiptRecord } from './receipt.js'
import { receiptPath } from '@handyhub/domain/request-form'
import { keepsBody, resumedFrom, SendStore, sendOutcome, type SendData, type SendReply } from './send.js'
import {
  CHANNEL_LABEL,
  ESTIMATE_LABEL,
  PROPERTY_LABEL,
  reviewSections,
  WINDOW_LABEL,
  type ReviewRow,
} from './review.js'
import { preparedOnText } from '../site/legal.js'
import {
  CONTACT_CHANNELS,
  EMPTY_VALUES,
  ESTIMATE_PREFERENCES,
  answerKey,
  firstPreferredDate,
  formatClock,
  fromServer,
  MAX_SERVICES,
  offeredWindows,
  questionPlan,
  problemKey,
  PROPERTY_TYPES,
  STEPS,
  stepOf,
  toBody,
  validate,
  type FormMeta,
  type FormService,
  type FormValues,
  type OfferedWindow,
  type Problem,
  type StepId,
  type VisitHours,
} from './form.js'

const t = (key: CustomerKey, values?: Record<string, string | number>) => customerTranslator().t(key, values)

// Every label by code, written out so the catalog check sees each key (RULE-LANGUAGES).
/** The four categories in the owner's order, each with its card text (HH-INT-15, OWN-DEC-90). */
const CATEGORIES = ['home_improvement', 'drywall', 'painting', 'cleaning'] as const
const CATEGORY_TEXT: Record<(typeof CATEGORIES)[number], CustomerKey> = {
  home_improvement: 'request.categoryText.home_improvement',
  drywall: 'request.categoryText.drywall',
  painting: 'request.categoryText.painting',
  cleaning: 'request.categoryText.cleaning',
}
const CATEGORY_LABEL: Record<string, CustomerKey> = {
  home_improvement: 'request.category.home_improvement',
  drywall: 'request.category.drywall',
  painting: 'request.category.painting',
  cleaning: 'request.category.cleaning',
}
/** PROPOSED: the form version. */
const FORM_VERSION = 'wizard-1'
/** The privacy policy version this page presents, saved with the request (TSK-0024; HH-PRIV-04, OWN-DEC-72). */
const PRIVACY_NOTICE_VERSION = PRIVACY_NOTICE.documentId
/** The SMS disclosure shown beside the SMS box, recorded with an opt-in (TSK-0029; HH-INT-22, OWN-DEC-147). */
const SMS_DISCLOSURE_VERSION = SMS_DISCLOSURE.documentId
const IDENTITY = 'guest'
/** TSK-0113: the draft identity of a form started from an account's project; such a form keeps no draft. */
const AGAIN_IDENTITY = 'account-again'

const STEP_LABEL: Record<StepId, CustomerKey> = {
  services: 'request.step.services',
  job: 'request.step.job',
  property: 'request.step.property',
  contact: 'request.step.contact',
  review: 'request.step.review',
}

/** The fields the error summary links to, by body path; a deeper path (`services.1.serviceId`) uses its group. */
const FIELD_LABEL: Record<string, CustomerKey> = {
  services: 'request.services.select',
  answers: 'request.step.job',
  otherServicesText: 'request.services.other',
  description: 'request.job.description',
  'property.street': 'request.property.street',
  'property.unit': 'request.property.unit',
  'property.city': 'request.property.city',
  'property.state': 'request.property.state',
  'property.zip': 'request.property.zip',
  'property.propertyType': 'request.property.type',
  'timing.preferredDate': 'request.timing.date',
  'timing.windows': 'request.timing.windows',
  estimatePreference: 'request.estimate.title',
  'contact.fullName': 'request.contact.fullName',
  'contact.email': 'request.contact.email',
  'contact.phone': 'request.contact.phone',
  'contact.preferredChannel': 'request.contact.channel',
  smsOptIn: 'request.sms.title',
  smsDisclosureVersion: 'request.sms.title',
  marketingOptIn: 'request.marketing.title',
  requestedDiscount: 'request.requestedDiscount.title',
  'repeatOf.detailsConfirmed': 'request.again.confirm',
}

function fieldOf(path: string): string {
  const known = Object.keys(FIELD_LABEL)
    .filter((f) => path === f || path.startsWith(`${f}.`))
    .sort((a, b) => b.length - a.length)
  return known[0] ?? path
}

type Phase = 'loading' | 'draftFound' | 'choose' | 'dismissed' | 'form' | 'sent'
type Settings = {
  draftDays: number | null
  timeZone: string | null
  photos: PhotoLimits | null
  /** The configured visit hours (FACT-HOURS) and the windows offered with any configured hours (HH-INT-02). */
  visitHours: VisitHours | null
  windows: OfferedWindow[]
  /** The free-estimate wording shows only while the configured policy is free (FACT-VISIT-FEE, HH-INT-03). */
  freeEstimates: boolean
  /** The configured response target in minutes (FACT-RESPONSE-TARGET), for the receipt's next steps; null: unknown. */
  responseMinutes: number | null
  /**
   * TSK-0142 (HH-OPS-06): whether the form takes requests here and now. closed (launch phase 1) and invitation_only
   * (phase 2) in production: the form says so instead of asking for details it cannot send. unknown (not read): the
   * form shows, and the server still decides when it is sent.
   */
  submissions: 'open' | 'testers_only' | 'invitation_only' | 'closed' | 'unknown'
  /** TSK-0125: the reductions the form offers (share, categories, the senior age and returning window); null: none. */
  requestableDiscounts: {
    percentBps: number
    categories: string[]
    seniorFromAge: number
    returningWithinMonths: number
  } | null
}
/** Until the settings arrive, or if they cannot be read: the five windows without hours, and no free-estimate claim. */
const NO_SETTINGS: Settings = {
  draftDays: null,
  timeZone: null,
  photos: null,
  visitHours: null,
  windows: offeredWindows(null, null),
  freeEstimates: false,
  responseMinutes: null,
  submissions: 'unknown',
  requestableDiscounts: null,
}
/** Day windows that, with Weekends, are explained as weekend times (HH-INT-02). */
const DAY_WINDOW_CODES: readonly string[] = ['mornings', 'afternoons', 'evenings']
/** The support contact of the SMS disclosure, from configuration (GET /api/v1/public/site); null while unknown. */
type SupportContact = { phone: ContactDetail; email: ContactDetail } | null
type Banner = { kind: 'error'; message: string; retry: boolean } | { kind: 'success'; message: string } | null
/** Where focus goes once its target is on the page: the error summary, or the step or receipt heading (HH-INT-09). */
type FocusRequest = { to: 'summary' | 'heading' }

function usable(read: () => Storage): Storage | null {
  try {
    const s = read()
    const probe = '__hh_probe__'
    s.setItem(probe, '1')
    s.removeItem(probe)
    return s
  } catch {
    return null
  }
}

function browserStorage(): Storage | null {
  return usable(() => window.localStorage)
}

/** This tab's storage: a send's exact body lives only as long as the tab, never with the 7-day draft (TSK-0030). */
function tabStorage(): Storage | null {
  return usable(() => window.sessionStorage)
}

export default function RequestWizard() {
  const [services, setServices] = useState<FormService[]>([])
  const [openCategory, setOpenCategory] = useState<string>(CATEGORIES[0])
  const [limitHit, setLimitHit] = useState(false)
  const [phase, setPhase] = useState<Phase>('loading')
  // TSK-0104 (HH-A11Y-02): the continue dialog's opener is replaced while the dialog is open, so once it is dismissed
  // focus goes to the button that opens it again (never back to the top of the page).
  const dismissedActions = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (phase === 'dismissed') dismissedActions.current?.querySelector('button')?.focus()
  }, [phase])
  /** TSK-0036: the visitor chose Create an Account; the form says how the account is made after sending. */
  const [accountIntent, setAccountIntent] = useState(false)
  /** TSK-0113: the form started from one of the account's projects (its reference); null for any other request. */
  const [again, setAgain] = useState<string | null>(null)
  /** TSK-0113: the page asked for a starting point the server did not give (signed out, not this account's). */
  const [againFailed, setAgainFailed] = useState(false)
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES)
  const [step, setStep] = useState<StepId>('services')
  const [problems, setProblems] = useState<Problem[]>([])
  const [banner, setBanner] = useState<Banner>(null)
  const [settings, setSettings] = useState<Settings>(NO_SETTINGS)
  const photos = usePhotos(settings.photos)
  const receiptPhotos = useReceiptPhotos()
  const [sending, setSending] = useState(false)
  const [receipt, setReceipt] = useState<ReceiptRecord | null>(null)
  const [website, setWebsite] = useState('')
  const [support, setSupport] = useState<SupportContact | 'loading'>('loading')
  // The ZIP checked before arriving (HH-INT-16) and the coverage of the ZIP in the form, rechecked as it changes.
  const checkedZip = useRef<string | null>(null)
  const [coverage, setCoverage] = useState<CoverageCheck | null>(null)
  // The draft's send: one idempotency key per draft, kept with the draft until the request is saved (TSK-0030).
  const draftSend = useRef<DraftSend>(newSend())
  // Set at the first press, before anything else runs, so a double click sends one request (HH-INT-10, T11).
  const inFlight = useRef(false)
  // The body of a send whose outcome is not known, kept for this tab under the draft's key (send.ts).
  const sends = useMemo(() => new SendStore(tabStorage()), [])
  // After a Resume of such a send: the exact body it posted and the values shown with it. The first send posts that body
  // unchanged while nothing has changed since, so the server returns the request it may already have saved.
  const resumed = useRef<{ key: string; body: string; values: FormValues } | null>(null)
  // The resumed send carries photos this page cannot show (they stay in its photo draft).
  const [earlierPhotos, setEarlierPhotos] = useState(false)
  // An Edit from the review: the step offers Return to review, which keeps every other answer (HH-INT-19).
  const [fromReview, setFromReview] = useState(false)
  const summaryRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  // State, not a flag: it is set in the same update as the problems or the step, so it commits together with the element
  // it names. Each request is a new object, so asking for the same target again still moves focus.
  const [focusTo, setFocusTo] = useState<FocusRequest | null>(null)
  const requestFocus = (to: FocusRequest['to']) => setFocusTo({ to })

  const loaded = phase !== 'loading'
  const store = useMemo(
    () =>
      loaded
        ? again
          ? new DraftStore(browserStorage(), AGAIN_IDENTITY, null)
          : new DraftStore(browserStorage(), IDENTITY, settings.draftDays)
        : null,
    [loaded, settings.draftDays, again],
  )
  // Settings (the configured draft period) and the services on offer, then any saved draft.
  useEffect(() => {
    let live = true
    const json = <T,>(url: string, fallback: T) =>
      fetch(url, { headers: { accept: 'application/json' } })
        .then(async (r) => (r.ok ? ((await r.json()) as T) : fallback))
        .catch(() => fallback)
    void Promise.all([
      json<Settings>('/api/v1/public/request-form', NO_SETTINGS),
      json<{ services: FormService[] }>('/api/v1/public/services', { services: [] }),
      json<unknown>('/api/v1/public/site', null),
    ]).then(([s, offered, site]) => {
      if (!live) return
      // Unknown is not safe: while the facts cannot be read, the disclosure says so instead of guessing a contact.
      const facts = parseSiteFacts(site)
      setSupport(facts ? contactDetails(facts.contact) : null)
      setSettings({ ...NO_SETTINGS, ...s })
      setServices(offered.services)
      checkedZip.current = takeRememberedZip()
      const remembered = checkedZip.current
      if (remembered) setValues((v) => ({ ...v, zip: remembered }))
      const draft = new DraftStore(browserStorage(), IDENTITY, s.draftDays).load()
      // Arriving from a service page: that service's category opens with the service selected (HH-INT-15, T05). The
      // link names the immutable service ID; its code (DW-01) is accepted too. From "Not sure what service I need"
      // (TSK-0021, HH-CUS-01) that option is chosen and no service is guessed.
      const wanted = new URLSearchParams(window.location.search).get('service')
      const preselect = offered.services.find((x) => x.id === wanted || x.id === `SVC-${wanted ?? ''}`)
      if (preselect) {
        setValues((v) => ({ ...v, services: [preselect.id] }))
        setOpenCategory(preselect.category)
      } else if (wanted === 'not-sure') setValues((v) => ({ ...v, notSure: true }))
      // TSK-0113: Request This Service Again, or a request at a saved property, from the signed-in account.
      const search = window.location.search
      if (!asksForPrefill(search)) return setPhase(draft ? 'draftFound' : 'choose')
      const url = prefillUrl(search)
      const read = url
        ? fetch(url, { headers: { accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store' })
            .then(async (r) => (r.ok ? parsePrefill(await r.json()) : null))
            .catch(() => null)
        : Promise.resolve(null)
      void read.then((prefill) => {
        if (!live) return
        if (!prefill) {
          setAgainFailed(true)
          return setPhase(draft ? 'draftFound' : 'choose')
        }
        const start = prefillValues(prefill, offered.services, MAX_SERVICES)
        setValues(start)
        const first = offered.services.find((x) => x.id === start.services[0])
        if (first) setOpenCategory(first.category)
        setAgain(prefill.reference)
        setPhase('form')
        requestFocus('heading')
      })
    })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    if (phase !== 'form' || !store) return
    // Nothing entered yet: nothing to keep.
    if (step === 'services' && JSON.stringify(values) === JSON.stringify(EMPTY_VALUES)) store.clear()
    else store.save(values, step, Date.now(), draftSend.current)
  }, [phase, store, values, step])

  // The photo counts the receipt learns (a Retry, a processing photo settling) are written back to the tab's record
  // with the time they were taken, so a reload shows them as of then, never older ones (TSK-0032, T13). The upload
  // capability is never stored.
  const liveCounts = receiptPhotos.snapshot
  useEffect(() => {
    if (!receipt || !liveCounts) return
    if (receipt.photosCheckedAt === liveCounts.checkedAt) return
    saveReceipt(tabStorage(), withPhotoCounts(receipt, liveCounts.counts, liveCounts.checkedAt))
  }, [receipt, liveCounts])

  // Any change after a Resume makes a new body: the first send then posts what the page shows now (HH-INT-10).
  useEffect(() => {
    if (resumed.current && resumed.current.values !== values) resumed.current = null
  }, [values])

  // Correcting the ZIP rechecks coverage without touching any other answer (HH-INT-16); it never blocks the form.
  useEffect(() => {
    const zip = zip5(values.zip)
    if (phase !== 'form' || step !== 'property' || !zip) {
      setCoverage(null)
      return
    }
    let live = true
    const timer = setTimeout(() => {
      void checkZip(zip).then((r) => {
        if (live) setCoverage(r)
      })
    }, 300)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [phase, step, values.zip])

  // A window no longer offered (its configured hours changed) is dropped from a resumed draft (HH-INT-02).
  useEffect(() => {
    const offered = settings.windows.map((w) => w.code as string)
    setValues((v) =>
      v.windows.every((w) => offered.includes(w)) ? v : { ...v, windows: v.windows.filter((w) => offered.includes(w)) },
    )
  }, [phase, settings.windows])

  // TSK-0125: a reduction no longer offered (or none offered at all) is dropped from a resumed draft, never sent.
  useEffect(() => {
    const offered: readonly string[] = settings.requestableDiscounts?.categories ?? []
    setValues((v) =>
      v.requestedDiscount === '' || offered.includes(v.requestedDiscount) ? v : { ...v, requestedDiscount: '' },
    )
  }, [phase, settings.requestableDiscounts])

  // Focus moves in the commit that shows its target (HH-INT-09). An effect that ran after every commit and cleared a ref
  // flag lost the summary's focus: the effects of an unrelated update committed just before a press (the ZIP coverage
  // result) run only when React starts the press's update, so they took the flag while the summary was not yet there.
  useEffect(() => {
    if (focusTo?.to === 'summary') summaryRef.current?.focus()
    else if (focusTo?.to === 'heading') headingRef.current?.focus()
  }, [focusTo])

  const meta: FormMeta = {
    formVersion: FORM_VERSION,
    privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
    smsDisclosureVersion: SMS_DISCLOSURE_VERSION,
    startedAt: draftSend.current.startedAt,
    ...(website ? { website } : {}),
  }
  const opts = {
    now: new Date(),
    zone: settings.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    services,
    windows: settings.windows.map((w) => w.code),
  }
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => setValues((v) => ({ ...v, [key]: value }))
  const errorFor = (field: string) => {
    const p = problems.find((x) => fieldOf(x.field) === field)
    return p ? t(problemKey(p.code)) : undefined
  }
  const show = (found: Problem[], to?: StepId) => {
    setProblems(found)
    // A problem found when sending opens its step, which then offers Return to review (HH-INT-19).
    if (to && step === 'review' && to !== 'review') setFromReview(true)
    if (to) setStep(to)
    if (found.length) requestFocus('summary')
  }
  const goTo = (to: StepId) => {
    setProblems([])
    setBanner(null)
    setStep(to)
    if (to === 'review') setFromReview(false)
    requestFocus('heading')
  }
  const edit = (to: StepId) => {
    goTo(to)
    setFromReview(true)
  }
  const index = STEPS.indexOf(step)

  const next = (to: StepId = STEPS[index + 1] ?? 'review') => {
    const mine = validate(values, meta, opts).filter((p) => stepOf(p.field) === step)
    if (mine.length) return show(mine)
    goTo(to)
  }

  const send = async () => {
    // One send at a time: a second press while the first is pending does nothing (the button is also pending).
    if (inFlight.current) return
    // A photo still uploading would be left out without a word, and the send would close its photo draft: nothing is
    // sent until it finishes or is removed; the review says so beside the photos (HH-INT-07).
    if (photos.items.some((i) => i.state === 'uploading')) return
    // The draft's key for every send of this draft: a double tap, a retry or a send after a reload returns the request
    // already saved; changed details under a key already used are a conflict naming that request (HH-INT-10, T11).
    const key = draftSend.current.idempotencyKey
    // The first send after a Resume, nothing changed since: the earlier body unchanged, with its consents and photo
    // draft, which the draft never keeps (HH-INT-10, T11).
    const replay = resumed.current?.key === key && photos.items.length === 0 ? resumed.current.body : null
    if (replay === null) {
      const all = validate(values, meta, opts)
      if (all.length) return show(all, stepOf(all[0]?.field ?? '') as StepId)
    }
    inFlight.current = true
    setSending(true)
    setBanner(null)
    // The server binds the draft's stored photos to the request; failed photos were never stored (TSK-0031). Photos
    // added before a reload are in the same photo draft. With any photo the draft is sent, so the receipt gets the
    // request's upload capability to retry a failed one (TSK-0032).
    const withPhotos = photos.items.length > 0 || earlierPhotos
    const payload =
      replay ??
      JSON.stringify({
        ...toBody(values, meta, services),
        ...(withPhotos && photos.capability ? { photoDraft: photos.capability } : {}),
      })
    // Kept for this tab until the outcome is known, so a reload and Resume send exactly this again.
    sends.save(key, payload)
    let reply: SendReply = 'network'
    // The request's own photo capability, returned once with a fresh save (TSK-0032); never kept in storage.
    let uploadCapability: string | null = null
    // This request's own contact verification on the receipt (TSK-0033); absent on a replayed response.
    let receiptCapability: string | null = null
    try {
      const res = await fetch('/api/v1/public/requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': key },
        body: payload,
      })
      reply = { status: res.status, data: (await res.json().catch(() => null)) as SendData }
      uploadCapability = res.headers.get('upload-capability')
      receiptCapability = res.headers.get('receipt-capability')
    } catch {
      // No answer: the outcome is unknown. The same key and body are kept, so trying again cannot create a second
      // request.
    } finally {
      inFlight.current = false
      setSending(false)
    }
    const outcome = sendOutcome(reply)
    if (!keepsBody(outcome)) sends.clear(key)
    if (outcome.kind === 'sent' || outcome.kind === 'already') {
      store?.clear()
      draftSend.current = newSend()
      resumed.current = null
      // Photos that failed here never reached the server; the receipt counts them with any the server refused, and
      // keeps them so they can be retried under the request's own capability. A key that had already created a
      // request saved nothing of this send: its receipt shows the reference only, with no photo count (TSK-0030).
      const notStored = outcome.kind === 'sent' ? photos.items.filter((i) => i.state === 'failed' && !i.id) : []
      const data = reply === 'network' ? null : reply.data
      const saved = receiptRecord({
        reference: outcome.reference,
        kind: outcome.kind,
        submittedAt: typeof data?.submittedAt === 'string' ? data.submittedAt : null,
        photos: outcome.kind === 'sent' ? outcome.photos : null,
        notStored: notStored.length,
        glance: receiptGlance(values, services, settings.windows),
        facts: { visitHours: settings.visitHours, responseMinutes: settings.responseMinutes },
        now: new Date(),
      })
      // TSK-0033: the receipt capability, only with a fresh save (a key that had already created the request has none).
      const record: ReceiptRecord = { ...saved, capability: outcome.kind === 'sent' ? receiptCapability : null }
      saveReceipt(tabStorage(), record)
      receiptPhotos.start({
        counts: record.photos,
        checkedAt: record.photosCheckedAt,
        failed: notStored.map((i) => ({
          key: i.key,
          file: i.file,
          preview: i.preview,
          state: 'failed' as const,
          ...(i.problem ? { problem: i.problem } : {}),
        })),
        capability: outcome.kind === 'sent' ? uploadCapability : null,
      })
      setReceipt(record)
      window.history.replaceState(null, '', receiptPath(outcome.reference))
      setPhase('sent')
      requestFocus('heading')
      return
    }
    if (outcome.kind === 'fields') {
      // TSK-0113: the account's link to the earlier project is gone (signed out, or access was removed): the request
      // is not sent as a repeat; the customer sees why and sends it as a new request.
      if (outcome.fieldErrors.some((f) => f.field === 'body.repeatOf' && f.code === 'unavailable')) {
        setValues((v) => ({ ...v, repeatOf: '', detailsConfirmed: false }))
        setBanner({ kind: 'error', message: t('request.again.unlinked'), retry: false })
        return requestFocus('heading')
      }
      const found = fromServer(outcome.fieldErrors)
      return show(found, stepOf(found[0]?.field ?? '') as StepId)
    }
    // Never "start a new request": the key may already have created one, and sending again only ever returns it.
    setBanner({
      kind: 'error',
      message:
        outcome.kind === 'uncertain'
          ? t('request.uncertain')
          : outcome.kind === 'conflict'
            ? t('request.sentEarlier')
            : (outcome.message ?? t('error.INTERNAL')),
      retry: true,
    })
  }

  if (phase === 'loading') return <StateView kind="loading" title={t('request.title')} />

  // TSK-0142: before launch phase 3 production takes no public request; nothing is asked that could not be sent.
  if (settings.submissions === 'closed' || settings.submissions === 'invitation_only')
    return (
      <StateView kind="blocked" title={t('request.closed.title')}>
        <p>{settings.submissions === 'closed' ? t('request.closed.notYet') : t('request.closed.invitationOnly')}</p>
      </StateView>
    )

  // The receipt: only from the server's confirmation of the save (HH-INT-12).
  if (phase === 'sent' && receipt)
    return (
      <Receipt
        record={receipt}
        photos={receiptPhotos}
        limits={settings.photos}
        headingRef={headingRef}
        onRecord={setReceipt}
      />
    )

  const choose = (
    <Dialog
      open={phase === 'choose'}
      title={t('request.continue.title')}
      onClose={() => setPhase('dismissed')}
      actions={
        <Button
          onClick={() => {
            setPhase('form')
            requestFocus('heading')
          }}
        >
          {t('request.continue.guest')}
        </Button>
      }
    >
      {againFailed ? <p role="status">{t('request.again.unavailable')}</p> : null}
      <p>{t('request.continue.guestText')}</p>
      <div className="hh-request__choice">
        {/* TSK-0036 (HH-ID-10): an account is created from the request's verified contact, so Create an Account
            opens the same form and the receipt then offers the account (PROPOSED); Sign in opens /account, and the
            draft stays in this browser (HH-INT-08). */}
        <Button
          variant="secondary"
          onClick={() => {
            setAccountIntent(true)
            setPhase('form')
            requestFocus('heading')
          }}
        >
          {t('request.continue.account')}
        </Button>
        <p className="hh-small">{t('request.continue.accountText')}</p>
        <a className="hh-button hh-button--quiet" href="/account">
          {t('request.continue.signIn')}
        </a>
      </div>
    </Dialog>
  )

  if (phase === 'draftFound')
    return (
      <section className="hh-card" aria-labelledby="hh-draft-title">
        {againFailed ? <p role="status">{t('request.again.unavailable')}</p> : null}
        <h2 id="hh-draft-title" className="hh-h3">
          {t('request.draft.found')}
        </h2>
        <div className="hh-request__actions">
          <Button
            onClick={() => {
              const draft = store?.load()
              if (draft) {
                const remembered = checkedZip.current
                let restored = remembered && !draft.values.zip ? { ...draft.values, zip: remembered } : draft.values
                setStep(draft.step)
                // The draft's own send: a send after the reload reuses its key (TSK-0030, HH-INT-10).
                if (draft.send) {
                  draftSend.current = draft.send
                  // Its last send from this tab has no known outcome: the review shows and sends that exact body again,
                  // consents and photo draft included, and says the outcome is not known (HH-INT-10, T11).
                  const earlier = sends.load(draft.send.idempotencyKey)
                  const kept = earlier === null ? null : resumedFrom(earlier)
                  if (earlier !== null && kept) {
                    restored = { ...restored, smsOptIn: kept.smsOptIn, marketingOptIn: kept.marketingOptIn }
                    resumed.current = { key: draft.send.idempotencyKey, body: earlier, values: restored }
                    if (kept.photoDraft) {
                      photos.adopt(kept.photoDraft)
                      setEarlierPhotos(true)
                    }
                    setBanner({ kind: 'error', message: t('request.uncertain'), retry: true })
                  }
                }
                setValues(restored)
              }
              setPhase('form')
              requestFocus('heading')
            }}
          >
            {t('request.draft.resume')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              const saved = store?.load()?.send
              if (saved) sends.clear(saved.idempotencyKey)
              store?.clear()
              draftSend.current = newSend()
              setValues(EMPTY_VALUES)
              setBanner({ kind: 'success', message: t('request.draft.cleared') })
              setPhase('choose')
            }}
          >
            {t('request.draft.clear')}
          </Button>
        </div>
      </section>
    )

  if (phase === 'choose' || phase === 'dismissed')
    return (
      <>
        {banner?.kind === 'success' ? <StateView kind="success" title={banner.message} /> : null}
        {choose}
        {phase === 'dismissed' ? (
          <div className="hh-request__actions" ref={dismissedActions}>
            <Button onClick={() => setPhase('choose')}>{t('request.continue.reopen')}</Button>
            <a className="hh-button hh-button--quiet" href="/">
              {t('request.home')}
            </a>
          </div>
        ) : null}
      </>
    )

  const text = (field: string, key: keyof FormValues, label: CustomerKey, extra: Record<string, unknown> = {}) => (
    <Field
      label={t(label)}
      name={field}
      value={values[key] as string}
      onChange={(e) => set(key, e.currentTarget.value as never)}
      error={errorFor(field)}
      requiredText={t('request.required')}
      {...extra}
    />
  )

  const group = (field: string, legend: CustomerKey, children: ReactNode, hint?: string) => {
    const error = errorFor(field)
    return (
      <fieldset className="hh-request__group" data-field={field} aria-invalid={error ? true : undefined}>
        <legend className="hh-field__label">{t(legend)}</legend>
        {hint ? <p className="hh-field__hint">{hint}</p> : null}
        {children}
        {error ? <p className="hh-field__error">{error}</p> : null}
      </fieldset>
    )
  }

  const check = (name: string, label: string, checked: boolean, onChange: (c: boolean) => void) => (
    <label className="hh-request__option">
      <input type="checkbox" name={name} checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
      <span>{label}</span>
    </label>
  )

  const radio = (name: string, value: string, label: string, current: string, onChange: (v: string) => void) => (
    <label className="hh-request__option">
      <input type="radio" name={name} value={value} checked={current === value} onChange={() => onChange(value)} />
      <span>{label}</span>
    </label>
  )

  const nameOf = (id: string) => services.find((x) => x.id === id)?.name ?? id
  const toggle = (id: string, on: boolean) => {
    if (!on) {
      setLimitHit(false)
      return set(
        'services',
        values.services.filter((x) => x !== id),
      )
    }
    if (values.services.includes(id)) return
    // A sixth service is refused; more work goes in the free-text field (HH-INT-15, OWN-DEC-90).
    if (values.services.length >= MAX_SERVICES) return setLimitHit(true)
    set('services', [...values.services, id])
  }
  const answer = (serviceId: string | undefined, q: { key: string; label: string }) => {
    const k = answerKey(serviceId, q.key)
    const a = values.answers[k] ?? { text: '', unknown: false }
    const put = (next: { text: string; unknown: boolean }) => set('answers', { ...values.answers, [k]: next })
    return (
      <div key={k} className="hh-request__question">
        <Field
          label={q.label}
          name={`answer:${k}`}
          value={a.text}
          disabled={a.unknown}
          onChange={(e) => put({ text: e.currentTarget.value, unknown: false })}
        />
        {check(`unknown:${k}`, t('request.questions.unknown'), a.unknown, (on) => put({ text: a.text, unknown: on }))}
      </div>
    )
  }
  const plan = questionPlan(values.services.flatMap((id) => services.filter((x) => x.id === id)))
  const savedPhotos = photos.items.filter((i) => i.state === 'complete' || i.state === 'processing').length
  const failedPhotos = photos.items.filter((i) => i.state === 'failed').length
  const uploadingPhotos = photos.items.filter((i) => i.state === 'uploading').length
  // While a photo uploads nothing is sent: it would be left out without a word (HH-INT-07).
  const waitForPhotos = uploadingPhotos ? { disabledReason: t('request.photos.uploadingReason') } : {}
  const sections = step === 'review' ? reviewSections(values, services, { windows: settings.windows }) : []
  // TSK-0125: the reductions the form offers now.
  const offer = settings.requestableDiscounts
  const body: Record<StepId, ReactNode> = {
    services: (
      <>
        <p className="hh-muted">{t('request.services.note')}</p>
        <section aria-labelledby="hh-categories-title" className="hh-request__categories">
          <h3 id="hh-categories-title" className="hh-h3">
            {t('request.services.choose')}
          </h3>
          <div className="hh-request__cards">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                className="hh-card hh-request__card"
                aria-pressed={openCategory === c}
                onClick={() => setOpenCategory(c)}
              >
                <span className="hh-request__card-title">{t(CATEGORY_LABEL[c] as CustomerKey)}</span>
                <span className="hh-small">{t(CATEGORY_TEXT[c])}</span>
              </button>
            ))}
          </div>
        </section>
        {group(
          'services',
          'request.services.select',
          <>
            {services
              .filter((x) => x.category === openCategory)
              .map((x) => check(`service-${x.id}`, x.name, values.services.includes(x.id), (on) => toggle(x.id, on)))}
          </>,
        )}
        <section aria-labelledby="hh-selected-title" className="hh-request__selected">
          <p id="hh-selected-title" className="hh-field__label" aria-live="polite">
            {t('request.services.count', { count: values.services.length, max: MAX_SERVICES })}
          </p>
          {values.services.length ? (
            <ul>
              {values.services.map((id) => (
                <li key={id}>
                  <span>{nameOf(id)}</span>{' '}
                  <Button
                    variant="quiet"
                    onClick={() => toggle(id, false)}
                    aria-label={t('request.services.removeNamed', { name: nameOf(id) })}
                  >
                    {t('request.services.remove')}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          {limitHit ? (
            <p role="status" className="hh-field__hint">
              {t('request.services.limit', { max: MAX_SERVICES })}
            </p>
          ) : null}
        </section>
        {check('notSure', t('request.services.notSure'), values.notSure, (on) => set('notSure', on))}
        {text('otherServicesText', 'otherServicesText', 'request.services.other', { multiline: true, rows: 3 })}
      </>
    ),
    job: (
      <>
        {text('description', 'description', 'request.job.description', { multiline: true, rows: 6, required: true })}
        {plan.shared.length ? (
          <section aria-labelledby="hh-q-shared" className="hh-request__questions">
            <h3 id="hh-q-shared" className="hh-h3">
              {t('request.questions.shared')}
            </h3>
            {plan.shared.map((q) => answer(undefined, q))}
          </section>
        ) : null}
        {plan.perService.map((g) => (
          <section key={g.serviceId} aria-labelledby={`hh-q-${g.serviceId}`} className="hh-request__questions">
            <h3 id={`hh-q-${g.serviceId}`} className="hh-h3">
              {nameOf(g.serviceId)}
            </h3>
            {g.questions.map((q) => answer(g.serviceId, q))}
            <Field
              label={t('request.questions.notes', { service: nameOf(g.serviceId) })}
              name={`notes:${g.serviceId}`}
              multiline
              rows={2}
              value={values.notes[g.serviceId] ?? ''}
              onChange={(e) => set('notes', { ...values.notes, [g.serviceId]: e.currentTarget.value })}
            />
          </section>
        ))}
        <PhotoUploader photos={photos} limits={settings.photos} earlier={earlierPhotos} />
      </>
    ),
    property: (
      <>
        {values.repeatOf ? (
          <div className="hh-request__again" role="note">
            <p>{t('request.again.notice', { reference: values.repeatOf })}</p>
            <p className="hh-small hh-muted">{t('request.again.review')}</p>
          </div>
        ) : null}
        {text('property.street', 'street', 'request.property.street', {
          required: true,
          autoComplete: 'address-line1',
        })}
        {text('property.unit', 'unit', 'request.property.unit', { autoComplete: 'address-line2' })}
        {text('property.city', 'city', 'request.property.city', { required: true, autoComplete: 'address-level2' })}
        {text('property.state', 'state', 'request.property.state', { required: true, autoComplete: 'address-level1' })}
        {text('property.zip', 'zip', 'request.property.zip', {
          required: true,
          autoComplete: 'postal-code',
          inputMode: 'numeric',
        })}
        <p className="hh-muted hh-request__coverage" role="status" aria-live="polite">
          {coverage?.kind === 'outcome'
            ? coverage.note
              ? `${coverage.message} ${coverage.note}`
              : coverage.message
            : coverage?.kind === 'failed'
              ? t('coverage.failed')
              : null}
        </p>
        {group(
          'property.propertyType',
          'request.property.type',
          PROPERTY_TYPES.map((p) =>
            radio('propertyType', p, t(PROPERTY_LABEL[p]), values.propertyType, (v) => set('propertyType', v)),
          ),
        )}
        {/* TSK-0113: the details of Request This Service Again are confirmed for every new job (HH-ID-12). */}
        {values.repeatOf ? (
          <div
            className="hh-request__question"
            data-field="repeatOf.detailsConfirmed"
            aria-invalid={errorFor('repeatOf.detailsConfirmed') ? true : undefined}
          >
            {check('detailsConfirmed', t('request.again.confirm'), values.detailsConfirmed, (on) =>
              set('detailsConfirmed', on),
            )}
            {errorFor('repeatOf.detailsConfirmed') ? (
              <p className="hh-field__error">{errorFor('repeatOf.detailsConfirmed')}</p>
            ) : null}
          </div>
        ) : null}
        {settings.visitHours ? (
          <p className="hh-small hh-muted">
            {t('request.timing.visitHours', {
              open: formatClock(settings.visitHours.open),
              close: formatClock(settings.visitHours.close),
            })}
          </p>
        ) : null}
        {check('flexible', t('request.timing.flexible'), values.flexible, (on) => set('flexible', on))}
        {values.flexible
          ? null
          : text('timing.preferredDate', 'preferredDate', 'request.timing.date', {
              type: 'date',
              required: true,
              // Standard dates start tomorrow in the property's local time (OWN-DEC-92, FACT-TIMEZONE).
              min: firstPreferredDate(opts.now, opts.zone),
              hint: t('request.timing.dateHint'),
            })}
        <div className="hh-request__question">
          <label className="hh-request__option">
            <input
              type="checkbox"
              name="needHelpToday"
              aria-describedby="hh-help-today-note"
              checked={values.needHelpToday}
              onChange={(e) => set('needHelpToday', e.currentTarget.checked)}
            />
            <span>{t('request.timing.needHelpToday')}</span>
          </label>
          <p id="hh-help-today-note" className="hh-field__hint">
            {t('request.timing.needHelpTodayNote')}
          </p>
        </div>
        {group(
          'timing.windows',
          'request.timing.windows',
          settings.windows.map(({ code: w, start, end }) =>
            check(
              `window-${w}`,
              start && end
                ? t('request.timing.windowHours', {
                    window: t(WINDOW_LABEL[w]),
                    start: formatClock(start),
                    end: formatClock(end),
                  })
                : t(WINDOW_LABEL[w]),
              values.windows.includes(w),
              (on) =>
                // "Any time" clears the others; another choice clears "Any time" (C02).
                set(
                  'windows',
                  on
                    ? w === 'any_time'
                      ? ['any_time']
                      : [...values.windows.filter((x) => x !== 'any_time'), w]
                    : values.windows.filter((x) => x !== w),
                ),
            ),
          ),
        )}
        {values.windows.includes('weekends') && values.windows.some((w) => DAY_WINDOW_CODES.includes(w)) ? (
          <p className="hh-field__hint" role="status">
            {t('request.timing.weekendsCombined')}
          </p>
        ) : null}
        {/* Preferences only, never a slot or an appointment, in the owner's words below the choices (HH-INT-02,
            HH-INT-17, OWN-DEC-170). */}
        <p className="hh-muted">{t('request.timing.note')}</p>
      </>
    ),
    contact: (
      <>
        <p className="hh-muted">{t('request.contact.usage')}</p>
        {text('contact.fullName', 'fullName', 'request.contact.fullName', { required: true, autoComplete: 'name' })}
        {text('contact.email', 'email', 'request.contact.email', {
          required: true,
          type: 'email',
          autoComplete: 'email',
        })}
        {text('contact.phone', 'phone', 'request.contact.phone', { required: true, type: 'tel', autoComplete: 'tel' })}
        {group(
          'contact.preferredChannel',
          'request.contact.channel',
          <>
            {CONTACT_CHANNELS.map((c) =>
              radio('preferredChannel', c, t(CHANNEL_LABEL[c]), values.preferredChannel, (v) =>
                set('preferredChannel', v),
              ),
            )}
            {/* Text needs the SMS opt-in: the form says so and never changes the choice (HH-INT-22). */}
            {values.preferredChannel === 'text' && !values.smsOptIn && !errorFor('contact.preferredChannel') ? (
              <p className="hh-field__hint" role="status">
                {t('request.contact.textNeedsOptIn')}
              </p>
            ) : null}
          </>,
        )}
        {/* The SMS opt-in: unchecked by default, its own choice, the exact versioned disclosure next to it (HH-INT-22,
            OWN-DEC-147). Not required to send a request. */}
        <fieldset
          className="hh-request__group"
          data-field="smsOptIn"
          data-sms-disclosure={SMS_DISCLOSURE.documentId}
          aria-invalid={errorFor('smsOptIn') || errorFor('smsDisclosureVersion') ? true : undefined}
        >
          <legend className="hh-field__label">{t('request.sms.title')}</legend>
          <label className="hh-request__option">
            <input
              type="checkbox"
              name="smsOptIn"
              aria-describedby="hh-sms-disclosure"
              checked={values.smsOptIn}
              onChange={(e) => set('smsOptIn', e.currentTarget.checked)}
            />
            <span>{t(SMS_DISCLOSURE.label as CustomerKey)}</span>
          </label>
          <div id="hh-sms-disclosure" className="hh-request__disclosure" data-testid="sms-disclosure">
            {disclosure(support)}
          </div>
          {errorFor('smsOptIn') || errorFor('smsDisclosureVersion') ? (
            <p className="hh-field__error">{errorFor('smsOptIn') ?? errorFor('smsDisclosureVersion')}</p>
          ) : null}
        </fieldset>
        {/* Marketing permission: a separate choice with its own consent record, never implied (HH-INT-18). */}
        <fieldset className="hh-request__group" data-field="marketingOptIn">
          <legend className="hh-field__label">{t('request.marketing.title')}</legend>
          <label className="hh-request__option">
            <input
              type="checkbox"
              name="marketingOptIn"
              aria-describedby="hh-marketing-note"
              checked={values.marketingOptIn}
              onChange={(e) => set('marketingOptIn', e.currentTarget.checked)}
            />
            <span>{t('request.marketing.label')}</span>
          </label>
          <p id="hh-marketing-note" className="hh-field__hint">
            {t('request.marketing.note')}
          </p>
        </fieldset>
        {group(
          'estimatePreference',
          'request.estimate.title',
          ESTIMATE_PREFERENCES.map((p) =>
            radio('estimatePreference', p, t(ESTIMATE_LABEL[p]), values.estimatePreference, (v) =>
              set('estimatePreference', v),
            ),
          ),
          t('request.estimate.note'),
        )}
        {settings.freeEstimates ? <p className="hh-muted">{t('request.estimate.free')}</p> : null}
        {offer ? (
          <fieldset className="hh-request__group" data-field="requestedDiscount" data-testid="request-reduction">
            <legend className="hh-field__label">{t('request.requestedDiscount.title')}</legend>
            <p className="hh-field__hint">
              {t('request.requestedDiscount.intro', { percent: offer.percentBps / 100 })}
            </p>
            {radio('requestedDiscount', '', t('request.requestedDiscount.none'), values.requestedDiscount, (v) =>
              set('requestedDiscount', v),
            )}
            {offer.categories.map((c) =>
              radio(
                'requestedDiscount',
                c,
                c === 'senior'
                  ? t('request.requestedDiscount.senior', { age: offer.seniorFromAge })
                  : c === 'returning_customer'
                    ? t('request.requestedDiscount.returning_customer', { months: offer.returningWithinMonths })
                    : t('request.requestedDiscount.military'),
                values.requestedDiscount,
                (v) => set('requestedDiscount', v),
              ),
            )}
            <p className="hh-field__hint">{t('request.requestedDiscount.note')}</p>
            {errorFor('requestedDiscount') ? <p className="hh-field__error">{errorFor('requestedDiscount')}</p> : null}
          </fieldset>
        ) : null}
      </>
    ),
    review: (
      <>
        {/* Nothing here is a price or a confirmed time (HH-INT-19): scope, pricing and scheduling follow review. */}
        <p className="hh-muted">{t('request.services.note')}</p>
        {sections.map((section) => (
          <section
            key={section.id}
            className="hh-card hh-request__review"
            aria-labelledby={`hh-review-${section.id}`}
            data-section={section.id}
          >
            <div className="hh-request__review-head">
              <h3 id={`hh-review-${section.id}`} className="hh-h3">
                {section.title}
              </h3>
              <Button
                variant="quiet"
                onClick={() => edit(section.step)}
                aria-label={t('request.review.editNamed', { section: section.title })}
              >
                {t('request.edit')}
              </Button>
            </div>
            {section.groups.map((g, i) => (
              <div key={g.title ?? i} className="hh-request__review-group">
                {g.title ? <h4 className="hh-request__review-sub">{g.title}</h4> : null}
                <dl>{g.rows.map(reviewRow)}</dl>
              </div>
            ))}
            {section.id === 'photos' ? (
              <>
                {earlierPhotos ? <p className="hh-muted">{t('request.photos.earlier')}</p> : null}
                {photos.items.length ? (
                  <>
                    {savedPhotos ? <p>{t('request.photos.saved', { count: savedPhotos })}</p> : null}
                    {failedPhotos ? (
                      <p className="hh-request__warning" role="status">
                        {t('request.photos.failedNotice', { count: failedPhotos })}
                      </p>
                    ) : null}
                    {/* A photo still uploading is not sent: wait for it or remove it (HH-INT-07). */}
                    {uploadingPhotos ? (
                      <p className="hh-request__warning" role="status" data-testid="photos-uploading">
                        {t('request.photos.uploadingNotice', { count: uploadingPhotos })}
                      </p>
                    ) : null}
                    <PhotoReviewList items={photos.items} />
                  </>
                ) : earlierPhotos ? null : (
                  <p className="hh-muted">{t('request.review.noPhotos')}</p>
                )}
              </>
            ) : null}
            {/* Preferences, never an appointment (HH-INT-02, OWN-DEC-92); staff confirm the approach (HH-INT-03). */}
            {section.id === 'timing' ? <p className="hh-small hh-muted">{t('request.timing.note')}</p> : null}
            {section.id === 'contact' ? <p className="hh-small hh-muted">{t('request.estimate.note')}</p> : null}
          </section>
        ))}
        {/* The privacy policy, linked, with the exact version this request is sent with (OWN-DEC-72, ENT-PolicyVersion). */}
        <div className="hh-request__privacy" data-privacy-notice={PRIVACY_NOTICE_VERSION}>
          <p>
            {t('request.review.privacy')}{' '}
            <a href={PRIVACY_NOTICE.path} target="_blank" rel="noopener">
              {t('legal.link.privacy')}
              <span className="hh-visually-hidden"> {t('request.newTab')}</span>
            </a>
          </p>
          <p className="hh-small hh-muted" data-testid="privacy-version">
            {t('legal.common.version', {
              version: PRIVACY_NOTICE.version,
              preparedOn: preparedOnText(PRIVACY_NOTICE.preparedOn),
              documentId: PRIVACY_NOTICE.documentId,
            })}
          </p>
        </div>
      </>
    ),
  }

  return (
    <form
      noValidate
      className="hh-request"
      aria-labelledby="hh-step-title"
      onSubmit={(e) => {
        e.preventDefault()
        if (step === 'review') void send()
        else next()
      }}
    >
      <ol className="hh-request__progress">
        {STEPS.map((s) => (
          <li key={s} aria-current={s === step ? 'step' : undefined}>
            {t(STEP_LABEL[s])}
          </li>
        ))}
      </ol>
      <h2 id="hh-step-title" ref={headingRef} tabIndex={-1} className="hh-h2">
        {t('request.progress', { current: index + 1, total: STEPS.length, name: t(STEP_LABEL[step]) })}
      </h2>
      <p className="hh-small hh-muted">
        {store?.enabled ? t('request.draft.note', { days: settings.draftDays ?? 0 }) : t('request.draft.off')}
      </p>
      {accountIntent ? <p className="hh-small">{t('request.continue.accountNext')}</p> : null}
      {problems.length ? (
        <div
          ref={summaryRef}
          tabIndex={-1}
          className="hh-request__summary"
          role="alert"
          aria-labelledby="hh-summary-title"
        >
          <h3 id="hh-summary-title" className="hh-h3">
            {t('request.errorSummary.title')}
          </h3>
          <ul>
            {problems.map((p) => {
              const f = fieldOf(p.field)
              return (
                <li key={p.field}>
                  <a
                    href={`#${f}`}
                    onClick={(e) => {
                      e.preventDefault()
                      const el = document.querySelector<HTMLElement>(`[name="${f}"], [data-field="${f}"] input`)
                      el?.focus()
                    }}
                  >
                    {FIELD_LABEL[f] ? t(FIELD_LABEL[f]) : f}: {t(problemKey(p.code))}
                  </a>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
      {banner?.kind === 'error' ? (
        <StateView
          kind="error"
          title={banner.message}
          action={
            banner.retry ? (
              <Button onClick={() => void send()} pending={sending} {...waitForPhotos}>
                {t('request.retry')}
              </Button>
            ) : undefined
          }
        />
      ) : null}
      {body[step]}
      {/* Quiet spam control (HH-INT-11): people never see or reach this field. */}
      <div className="hh-visually-hidden" aria-hidden="true">
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.currentTarget.value)}
        />
      </div>
      <div className="hh-request__actions">
        {index > 0 ? (
          <Button variant="secondary" onClick={() => goTo(STEPS[index - 1] ?? 'services')}>
            {t('request.back')}
          </Button>
        ) : null}
        {fromReview && step !== 'review' ? (
          <Button variant="secondary" onClick={() => next('review')}>
            {t('request.review.return')}
          </Button>
        ) : null}
        {step === 'review' ? (
          <Button type="submit" pending={sending} {...waitForPhotos}>
            {t('request.send')}
          </Button>
        ) : (
          <Button type="submit">{t('request.next')}</Button>
        )}
      </div>
    </form>
  )
}

/** One summary line; a value with several lines (an address, the services) is a list. */
function reviewRow(row: ReviewRow): ReactNode {
  return (
    <div key={row.label}>
      <dt>{row.label}</dt>
      <dd>
        {typeof row.value === 'string' ? (
          row.value
        ) : row.value.length === 1 ? (
          row.value[0]
        ) : (
          <ul className="hh-request__review-lines">
            {row.value.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </dd>
    </div>
  )
}

/**
 * The SMS disclosure's blocks as the box shows them (TSK-0029; HH-INT-22, HH-COM-12): every sentence is a catalog key
 * of the versioned text; the support contact is the configured public phone and email, a labelled placeholder while
 * not provided (OWN-DEC-131), never a guessed value; the links open the SMS terms and the privacy policy.
 */
function disclosure(support: SupportContact | 'loading'): ReactNode {
  const detail = (d: ContactDetail | undefined) => {
    if (support === 'loading') return t('site.footer.loading')
    if (!d) return t('error.UNAVAILABLE')
    if (d.kind === 'placeholder') return <span className="hh-badge">{t('site.footer.contactPlaceholder')}</span>
    return <a href={d.href}>{d.value}</a>
  }
  const contact = support === 'loading' ? undefined : (support ?? undefined)
  const links = SMS_DISCLOSURE.blocks.flatMap((b) => (b.kind === 'link' ? [b] : []))
  return (
    <>
      {SMS_DISCLOSURE.blocks.map((b, i) => {
        if (b.kind === 'p')
          return (
            <p key={i} data-key={b.key}>
              {t(b.key as CustomerKey)}
            </p>
          )
        if (b.kind === 'contact')
          return (
            <dl key={i} data-pending={b.waitsOn.join(' ')}>
              <div>
                <dt>{t('site.footer.phone')}</dt>
                <dd data-contact="phone">{detail(contact?.phone)}</dd>
              </div>
              <div>
                <dt>{t('site.footer.email')}</dt>
                <dd data-contact="email">{detail(contact?.email)}</dd>
              </div>
            </dl>
          )
        return null
      })}
      <ul>
        {links.map((b) => (
          <li key={b.key}>
            <a href={legalDocument(b.to).path} target="_blank" rel="noopener">
              {t(b.key as CustomerKey)}
              <span className="hh-visually-hidden"> {t('request.newTab')}</span>
            </a>
          </li>
        ))}
      </ul>
    </>
  )
}
