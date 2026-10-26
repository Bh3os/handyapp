// Help with customer access (TSK-0149; OWN-DEC-198 F2, F4, F5, F6; HH-ID-11, HH-ID-09, RULE-SERVER-AUTHZ). The Owner's
// screen below the privacy requests (/access-help, and one request at /access-help/<id> from the staff queue).
// - The requests visitors sent for help signing in or getting a new project link: what they typed (the email or phone,
//   the reference) and what it points to. The visitor got the same answer whatever matched; the Owner verifies the
//   person's identity through the contact details on file before doing anything, and closes the request once with an
//   outcome and a note.
// - A lookup by email, phone or reference shows the same matches without a request (a customer who called).
// - What the Owner can do: end every session of an account (a written reason), start a staff-assisted recovery with a
//   new sign-in email (how identity was verified; it completes when the customer enters the code sent to that email),
//   cancel it, or send a project's contact on file a new link (also after a link staff revoked). The server decides
//   every request; the words come from the staff catalogs.
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type Fetch } from './api'
import { codeLabel } from './Requests'
import { useOnline } from './Shell'

type T = (key: StaffKey, values?: Record<string, string | number | Date>) => string

export type AccountMatch = {
  id: string
  email: string | null
  phone: string | null
  createdAt: string
  liveSessions: number
  projects: string[]
  recovery: { id: string; email: string; expiresAt: string } | null
}
export type ProjectMatch = {
  id: string
  reference: string
  matchedBy: ('reference' | 'email' | 'phone')[]
  contact: { name: string; email: string; phone: string }
  link: { state: 'live' | 'expired' | 'revoked' | 'none'; revokeReason: string | null; expiresAt: string | null }
  reissuesToday: number
  reissueLimit: number | null
}
export type Matches = { accounts: AccountMatch[]; projects: ProjectMatch[] }
export type HelpRequest = {
  id: string
  kind: 'sign_in' | 'project_link'
  channel: 'email' | 'phone'
  contact: string
  reference: string | null
  createdAt: string
  state: 'open' | 'closed'
  outcome: string | null
  note: string | null
  closedBy: { id: string; name: string | null } | null
  closedAt: string | null
  version: number
}
export type HelpDetail = HelpRequest & { matches: Matches }

const OUTCOMES = ['access_restored', 'identity_not_verified', 'no_match', 'no_action'] as const
const LINK_TONE = { live: 'success', expired: 'neutral', revoked: 'warning', none: 'neutral' } as const

/** A refusal in the Owner's words: the first field's code, else the error code. */
export function helpRefusal(t: T, error: ApiErrorBody): string {
  const f = error.fieldErrors[0]
  return codeLabel(t, 'accessHelpRefusal', f ? f.code : error.code)
}

/** One write with its idempotency key, kept for a retry after a server failure. */
function useWrite(fetchImpl: Fetch) {
  const key = useRef<string | null>(null)
  const [pending, setPending] = useState(false)
  async function send<R>(path: string, body: unknown) {
    setPending(true)
    key.current ??= idempotencyKey()
    const r = await call<R>(fetchImpl, path, { method: 'POST', body, headers: { 'idempotency-key': key.current } })
    setPending(false)
    if (r.ok || r.status < 500) key.current = null
    return r
  }
  return { send, pending }
}

type FieldSpec = { name: string; label: StaffKey; hint?: StaffKey; multiline?: boolean; type?: string }

/**
 * A button that opens a small form of required texts and sends it once; the server's refusal is shown in words. The
 * form closes after a success and says what happened.
 */
