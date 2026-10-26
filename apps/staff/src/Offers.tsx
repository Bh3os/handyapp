// Window offers on a visit (TSK-0063; HH-SCH-11, HH-LEAD-07, HH-SCH-04, OWN-DEC-99, OWN-DEC-105, OWN-DEC-144).
// - OfferWindows: staff offer the configured number of windows of a tentative visit (scheduling.window_offers: 2-3)
//   with the visit's team (the lead first) and optional preparation instructions for the customer. Every window holds
//   the whole team until the offer expires (the configured hours from the offer: 24, OWN-DEC-144); the server checks
//   each window like a confirmation and refuses with every problem, per window, and the alternatives.
// - VisitOffers: every offer of the visit, newest first: its state, until when it is held, its windows (the selected
//   one marked), the customer's note when they asked for other times, the withdrawal reason, and the automatic notice
//   with what really happened to each delivery (its wording is not configured yet, so nothing reads as sent). An open
//   offer can be withdrawn with a reason, which releases every hold.
// - Every time is shown with its zone, read from the UTC instants, so this device's zone never changes it.
// - TSK-0145 (OWN-DEC-194 B1, B4): windows are saved as a draft (nothing held, no clock) or published at once; a draft
//   is published or discarded from its entry. The hold runs from the publication. Over a published offer the form
//   replaces it with a reason, and the customer gets the new offer's notice once. A withdrawal sends no notice of its
//   own (its wording is not approved): the request asks staff to offer new times.
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type Fetch } from './api'
import { AlternativesView, spanText, type Alternatives, type CapacityDay } from './Capacity'
import { codeLabel } from './Requests'
import { EMPTY_ENTRY, WindowFields, windowBody, type Entry } from './Visits'

type T = (key: StaffKey, values?: Record<string, string | number>) => string
type StaffRef = { id: string; name: string | null }

export type OfferPolicy = { holdHours: number; minWindows: number; maxWindows: number; proposed: boolean }

export type Notice = { messageKey: string; channel: string; state: string; errorCode: string | null }

export type Offer = {
  id: string
  /** Null for a draft (numbered when published). */
  number: number | null
  state: string
  held: boolean
  version: number
  offeredBy: StaffRef
  offeredAt: string
  publishedBy?: StaffRef | null
  publishedAt?: string | null
  expiresAt: string | null
  holdHours: number
  preparationInstructions: string | null
  windows: {
    position: number
    window: { localDate: string; start: string; end: string; timeZone: string; startsAt: string; endsAt: string }
    reservedRange: { startsAt: string; endsAt: string }
  }[]
  selectedPosition: number | null
  closedAt: string | null
  closedBy: StaffRef | null
  closedReason: string | null
  replacedByNumber?: number | null
  customerNote: string | null
  noticeKey: string | null
  notices: Notice[]
  actions: { withdraw: boolean; publish?: boolean; discard?: boolean }
}

type OfferableVisit = {
  id: string
  purpose: string
  version: number
  window: { localDate: string; start: string; end: string; timeZone: string }
  requiredWorkers: number | null
  equipment: string[]
}

// TSK-0119: released wording whose values are not wired yet is not configured for sending either.
const NOT_CONFIGURED = new Set(['template_not_configured', 'channel_not_configured', 'template_values_not_wired'])
const bcp47 = (locale: StaffLocale) => (locale === 'es' ? 'es-US' : 'en-US')
const name = (t: T, s: StaffRef) => s.name ?? t('queue.unnamed')

