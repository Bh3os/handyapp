// Settings -> Launch phase (TSK-0142; HH-OPS-06, OWN-DEC-191). The phase in force, its three switches (invited customers,
// public submissions, search indexing: all off in phase 1), what they mean in this environment, the history of phase
// decisions, and the Owner's move: the next phase or back to an earlier one, with the words to type, a written approval
// and a fresh sign-in. The server decides everything (Owner only, one step forward, the database's own check); this
// screen never moves a phase by itself.
import { labelKey, type StaffKey, type StaffLocale } from '@handyhub/i18n'
import { Button, Dialog, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useState } from 'react'
import { call, type ApiErrorBody, type Fetch } from './api'
import { ReauthForm, useOwnerWrite } from './OwnerWrite'

type T = (key: StaffKey, values?: Record<string, string | number>) => string
type Person = { id: string; name: string | null } | null
export type LaunchView = {
  environment: string
  phase: string
  phaseNumber: number
  version: number | null
  changedAt: string | null
  changedBy: Person
  approval: string | null
  switches: { id: string; on: boolean }[]
  effect: { submissions: string; indexing: boolean }
  moves: { to: string; confirmation: string }[]
  freshAuthMinutes: number
  history: { version: number; phase: string; changedAt: string; changedBy: Person; approval: string | null }[]
}

type Family = Parameters<typeof labelKey>[0]
function label(t: T, family: Family, code: string): string {
  try {
    return t(labelKey(family, code) as StaffKey)
  } catch {
    return code
  }
}

const isView = (d: unknown): d is LaunchView =>
  !!d && typeof (d as LaunchView).phase === 'string' && Array.isArray((d as LaunchView).switches)

function refusal(t: T, error: ApiErrorBody): string {
  const code = error.fieldErrors[0]?.code
  if (code === 'SKIPS_A_PHASE' || code === 'SAME_PHASE' || code === 'confirmation_mismatch')
    return label(t, 'launchRefusal', code)
  if (error.code === 'STALE_VERSION') return t('launch.refused.stale')
  return t('launch.refused.other')
}