function ActionForm<R>({
  t,
  label,
  hint,
  fields,
  path,
  body,
  done,
  fetchImpl,
  onDone,
  testId,
}: {
  t: T
  label: StaffKey
  hint: StaffKey
  fields: FieldSpec[]
  path: string
  body: (values: Record<string, string>) => unknown
  done: (data: R) => string
  fetchImpl: Fetch
  onDone: () => void
  testId: string
}) {
  const online = useOnline()
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const [problem, setProblem] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const { send, pending } = useWrite(fetchImpl)
  async function submit() {
    if (fields.some((f) => !(values[f.name] ?? '').trim())) return setProblem(t('accessHelp.required'))
    setProblem(null)
    const r = await send<R>(path, body(values))
    if (!r.ok) return setProblem(helpRefusal(t, r.error))
    setOpen(false)
    setValues({})
    setMessage(done(r.data))
    onDone()
  }
  return (
    <div data-testid={testId}>
      {!open ? (
        <div className="hh-button-row">
          <Button
            variant="secondary"
            onClick={() => (setOpen(true), setMessage(null))}
            {...(!online ? { disabledReason: t('offline.needsConnection') } : {})}
          >
            {t(label)}
          </Button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
          noValidate
          aria-label={t(label)}
        >
          <p className="staff-request__hint">{t(hint)}</p>
          {fields.map((f) => {
            const common = {
              label: t(f.label),
              ...(f.hint ? { hint: t(f.hint) } : {}),
              name: f.name,
              maxLength: 2000,
              value: values[f.name] ?? '',
              required: true,
            }
            const change = (value: string) => setValues((v) => ({ ...v, [f.name]: value }))
            return f.multiline ? (
              <Field key={f.name} {...common} multiline onChange={(e) => change(e.target.value)} />
            ) : (
              <Field
                key={f.name}
                {...common}
                {...(f.type ? { type: f.type } : {})}
                onChange={(e) => change(e.target.value)}
              />
            )
          })}
          <div className="hh-button-row">
            <Button
              type="submit"
              pending={pending}
              {...(!online ? { disabledReason: t('offline.needsConnection') } : {})}
            >
              {t(label)}
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('accessHelp.cancel')}
            </Button>
          </div>
        </form>
      )}
      {problem ? (
        <p role="alert" className="hh-field__error">
          {problem}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="staff-request__hint">
          {message}
        </p>
      ) : null}
    </div>
  )
}

const bcp47 = (locale: StaffLocale) => (locale === 'es' ? 'es-US' : 'en-US')

