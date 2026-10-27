// The SOP checklist pinned on a work package (TSK-0068; HH-PKT-03, HH-WORK-11, T43, T45, ENT-SOPVersion, OWN-DEC-17,
// OWN-DEC-79, OWN-DEC-108, RULE-NO-INVENTED-FACTS, RULE-HUMAN-REVIEW).
// - Shows the exact SOP version the work package pinned: its review state, source file, digests and pin time; the six
//   stages in order with every item verbatim (English, as imported) and its vault line, or "Added in the graph" for a
//   line the graph added; the hazard checks (HOLD, GATE and FLAG controls and the stop-work section); the source
//   SOP's open questions. A stage with no step says "No SOP step recorded for this stage — ask the office".
// - NOT CONFIGURED (no SOP version for the service when the job was created) shows no checklist at all and says the
//   work package cannot become ready. A package that is not part of a job yet says when its SOP is pinned.
// - "Pending competent review" banner while the version has no sign-off; in production that also blocks readiness.
//   Spanish-reading staff see the Spanish text of a version released as AI-reviewed after its separate comparison
//   (TSK-0103, OWN-DEC-79), labelled "AI-reviewed" with the comparison date; until then "Spanish safety review
//   pending" and the English text. The section headings and the open questions stay in English. Every reader sees
//   the Spanish status of the version.
// - Licensed-trade, structural and hazardous-material work has no procedure here: the notice routes it to a hold and
//   human review; nothing on this screen clears a hold or decides that work is safe.
// - The Owner records the competent reviewer's sign-off (sop.sign_off_review) when the server offers it.
// The checklist is read-only here: running it on site is TSK-0075.
import { Button, Field, ScrollArea, StateView, StatusBadge } from '@handyhub/ui'
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { Fragment, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type Fetch } from './api'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

export type SopItemView = {
  id: string
  kind: 'step' | 'control' | 'note' | 'table'
  section: string | null
  line: number | null
  text: string
  checkbox?: boolean
  evidence?: string[]
  required?: boolean
  holdBefore?: string[]
  control?: 'HOLD' | 'GATE' | 'FLAG'
  ref?: string | null
  table?: { header: string[]; rows: string[][] }
}
export type SopStageView = { stage: number; key: string; heading: string; steps: number; items: SopItemView[] }
type Lang = 'en' | 'es'
export type WorkPackageSopView = {
  workPackage: { id: string; serviceCode: string; state: string; jobId: string | null }
  pin: { state: 'pinned' | 'not_configured' | 'no_job'; pinnedAt: string | null; source: string | null }
  readiness: { ok: boolean; blockers: string[]; pendingReviewBanner: boolean }
  sop: {
    id: string
    sopId: string
    version: number
    title: string
    reviewState: string
    current: boolean
    spanishStatus: 'ai_reviewed' | 'pending'
    spanish: {
      status: 'ai_reviewed' | 'pending'
      check: {
        checkedOn: string
        tool: string
        englishContentSha256: string
        results: Record<string, 'pass' | 'fail'>
        problems: number
        ambiguous: { item: string; note: string }[]
      } | null
      title: string | null
      stages: SopStageView[] | null
      hazards: { controls: SopItemView[]; stopWork: SopItemView[] } | null
    }
    sourceFile: string
    contentSha256: string
    hazardSha256: string
    qualitySha256: string
    rowVersion: number
    signOff: {
      reviewerName: string
      reviewerQualification: string
      reviewNote: string
      signedOffBy: { id: string; name: string | null }
      signedOffAt: string
    } | null
    stages: SopStageView[]
    hazards: { controls: SopItemView[]; stopWork: SopItemView[] }
    openQuestions: SopItemView[]
  } | null
  actions: { signOff: boolean }
}

/** Verbatim SOP text with its own **bold** and [[link]] markers shown as plain emphasis and plain ids. */
function Verbatim({ text, lang = 'en' }: { text: string; lang?: Lang }) {
  const parts = text.replace(/\[\[([^\]|]*)(\|[^\]]*)?\]\]/g, '$1').split(/(\*\*[^*]+\*\*)/)
  return (
    <span className="staff-sop__text" lang={lang}>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') && p.length > 4 ? (
          <strong key={i}>{p.slice(2, -2)}</strong>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </span>
  )
}

