// Owner Dashboard -> Staging Tools -> Test Data Management (TSK-0141; HH-OPS-05, OWN-DEC-191). The section exists only
// where the server registers the staging routes: in production the read answers 404 and nothing is shown. The server
// decides everything (Owner only, the environment checks, the typed words, the fresh sign-in, the lock); this screen
// shows the STAGING / TEST MODE mark, the counts of what a reset removes and keeps, the reusable test accounts, the
// confirmation dialog and the summary of each run with its checks and errors.
import { labelKey, type StaffKey, type StaffLocale } from '@handyhub/i18n'
import { Button, Dialog, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type Fetch } from './api'
import { ReauthForm, useOwnerWrite } from './OwnerWrite'

type T = (key: StaffKey, values?: Record<string, string | number>) => string
type Count = { id: string; count: number }
type ResetCheck = { id: string; ok: boolean; details: string[] }
type Outcome = {
  id: string
  state: string
  references: string[]
  step: string | null
  codes: string[]
  task: string | null
}
type Seeding = { state: string; outcomes: Outcome[] } | null
type Run = {
  id: string
  seq: string
  mode: string
  state: string
  requestedAt: string
  finishedAt: string | null
  requestedBy: { id: string; name: string | null }
  removedTotal: number
  checks: ResetCheck[]
  errors: { code: string; detail: string | null }[]
  seeding: Seeding
}
export type StagingStatus = {
  environment: string
  identified: boolean
  checks: { id: string; ok: boolean }[]
  running: boolean
  confirmationPhrase: string
  freshAuthMinutes: number
  removed: Count[]
  total: number
  preserved: Count[]
  reusableAccounts: {
    accountId: string
    email: string | null
    phone: string | null
    state: string
    designatedAt: string
  }[]
  freshData: { id: string; available: boolean; task: string | null }[]
  runs: Run[]
  testAccounts: TestAccount[]
}
type TestAccount = {
  id: string
  kind: 'customer' | 'guest' | 'staff'
  role: string | null
  email: string
  name: string
  state: string
  reusable: boolean | null
  mfaEnrolled: boolean | null
  receivesEmail: boolean | null
}
type AccountOutcome = { id: string; outcome: string; step: string | null; codes: string[] }
type ResetResult = {
  runId: string
  seq: string
  mode: string
  state: 'completed' | 'failed'
  removed: Count[]
  checks: ResetCheck[]
  errors: { code: string; detail: string | null }[]
  storedFileJobs: number
  seeding: Seeding
}

type Family = Parameters<typeof labelKey>[0]
function label(t: T, family: Family, code: string): string {
  try {
    return t(labelKey(family, code) as StaffKey)
  } catch {
    return code
  }
}

const isStatus = (d: unknown): d is StagingStatus =>
  !!d && Array.isArray((d as StagingStatus).removed) && typeof (d as StagingStatus).confirmationPhrase === 'string'

function refusal(t: T, error: ApiErrorBody): string {
  const code = error.fieldErrors.find((f) =>
    ['STAGING_NOT_IDENTIFIED', 'RESET_RUNNING', 'RESET_SENDS_IN_FLIGHT'].includes(f.code),
  )?.code
  if (code === 'STAGING_NOT_IDENTIFIED') return t('staging.refused.STAGING_NOT_IDENTIFIED')
  if (code === 'RESET_RUNNING') return t('staging.refused.RESET_RUNNING')
  if (code === 'RESET_SENDS_IN_FLIGHT') return t('staging.refused.RESET_SENDS_IN_FLIGHT')
  if (error.fieldErrors.some((f) => f.code === 'confirmation_mismatch')) return t('staging.dialog.mismatch')
  return t('staging.refused.other')
}

