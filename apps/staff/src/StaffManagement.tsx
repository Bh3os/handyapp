// Staff management in the staff app (TSK-0097; HH-STAFF-02, HH-STAFF-03, HH-STAFF-07, S09, OWN-DEC-114,
// OWN-DEC-123). The Owner's Staff screen:
// - the staff list: each person's status, roles and capabilities, sign-in facts (password set, authenticator, live
//   sessions) and upcoming assignments with how many are flagged for review;
// - per person: grant a role or capability (fresh sign-in and a reason), end a grant, start password recovery, revoke
//   every session, disable the account (offboarding: sessions end at once, upcoming assignments go to the action queue
//   for reassignment, nothing is cancelled, history stays) and re-enable it (fresh sign-in and a reason);
// - inviting a person by email with a role;
// - working days, hours and time off, and equipment, stay the capacity screen below (TSK-0062).
// The server decides every request; a refusal is written out. A sensitive action that needs a fresh sign-in asks for
// the password once and is then sent again.
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type Fetch } from './api'
import { AvailabilityScreen } from './Capacity'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

const ROLES = ['owner', 'office', 'estimator', 'worker'] as const
const CAPABILITIES = ['collect'] as const

type By = { staffUserId: string | null; name: string | null; system: boolean } | null

export type MemberSummary = {
  id: string
  displayName: string | null
  email: string
  locale: 'en' | 'es'
  status: 'invited' | 'active' | 'disabled'
  self: boolean
  roles: string[]
  capabilities: string[]
  invitedAt: string
  activatedAt: string | null
  disabledAt: string | null
  passwordSet: boolean
  mfaEnrolled: boolean
  liveSessions: number
  upcomingAssignments: number
  flaggedAssignments: number
  version: number
}

export type MemberDetail = MemberSummary & {
  grants: {
    id: string
    kind: 'role' | 'capability'
    name: string
    issuedBy: By
    reason: string | null
    effectiveFrom: string
    endedAt: string | null
    endedBy: By
  }[]
  statusHistory: { id: string; from: string; to: string; by: By; reason: string | null; at: string }[]
  assignments: {
    reservationId: string
    visitId: string
    requestId: string | null
    reference: string
    purpose: string
    visitState: string
    role: string | null
    kind: string
    startsAt: string
    endsAt: string
    timeZone: string
    flags: string[]
  }[]
}

type Session = { csrfToken: string }