/** What a contact or reference points to, with the Owner's actions on each account and project. */
export function MatchesView({
  t,
  locale,
  matches,
  fetchImpl,
  helpRequestId,
  onChanged,
}: {
  t: T
  locale: StaffLocale
  matches: Matches
  fetchImpl: Fetch
  helpRequestId: string | null
  onChanged: () => void
}) {
  const time = new Intl.DateTimeFormat(bcp47(locale), { dateStyle: 'medium', timeStyle: 'short' })
  const help = helpRequestId ? { helpRequestId } : {}
  return (
    <div data-testid="access-help-matches">
      <h3 className="staff-queue__heading">{t('accessHelp.accounts')}</h3>
      {matches.accounts.length ? (
        <ul className="staff-deposit__payments" aria-label={t('accessHelp.accounts')}>
          {matches.accounts.map((a) => (
            <li key={a.id} data-testid="access-help-account">
              <strong>{[a.email, a.phone].filter(Boolean).join(' · ')}</strong>
              <br />
              {t('accessHelp.account.summary', {
                sessions: a.liveSessions,
                projects: a.projects.length ? a.projects.join(', ') : t('accessHelp.none'),
              })}
              {a.recovery ? (
                <>
                  <br />
                  <StatusBadge tone="warning">{t('accessHelp.recovery.pending')}</StatusBadge>{' '}
                  {t('accessHelp.recovery.waiting', {
                    email: a.recovery.email,
                    time: time.format(new Date(a.recovery.expiresAt)),
                  })}
                </>
              ) : null}
              <ActionForm<{ endedSessions: number }>
                t={t}
                label="accessHelp.signOut"
                hint="accessHelp.signOut.hint"
                fields={[{ name: 'reason', label: 'accessHelp.reason', multiline: true }]}
                path={`/staff/customer-accounts/${encodeURIComponent(a.id)}/sign-out-everywhere`}
                body={(v) => ({ reason: (v['reason'] ?? '').trim() })}
                done={(d) => t('accessHelp.signOut.done', { n: d.endedSessions })}
                fetchImpl={fetchImpl}
                onDone={onChanged}
                testId="access-help-sign-out"
              />
              <ActionForm<{ endedSessions: number }>
                t={t}
                label="accessHelp.recovery.start"
                hint="accessHelp.recovery.hint"
                fields={[
                  { name: 'email', label: 'accessHelp.recovery.email', type: 'email' },
                  { name: 'evidence', label: 'accessHelp.evidence', hint: 'accessHelp.evidence.hint', multiline: true },
                ]}
                path={`/staff/customer-accounts/${encodeURIComponent(a.id)}/recovery`}
                body={(v) => ({ email: (v['email'] ?? '').trim(), evidence: (v['evidence'] ?? '').trim(), ...help })}
                done={(d) => t('accessHelp.recovery.started', { n: d.endedSessions })}
                fetchImpl={fetchImpl}
                onDone={onChanged}
                testId="access-help-recovery"
              />
              {a.recovery ? <CancelRecovery t={t} accountId={a.id} fetchImpl={fetchImpl} onDone={onChanged} /> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="hh-muted">{t('accessHelp.noAccounts')}</p>
      )}
      <h3 className="staff-queue__heading">{t('accessHelp.projects')}</h3>
      {matches.projects.length ? (
        <ul className="staff-deposit__payments" aria-label={t('accessHelp.projects')}>
          {matches.projects.map((p) => (
            <li key={p.id} data-testid="access-help-project">
              <strong>{p.reference}</strong>{' '}
              <StatusBadge tone={LINK_TONE[p.link.state]}>{codeLabel(t, 'accessLinkState', p.link.state)}</StatusBadge>
              {p.link.revokeReason ? ` · ${codeLabel(t, 'accessRevokeReason', p.link.revokeReason)}` : ''}
              <br />
              {t('accessHelp.project.contact', {
                name: p.contact.name,
                email: p.contact.email,
                phone: p.contact.phone,
              })}
              <br />
              {p.matchedBy.length
                ? t('accessHelp.project.matched', {
                    by: p.matchedBy.map((m) => codeLabel(t, 'accessMatch', m)).join(', '),
                  })
                : t('accessHelp.project.earlier')}
              {' · '}
              {p.reissueLimit === null
                ? t('accessHelp.project.reissues', { n: p.reissuesToday })
                : t('accessHelp.project.reissuesOf', { n: p.reissuesToday, limit: p.reissueLimit })}
              <ActionForm<{ sentTo: string }>
                t={t}
                label="accessHelp.link.send"
                hint="accessHelp.link.hint"
                fields={[
                  { name: 'evidence', label: 'accessHelp.evidence', hint: 'accessHelp.evidence.hint', multiline: true },
                ]}
                path={`/staff/projects/${encodeURIComponent(p.id)}/access-link`}
                body={(v) => ({ evidence: (v['evidence'] ?? '').trim(), ...help })}
                done={(d) => t('accessHelp.link.sent', { destination: d.sentTo })}
                fetchImpl={fetchImpl}
                onDone={onChanged}
                testId="access-help-link"
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="hh-muted">{t('accessHelp.noProjects')}</p>
      )}
    </div>
  )
}

function CancelRecovery({
  t,
  accountId,
  fetchImpl,
  onDone,
}: {
  t: T
  accountId: string
  fetchImpl: Fetch
  onDone: () => void
}) {
  const online = useOnline()
  const [problem, setProblem] = useState<string | null>(null)
  const { send, pending } = useWrite(fetchImpl)
  return (
    <div className="hh-button-row">
      <Button
        variant="secondary"
        pending={pending}
        onClick={() =>
          void send(`/staff/customer-accounts/${encodeURIComponent(accountId)}/recovery/cancel`, {}).then((r) =>
            r.ok ? onDone() : setProblem(helpRefusal(t, r.error)),
          )
        }
        {...(!online ? { disabledReason: t('offline.needsConnection') } : {})}
      >
        {t('accessHelp.recovery.cancel')}
      </Button>
      {problem ? (
        <p role="alert" className="hh-field__error">
          {problem}
        </p>
      ) : null}
    </div>
  )
}

function Close({ t, id, fetchImpl, onDone }: { t: T; id: string; fetchImpl: Fetch; onDone: () => void }) {
  const ids = useId()
  const online = useOnline()
  const [outcome, setOutcome] = useState<string>(OUTCOMES[0])
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const { send, pending } = useWrite(fetchImpl)
  async function submit() {
    if (!note.trim()) return setProblem(t('accessHelp.required'))
    setProblem(null)
    const r = await send(`/staff/access-help/${encodeURIComponent(id)}/close`, { outcome, note: note.trim() })
    if (!r.ok) return setProblem(helpRefusal(t, r.error))
    onDone()
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
      noValidate
      aria-label={t('accessHelp.close')}
      data-testid="access-help-close"
    >
      <div className="staff-queue__select">
        <label htmlFor={`${ids}-outcome`}>{t('accessHelp.outcome')}</label>
        <select id={`${ids}-outcome`} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
          {OUTCOMES.map((o) => (
            <option key={o} value={o}>
              {codeLabel(t, 'accessHelpOutcome', o)}
            </option>
          ))}
        </select>
      </div>
      <Field
        label={t('accessHelp.note')}
        hint={t('accessHelp.note.hint')}
        name="accessHelpNote"
        multiline
        maxLength={2000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        required
      />
      <Button type="submit" pending={pending} {...(!online ? { disabledReason: t('offline.needsConnection') } : {})}>
        {t('accessHelp.close')}
      </Button>
      {problem ? (
        <p role="alert" className="hh-field__error">
          {problem}
        </p>
      ) : null}
    </form>
  )
}

function RequestLine({ t, locale, r }: { t: T; locale: StaffLocale; r: HelpRequest }) {
  const time = new Intl.DateTimeFormat(bcp47(locale), { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <>
      <strong>{codeLabel(t, 'queueReason', r.kind)}</strong>{' '}
      <StatusBadge tone={r.state === 'open' ? 'warning' : 'success'}>
        {r.outcome ? codeLabel(t, 'accessHelpOutcome', r.outcome) : t('accessHelp.open')}
      </StatusBadge>
      <br />
      {/* What the visitor typed, as typed: never proof of who they are. */}
      {[r.contact, r.reference].filter(Boolean).join(' · ')} · {time.format(new Date(r.createdAt))}
      {r.closedAt ? (
        <>
          <br />
          {t('accessHelp.closedBy', { name: r.closedBy?.name ?? t('queue.unnamed'), time: new Date(r.closedAt) })}{' '}
          {r.note}
        </>
      ) : null}
    </>
  )
}

function Lookup({ t, locale, fetchImpl }: { t: T; locale: StaffLocale; fetchImpl: Fetch }) {
  const [contact, setContact] = useState('')
  const [reference, setReference] = useState('')
  const [matches, setMatches] = useState<Matches | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function find() {
    const q = new URLSearchParams()
    if (contact.trim()) q.set('contact', contact.trim())
    if (reference.trim()) q.set('reference', reference.trim())
    if (!q.toString()) return setProblem(t('accessHelp.lookup.required'))
    setProblem(null)
    setBusy(true)
    const r = await call<Matches>(fetchImpl, `/staff/access-help/lookup?${q.toString()}`)
    setBusy(false)
    if (!r.ok) return setProblem(helpRefusal(t, r.error))
    setMatches(r.data)
  }
  return (
    <section aria-label={t('accessHelp.lookup')} data-testid="access-help-lookup">
      <h2 className="staff-queue__heading">{t('accessHelp.lookup')}</h2>
      <form
        className="staff-queue__filters"
        onSubmit={(e) => {
          e.preventDefault()
          void find()
        }}
        noValidate
      >
        <Field
          label={t('accessHelp.lookup.contact')}
          name="accessHelpContact"
          maxLength={320}
          value={contact}
          onChange={(e) => setContact(e.target.value)}
        />
        <Field
          label={t('accessHelp.lookup.reference')}
          name="accessHelpReference"
          maxLength={40}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
        <Button type="submit" variant="secondary" pending={busy}>
          {t('accessHelp.lookup.find')}
        </Button>
      </form>
      {problem ? (
        <p role="alert" className="hh-field__error">
          {problem}
        </p>
      ) : null}
      {matches ? (
        <MatchesView
          t={t}
          locale={locale}
          matches={matches}
          fetchImpl={fetchImpl}
          helpRequestId={null}
          onChanged={() => void find()}
        />
      ) : null}
    </section>
  )
}

/** One help request with what it points to, the actions and the close form (the staff queue's link). */
function HelpRequestPage({ t, locale, id, fetchImpl }: { t: T; locale: StaffLocale; id: string; fetchImpl: Fetch }) {
  const [d, setD] = useState<HelpDetail | null | undefined>(undefined)
  const load = useCallback(async () => {
    const r = await call<HelpDetail>(fetchImpl, `/staff/access-help/${encodeURIComponent(id)}`)
    setD(r.ok ? r.data : null)
  }, [fetchImpl, id])
  useEffect(() => {
    void load()
  }, [load])
  if (d === undefined) return <StateView kind="loading" title={t('common.loading')} />
  if (d === null) return <StateView kind="blocked" title={t('record.notFound')} />
  return (
    <div data-testid="access-help-request">
      <p>
        <RequestLine t={t} locale={locale} r={d} />
      </p>
      <MatchesView
        t={t}
        locale={locale}
        matches={d.matches}
        fetchImpl={fetchImpl}
        helpRequestId={d.id}
        onChanged={() => void load()}
      />
      {d.state === 'open' ? <Close t={t} id={d.id} fetchImpl={fetchImpl} onDone={() => void load()} /> : null}
    </div>
  )
}

export function AccessHelpScreen({
  t,
  locale,
  fetchImpl,
  href,
  requestId,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  href: (path: string) => string
  /** One request, from the staff queue's link. */
  requestId?: string
}) {
  const ids = useId()
  const [data, setData] = useState<{ open: HelpRequest[]; closed: HelpRequest[] } | null | undefined>(undefined)
  useEffect(() => {
    if (requestId) return
    void call<{ open: HelpRequest[]; closed: HelpRequest[] }>(fetchImpl, '/staff/access-help').then((r) =>
      setData(r.ok ? r.data : null),
    )
  }, [fetchImpl, requestId])
  return (
    <section className="staff-screen staff-request" aria-labelledby={`${ids}-title`} data-testid="access-help">
      <h1 id={`${ids}-title`} className="hh-h3">
        {t('accessHelp.title')}
      </h1>
      <p className="staff-request__hint">{t('accessHelp.hint')}</p>
      {requestId ? (
        <>
          <HelpRequestPage key={requestId} t={t} locale={locale} id={requestId} fetchImpl={fetchImpl} />
          <p>
            <a href={href('/access-help')}>{t('accessHelp.all')}</a>
          </p>
        </>
      ) : data === undefined ? (
        <StateView kind="loading" title={t('common.loading')} />
      ) : data === null ? (
        <StateView kind="blocked" title={t('record.notFound')} />
      ) : (
        <>
          <h2 className="staff-queue__heading">{t('accessHelp.openTitle')}</h2>
          {data.open.length ? (
            <ul className="staff-deposit__payments" aria-label={t('accessHelp.openTitle')}>
              {data.open.map((r) => (
                <li key={r.id} data-testid="access-help-item">
                  <RequestLine t={t} locale={locale} r={r} />{' '}
                  <a href={href(`/access-help/${r.id}`)}>{t('accessHelp.openRequest')}</a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hh-muted">{t('accessHelp.none')}</p>
          )}
          <Lookup t={t} locale={locale} fetchImpl={fetchImpl} />
          {data.closed.length ? (
            <>
              <h2 className="staff-queue__heading">{t('accessHelp.closedTitle')}</h2>
              <ul className="staff-deposit__payments" aria-label={t('accessHelp.closedTitle')}>
                {data.closed.map((r) => (
                  <li key={r.id}>
                    <RequestLine t={t} locale={locale} r={r} />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}
    </section>
  )
}