function Source({ t, line }: { t: T; line: number | null }) {
  return (
    <span className="staff-sop__source">{line === null ? t('sop.addedInGraph') : t('sop.vaultLine', { line })}</span>
  )
}

function Item({ t, item, lang }: { t: T; item: SopItemView; lang: Lang }) {
  if (item.kind === 'step')
    return (
      <li className="staff-sop__item staff-sop__item--step" data-item={item.id}>
        <p>
          {item.checkbox ? (
            <span aria-hidden="true" className="staff-sop__box">
              ☐{' '}
            </span>
          ) : null}
          <Verbatim text={item.text} lang={lang} />
        </p>
        <p className="staff-sop__meta">
          {item.required ? <StatusBadge tone="info">{t('sop.required')}</StatusBadge> : null}
          {(item.evidence ?? []).map((e) => (
            <StatusBadge key={e}>{codeLabel(t, 'sopEvidence', e)}</StatusBadge>
          ))}
          {item.holdBefore?.length ? <span>{t('sop.holdBefore', { ids: item.holdBefore.join(', ') })}</span> : null}
          <span>{t('sop.itemId', { id: item.id })}</span>
          <Source t={t} line={item.line} />
        </p>
      </li>
    )
  if (item.kind === 'control')
    return (
      <li className="staff-sop__item staff-sop__item--control" data-item={item.id}>
        <p>
          <StatusBadge tone={item.control === 'FLAG' ? 'info' : 'warning'}>
            {codeLabel(t, 'sopControl', item.control ?? 'FLAG')}
          </StatusBadge>{' '}
          <Verbatim text={item.text} lang={lang} />
        </p>
        <p className="staff-sop__meta">
          <span>{t('sop.itemId', { id: item.id })}</span>
          <Source t={t} line={item.line} />
        </p>
      </li>
    )
  if (item.kind === 'table' && item.table)
    return (
      <li className="staff-sop__item staff-sop__item--table" data-item={item.id}>
        <ScrollArea className="staff-sop__table" label={t('sop.itemId', { id: item.id })}>
          <table lang={lang}>
            <thead>
              <tr>
                {item.table.header.map((h, i) => (
                  <th key={i} scope="col">
                    <Verbatim text={h} lang={lang} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {item.table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>
                      <Verbatim text={c} lang={lang} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
        <p className="staff-sop__meta">
          <Source t={t} line={item.line} />
        </p>
      </li>
    )
  return (
    <li className="staff-sop__item staff-sop__item--note" data-item={item.id}>
      <p>
        <Verbatim text={item.text} lang={lang} />
      </p>
      <p className="staff-sop__meta">
        <Source t={t} line={item.line} />
      </p>
    </li>
  )
}

/** Items with the vault section heading shown where it changes. */
function Items({ t, items, lang = 'en' }: { t: T; items: SopItemView[]; lang?: Lang }) {
  const out: ReactNode[] = []
  let section: string | null = null
  let group: SopItemView[] = []
  const flush = () => {
    if (group.length === 0) return
    out.push(
      <Fragment key={group[0]?.id}>
        {section ? (
          <h5 className="staff-sop__section" lang="en">
            {section}
          </h5>
        ) : null}
        <ol className="staff-sop__items">
          {group.map((i) => (
            <Item key={i.id} t={t} item={i} lang={lang} />
          ))}
        </ol>
      </Fragment>,
    )
    group = []
  }
  for (const item of items) {
    if (item.section !== section) {
      flush()
      section = item.section
    }
    group.push(item)
  }
  flush()
  return <>{out}</>
}

function SignOff({
  t,
  fetchImpl,
  sop,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  sop: NonNullable<WorkPackageSopView['sop']>
  onDone: () => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<ApiErrorBody | null>(null)
  const key = useRef<string | null>(null)
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const text = (name: string) => String(form.get(name) ?? '').trim()
    setPending(true)
    setError(null)
    key.current ??= idempotencyKey()
    const r = await call(fetchImpl, `/staff/sop-versions/${encodeURIComponent(sop.id)}/sign-off`, {
      method: 'POST',
      body: {
        reviewerName: text('reviewerName'),
        reviewerQualification: text('reviewerQualification'),
        reviewNote: text('reviewNote'),
      },
      headers: { 'idempotency-key': key.current, 'if-match': `"${sop.rowVersion}"` },
    })
    setPending(false)
    if (r.ok || r.status < 500) key.current = null
    if (!r.ok) return setError(r.error)
    onDone()
  }
  const problems = (error?.fieldErrors ?? []).map((f) => codeLabel(t, 'sopSignOffProblem', f.code))
  return (
    <form className="staff-request__form" onSubmit={(e) => void submit(e)} noValidate>
      <h4>{t('sop.signOff.title')}</h4>
      <p className="staff-request__hint">{t('sop.signOff.hint')}</p>
      {error ? (
        <StateView
          kind="error"
          title={error.code === 'STALE_VERSION' ? t('sop.signOff.stale') : t('sop.signOff.failed')}
          reasons={problems}
        />
      ) : null}
      <Field label={t('sop.signOff.reviewerName')} name="reviewerName" maxLength={200} required />
      <Field label={t('sop.signOff.reviewerQualification')} name="reviewerQualification" maxLength={200} required />
      <Field label={t('sop.signOff.reviewNote')} name="reviewNote" multiline maxLength={2000} required />
      <Button type="submit" pending={pending}>
        {t('sop.signOff.submit')}
      </Button>
    </form>
  )
}

function Checklist({
  t,
  locale,
  fetchImpl,
  view,
  reload,
  when,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  view: WorkPackageSopView
  reload: () => void
  when: (iso: string) => string
}) {
  const ids = useId()
  if (view.pin.state === 'no_job') return <StateView kind="empty" title={t('sop.noJob')} />
  const sop = view.sop
  if (view.pin.state === 'not_configured' || !sop)
    return (
      <StateView kind="blocked" title={t('sop.notConfigured.title')} reasons={[t('sop.notConfigured.reason')]}>
        <p>{t('sop.notConfigured.body')}</p>
      </StateView>
    )
  // A Spanish-reading reader sees the released Spanish text; everyone else, and every unreleased version, the English.
  const spanish = locale === 'es' && sop.spanish.status === 'ai_reviewed' && sop.spanish.stages && sop.spanish.hazards
  const stages = spanish ? (sop.spanish.stages ?? sop.stages) : sop.stages
  const hazards = spanish ? (sop.spanish.hazards ?? sop.hazards) : sop.hazards
  const lang: Lang = spanish ? 'es' : 'en'
  return (
    <div className="staff-sop" data-testid="work-package-sop" data-language={lang}>
      {view.readiness.pendingReviewBanner ? (
        <StateView
          kind={view.readiness.ok ? 'stale' : 'blocked'}
          title={t('sop.pendingReview.title')}
          reasons={view.readiness.ok ? [] : [t('sop.pendingReview.productionBlocked')]}
        >
          <p>{t('sop.pendingReview.body')}</p>
        </StateView>
      ) : null}
      {locale === 'es' && !spanish ? (
        <StateView kind="blocked" title={t('sop.spanishNotReleased')}>
          <p>{t('sop.spanishPending')}</p>
        </StateView>
      ) : null}
      <StateView kind="blocked" title={t('sop.humanReview.title')}>
        <p>{t('sop.humanReview.body')}</p>
      </StateView>
      <dl className="staff-sop__facts">
        <dt>{t('sop.version')}</dt>
        <dd>
          <span lang="en">{sop.title}</span> · {t('sop.versionNumber', { version: sop.version })} ·{' '}
          {codeLabel(t, 'sopReviewState', sop.reviewState)}
          {sop.current ? null : <> · {t('sop.notCurrent')}</>}
        </dd>
        <dt>{t('sop.spanish')}</dt>
        <dd data-testid="sop-spanish-status">
          {sop.spanish.status === 'ai_reviewed' && sop.spanish.check ? (
            <>
              <StatusBadge tone="info">{t('sop.aiReviewed')}</StatusBadge>{' '}
              {t('sop.spanishAiReviewed', { date: sop.spanish.check.checkedOn })}
            </>
          ) : (
            <>
              {/* Plain text, not a badge: badges do not wrap, and this one is long at phone width. */}
              <strong>{t('sop.spanishNotReleased')}</strong>
              {sop.spanish.check ? (
                <>
                  {' '}
                  {t('sop.spanishCheckFailed', {
                    date: sop.spanish.check.checkedOn,
                    categories: Object.entries(sop.spanish.check.results)
                      .filter(([, r]) => r === 'fail')
                      .map(([c]) => codeLabel(t, 'spanishCheck', c))
                      .join(', '),
                    flags: sop.spanish.check.ambiguous.length,
                  })}
                </>
              ) : null}
            </>
          )}
        </dd>
        <dt>{t('sop.sourceFile')}</dt>
        <dd lang="en">{sop.sourceFile}</dd>
        <dt>{t('sop.pinned')}</dt>
        <dd>
          {view.pin.pinnedAt ? when(view.pin.pinnedAt) : '—'}
          {view.pin.source ? <> · {codeLabel(t, 'sopPinSource', view.pin.source)}</> : null}
        </dd>
        <dt>{t('sop.digests')}</dt>
        <dd>
          <code>{t('sop.digest.content', { sha: sop.contentSha256.slice(0, 12) })}</code>{' '}
          <code>{t('sop.digest.hazard', { sha: sop.hazardSha256.slice(0, 12) })}</code>{' '}
          <code>{t('sop.digest.quality', { sha: sop.qualitySha256.slice(0, 12) })}</code>
        </dd>
        <dt>{t('sop.signOff.recorded')}</dt>
        <dd>
          {sop.signOff
            ? t('sop.signOff.entry', {
                reviewer: sop.signOff.reviewerName,
                qualification: sop.signOff.reviewerQualification,
                by: sop.signOff.signedOffBy.name ?? t('queue.unnamed'),
                time: when(sop.signOff.signedOffAt),
              })
            : t('sop.signOff.none')}
        </dd>
      </dl>
      <h4 id={`${ids}-stages`}>{t('sop.stages')}</h4>
      <ol className="staff-sop__stages" aria-labelledby={`${ids}-stages`}>
        {stages.map((s) => (
          <li key={s.key} data-stage={s.key}>
            <details>
              <summary>
                {t('sop.stageTitle', { n: s.stage, stage: codeLabel(t, 'sopStage', s.key) })} ·{' '}
                {t('sop.stepCount', { count: s.steps })}
              </summary>
              {s.steps === 0 ? <StateView kind="empty" title={t('sop.noStep')} /> : null}
              <Items t={t} items={s.items} lang={lang} />
            </details>
          </li>
        ))}
      </ol>
      <h4>{t('sop.hazards')}</h4>
      <details>
        <summary>{t('sop.hazardCount', { count: hazards.controls.length })}</summary>
        <Items t={t} items={hazards.controls} lang={lang} />
      </details>
      <details>
        <summary>{t('sop.stopWork')}</summary>
        <Items t={t} items={hazards.stopWork} lang={lang} />
      </details>
      <h4>{t('sop.openQuestions')}</h4>
      <details>
        <summary>{t('sop.openQuestionCount', { count: sop.openQuestions.length })}</summary>
        <Items t={t} items={sop.openQuestions} />
      </details>
      {view.actions.signOff ? <SignOff t={t} fetchImpl={fetchImpl} sop={sop} onDone={reload} /> : null}
    </div>
  )
}

/** One work package's SOP, loaded when staff open it. */
export function WorkPackageSop({
  t,
  locale,
  fetchImpl,
  workPackageId,
  when,
  offlineCopy,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  workPackageId: string
  when: (iso: string) => string
  /** TSK-0079: the checklist this phone stored with the offline packet, shown when the server cannot be reached. */
  offlineCopy?: unknown
}) {
  const [view, setView] = useState<WorkPackageSopView | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  async function load() {
    setLoading(true)
    setError(false)
    const r = await call<WorkPackageSopView>(fetchImpl, `/staff/work-packages/${encodeURIComponent(workPackageId)}/sop`)
    setLoading(false)
    if (r.ok) setView(r.data)
    else if (r.status === 0 && offlineCopy) setView(offlineCopy as WorkPackageSopView)
    else setError(true)
  }
  if (!view)
    return (
      <div className="hh-button-row">
        {error ? <StateView kind="error" title={t('sop.loadFailed')} /> : null}
        <Button variant="secondary" pending={loading} onClick={() => void load()}>
          {t('sop.show')}
        </Button>
      </div>
    )
  return <Checklist t={t} locale={locale} fetchImpl={fetchImpl} view={view} reload={() => void load()} when={when} />
}