function MoveDialog({
  t,
  view,
  move,
  fetchImpl,
  onSession,
  onClose,
  onDone,
}: {
  t: T
  view: LaunchView
  move: { to: string; confirmation: string }
  fetchImpl: Fetch
  onSession?: (s: { csrfToken: string }) => void
  onClose: () => void
  onDone: (v: LaunchView) => void
}) {
  const ids = useId()
  const [typed, setTyped] = useState('')
  const [approval, setApproval] = useState('')
  const [error, setError] = useState<string | null>(null)
  const w = useOwnerWrite(fetchImpl, onSession)
  const forward = LAUNCH_ORDER.indexOf(move.to) > LAUNCH_ORDER.indexOf(view.phase)
  const ready = typed === move.confirmation && approval.trim() !== ''
  const confirm = () =>
    void w.send<LaunchView>(
      '/staff/launch/phase',
      { phase: move.to, confirmation: typed, reason: approval.trim() },
      (r) => {
        if (r.ok) return onDone(r.data)
        setError(refusal(t, r.error))
      },
      { 'if-match': `"${view.version ?? 0}"` },
      'PUT',
    )
  return (
    <Dialog
      open
      title={t('launch.dialog.title', { phase: label(t, 'launchPhase', move.to) })}
      onClose={onClose}
      actions={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t('staging.dialog.cancel')}
          </Button>
          <Button
            variant={forward ? 'danger' : 'primary'}
            pending={w.pending}
            onClick={confirm}
            {...(ready ? {} : { disabledReason: t('launch.dialog.incomplete') })}
          >
            {t('launch.dialog.confirm')}
          </Button>
        </>
      }
    >
      <div data-testid="launch-dialog">
        <p>
          <strong>
            {forward
              ? t(move.to === 'public' ? 'launch.dialog.forwardPhase3' : 'launch.dialog.forwardPhase2')
              : t('launch.dialog.back')}
          </strong>
        </p>
        {view.environment !== 'production' ? <p>{t('launch.notProduction')}</p> : null}
        <Field
          multiline
          label={t('launch.dialog.approval')}
          name={`${ids}-approval`}
          value={approval}
          maxLength={2000}
          onChange={(e) => setApproval(e.target.value)}
        />
        <Field
          label={t('staging.dialog.type', { phrase: move.confirmation })}
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

const LAUNCH_ORDER = ['owner_acceptance_testing', 'invited_customers', 'public']

export function LaunchPhaseSetting({
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
  const ids = useId()
  // undefined: loading; null: not available to this person.
  const [view, setView] = useState<LaunchView | null | undefined>(undefined)
  const [move, setMove] = useState<{ to: string; confirmation: string } | null>(null)
  const [saved, setSaved] = useState(false)
  const load = useCallback(async () => {
    const r = await call<LaunchView>(fetchImpl, '/staff/launch')
    setView(r.ok && isView(r.data) ? r.data : null)
  }, [fetchImpl])
  useEffect(() => {
    void load()
  }, [load])
  if (view === undefined) return <StateView kind="loading" title={t('common.loading')} />
  if (view === null) return null
  const when = new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })
  const who = (p: Person) => (p ? (p.name ?? p.id) : t('launch.byMigration'))
  return (
    <section className="staff-request__section" aria-labelledby={`${ids}-launch`} data-testid="launch-phase">
      <h2 id={`${ids}-launch`} className="staff-queue__heading">
        {t('launch.title')}
      </h2>
      <p data-testid="launch-current">
        <strong>{t('launch.current', { n: view.phaseNumber, phase: label(t, 'launchPhase', view.phase) })}</strong>
      </p>
      <p className="staff-request__hint">{t('launch.intro')}</p>
      <h3 className="staff-queue__title">{t('launch.switches')}</h3>
      <ul className="staff-queue__facts" data-testid="launch-switches">
        {view.switches.map((s) => (
          <li key={s.id} data-testid={`launch-switch-${s.id}`}>
            <StatusBadge tone={s.on ? 'warning' : 'neutral'}>{s.on ? t('launch.on') : t('launch.off')}</StatusBadge>{' '}
            {label(t, 'launchSwitch', s.id)}
          </li>
        ))}
      </ul>
      <p data-testid="launch-effect">{label(t, 'launchSubmissions', view.effect.submissions)}</p>
      <p>{view.effect.indexing ? t('launch.indexingOn') : t('launch.indexingOff')}</p>
      <div className="hh-button-row">
        {view.moves.map((m) => (
          <Button
            key={m.to}
            variant={LAUNCH_ORDER.indexOf(m.to) > LAUNCH_ORDER.indexOf(view.phase) ? 'danger' : 'secondary'}
            onClick={() => (setSaved(false), setMove(m))}
          >
            {LAUNCH_ORDER.indexOf(m.to) > LAUNCH_ORDER.indexOf(view.phase)
              ? t('launch.action.forward', { phase: label(t, 'launchPhase', m.to) })
              : t('launch.action.back', { phase: label(t, 'launchPhase', m.to) })}
          </Button>
        ))}
      </div>
      {saved ? <StateView kind="success" title={t('launch.saved')} /> : null}
      <h3 className="staff-queue__title">{t('launch.history')}</h3>
      <ul className="staff-queue__facts" data-testid="launch-history">
        {view.history.map((h) => (
          <li key={h.version}>
            {t('launch.historyItem', {
              when: when.format(new Date(h.changedAt)),
              phase: label(t, 'launchPhase', h.phase),
              who: who(h.changedBy),
            })}
            {h.approval ? ` — ${h.approval}` : null}
          </li>
        ))}
      </ul>
      {move ? (
        <MoveDialog
          t={t}
          view={view}
          move={move}
          fetchImpl={fetchImpl}
          {...(onSession ? { onSession } : {})}
          onClose={() => setMove(null)}
          onDone={(v) => {
            setMove(null)
            setView(v)
            setSaved(true)
          }}
        />
      ) : null}
    </section>
  )
}