const bcp47 = (locale: StaffLocale) => (locale === 'es' ? 'es-US' : 'en-US')
function when(iso: string, locale: StaffLocale, zone?: string): string {
  return new Intl.DateTimeFormat(bcp47(locale), {
    ...(zone ? { timeZone: zone } : {}),
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(iso))
}

const roleName = (t: T, r: string) => codeLabel(t, 'staffRole', r)
const grantName = (t: T, kind: string, name: string) =>
  kind === 'role' ? roleName(t, name) : codeLabel(t, 'staffCapability', name)
const byName = (t: T, by: By) =>
  by === null ? '' : by.system ? t('staffAdmin.bySystem') : (by.name ?? t('queue.unnamed'))

function problems(t: T, error: ApiErrorBody): string[] {
  const out = error.fieldErrors.map((f) => codeLabel(t, 'staffProblem', f.code))
  return out.length ? out : [codeLabel(t, 'staffProblem', error.code)]
}

const TONE = { invited: 'info', active: 'success', disabled: 'danger' } as const

/**
 * Sends one staff-management write: an idempotency key per attempt; FRESH_AUTH_REQUIRED asks for the password
 * (password re-entry, TSK-0015) and the same write is then sent again once.
 */
function useStaffWrite(fetchImpl: Fetch, t: T, onSession: (s: Session) => void) {
  const key = useRef<string | null>(null)
  const [pending, setPending] = useState(false)
  const [reasons, setReasons] = useState<string[]>([])
  const [reauth, setReauth] = useState<null | (() => Promise<void>)>(null)
  async function send<R>(path: string, body: unknown, onOk: (data: R) => void, idempotent = true): Promise<void> {
    setPending(true)
    key.current = key.current ?? idempotencyKey()
    const r = await call<R>(fetchImpl, path, {
      method: 'POST',
      body,
      headers: idempotent ? { 'idempotency-key': key.current } : {},
    })
    setPending(false)
    if (r.ok || r.status < 500) key.current = null
    if (r.ok) {
      setReasons([])
      setReauth(null)
      onOk(r.data)
      return
    }
    if (r.error.code === 'FRESH_AUTH_REQUIRED') {
      setReasons([])
      setReauth(() => () => send(path, body, onOk, idempotent))
      return
    }
    setReasons(problems(t, r.error))
  }
  async function confirmPassword(password: string): Promise<boolean> {
    const r = await call<Session>(fetchImpl, '/staff/auth/reauth', { method: 'POST', body: { password } })
    if (!r.ok) {
      setReasons([
        codeLabel(t, 'staffProblem', r.error.code === 'INVALID_CREDENTIALS' ? 'FRESH_AUTH_REQUIRED' : r.error.code),
      ])
      return false
    }
    onSession(r.data)
    const retry = reauth
    setReauth(null)
    if (retry) await retry()
    return true
  }
  return { send, pending, reasons, reauth: reauth !== null, confirmPassword, cancel: () => setReauth(null) }
}

type Write = ReturnType<typeof useStaffWrite>

/** The password prompt of a write that needs a fresh sign-in, and the write's refusal. */
function WriteState({ t, w }: { t: T; w: Write }) {
  const [password, setPassword] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (await w.confirmPassword(password)) setPassword('')
  }
  return (
    <>
      {w.reasons.length ? <StateView kind="error" title={t('staffAdmin.refused')} reasons={w.reasons} /> : null}
      {w.reauth ? (
        <form className="staff-auth__form" onSubmit={(e) => void submit(e)} data-testid="staff-reauth">
          <p>{t('staffAdmin.reauthIntro')}</p>
          <Field
            label={t('signIn.password')}
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="hh-button-row">
            <Button type="submit">{t('security.reauthSubmit')}</Button>
            <Button variant="quiet" onClick={w.cancel}>
              {t('staffAdmin.cancel')}
            </Button>
          </div>
        </form>
      ) : null}
    </>
  )
}