function Outcomes({ t, seeding }: { t: T; seeding: Seeding }) {
  if (!seeding) return null
  return (
    <div className="staff-system__section">
      <p>
        <strong>{t('staging.fresh.result', { state: label(t, 'stagingRunState', seeding.state) })}</strong>
      </p>
      <ul className="staff-queue__facts">
        {seeding.outcomes.map((o) => (
          <li key={o.id} data-testid={`scenario-${o.id}`}>
            {o.state === 'not_available' && o.task
              ? t('staging.fresh.notAvailable', { scenario: label(t, 'stagingScenario', o.id), task: o.task })
              : t('staging.fresh.outcome', {
                  scenario: label(t, 'stagingScenario', o.id),
                  state: label(t, 'stagingScenarioState', o.state),
                })}
            {o.step ? ` — ${t('staging.fresh.blockedAt', { step: o.step, codes: o.codes.join(', ') })}` : null}
            {o.references.length
              ? ` — ${t('staging.fresh.references', { references: o.references.join(', ') })}`
              : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Checks({ t, checks }: { t: T; checks: ResetCheck[] }) {
  return (
    <ul className="staff-queue__facts">
      {checks.map((c) => (
        <li key={c.id}>
          <StatusBadge tone={c.ok ? 'success' : 'danger'}>
            {c.ok ? t('staging.checks.ok') : t('staging.checks.failed')}
          </StatusBadge>{' '}
          {label(t, 'stagingResetCheck', c.id)}
          {c.details.length ? ` (${c.details.join(', ')})` : null}
        </li>
      ))}
    </ul>
  )
}

function Summary({ t, result }: { t: T; result: ResetResult }) {
  const ok = result.state === 'completed'
  return (
    <section className="staff-system__section" aria-live="polite" data-testid="reset-summary">
      <StateView
        kind={ok ? 'success' : 'error'}
        title={ok ? t('staging.result.completed') : t('staging.result.failed')}
      />
      <h4 className="staff-queue__title">{t('staging.result.removed')}</h4>
      <ul className="staff-queue__facts">
        {result.removed.map((c) => (
          <li key={c.id}>{t('staging.count', { kind: label(t, 'stagingRemoved', c.id), n: c.count })}</li>
        ))}
      </ul>
      {result.storedFileJobs > 0 ? <p>{t('staging.result.storedFiles', { n: result.storedFileJobs })}</p> : null}
      <h4 className="staff-queue__title">{t('staging.result.checks')}</h4>
      <Checks t={t} checks={result.checks} />
      {result.errors.length ? (
        <>
          <h4 className="staff-queue__title">{t('staging.result.errors')}</h4>
          <ul className="staff-queue__facts">
            {result.errors.map((e, i) => (
              <li key={i}>
                {label(t, 'stagingError', e.code)}
                {e.detail ? ` (${e.detail})` : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <Outcomes t={t} seeding={result.seeding} />
    </section>
  )
}

function ResetDialog({
  t,
  status,
  fresh,
  fetchImpl,
  onSession,
  onClose,
  onDone,
}: {
  t: T
  status: StagingStatus
  fresh: boolean
  fetchImpl: Fetch
  onSession?: (s: { csrfToken: string }) => void
  onClose: () => void
  onDone: (r: ResetResult) => void
}) {
  const ids = useId()
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const w = useOwnerWrite(fetchImpl, onSession)
  const matches = typed === status.confirmationPhrase
  const confirm = () =>
    void w.send<ResetResult>('/staff/staging/test-data/reset', { confirmation: typed, freshData: fresh }, (r) => {
      if (r.ok) {
        setError(null)
        onDone(r.data)
        return
      }
      setError(refusal(t, r.error))
    })
  return (
    <Dialog
      open
      title={fresh ? t('staging.dialog.titleFresh') : t('staging.dialog.title')}
      onClose={onClose}
      actions={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t('staging.dialog.cancel')}
          </Button>
          <Button
            variant="danger"
            pending={w.pending}
            onClick={confirm}
            {...(matches ? {} : { disabledReason: t('staging.dialog.mismatch') })}
          >
            {t('staging.dialog.confirm')}
          </Button>
        </>
      }
    >
      <div data-testid="reset-dialog">
        <p>
          <strong>{t('staging.dialog.explain')}</strong>
        </p>
        {fresh ? <p>{t('staging.dialog.freshExplain')}</p> : null}
        <p>{t('staging.removed.total', { n: status.total })}</p>
        <ul aria-label={t('staging.removed.heading')}>
          {status.removed
            .filter((c) => c.count > 0)
            .map((c) => (
              <li key={c.id}>{t('staging.count', { kind: label(t, 'stagingRemoved', c.id), n: c.count })}</li>
            ))}
        </ul>
        <Field
          label={t('staging.dialog.type', { phrase: status.confirmationPhrase })}
          name={`${ids}-confirm`}
          autoComplete="off"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          {...(error ? { error } : {})}
        />
        <ReauthForm t={t} w={w} />
      </div>
    </Dialog>
  )
}

// TSK-0142 (HH-OPS-06, OWN-DEC-191): the Owner Acceptance Testing accounts, one fictional account per role. No
// credential is ever shown here: staff accounts get an emailed invite link, the Customer signs in with an emailed code,
// and on staging only an approved test address (TEST_EMAIL_DESTINATIONS) receives either.
function TestAccounts({
  t,
  status,
  fetchImpl,
  onSession,
  reload,
}: {
  t: T
  status: StagingStatus
  fetchImpl: Fetch
  onSession?: (s: { csrfToken: string }) => void
  reload: () => void
}) {
  const [reason, setReason] = useState(() => t('staging.accounts.defaultReason'))
  const [outcomes, setOutcomes] = useState<AccountOutcome[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const w = useOwnerWrite(fetchImpl, onSession)
  const missing = status.testAccounts.some((a) => a.state === 'not_created')
  const create = () =>
    void w.send<{ outcomes: AccountOutcome[] }>('/staff/staging/test-accounts', { reason: reason.trim() }, (r) => {
      if (!r.ok) return setError(refusal(t, r.error))
      setError(null)
      setOutcomes(r.data.outcomes)
      reload()
    })
  const unavailable = !status.identified ? t('staging.notIdentified') : undefined
  return (
    <section className="staff-system__section" aria-labelledby="staging-accounts" data-testid="staging-test-accounts">
      <h3 id="staging-accounts" className="staff-queue__heading">
        {t('staging.accounts.heading')}
      </h3>
      <p>{t('staging.accounts.intro')}</p>
      <ul className="staff-queue__facts">
        {status.testAccounts.map((a) => (
          <li key={a.id} data-testid={`test-account-${a.id}`}>
            <strong>{label(t, 'stagingTestAccount', a.id)}</strong>: {a.email} —{' '}
            {label(t, 'stagingTestAccountState', a.state)}
            {a.reusable === true ? ` — ${t('staging.accounts.reusable')}` : null}
            {a.mfaEnrolled === true ? ` — ${t('staging.accounts.mfa')}` : null}
            {a.receivesEmail === false ? (
              <>
                {' '}
                <StatusBadge tone="warning">{t('staging.accounts.noEmail')}</StatusBadge>
              </>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="staff-request__hint">{t('staging.accounts.howToSignIn')}</p>
      <Field
        multiline
        label={t('staging.accounts.reason')}
        name="test-accounts-reason"
        value={reason}
        maxLength={2000}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="hh-button-row">
        <Button
          pending={w.pending}
          onClick={create}
          {...(unavailable
            ? { disabledReason: unavailable }
            : !missing
              ? { disabledReason: t('staging.accounts.allCreated') }
              : reason.trim() === ''
                ? { disabledReason: t('staging.accounts.reasonRequired') }
                : {})}
        >
          {t('staging.accounts.create')}
        </Button>
      </div>
      <ReauthForm t={t} w={w} />
      {error ? <StateView kind="error" title={error} /> : null}
      {outcomes ? (
        <ul className="staff-queue__facts" aria-live="polite" data-testid="test-account-outcomes">
          {outcomes.map((o) => (
            <li key={o.id}>
              {t('staging.accounts.outcome', {
                account: label(t, 'stagingTestAccount', o.id),
                outcome: label(t, 'stagingTestAccountOutcome', o.outcome),
              })}
              {o.step ? ` — ${t('staging.fresh.blockedAt', { step: o.step, codes: o.codes.join(', ') })}` : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function ReusableAccounts({
  t,
  status,
  fetchImpl,
  reload,
}: {
  t: T
  status: StagingStatus
  fetchImpl: Fetch
  reload: () => void
}) {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  async function save(reusable: boolean) {
    const r = await call(fetchImpl, '/staff/staging/test-data/reusable-accounts', {
      method: 'POST',
      body: { email, reusable },
      headers: { 'idempotency-key': idempotencyKey() },
    })
    setMessage(
      r.ok
        ? t('staging.reusable.saved')
        : r.status === 404
          ? t('staging.reusable.notFound')
          : t('staging.refused.other'),
    )
    if (r.ok) reload()
  }
  return (
    <section className="staff-system__section" aria-labelledby="staging-reusable">
      <h3 id="staging-reusable" className="staff-queue__heading">
        {t('staging.reusable.heading')}
      </h3>
      {status.reusableAccounts.length === 0 ? (
        <p className="staff-system__none">{t('staging.reusable.none')}</p>
      ) : (
        <ul className="staff-queue__facts">
          {status.reusableAccounts.map((a) => (
            <li key={a.accountId}>
              {t('staging.reusable.item', { account: a.email ?? a.phone ?? a.accountId, state: a.state })}
            </li>
          ))}
        </ul>
      )}
      <form className="staff-auth__form" onSubmit={(e: FormEvent) => e.preventDefault()}>
        <Field
          label={t('staging.reusable.email')}
          name="reusable-email"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="hh-button-row">
          <Button onClick={() => void save(true)}>{t('staging.reusable.keep')}</Button>
          <Button variant="quiet" onClick={() => void save(false)}>
            {t('staging.reusable.release')}
          </Button>
        </div>
        {message ? <p role="status">{message}</p> : null}
      </form>
    </section>
  )
}

export function StagingTools({
  t,
  locale,
  fetchImpl,
  onSession,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  onSession?: (s: { csrfToken: string }) => void
}) {
  // undefined: loading; null: not available here (production, or not the Owner); 'error': could not load.
  const [status, setStatus] = useState<StagingStatus | null | undefined | 'error'>(undefined)
  const [dialog, setDialog] = useState<null | 'reset' | 'fresh'>(null)
  const [result, setResult] = useState<ResetResult | null>(null)
  const load = useCallback(async () => {
    const r = await call<StagingStatus>(fetchImpl, '/staff/staging/test-data')
    if (r.ok && isStatus(r.data)) setStatus(r.data)
    else if (!r.ok && (r.status === 404 || r.status === 403 || r.status === 401)) setStatus(null)
    else setStatus('error')
  }, [fetchImpl])
  useEffect(() => {
    void load()
  }, [load])
  if (status === null) return null
  if (status === undefined) return <StateView kind="loading" title={t('common.loading')} />
  if (status === 'error')
    return (
      <StateView
        kind="error"
        title={t('staging.loadFailed')}
        action={<Button onClick={() => void load()}>{t('system.retry')}</Button>}
      />
    )
  const when = new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })
  const unavailable = !status.identified
    ? t('staging.notIdentified')
    : status.running
      ? t('staging.running')
      : undefined
  return (
    <section className="staff-screen" aria-labelledby="staging-tools" data-testid="staging-tools">
      <h2 id="staging-tools" className="hh-h3">
        {t('staging.heading')} <StatusBadge tone="warning">{t('staging.mode')}</StatusBadge>
      </h2>
      <p>{t('staging.environment', { environment: status.environment })}</p>
      <section className="staff-system__section" aria-labelledby="staging-test-data">
        <h3 id="staging-test-data" className="staff-queue__heading">
          {t('staging.testData.heading')}
        </h3>
        <p>{t('staging.testData.intro')}</p>
        <h4 className="staff-queue__title">{t('staging.checks.heading')}</h4>
        <ul className="staff-queue__facts">
          {status.checks.map((c) => (
            <li key={c.id}>
              <StatusBadge tone={c.ok ? 'success' : 'danger'}>
                {c.ok ? t('staging.checks.ok') : t('staging.checks.failed')}
              </StatusBadge>{' '}
              {label(t, 'stagingCheck', c.id)}
            </li>
          ))}
        </ul>
        {unavailable ? <StateView kind="blocked" title={unavailable} /> : null}
        <div className="hh-button-row">
          <Button
            variant="danger"
            onClick={() => setDialog('reset')}
            {...(unavailable ? { disabledReason: unavailable } : {})}
          >
            {t('staging.action.reset')}
          </Button>
          <Button
            variant="danger"
            onClick={() => setDialog('fresh')}
            {...(unavailable ? { disabledReason: unavailable } : {})}
          >
            {t('staging.action.resetFresh')}
          </Button>
        </div>
        {result ? <Summary t={t} result={result} /> : null}
        <h4 className="staff-queue__title">{t('staging.removed.heading')}</h4>
        <p>{t('staging.removed.total', { n: status.total })}</p>
        <ul className="staff-queue__facts" data-testid="staging-removed">
          {status.removed.map((c) => (
            <li key={c.id}>{t('staging.count', { kind: label(t, 'stagingRemoved', c.id), n: c.count })}</li>
          ))}
        </ul>
        <h4 className="staff-queue__title">{t('staging.kept.heading')}</h4>
        <ul className="staff-queue__facts">
          {status.preserved.map((c) => (
            <li key={c.id}>{t('staging.count', { kind: label(t, 'stagingKept', c.id), n: c.count })}</li>
          ))}
        </ul>
        <h4 className="staff-queue__title">{t('staging.fresh.heading')}</h4>
        <ul className="staff-queue__facts">
          {status.freshData.map((f) => (
            <li key={f.id}>
              {f.available || !f.task
                ? label(t, 'stagingScenario', f.id)
                : t('staging.fresh.notAvailable', { scenario: label(t, 'stagingScenario', f.id), task: f.task })}
            </li>
          ))}
        </ul>
      </section>
      <TestAccounts
        t={t}
        status={status}
        fetchImpl={fetchImpl}
        {...(onSession ? { onSession } : {})}
        reload={() => void load()}
      />
      <ReusableAccounts t={t} status={status} fetchImpl={fetchImpl} reload={() => void load()} />
      <section className="staff-system__section" aria-labelledby="staging-runs">
        <h3 id="staging-runs" className="staff-queue__heading">
          {t('staging.runs.heading')}
        </h3>
        {status.runs.length === 0 ? (
          <p className="staff-system__none">{t('staging.runs.none')}</p>
        ) : (
          <ul className="staff-queue__items">
            {status.runs.map((r) => (
              <li key={r.id} className="staff-queue__item">
                <p className="staff-queue__title">
                  {t('staging.runs.item', {
                    when: when.format(new Date(r.requestedAt)),
                    mode: label(t, 'stagingRunMode', r.mode),
                    state: label(t, 'stagingRunState', r.state),
                    n: r.removedTotal,
                    who: r.requestedBy.name ?? r.requestedBy.id,
                  })}
                </p>
                {r.errors.length ? (
                  <ul className="staff-queue__facts">
                    {r.errors.map((e, i) => (
                      <li key={i}>{label(t, 'stagingError', e.code)}</li>
                    ))}
                  </ul>
                ) : null}
                <Outcomes t={t} seeding={r.seeding} />
              </li>
            ))}
          </ul>
        )}
      </section>
      {dialog ? (
        <ResetDialog
          t={t}
          status={status}
          fresh={dialog === 'fresh'}
          fetchImpl={fetchImpl}
          {...(onSession ? { onSession } : {})}
          onClose={() => setDialog(null)}
          onDone={(r) => {
            setDialog(null)
            setResult(r)
            void load()
          }}
        />
      ) : null}
    </section>
  )
}
