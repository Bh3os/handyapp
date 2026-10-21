// A job's loadout (TSK-0071; HH-PKT-05, HH-PKT-06, HH-WORK-01, HH-WORK-02, T43, T45, ENT-Hold, OQ-LOADOUT-DETAILS,
// RULE-SAFETY-GATES, RULE-NO-INVENTED-FACTS).
// - Per work package: the list pinned on it, as the vault inventory file writes it (its groups, items and review
//   notes; the proposed additions are shown as not approved and are never items), PROPOSED every item required. No
//   quantity is ever added: an item says only what the file says.
// - Assigned workers (and the Owner on an assigned job) state per item: Loaded, Missing or Damaged, with a note. The
//   server raises the task block of a missing or damaged required item and answers the package's readiness; this
//   screen only shows what the server says.
// - Task blocks show their owner and action. The Owner starts the review, then resolves it (the item provided, or a
//   named substitute with what it affects) or cancels one entered in error. A substitute that affects the customer
//   needs a change order, which is not available yet: the server refuses it and this screen says so. Nothing here
//   clears a block by a checkbox, and nothing is marked equivalent.
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { Button, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { call, type Fetch } from './api'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

type StaffRef = { id: string; name: string | null }
type Lines = { lines: string[]; line: number | null }
type ItemState = {
  status: 'loaded' | 'missing' | 'damaged' | 'substitute_approved'
  note: string | null
  substitute: string | null
  impacts: string[] | null
  recordedBy: StaffRef
  recordedAt: string
}
export type LoadoutItemView = {
  key: string
  name: string | null
  lines: string[]
  line: number | null
  criticality: string
  category: string
  current: ItemState | null
}
export type LoadoutBlock = {
  holdId: string
  workPackageId: string
  itemKey: string
  itemName: string | null
  state: 'open' | 'under_review' | 'resolved' | 'canceled_as_error'
  version: number
  note: string
  raisedBy: StaffRef
  raisedAt: string
  reviewStartedAt: string | null
  resolutionNote: string | null
  reviewer: string | null
  resolvedAt: string | null
  cancelReason: string | null
  canceledAt: string | null
  owner: { role: string; action: string }
  actions: { startReview: boolean; resolve: boolean; cancel: boolean }
}
export type LoadoutPackageView = {
  workPackageId: string
  serviceId: string
  serviceCode: string
  position: number
  state: string
  loadout: {
    loadoutVersionId: string
    inventoryId: string
    version: number
    sourceFile: string
    pinnedAt: string
  } | null
  readiness: {
    state: 'ready' | 'not_confirmed' | 'blocked' | 'not_configured'
    unconfirmed: string[]
    reported: string[]
    blocks: string[]
  }
  groups: { heading: string | null; line: number | null; notes: Lines[]; items: LoadoutItemView[] }[]
  proposed: Lines | null
  blocks: LoadoutBlock[]
}
export type LoadoutView = {
  jobId: string
  projectReference: string
  packetVersion: number
  packages: LoadoutPackageView[]
  actions: { record: boolean }
}

const bcp47 = (locale: StaffLocale) => (locale === 'es' ? 'es-US' : 'en-US')
const REPORTS = ['loaded', 'missing', 'damaged'] as const
type Report = (typeof REPORTS)[number]
const IMPACTS = ['safety', 'appearance', 'specification', 'price', 'warranty'] as const

/** An item line as the file writes it, without the checklist box and the bold markers. */
export const plainLine = (line: string) =>
  line
    .replace(/^\s*- \[ \] /, '')
    .replace(/\*\*/g, '')
    .trim()

const READINESS_TONE = {
  ready: 'success',
  not_confirmed: 'warning',
  blocked: 'danger',
  not_configured: 'neutral',
} as const
const STATUS_TONE = { loaded: 'success', substitute_approved: 'info', missing: 'danger', damaged: 'danger' } as const
const BLOCK_TONE = {
  open: 'danger',
  under_review: 'warning',
  resolved: 'success',
  canceled_as_error: 'neutral',
} as const

function useKey() {
  const ref = useRef<string | null>(null)
  return {
    get: () => (ref.current ??= `staff-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`),
    reset: () => void (ref.current = null),
  }
}

function problemsOf(t: T, codes: { code: string }[]): string {
  return codes.map((c) => codeLabel(t, 'loadoutProblem', c.code)).join(' ')
}

function BlockActions({
  t,
  fetchImpl,
  block,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  block: LoadoutBlock
  onDone: () => void
}) {
  const ids = useId()
  const key = useKey()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resolution, setResolution] = useState<'item_provided' | 'substitute_approved'>('item_provided')
  const [note, setNote] = useState('')
  const [reviewer, setReviewer] = useState('')
  const [substitute, setSubstitute] = useState('')
  const [impacts, setImpacts] = useState<string[]>([])
  const [customerAffected, setCustomerAffected] = useState(false)
  const [reason, setReason] = useState('')

  async function send(action: 'start-review' | 'resolve' | 'cancel', body: Record<string, unknown>) {
    setPending(true)
    const r = await call(fetchImpl, `/staff/loadout-blocks/${encodeURIComponent(block.holdId)}/actions/${action}`, {
      method: 'POST',
      body,
      headers: { 'idempotency-key': key.get(), 'if-match': `"${block.version}"` },
    })
    setPending(false)
    key.reset()
    if (!r.ok)
      return setError(
        r.error.code === 'CONFLICT' && r.error.fieldErrors.length
          ? problemsOf(t, r.error.fieldErrors)
          : r.error.code === 'STALE_VERSION'
            ? t('loadout.stale')
            : t('loadout.actionFailed'),
      )
    setError(null)
    onDone()
  }

  if (!block.actions.startReview && !block.actions.resolve && !block.actions.cancel) return null
  return (
    <div className="staff-loadout__block-actions">
      {error ? <StateView kind="error" title={error} /> : null}
      {block.actions.startReview ? (
        <Button variant="secondary" pending={pending} onClick={() => void send('start-review', {})}>
          {t('loadout.block.startReview')}
        </Button>
      ) : null}
      {block.actions.resolve ? (
        <form
          className="staff-loadout__form"
          aria-label={t('loadout.block.resolveTitle')}
          onSubmit={(e) => {
            e.preventDefault()
            void send('resolve', {
              resolution,
              resolutionNote: note,
              reviewer,
              ...(resolution === 'substitute_approved' ? { substitute, impacts, customerAffected } : {}),
            })
          }}
        >
          <fieldset>
            <legend>{t('loadout.block.resolveTitle')}</legend>
            {(['item_provided', 'substitute_approved'] as const).map((r) => (
              <label key={r} className="staff-loadout__choice">
                <input
                  type="radio"
                  name={`${ids}-resolution`}
                  value={r}
                  checked={resolution === r}
                  onChange={() => setResolution(r)}
                />{' '}
                {codeLabel(t, 'taskBlockResolution', r)}
              </label>
            ))}
          </fieldset>
          {resolution === 'substitute_approved' ? (
            <>
              <label htmlFor={`${ids}-substitute`}>{t('loadout.block.substitute')}</label>
              <input
                id={`${ids}-substitute`}
                value={substitute}
                maxLength={300}
                onChange={(e) => setSubstitute(e.target.value)}
              />
              <fieldset>
                <legend>{t('loadout.block.impacts')}</legend>
                {IMPACTS.map((i) => (
                  <label key={i} className="staff-loadout__choice">
                    <input
                      type="checkbox"
                      checked={impacts.includes(i)}
                      onChange={(e) => setImpacts((xs) => (e.target.checked ? [...xs, i] : xs.filter((x) => x !== i)))}
                    />{' '}
                    {codeLabel(t, 'substituteImpact', i)}
                  </label>
                ))}
              </fieldset>
              <label className="staff-loadout__choice">
                <input
                  type="checkbox"
                  checked={customerAffected}
                  onChange={(e) => setCustomerAffected(e.target.checked)}
                />{' '}
                {t('loadout.block.customerAffected')}
              </label>
              <p className="staff-request__hint">{t('loadout.block.changeOrderHint')}</p>
            </>
          ) : (
            <p className="staff-request__hint">{t('loadout.block.providedHint')}</p>
          )}
          <label htmlFor={`${ids}-note`}>{t('loadout.block.resolutionNote')}</label>
          <textarea id={`${ids}-note`} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
          <label htmlFor={`${ids}-reviewer`}>{t('loadout.block.reviewer')}</label>
          <input
            id={`${ids}-reviewer`}
            value={reviewer}
            maxLength={200}
            onChange={(e) => setReviewer(e.target.value)}
          />
          <Button type="submit" pending={pending}>
            {t('loadout.block.resolve')}
          </Button>
        </form>
      ) : null}
      {block.actions.cancel ? (
        <details>
          <summary>{t('loadout.block.cancelTitle')}</summary>
          <form
            className="staff-loadout__form"
            onSubmit={(e) => {
              e.preventDefault()
              void send('cancel', { reason })
            }}
          >
            <label htmlFor={`${ids}-reason`}>{t('loadout.block.cancelReason')}</label>
            <textarea
              id={`${ids}-reason`}
              value={reason}
              maxLength={1000}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button type="submit" variant="secondary" pending={pending}>
              {t('loadout.block.cancel')}
            </Button>
          </form>
        </details>
      ) : null}
    </div>
  )
}