/** "Tue, Oct 27, 9:00 AM – 10:00 AM EDT" for an offered window. */
function windowLine(w: Offer['windows'][number]['window'], locale: StaffLocale): string {
  const date = new Intl.DateTimeFormat(bcp47(locale), {
    timeZone: w.timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(w.startsAt))
  return `${date}, ${spanText(w, w.timeZone, locale)}`
}

/** One delivery of an automatic notice as it really went. */
export function NoticeLine({ t, notice }: { t: T; notice: Notice }) {
  const state = codeLabel(t, 'noticeState', notice.state)
  const channel = codeLabel(t, 'providerChannel', notice.channel)
  return (
    <li>
      {t('offers.notice.entry', { channel, state })}
      {notice.errorCode && NOT_CONFIGURED.has(notice.errorCode) ? ` ${t('offers.notice.notConfigured')}` : ''}
    </li>
  )
}

type WindowErrors = { fields: Record<string, string>[]; general: string[] }

/** The refusal as messages per window field, plus those about the team, each window or the whole offer. */
function offerErrors(
  t: T,
  error: ApiErrorBody,
  count: number,
  names: { workers: Map<string, string>; equipment: Map<string, string> },
): WindowErrors {
  const fields: Record<string, string>[] = Array.from({ length: count }, () => ({}))
  const general: string[] = []
  for (const f of error.fieldErrors) {
    const msg = codeLabel(t, 'visitProblem', f.code)
    const own = /^body\.windows\[(\d+)\]\.(localDate|windowStart|windowEnd|startOffset|endOffset)$/.exec(f.field)
    const each = /^(?:body\.)?windows\[(\d+)\](?:\.(workers|equipment)\.(.+))?/.exec(f.field)
    if (own) {
      const at = fields[Number(own[1])]
      if (at) at[own[2] as string] = msg
    } else if (each) {
      const n = Number(each[1]) + 1
      const subject = each[3]
      const who =
        each[2] === 'workers'
          ? (names.workers.get(subject as string) ?? t('queue.unnamed'))
          : each[2] === 'equipment'
            ? (names.equipment.get(subject as string) ?? subject)
            : null
      general.push(
        t('offers.aboutWindow', { n, problem: who ? t('capacity.about', { name: who, problem: msg }) : msg }),
      )
    } else general.push(msg)
  }
  if (error.fieldErrors.length === 0) general.push(codeLabel(t, 'visitProblem', error.code))
  return { fields, general }
}

/** Offer windows of a tentative visit: the windows, the team and the customer's preparation instructions. */
export function OfferWindows<V>({
  t,
  locale,
  fetchImpl,
  visit,
  policy,
  onOffered,
  replace = false,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  visit: OfferableVisit
  policy: OfferPolicy
  onOffered: (d: V | null) => void
  /** TSK-0145 (B4): the visit has a published offer: these windows replace it, with a reason. */
  replace?: boolean
}) {
  const ids = useId()
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<Entry[]>(() =>
    Array.from({ length: policy.minWindows }, (_, i) =>
      i === 0
        ? {
            ...EMPTY_ENTRY,
            localDate: visit.window.localDate,
            windowStart: visit.window.start,
            windowEnd: visit.window.end,
          }
        : { ...EMPTY_ENTRY, localDate: visit.window.localDate },
    ),
  )
  const [day, setDay] = useState<CapacityDay | null | undefined>(undefined)
  const [workers, setWorkers] = useState<string[]>([])
  const [items, setItems] = useState<string[]>([])
  const [instructions, setInstructions] = useState('')
  const [replaceReason, setReplaceReason] = useState('')
  const [errors, setErrors] = useState<WindowErrors>({ fields: [], general: [] })
  const [alternatives, setAlternatives] = useState<Alternatives | null>(null)
  const [stale, setStale] = useState(false)
  const [pending, setPending] = useState(false)
  const key = useRef<string | null>(null)
  const load = useCallback(async () => {
    const r = await call<CapacityDay>(fetchImpl, `/staff/capacity?date=${encodeURIComponent(visit.window.localDate)}`)
    setDay(r.ok ? r.data : null)
  }, [fetchImpl, visit.window.localDate])
  useEffect(() => {
    if (open) void load()
  }, [open, load])
  if (!open)
    return (
      <div className="hh-button-row">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {replace ? t('offers.form.replaceOpen') : t('offers.open')}
        </Button>
      </div>
    )
  const work = visit.purpose !== 'site_estimate'
  const candidates = (day?.workers ?? []).filter((w) =>
    work ? w.eligibleFor.workVisits : w.eligibleFor.estimateVisits,
  )
  const names = {
    workers: new Map((day?.workers ?? []).map((w) => [w.id, w.name ?? t('queue.unnamed')])),
    equipment: new Map((day?.equipment ?? []).map((e) => [e.id, e.name])),
  }
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  const setEntry = (i: number, e: Entry) => setEntries(entries.map((x, j) => (j === i ? e : x)))
  async function submit(e: { preventDefault(): void }, draft: boolean) {
    e.preventDefault()
    setPending(true)
    key.current = key.current ?? idempotencyKey()
    const r = await call<V>(fetchImpl, `/staff/visits/${encodeURIComponent(visit.id)}/offers`, {
      method: 'POST',
      headers: { 'idempotency-key': key.current, 'if-match': `"${visit.version}"` },
      body: {
        windows: entries.map(windowBody),
        workerIds: workers,
        equipmentIds: items,
        ...(instructions.trim() ? { preparationInstructions: instructions.trim() } : {}),
        ...(draft ? { draft: true } : {}),
        ...(replace && !draft && replaceReason.trim() ? { replaceReason: replaceReason.trim() } : {}),
      },
    })
    setPending(false)
    if (r.ok || r.status < 500) key.current = null
    if (!r.ok) {
      if (r.error.code === 'STALE_VERSION') return setStale(true)
      setAlternatives(r.error.alternatives ?? null)
      return setErrors(offerErrors(t, r.error, entries.length, names))
    }
    setOpen(false)
    onOffered(r.data)
  }
  return (
    <form
      className="staff-request__form"
      onSubmit={(e) => void submit(e, false)}
      aria-labelledby={`${ids}-offer`}
      data-testid="offer-windows"
    >
      <h3 id={`${ids}-offer`}>{replace ? t('offers.form.replaceTitle') : t('offers.form.title')}</h3>
      <p className="staff-request__hint">
        {t('offers.form.hint', { min: policy.minWindows, max: policy.maxWindows, hours: policy.holdHours })}
      </p>
      <p className="staff-request__hint">{t('offers.form.draftHint', { hours: policy.holdHours })}</p>
      {replace ? <p className="staff-request__hint">{t('offers.form.replaceHint')}</p> : null}
      {entries.map((entry, i) => (
        <fieldset key={i} className="staff-request__check" data-testid="offer-window">
          <legend>{t('offers.form.window', { n: i + 1 })}</legend>
          <WindowFields
            t={t}
            locale={locale}
            zone={visit.window.timeZone}
            entry={entry}
            onChange={(e) => setEntry(i, e)}
            errors={errors.fields[i] ?? {}}
          />
          {entries.length > policy.minWindows ? (
            <div className="hh-button-row">
              <Button variant="secondary" onClick={() => setEntries(entries.filter((_, j) => j !== i))}>
                {t('offers.form.removeWindow')}
              </Button>
            </div>
          ) : null}
        </fieldset>
      ))}
      {entries.length < policy.maxWindows ? (
        <div className="hh-button-row">
          <Button
            variant="secondary"
            onClick={() => setEntries([...entries, { ...EMPTY_ENTRY, localDate: visit.window.localDate }])}
          >
            {t('offers.form.addWindow')}
          </Button>
        </div>
      ) : null}
      {day === undefined ? <StateView kind="loading" title={t('capacity.loading')} /> : null}
      {day === null ? <StateView kind="error" title={t('capacity.unavailable')} /> : null}
      {day ? (
        <fieldset className="staff-request__check">
          <legend>{t('offers.form.team', { n: visit.requiredWorkers ?? 0 })}</legend>
          {candidates.length === 0 ? <p>{t('capacity.noWorkers')}</p> : null}
          <div className="staff-request__outcomes">
            {candidates.map((w) => (
              <label key={w.id}>
                <input
                  type="checkbox"
                  checked={workers.includes(w.id)}
                  onChange={() => setWorkers(toggle(workers, w.id))}
                />
                {w.name ?? t('queue.unnamed')}
                {workers[0] === w.id ? ` (${codeLabel(t, 'reservationRole', 'lead')})` : ''}
              </label>
            ))}
          </div>
          <p className="staff-request__hint">{t('capacity.confirm.leadHint')}</p>
        </fieldset>
      ) : null}
      {day && (visit.equipment.length > 0 || day.equipment.length > 0) ? (
        <fieldset className="staff-request__check">
          <legend>{t('capacity.confirm.equipment', { entries: visit.equipment.join(', ') || '—' })}</legend>
          <div className="staff-request__outcomes">
            {day.equipment.map((i) => (
              <label key={i.id}>
                <input type="checkbox" checked={items.includes(i.id)} onChange={() => setItems(toggle(items, i.id))} />
                {i.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <Field
        label={t('offers.form.instructions')}
        multiline
        rows={3}
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
      />
      {replace ? (
        <Field
          label={t('offers.form.replaceReason')}
          required
          value={replaceReason}
          onChange={(e) => setReplaceReason(e.target.value)}
        />
      ) : null}
      {stale ? (
        <StateView
          kind="stale"
          title={t('conflict.title')}
          action={
            <Button variant="secondary" onClick={() => onOffered(null)}>
              {t('visits.reload')}
            </Button>
          }
        >
          <p>{t('visits.stale')}</p>
        </StateView>
      ) : null}
      {errors.general.length ? (
        <StateView kind="error" title={t('offers.refused')} reasons={errors.general}>
          {alternatives ? (
            <AlternativesView t={t} locale={locale} zone={visit.window.timeZone} alternatives={alternatives} />
          ) : null}
        </StateView>
      ) : null}
      <div className="hh-button-row">
        <Button type="submit" pending={pending || !day}>
          {replace ? t('offers.form.replaceOpen') : t('offers.form.submit')}
        </Button>
        <Button variant="secondary" pending={pending || !day} onClick={(e) => void submit(e, true)}>
          {t('offers.form.saveDraft')}
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          {t('offers.form.cancel')}
        </Button>
      </div>
    </form>
  )
}

/** TSK-0145 (B1, B4): publish a draft (over a published offer, as its replacement with a reason) or discard it. */
function DraftActions<V>({
  t,
  fetchImpl,
  offer,
  replaces,
  onChanged,
}: {
  t: T
  fetchImpl: Fetch
  offer: Offer
  /** The visit has a published offer: publishing replaces it. */
  replaces: boolean
  onChanged: (d: V | null) => void
}) {
  const [reason, setReason] = useState('')
  const [refusal, setRefusal] = useState<string[] | null>(null)
  const [pending, setPending] = useState(false)
  const key = useRef<string | null>(null)
  async function post(what: 'publish' | 'discard') {
    setPending(true)
    key.current = key.current ?? idempotencyKey()
    const r = await call<V>(fetchImpl, `/staff/window-offers/${encodeURIComponent(offer.id)}/${what}`, {
      method: 'POST',
      headers: { 'idempotency-key': key.current, 'if-match': `"${offer.version}"` },
      body: what === 'publish' && replaces && reason.trim() ? { replaceReason: reason.trim() } : {},
    })
    setPending(false)
    if (r.ok || r.status < 500) key.current = null
    if (!r.ok) {
      if (r.error.code === 'STALE_VERSION') return onChanged(null)
      return setRefusal(
        r.error.fieldErrors.length
          ? [...new Set(r.error.fieldErrors.map((f) => codeLabel(t, 'visitProblem', f.code)))]
          : [codeLabel(t, 'visitProblem', r.error.code)],
      )
    }
    onChanged(r.data)
  }
  return (
    <div data-testid="offer-draft-actions">
      {replaces && offer.actions.publish ? (
        <Field
          label={t('offers.draft.replaceReason')}
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      ) : null}
      {refusal ? <StateView kind="error" title={t('offers.draft.refused')} reasons={refusal} /> : null}
      <div className="hh-button-row">
        {offer.actions.publish ? (
          <Button pending={pending} onClick={() => void post('publish')}>
            {t('offers.draft.publish')}
          </Button>
        ) : null}
        {offer.actions.discard ? (
          <Button variant="secondary" pending={pending} onClick={() => void post('discard')}>
            {t('offers.draft.discard')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function Withdraw<V>({
  t,
  fetchImpl,
  offer,
  onWithdrawn,
}: {
  t: T
  fetchImpl: Fetch
  offer: Offer
  onWithdrawn: (d: V | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [refusal, setRefusal] = useState<string[] | null>(null)
  const [pending, setPending] = useState(false)
  const key = useRef<string | null>(null)
  if (!open)
    return (
      <div className="hh-button-row">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {t('offers.withdraw.open')}
        </Button>
      </div>
    )
  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    key.current = key.current ?? idempotencyKey()
    const r = await call<V>(fetchImpl, `/staff/window-offers/${encodeURIComponent(offer.id)}/withdraw`, {
      method: 'POST',
      headers: { 'idempotency-key': key.current, 'if-match': `"${offer.version}"` },
      body: { reason: reason.trim() },
    })
    setPending(false)
    if (r.ok || r.status < 500) key.current = null
    if (!r.ok) {
      if (r.error.code === 'STALE_VERSION') return onWithdrawn(null)
      return setRefusal(
        r.error.fieldErrors.length
          ? r.error.fieldErrors.map((f) => codeLabel(t, 'visitProblem', f.code))
          : [codeLabel(t, 'visitProblem', r.error.code)],
      )
    }
    onWithdrawn(r.data)
  }
  return (
    <form className="staff-request__form" onSubmit={(e) => void submit(e)}>
      <p className="staff-request__hint">{t('offers.withdraw.hint')}</p>
      <Field label={t('offers.withdraw.reason')} required value={reason} onChange={(e) => setReason(e.target.value)} />
      {refusal ? <StateView kind="error" title={t('offers.withdraw.refused')} reasons={refusal} /> : null}
      <div className="hh-button-row">
        <Button type="submit" pending={pending}>
          {t('offers.withdraw.submit')}
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          {t('offers.form.cancel')}
        </Button>
      </div>
    </form>
  )
}

/** Every offer of a visit, newest first. */
export function VisitOffers<V>({
  t,
  locale,
  fetchImpl,
  offers,
  when,
  onChanged,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  offers: readonly Offer[]
  when: (iso: string) => string
  onChanged: (d: V | null) => void
}) {
  if (offers.length === 0) return null
  const published = offers.some((o) => o.state === 'open')
  return (
    <div data-testid="visit-offers">
      <p>
        <strong>{t('offers.title')}</strong>
      </p>
      <ul className="staff-request__list">
        {offers.map((o) => (
          <li key={o.id} data-testid="visit-offer">
            <p>
              {o.number === null ? t('offers.numberDraft') : t('offers.number', { n: o.number })}{' '}
              <StatusBadge tone={o.state === 'open' || o.state === 'draft' ? 'warning' : 'neutral'}>
                {codeLabel(t, 'windowOfferState', o.state)}
              </StatusBadge>
            </p>
            {o.publishedAt ? (
              <p className="staff-request__hint" data-testid="offer-published">
                {t('offers.published', {
                  name: name(t, o.publishedBy ?? o.offeredBy),
                  time: when(o.publishedAt),
                  hours: o.holdHours,
                })}
              </p>
            ) : o.state === 'draft' || o.state === 'discarded' ? (
              <p className="staff-request__hint" data-testid="offer-draft">
                {t('offers.draftSaved', { name: name(t, o.offeredBy), time: when(o.offeredAt) })}
              </p>
            ) : (
              <p className="staff-request__hint">
                {t('offers.offered', { name: name(t, o.offeredBy), time: when(o.offeredAt), hours: o.holdHours })}
              </p>
            )}
            {o.state === 'open' && o.expiresAt ? (
              <p className="staff-request__hint" data-testid="offer-held">
                {o.held
                  ? t('offers.heldUntil', { time: when(o.expiresAt) })
                  : t('offers.holdEnded', { time: when(o.expiresAt) })}
              </p>
            ) : null}
            <ul className="staff-request__list">
              {o.windows.map((w) => (
                <li key={w.position} data-testid="offer-window-line">
                  {t('offers.window', { n: w.position, window: windowLine(w.window, locale) })}
                  {o.selectedPosition === w.position ? ` ${t('offers.selected')}` : ''}
                </li>
              ))}
            </ul>
            {o.preparationInstructions ? (
              <p className="staff-request__hint">{t('offers.instructions', { text: o.preparationInstructions })}</p>
            ) : null}
            {o.customerNote ? (
              <p data-testid="offer-customer-note">{t('offers.customerNote', { note: o.customerNote })}</p>
            ) : null}
            {o.closedReason && o.closedBy ? (
              <p className="staff-request__hint" data-testid="offer-closed-reason">
                {o.state === 'replaced' && o.replacedByNumber
                  ? t('offers.replacedBy', { n: o.replacedByNumber, name: name(t, o.closedBy), reason: o.closedReason })
                  : t('offers.withdrawnBy', { name: name(t, o.closedBy), reason: o.closedReason })}
              </p>
            ) : null}
            {o.state === 'draft' || o.state === 'discarded' ? null : (
              <div data-testid="offer-notice">
                <p className="staff-request__hint">{t('offers.notice')}</p>
                {o.noticeKey === null ? (
                  <p className="staff-request__hint">{t('offers.notice.none')}</p>
                ) : o.notices.length === 0 ? (
                  <p className="staff-request__hint">{t('offers.notice.pending')}</p>
                ) : (
                  <ul className="staff-request__list">
                    {o.notices.map((n) => (
                      <NoticeLine key={`${n.messageKey}-${n.channel}`} t={t} notice={n} />
                    ))}
                  </ul>
                )}
              </div>
            )}
            {o.actions.publish || o.actions.discard ? (
              <DraftActions<V>
                key={`${o.id}-${o.version}`}
                t={t}
                fetchImpl={fetchImpl}
                offer={o}
                replaces={published}
                onChanged={onChanged}
              />
            ) : null}
            {o.actions.withdraw ? (
              <Withdraw<V> key={`${o.id}-${o.version}`} t={t} fetchImpl={fetchImpl} offer={o} onWithdrawn={onChanged} />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
