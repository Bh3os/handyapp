// The escalation procedure on every job screen: Call 911 and Call Owner (TSK-0129; HH-PKT-09, HH-WORK-13,
// HH-OFF-03, FACT-SVC-ESCALATION-PATH, OWN-DEC-172, OWN-DEC-208, RULE-SAFETY-GATES).
// - Call 911 — Immediate Emergency comes first, a plain phone link that needs nothing else: not the network, not the
//   server, not the Owner's number, not the Owner being reachable. Nothing is ever put in front of it.
// - Call Owner — Report a Problem dials the number the Owner entered in their own staff profile, as the server last
//   answered it (a packet, the job's reports, a recorded tap). This phone keeps that answer, so the call works offline;
//   it is removed at sign-out. While the Owner has entered none it says NOT CONFIGURED and to call 911 in an
//   emergency; a phone that never received an answer says so instead of guessing.
// - Each tap is recorded after the call started (the link is never held back): saved on this phone with its own UUID
//   and sent when the server can be reached, so it is recorded once. "I could not reach the Owner" records that and
//   shows the owner's rule: the affected work stays paused, the area secured if safe, the problem documented; call 911
//   if it becomes dangerous. Nothing here resumes work or changes a hold.
// - The procedure text: the owner-first procedure of OWN-DEC-172 in English and, for Spanish-reading staff, the
//   owner's Spanish instruction exactly as given (item 6).
// - OwnerEscalationPhone: the Owner enters or clears that number on their own account page (fresh sign-in).
import { CALL_911, type EscalationAction, type OwnerContact } from '@handyhub/domain/escalation'
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { Button, Card, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { call, type Fetch } from './api'
import { ReauthForm, useOwnerWrite } from './OwnerWrite'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

const bcp47 = (locale: StaffLocale) => (locale === 'es' ? 'es-US' : 'en-US')
const when = (iso: string, locale: StaffLocale) =>
  new Intl.DateTimeFormat(bcp47(locale), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

// --- The Owner's contact as this phone last received it ---------------------------------------------------------

const CONTACT_KEY = 'hh.staff.ownerContact'
/** The event that tells mounted actions the remembered contact changed. */
export const OWNER_CONTACT_CHANGED = 'hh-owner-contact-changed'

function validContact(c: unknown): OwnerContact | null {
  if (!c || typeof c !== 'object') return null
  const v = c as Record<string, unknown>
  if (v['state'] === 'not_configured') return { state: 'not_configured' }
  if (
    v['state'] === 'configured' &&
    typeof v['phone'] === 'string' &&
    typeof v['display'] === 'string' &&
    typeof v['tel'] === 'string' &&
    v['tel'] === `tel:${v['phone']}` &&
    /^\+1[0-9]{10}$/.test(v['phone'])
  )
    return { state: 'configured', phone: v['phone'], display: v['display'], tel: v['tel'] }
  return null
}

/** Keeps the contact the server answered on this phone (null removes it: sign-out). */
export function rememberOwnerContact(c: OwnerContact | null | undefined): void {
  const valid = validContact(c)
  try {
    const before = window.localStorage.getItem(CONTACT_KEY)
    const after = valid ? JSON.stringify(valid) : null
    if (before === after) return
    if (after) window.localStorage.setItem(CONTACT_KEY, after)
    else window.localStorage.removeItem(CONTACT_KEY)
  } catch {
    // Storage unavailable: the screen still shows what the server answered.
  }
  window.dispatchEvent(new Event(OWNER_CONTACT_CHANGED))
}

/** The contact this phone last received; null when it never received one. */
export function rememberedOwnerContact(): OwnerContact | null {
  try {
    const raw = window.localStorage.getItem(CONTACT_KEY)
    return raw ? validContact(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

/** The contact to show: the one just given (remembered for offline use), else the one this phone kept. */
export function useOwnerContact(given?: OwnerContact | null): OwnerContact | null {
  const [kept, setKept] = useState<OwnerContact | null>(() => rememberedOwnerContact())
  const fresh = validContact(given)
  const freshKey = fresh ? JSON.stringify(fresh) : null
  useEffect(() => {
    if (fresh) rememberOwnerContact(fresh)
  }, [freshKey])
  useEffect(() => {
    const changed = () => setKept(rememberedOwnerContact())
    window.addEventListener(OWNER_CONTACT_CHANGED, changed)
    return () => window.removeEventListener(OWNER_CONTACT_CHANGED, changed)
  }, [])
  return fresh ?? kept
}

// --- Taps saved on this phone -------------------------------------------------------------------------------------

const PENDING_KEY = 'hh.staff.pendingEscalations'
type PendingCall = { clientId: string; jobId: string; body: Record<string, unknown> }
type CallAnswer = { clientId: string; action: EscalationAction; workStaysPaused: boolean; owner: OwnerContact }

function readPending(): PendingCall[] {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY)
    const list = raw ? (JSON.parse(raw) as PendingCall[]) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}
function writePending(list: PendingCall[]): void {
  try {
    if (list.length) window.localStorage.setItem(PENDING_KEY, JSON.stringify(list))
    else window.localStorage.removeItem(PENDING_KEY)
  } catch {
    // Storage unavailable: the tap is sent now or not recorded; the call itself already started.
  }
}

/** Sends one saved tap; one the server did not take stays on this phone, to send again with the same UUID. */
async function sendCall(fetchImpl: Fetch, p: PendingCall) {
  const r = await call<CallAnswer>(fetchImpl, `/staff/jobs/${encodeURIComponent(p.jobId)}/escalation-calls`, {
    method: 'POST',
    body: p.body,
    headers: { 'idempotency-key': `escalation-${p.clientId}` },
  })
  if (r.ok) {
    writePending(readPending().filter((x) => x.clientId !== p.clientId))
    rememberOwnerContact(r.data.owner)
  }
  return r
}

/** How many taps wait on this phone for the server (the sync bar and sign-out count them, TSK-0080). */
export function pendingEscalationCount(): number {
  return readPending().length
}

/** Sends every tap saved on this phone (on load and whenever the phone is back online). */
export async function flushPendingEscalations(fetchImpl: Fetch): Promise<number> {
  let sent = 0
  for (const p of readPending()) if ((await sendCall(fetchImpl, p)).ok) sent++
  return sent
}

/** Saves one tap on this phone, then sends it; never awaited by the call it records. */
export function recordEscalation(
  fetchImpl: Fetch,
  jobId: string,
  action: EscalationAction,
  where: { visitId?: string | undefined; reportId?: string | undefined } = {},
) {
  const p: PendingCall = {
    clientId: globalThis.crypto.randomUUID(),
    jobId,
    body: {
      action,
      ...(where.visitId ? { visitId: where.visitId } : {}),
      ...(where.reportId ? { reportId: where.reportId } : {}),
      deviceRecordedAt: new Date().toISOString(),
    },
  }
  p.body['clientId'] = p.clientId
  writePending([...readPending(), p])
  return sendCall(fetchImpl, p)
}

// --- The actions -------------------------------------------------------------------------------------------------

/** Call Owner — Report a Problem, or why it cannot dial (NOT CONFIGURED; never received on this phone). */
export function OwnerCallLine({ t, contact, onCall }: { t: T; contact: OwnerContact | null; onCall?: () => void }) {
  if (contact?.state === 'configured')
    return (
      <p className="staff-escalation__owner">
        <a
          className="staff-escalation__callOwner"
          href={contact.tel}
          onClick={onCall}
          data-testid="escalation-call-owner"
        >
          {t('escalation.callOwner')}
        </a>{' '}
        <span data-testid="escalation-owner-number">{contact.display}</span>
      </p>
    )
  return (
    <p className="staff-request__hint" data-testid="escalation-owner-not-configured">
      {t(contact ? 'stop.callOwnerNotConfigured' : 'escalation.owner.unknown')}
    </p>
  )
}

/**
 * Call 911 first, then Call Owner and "I could not reach the Owner". Without a job (a screen still loading) the calls
 * work and are not recorded.
 */
export function EscalationActions({
  t,
  fetchImpl,
  jobId,
  visitId,
  reportId,
  owner,
}: {
  t: T
  fetchImpl?: Fetch
  jobId?: string | null
  visitId?: string | null
  reportId?: string | null
  owner?: OwnerContact | null
}) {
  const contact = useOwnerContact(owner)
  const [unreachable, setUnreachable] = useState<'saved' | 'sent' | null>(null)
  const where = { visitId: visitId ?? undefined, reportId: reportId ?? undefined }
  // The call starts at once (the link's own default action); the record follows, never in front of it.
  const tap = (action: EscalationAction) => () => {
    if (fetchImpl && jobId) void recordEscalation(fetchImpl, jobId, action, where)
  }
  async function couldNotReach() {
    setUnreachable('saved')
    if (!fetchImpl || !jobId) return
    const r = await recordEscalation(fetchImpl, jobId, 'owner_unreachable', where)
    setUnreachable(r.ok ? 'sent' : 'saved')
  }
  return (
    <>
      <section className="staff-start__emergency" aria-label={t('start.emergency.title')} data-testid="start-call-911">
        <a className="staff-start__call911" href={CALL_911} onClick={tap('call_911')}>
          {t('start.emergency.call911')}
        </a>
        <p>{t('start.emergency.note')}</p>
      </section>
      <section className="staff-escalation" aria-label={t('escalation.callOwner')} data-testid="escalation-owner">
        <OwnerCallLine t={t} contact={contact} onCall={tap('call_owner')} />
        <p>{t('escalation.owner.note')}</p>
        <Button variant="secondary" onClick={() => void couldNotReach()}>
          {t('escalation.unreachable.button')}
        </Button>
        {unreachable ? (
          <div role="status" data-testid="escalation-unreachable">
            <p>{t('escalation.unreachable.guidance')}</p>
            <p className="staff-request__hint">
              {t(unreachable === 'sent' ? 'escalation.unreachable.recorded' : 'escalation.notSynced')}
            </p>
          </div>
        ) : null}
      </section>
    </>
  )
}

/** The procedure of OWN-DEC-172 as the packet states it: in Spanish the owner's instruction exactly as given. */
export function EscalationProcedure({ t }: { t: T }) {
  return (
    <div className="staff-escalation__procedure" data-testid="escalation-procedure">
      <h3 className="staff-myday__sub">{t('escalation.procedure.title')}</h3>
      <p>{t('escalation.procedure')}</p>
      <p>{t('escalation.unreachable.guidance')}</p>
    </div>
  )
}

export type EscalationCall = {
  clientId: string
  action: EscalationAction
  visitId: string | null
  reportId: string | null
  recordedBy: { id: string; name: string | null }
  deviceRecordedAt: string
  receivedAt: string
}

/** The recorded taps of a job: every one for the Owner, the caller's own for everyone else (the server decides). */
export function EscalationCalls({ t, locale, calls }: { t: T; locale: StaffLocale; calls: EscalationCall[] }) {
  const ids = useId()
  if (!calls.length) return null
  return (
    <section aria-labelledby={`${ids}-calls`} data-testid="escalation-calls">
      <h2 id={`${ids}-calls`} className="staff-myday__sub">
        {t('escalation.calls.title')}
      </h2>
      <ul>
        {calls.map((c) => (
          <li key={c.clientId} data-action={c.action}>
            {t('escalation.calls.item', {
              action: codeLabel(t, 'escalationAction', c.action),
              who: c.recordedBy.name ?? '',
              time: when(c.deviceRecordedAt, locale),
            })}
          </li>
        ))}
      </ul>
    </section>
  )
}

// --- The Owner's own number --------------------------------------------------------------------------------------

type OwnPhone = {
  state: 'CONFIGURED' | 'NOT_CONFIGURED'
  phone: string | null
  display: string | null
  version: number
  updatedAt: string | null
}

/** The escalation number on the Owner's own account page; hidden when the server refuses it (another role). */
export function OwnerEscalationPhone({
  t,
  fetchImpl,
  onSession,
}: {
  t: T
  fetchImpl: Fetch
  onSession?: (s: { csrfToken: string }) => void
}) {
  const [own, setOwn] = useState<OwnPhone | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const w = useOwnerWrite(fetchImpl, onSession)
  useEffect(() => {
    void call<OwnPhone>(fetchImpl, '/staff/profile/escalation-phone').then((r) =>
      setOwn(r.ok && typeof r.data?.state === 'string' ? r.data : null),
    )
  }, [fetchImpl])
  if (!own) return null

  async function save(phone: string | null) {
    if (!own) return
    setSaved(false)
    if (phone !== null && phone.trim() === '') return setError(t('escalation.phone.invalid'))
    setError(null)
    await w.send<OwnPhone>(
      '/staff/profile/escalation-phone',
      { phone },
      (r) => {
        if (!r.ok)
          return setError(
            r.error.fieldErrors.some((f) => f.code === 'invalidPhone')
              ? t('escalation.phone.invalid')
              : r.error.code === 'STALE_VERSION'
                ? t('ownerApproval.stale')
                : t('ownerApproval.failed'),
          )
        setOwn(r.data)
        setText('')
        setSaved(true)
      },
      { 'if-match': `"${own.version}"` },
      'PUT',
    )
  }
  function submit(e: FormEvent) {
    e.preventDefault()
    void save(text)
  }

  return (
    <Card title={t('escalation.phone.title')} headingLevel={2}>
      <div className="staff-auth" data-testid="escalation-phone">
        <p>{t('escalation.phone.intro')}</p>
        {own.state === 'CONFIGURED' && own.display ? (
          <p data-testid="escalation-phone-current">{t('escalation.phone.current', { number: own.display })}</p>
        ) : (
          <p data-testid="escalation-phone-current">
            <StatusBadge tone="warning">{t('businessDetails.notConfigured')}</StatusBadge>{' '}
            {t('escalation.phone.notConfigured')}
          </p>
        )}
        <ReauthForm t={t} w={w} />
        {!w.reauth ? (
          <form className="staff-auth__form" onSubmit={submit} noValidate>
            <Field
              label={t('escalation.phone.label')}
              hint={t('escalation.phone.hint')}
              name="escalationPhone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              value={text}
              maxLength={40}
              onChange={(e) => setText(e.target.value)}
              {...(error ? { error } : {})}
            />
            <div className="hh-button-row">
              <Button type="submit" pending={w.pending}>
                {t('escalation.phone.save')}
              </Button>
              {own.state === 'CONFIGURED' ? (
                <Button variant="secondary" onClick={() => void save(null)}>
                  {t('escalation.phone.clear')}
                </Button>
              ) : null}
            </div>
          </form>
        ) : null}
        {saved ? <StateView kind="success" title={t('escalation.phone.saved')} /> : null}
      </div>
    </Card>
  )
}