function PackageLoadout({
  t,
  fetchImpl,
  jobId,
  pkg,
  mayRecord,
  when,
  onSaved,
}: {
  t: T
  fetchImpl: Fetch
  jobId: string
  pkg: LoadoutPackageView
  mayRecord: boolean
  when: (iso: string) => string
  onSaved: () => void
}) {
  const ids = useId()
  const key = useKey()
  const [choices, setChoices] = useState<Record<string, Report>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const service = codeLabel(t, 'service', pkg.serviceCode)
  const titleId = `${ids}-title`

  async function save() {
    const items = Object.entries(choices).map(([k, status]) => ({
      key: k,
      status,
      ...(notes[k]?.trim() ? { note: notes[k].trim() } : {}),
    }))
    if (items.length === 0) return setMessage({ kind: 'error', text: t('loadout.nothingChosen') })
    setPending(true)
    const r = await call<{ blocksRaised: string[]; readiness: string }>(
      fetchImpl,
      `/staff/jobs/${encodeURIComponent(jobId)}/loadout/checks`,
      { method: 'POST', body: { workPackageId: pkg.workPackageId, items }, headers: { 'idempotency-key': key.get() } },
    )
    setPending(false)
    key.reset()
    if (!r.ok)
      return setMessage({
        kind: 'error',
        text:
          r.error.code === 'CONFLICT' && r.error.fieldErrors.length
            ? problemsOf(t, r.error.fieldErrors)
            : t('loadout.saveFailed'),
      })
    setChoices({})
    setNotes({})
    setMessage({
      kind: 'success',
      text: r.data.blocksRaised.length
        ? t('loadout.savedBlocked', { count: r.data.blocksRaised.length })
        : t('loadout.saved'),
    })
    onSaved()
  }

  return (
    <section
      className="staff-request__section staff-loadout__package"
      aria-labelledby={titleId}
      data-testid="loadout-package"
    >
      <h2 id={titleId} className="staff-queue__heading">
        {service}{' '}
        <span data-testid="loadout-readiness" data-state={pkg.readiness.state}>
          <StatusBadge tone={READINESS_TONE[pkg.readiness.state]}>
            {codeLabel(t, 'loadoutReadiness', pkg.readiness.state)}
          </StatusBadge>
        </span>
      </h2>
      {pkg.loadout === null ? (
        <StateView kind="blocked" title={t('loadout.notConfigured')} />
      ) : (
        <p className="staff-request__hint">
          {t('loadout.source', { version: pkg.loadout.version, file: pkg.loadout.sourceFile })}
        </p>
      )}
      {pkg.readiness.state === 'blocked' ? <StateView kind="blocked" title={t('loadout.blockedBody')} /> : null}
      {pkg.readiness.state === 'not_confirmed' ? (
        <p>{t('loadout.unconfirmed', { count: pkg.readiness.unconfirmed.length })}</p>
      ) : null}

      {pkg.blocks.length ? (
        <>
          <h3 className="hh-h4">{t('loadout.blocks')}</h3>
          <ul className="staff-request__list" data-testid="loadout-blocks">
            {pkg.blocks.map((b) => (
              <li key={b.holdId} data-testid="loadout-block">
                <p>
                  <StatusBadge tone={BLOCK_TONE[b.state]}>{codeLabel(t, 'holdState', b.state)}</StatusBadge>{' '}
                  <strong lang="en">{b.itemName ?? b.itemKey}</strong> · {codeLabel(t, 'holdKind', 'task_block')}
                </p>
                <p>{b.note}</p>
                <p className="staff-request__hint">
                  {t('loadout.block.raised', { name: b.raisedBy.name ?? '—', time: when(b.raisedAt) })}
                </p>
                <p className="staff-request__hint">{t('loadout.block.owner')}</p>
                {b.resolutionNote ? (
                  <p className="staff-request__hint">
                    {t('loadout.block.resolved', { note: b.resolutionNote, reviewer: b.reviewer ?? '—' })}
                  </p>
                ) : null}
                {b.cancelReason ? (
                  <p className="staff-request__hint">{t('loadout.block.canceled', { reason: b.cancelReason })}</p>
                ) : null}
                <BlockActions t={t} fetchImpl={fetchImpl} block={b} onDone={onSaved} />
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {pkg.groups.map((g, gi) => (
        <div key={`${pkg.workPackageId}-${gi}`} className="staff-loadout__group">
          {g.heading !== null ? (
            <h3 className="hh-h4" lang="en">
              {g.heading}
            </h3>
          ) : null}
          {g.notes.map((n, ni) => (
            <p key={ni} className="staff-request__hint" lang="en">
              {n.lines.map((l) => l.replace(/^>\s?/, '')).join(' ')}
            </p>
          ))}
          <ul className="staff-request__list">
            {g.items.map((i) => {
              const name = `${ids}-${i.key}`
              return (
                <li key={i.key} data-testid="loadout-item" data-item={i.key}>
                  <p>
                    <span lang="en">{plainLine(i.lines[0] ?? '')}</span>{' '}
                    <StatusBadge tone={i.criticality === 'required' ? 'warning' : 'neutral'}>
                      {codeLabel(t, 'loadoutCriticality', i.criticality)}
                    </StatusBadge>{' '}
                    <span data-testid="loadout-item-status" data-status={i.current?.status ?? 'not_stated'}>
                      {i.current ? (
                        <StatusBadge tone={STATUS_TONE[i.current.status]}>
                          {codeLabel(t, 'loadoutStatus', i.current.status)}
                        </StatusBadge>
                      ) : (
                        <StatusBadge>{t('loadout.notStated')}</StatusBadge>
                      )}
                    </span>
                  </p>
                  {i.lines.length > 1 ? (
                    <ul lang="en">
                      {i.lines.slice(1).map((l, li) => (
                        <li key={li}>{plainLine(l)}</li>
                      ))}
                    </ul>
                  ) : null}
                  {i.current ? (
                    <p className="staff-request__hint">
                      {t('loadout.stated', {
                        name: i.current.recordedBy.name ?? '—',
                        time: when(i.current.recordedAt),
                      })}
                      {i.current.substitute
                        ? ` · ${t('loadout.substitute', { substitute: i.current.substitute })}`
                        : ''}
                      {i.current.note ? ` · ${i.current.note}` : ''}
                    </p>
                  ) : null}
                  {mayRecord && pkg.loadout ? (
                    <fieldset className="staff-loadout__report">
                      <legend className="staff-request__hint">
                        {t('loadout.reportFor', { name: i.name ?? i.key })}
                      </legend>
                      {REPORTS.map((r) => (
                        <label key={r} className="staff-loadout__choice">
                          <input
                            type="radio"
                            name={name}
                            value={r}
                            checked={choices[i.key] === r}
                            onChange={() => setChoices((c) => ({ ...c, [i.key]: r }))}
                          />{' '}
                          {codeLabel(t, 'loadoutStatus', r)}
                        </label>
                      ))}
                      {choices[i.key] === 'missing' || choices[i.key] === 'damaged' ? (
                        <>
                          <label htmlFor={`${name}-note`}>{t('loadout.note')}</label>
                          <input
                            id={`${name}-note`}
                            value={notes[i.key] ?? ''}
                            maxLength={1000}
                            onChange={(e) => setNotes((n) => ({ ...n, [i.key]: e.target.value }))}
                          />
                        </>
                      ) : null}
                    </fieldset>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
      {pkg.proposed ? (
        <details>
          <summary>{t('loadout.proposed')}</summary>
          <p lang="en">{pkg.proposed.lines.join(' ')}</p>
        </details>
      ) : null}
      {message ? <StateView kind={message.kind} title={message.text} /> : null}
      {mayRecord && pkg.loadout ? (
        <Button pending={pending} onClick={() => void save()}>
          {t('loadout.save', { service })}
        </Button>
      ) : null}
    </section>
  )
}

/** The loadout of one job, as the server answers it now. */
export function LoadoutPage({
  t,
  locale,
  fetchImpl,
  jobId,
  href = (to) => to,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  jobId: string
  href?: (to: string) => string
}) {
  const ids = useId()
  const [view, setView] = useState<LoadoutView | null | undefined>(undefined)
  const load = useCallback(async () => {
    const r = await call<LoadoutView>(fetchImpl, `/staff/jobs/${encodeURIComponent(jobId)}/loadout`)
    setView(r.ok ? r.data : null)
  }, [fetchImpl, jobId])
  useEffect(() => {
    void load()
  }, [load])
  if (view === undefined) return <StateView kind="loading" title={t('loadout.loading')} />
  if (view === null)
    return (
      <section className="staff-screen">
        <StateView kind="blocked" title={t('loadout.unavailable')}>
          <p>{t('packet.unavailableBody')}</p>
        </StateView>
      </section>
    )
  const fmt = new Intl.DateTimeFormat(bcp47(locale), { dateStyle: 'medium', timeStyle: 'short' })
  const when = (iso: string) => fmt.format(new Date(iso))
  return (
    <article className="staff-screen staff-loadout" aria-labelledby={`${ids}-title`} data-testid="job-loadout">
      <h1 id={`${ids}-title`} className="hh-h3">
        {t('loadout.title', { reference: view.projectReference })}
      </h1>
      <p>
        <a href={href(`/packets/${view.jobId}`)}>{t('loadout.openPacket', { version: view.packetVersion })}</a>
      </p>
      <p className="staff-request__hint">{t('loadout.intro')}</p>
      <p className="staff-request__hint">{t('loadout.evidenceLater')}</p>
      <div className="hh-button-row">
        <Button variant="secondary" onClick={() => void load()}>
          {t('packet.refresh')}
        </Button>
      </div>
      {view.packages.map((p) => (
        <PackageLoadout
          key={p.workPackageId}
          t={t}
          fetchImpl={fetchImpl}
          jobId={view.jobId}
          pkg={p}
          mayRecord={view.actions.record}
          when={when}
          onSaved={() => void load()}
        />
      ))}
    </article>
  )
}