function Section({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  const id = useId()
  return (
    <section className="staff-request__section" aria-labelledby={id} {...(testId ? { 'data-testid': testId } : {})}>
      <h3 id={id}>{title}</h3>
      {children}
    </section>
  )
}

function GrantForm({
  t,
  member,
  w,
  onDone,
}: {
  t: T
  member: MemberDetail
  w: Write
  onDone: (m: MemberDetail) => void
}) {
  const ids = useId()
  const options = [
    ...ROLES.filter((r) => !member.roles.includes(r)).map((r) => ({ value: `role:${r}`, label: roleName(t, r) })),
    ...CAPABILITIES.filter((c) => !member.capabilities.includes(c)).map((c) => ({
      value: `capability:${c}`,
      label: codeLabel(t, 'staffCapability', c),
    })),
  ]
  const [choice, setChoice] = useState(options[0]?.value ?? '')
  const [reason, setReason] = useState('')
  if (!options.length) return null
  async function submit(e: FormEvent) {
    e.preventDefault()
    const [kind, name] = choice.split(':')
    await w.send<MemberDetail>(
      `/staff/members/${encodeURIComponent(member.id)}/grants`,
      { kind, name, reason },
      (m) => (setReason(''), onDone(m)),
    )
  }
  return (
    <form className="staff-request__form" onSubmit={(e) => void submit(e)} aria-labelledby={`${ids}-grant`}>
      <h4 id={`${ids}-grant`}>{t('staffAdmin.grant.title')}</h4>
      <p className="staff-request__hint">{t('staffAdmin.grant.hint')}</p>
      <div className="staff-queue__select">
        <label htmlFor={`${ids}-choice`}>{t('staffAdmin.grant.choice')}</label>
        <select id={`${ids}-choice`} value={choice} onChange={(e) => setChoice(e.currentTarget.value)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <Field
        label={t('staffAdmin.reasonRequired')}
        required
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="hh-button-row">
        <Button type="submit" pending={w.pending}>
          {t('staffAdmin.grant.submit')}
        </Button>
      </div>
    </form>
  )
}

function MemberRecord({
  t,
  locale,
  fetchImpl,
  id,
  onSession,
  onChanged,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  id: string
  onSession: (s: Session) => void
  onChanged: () => void
}) {
  const [member, setMember] = useState<MemberDetail | null | undefined>(undefined)
  const [notice, setNotice] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [confirmDisable, setConfirmDisable] = useState(false)
  const w = useStaffWrite(fetchImpl, t, onSession)
  useEffect(() => {
    void call<MemberDetail>(fetchImpl, `/staff/members/${encodeURIComponent(id)}`).then((r) =>
      setMember(r.ok ? r.data : null),
    )
  }, [fetchImpl, id])
  if (member === undefined) return <StateView kind="loading" title={t('common.loading')} />
  if (member === null) return <StateView kind="error" title={t('staffAdmin.unavailable')} />
  const m = member
  const path = (action: string) => `/staff/members/${encodeURIComponent(m.id)}/${action}`
  const changed = (next: MemberDetail, message: string) => {
    setMember(next)
    setNotice(message)
    setReason('')
    setConfirmDisable(false)
    onChanged()
  }
  const live = m.grants.filter((g) => g.endedAt === null)
  const ended = m.grants.filter((g) => g.endedAt !== null)
  return (
    <div className="staff-request__form" data-testid="staff-member-record">
      {notice ? <StateView kind="success" title={notice} /> : null}
      <WriteState t={t} w={w} />
      <Section title={t('staffAdmin.grants.title')} testId="staff-grants">
        <ul className="staff-request__list">
          {live.map((g) => (
            <li key={g.id}>
              {t('staffAdmin.grants.live', {
                name: grantName(t, g.kind, g.name),
                by: byName(t, g.issuedBy),
                at: when(g.effectiveFrom, locale),
              })}{' '}
              <Button
                variant="secondary"
                pending={w.pending}
                onClick={() =>
                  void w.send<MemberDetail>(
                    path('grants/end'),
                    { kind: g.kind, name: g.name, ...(reason.trim() ? { reason: reason.trim() } : {}) },
                    (next) => changed(next, t('staffAdmin.grants.ended')),
                  )
                }
              >
                {t('staffAdmin.grants.end', { name: grantName(t, g.kind, g.name) })}
              </Button>
            </li>
          ))}
        </ul>
        {ended.length ? (
          <ul className="staff-request__list" data-testid="staff-grants-ended">
            {ended.map((g) => (
              <li key={g.id}>
                {t('staffAdmin.grants.history', {
                  name: grantName(t, g.kind, g.name),
                  from: when(g.effectiveFrom, locale),
                  to: when(g.endedAt as string, locale),
                  by: byName(t, g.endedBy),
                })}
              </li>
            ))}
          </ul>
        ) : null}
      </Section>
      {m.status !== 'disabled' ? (
        <GrantForm
          key={m.version}
          t={t}
          member={m}
          w={w}
          onDone={(next) => changed(next, t('staffAdmin.grant.done'))}
        />
      ) : null}
      <Section title={t('staffAdmin.assignments.title')} testId="staff-assignments">
        {m.assignments.length === 0 ? <p>{t('staffAdmin.assignments.none')}</p> : null}
        <ul className="staff-request__list">
          {m.assignments.map((a) => (
            <li key={a.reservationId}>
              {t('staffAdmin.assignments.entry', {
                reference: a.reference,
                from: when(a.startsAt, locale, a.timeZone),
                state: codeLabel(t, 'reservationKind', a.kind),
              })}
              {a.flags.length ? ` (${a.flags.map((f) => codeLabel(t, 'reservationFlag', f)).join('; ')})` : ''}
            </li>
          ))}
        </ul>
      </Section>
      {m.statusHistory.length ? (
        <Section title={t('staffAdmin.history.title')} testId="staff-status-history">
          <ul className="staff-request__list">
            {m.statusHistory.map((h) => (
              <li key={h.id}>
                {t('staffAdmin.history.entry', {
                  to: codeLabel(t, 'staffStatus', h.to),
                  at: when(h.at, locale),
                  by: byName(t, h.by),
                })}
                {h.reason ? ` ${t('staffAdmin.history.reason', { reason: h.reason })}` : ''}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      <Section title={t('staffAdmin.access.title')} testId="staff-access">
        <Field
          label={m.status === 'disabled' ? t('staffAdmin.reasonRequired') : t('staffAdmin.reasonOptional')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          {...(m.status === 'disabled' ? { required: true } : {})}
        />
        {m.status === 'disabled' ? (
          <div className="hh-button-row">
            <Button
              pending={w.pending}
              onClick={() =>
                void w.send<{ member: MemberDetail; linkSent: string }>(path('enable'), { reason }, (out) =>
                  changed(out.member, t('staffAdmin.enable.done')),
                )
              }
            >
              {t('staffAdmin.enable.submit')}
            </Button>
          </div>
        ) : (
          <>
            <div className="hh-button-row">
              <Button
                variant="secondary"
                pending={w.pending}
                onClick={() =>
                  void w.send<{ member: MemberDetail; linkSent: string }>(path('password-recovery'), {}, (out) =>
                    changed(out.member, t('staffAdmin.recovery.done')),
                  )
                }
              >
                {t('staffAdmin.recovery.submit')}
              </Button>
              <Button
                variant="secondary"
                pending={w.pending}
                onClick={() =>
                  void w.send<{ sessionsRevoked: number }>(
                    `/staff/${encodeURIComponent(m.id)}/sessions/revoke`,
                    undefined,
                    (out) => (setNotice(t('staffAdmin.sessions.done', { n: out.sessionsRevoked })), onChanged()),
                    false,
                  )
                }
              >
                {t('staffAdmin.sessions.submit')}
              </Button>
              {m.self ? null : (
                <Button variant="danger" onClick={() => setConfirmDisable(true)}>
                  {t('staffAdmin.disable.submit')}
                </Button>
              )}
            </div>
            {confirmDisable ? (
              <div data-testid="staff-disable-confirm">
                <StateView
                  kind="stale"
                  title={t('staffAdmin.disable.confirmTitle', { name: m.displayName ?? m.email })}
                  reasons={[t('staffAdmin.disable.effectSessions'), t('staffAdmin.disable.effectAssignments')]}
                />
                <div className="hh-button-row">
                  <Button
                    variant="danger"
                    pending={w.pending}
                    onClick={() =>
                      void w.send<{ member: MemberDetail; sessionsRevoked: number; flagged: number }>(
                        path('disable'),
                        reason.trim() ? { reason: reason.trim() } : {},
                        (out) =>
                          changed(
                            out.member,
                            t('staffAdmin.disable.done', { sessions: out.sessionsRevoked, flagged: out.flagged }),
                          ),
                      )
                    }
                  >
                    {t('staffAdmin.disable.confirm')}
                  </Button>
                  <Button variant="quiet" onClick={() => setConfirmDisable(false)}>
                    {t('staffAdmin.cancel')}
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </Section>
    </div>
  )
}

function InviteForm({
  t,
  fetchImpl,
  onSession,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  onSession: (s: Session) => void
  onDone: () => void
}) {
  const ids = useId()
  const empty = { email: '', displayName: '', role: 'worker', locale: 'en', reason: '' }
  const [f, setF] = useState(empty)
  const [sent, setSent] = useState(false)
  const w = useStaffWrite(fetchImpl, t, onSession)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setSent(false)
    await w.send('/staff/invitations', f, () => (setF(empty), setSent(true), onDone()))
  }
  return (
    <form className="staff-request__form" onSubmit={(e) => void submit(e)} aria-labelledby={`${ids}-invite`}>
      <h2 id={`${ids}-invite`} className="staff-queue__heading">
        {t('staffAdmin.invite.title')}
      </h2>
      <p className="staff-request__hint">{t('staffAdmin.invite.hint')}</p>
      <Field
        label={t('signIn.email')}
        type="email"
        required
        value={f.email}
        onChange={(e) => setF({ ...f, email: e.target.value })}
      />
      <Field
        label={t('staffAdmin.invite.name')}
        required
        value={f.displayName}
        onChange={(e) => setF({ ...f, displayName: e.target.value })}
      />
      <div className="staff-queue__select">
        <label htmlFor={`${ids}-role`}>{t('staffAdmin.invite.role')}</label>
        <select id={`${ids}-role`} value={f.role} onChange={(e) => setF({ ...f, role: e.currentTarget.value })}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {roleName(t, r)}
            </option>
          ))}
        </select>
      </div>
      <div className="staff-queue__select">
        <label htmlFor={`${ids}-locale`}>{t('staffAdmin.invite.locale')}</label>
        <select id={`${ids}-locale`} value={f.locale} onChange={(e) => setF({ ...f, locale: e.currentTarget.value })}>
          <option value="en">{t('language.en')}</option>
          <option value="es">{t('language.es')}</option>
        </select>
      </div>
      <Field
        label={t('staffAdmin.reasonRequired')}
        required
        value={f.reason}
        onChange={(e) => setF({ ...f, reason: e.target.value })}
      />
      <WriteState t={t} w={w} />
      {sent ? <StateView kind="success" title={t('staffAdmin.invite.sent')} /> : null}
      <div className="hh-button-row">
        <Button type="submit" pending={w.pending}>
          {t('staffAdmin.invite.submit')}
        </Button>
      </div>
    </form>
  )
}

/** The Staff screen (Owner): the staff list, invites, roles, offboarding; then working hours and equipment. */
export function StaffScreen({
  t,
  locale,
  fetchImpl,
  onSession,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  onSession: (s: Session) => void
}) {
  const [members, setMembers] = useState<MemberSummary[] | null | undefined>(undefined)
  const [open, setOpen] = useState<string | null>(null)
  const [hoursKey, setHoursKey] = useState(0)
  const load = useCallback(async () => {
    const r = await call<{ members: MemberSummary[] }>(fetchImpl, '/staff/members')
    setMembers(r.ok ? r.data.members : null)
  }, [fetchImpl])
  useEffect(() => {
    void load()
  }, [load])
  const refresh = () => (void load(), setHoursKey((k) => k + 1))
  return (
    <section className="staff-screen" aria-labelledby="staff-admin-title" data-testid="staff-admin">
      <h1 id="staff-admin-title" className="hh-h3">
        {t('staffAdmin.title')}
      </h1>
      <p className="staff-request__hint">{t('staffAdmin.hint')}</p>
      {members === undefined ? <StateView kind="loading" title={t('common.loading')} /> : null}
      {members === null ? <StateView kind="error" title={t('staffAdmin.unavailable')} /> : null}
      {members ? (
        <ul className="staff-request__list" aria-label={t('staffAdmin.list')}>
          {members.map((m) => (
            <li key={m.id} data-testid="staff-member">
              <h2 className="staff-queue__heading">{m.displayName ?? m.email}</h2>
              <p>
                <StatusBadge tone={TONE[m.status]}>{codeLabel(t, 'staffStatus', m.status)}</StatusBadge> {m.email}
              </p>
              <p data-testid="staff-member-roles">
                {t('staffAdmin.roles', {
                  roles:
                    [
                      ...m.roles.map((r) => roleName(t, r)),
                      ...m.capabilities.map((c) => codeLabel(t, 'staffCapability', c)),
                    ].join(', ') || t('staffAdmin.noRoles'),
                })}
              </p>
              <p>
                {[
                  m.passwordSet ? t('staffAdmin.passwordSet') : t('staffAdmin.passwordNotSet'),
                  m.mfaEnrolled ? t('staffAdmin.mfaOn') : t('staffAdmin.mfaOff'),
                  t('staffAdmin.liveSessions', { n: m.liveSessions }),
                  t('staffAdmin.upcoming', { n: m.upcomingAssignments, flagged: m.flaggedAssignments }),
                ].join(' · ')}
              </p>
              <Button variant="secondary" onClick={() => setOpen(open === m.id ? null : m.id)}>
                {open === m.id ? t('staffAdmin.close') : t('staffAdmin.manage', { name: m.displayName ?? m.email })}
              </Button>
              {open === m.id ? (
                <MemberRecord
                  key={m.id}
                  t={t}
                  locale={locale}
                  fetchImpl={fetchImpl}
                  id={m.id}
                  onSession={onSession}
                  onChanged={refresh}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <InviteForm t={t} fetchImpl={fetchImpl} onSession={onSession} onDone={refresh} />
      <AvailabilityScreen key={hoursKey} t={t} locale={locale} fetchImpl={fetchImpl} headingLevel={2} />
    </section>
  )
}
