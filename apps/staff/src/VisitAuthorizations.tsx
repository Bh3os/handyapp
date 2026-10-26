// Visit authorizations (TSK-0145; OWN-DEC-193 A1, A4; OWN-DEC-208 reading 2; HH-SCH-06).
// - The hazard-evaluation inspection: while an intake review hold is open, the Owner may authorize a tentative site
//   visit as an inspection to evaluate the hazard, naming the qualified person, their qualification, the safety
//   conditions and a reason. The hold stays open; every other visit stays blocked.
// - The follow-up visit on a completed job: a work visit of a job whose work is complete needs its recorded basis (a
//   contractual obligation, a warranty claim, the punch-list process or an approved return-work authorization) before
//   it is offered or confirmed. The Owner or Office records it.
// Shown with what is recorded; the server decides again on every write.
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { Button, Field, StateView } from '@handyhub/ui'
import { useRef, useState, type FormEvent } from 'react'
import { call, idempotencyKey, type Fetch } from './api'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string
type StaffRef = { id: string; name: string | null }

export const FOLLOW_UP_BASES = ['contractual_obligation', 'warranty', 'punch_list', 'return_work'] as const

export type VisitAuthorizationsView = {
  inspection: {
    id: string
    qualifiedPerson: string
    qualification: string
    safetyConditions: string
    reason: string
    holdIds: string[]
    authorizedBy: StaffRef
    authorizedAt: string
  } | null
  followUp: {
    id: string
    basis: (typeof FOLLOW_UP_BASES)[number]
    note: string
    returnWorkId: string | null
    authorizedBy: StaffRef
    authorizedAt: string
  } | null
  jobCompleted: boolean
  actions: { authorizeInspection: boolean; authorizeFollowUp: boolean }
}

const name = (t: T, s: StaffRef) => s.name ?? t('queue.unnamed')

/** One form posting to the visit, with the visit version shown; a refusal lists every reason. */
function useVisitPost<V>(fetchImpl: Fetch, visit: { id: string; version: number }, onDone: (d: V | null) => void) {
  const [refusal, setRefusal] = useState<string[] | null>(null)
  const [pending, setPending] = useState(false)
  const key = useRef<string | null>(null)
  async function post(t: T, path: string, body: object) {
    setPending(true)
    key.current = key.current ?? idempotencyKey()
    const r = await call<V>(fetchImpl, `/staff/visits/${encodeURIComponent(visit.id)}/${path}`, {
      method: 'POST',
      headers: { 'idempotency-key': key.current, 'if-match': `"${visit.version}"` },
      body,
    })
    setPending(false)
    if (r.ok || r.status < 500) key.current = null
    if (!r.ok) {
      if (r.error.code === 'STALE_VERSION') return onDone(null)
      return setRefusal(
        r.error.fieldErrors.length
          ? [...new Set(r.error.fieldErrors.map((f) => codeLabel(t, 'visitProblem', f.code)))]
          : [codeLabel(t, 'visitProblem', r.error.code)],
      )
    }
    onDone(r.data)
  }
  return { refusal, pending, post }
}

function InspectionForm<V>({
  t,
  fetchImpl,
  visit,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  visit: { id: string; version: number }
  onDone: (d: V | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [person, setPerson] = useState('')
  const [qualification, setQualification] = useState('')
  const [conditions, setConditions] = useState('')
  const [reason, setReason] = useState('')
  const { refusal, pending, post } = useVisitPost<V>(fetchImpl, visit, onDone)
  if (!open)
    return (
      <div className="hh-button-row">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {t('visits.inspection.open')}
        </Button>
      </div>
    )
  function submit(e: FormEvent) {
    e.preventDefault()
    void post(t, 'inspection-authorization', {
      qualifiedPerson: person.trim(),
      qualification: qualification.trim(),
      safetyConditions: conditions.trim(),
      reason: reason.trim(),
    })
  }
  return (
    <form className="staff-request__form" onSubmit={submit} data-testid="inspection-form">
      <Field
        label={t('visits.inspection.person')}
        required
        value={person}
        onChange={(e) => setPerson(e.target.value)}
      />
      <Field
        label={t('visits.inspection.qualification')}
        required
        value={qualification}
        onChange={(e) => setQualification(e.target.value)}
      />
      <Field
        label={t('visits.inspection.conditions')}
        required
        multiline
        rows={3}
        value={conditions}
        onChange={(e) => setConditions(e.target.value)}
      />
      <Field
        label={t('visits.inspection.reason')}
        required
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {refusal ? <StateView kind="error" title={t('visits.inspection.refused')} reasons={refusal} /> : null}
      <div className="hh-button-row">
        <Button type="submit" pending={pending}>
          {t('visits.inspection.submit')}
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          {t('offers.form.cancel')}
        </Button>
      </div>
    </form>
  )
}

function FollowUpForm<V>({
  t,
  fetchImpl,
  visit,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  visit: { id: string; version: number }
  onDone: (d: V | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [basis, setBasis] = useState<(typeof FOLLOW_UP_BASES)[number]>('punch_list')
  const [note, setNote] = useState('')
  const [returnWorkId, setReturnWorkId] = useState('')
  const { refusal, pending, post } = useVisitPost<V>(fetchImpl, visit, onDone)
  if (!open)
    return (
      <div className="hh-button-row">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {t('visits.followUp.open')}
        </Button>
      </div>
    )
  const needsReturnWork = basis === 'warranty' || basis === 'return_work'
  function submit(e: FormEvent) {
    e.preventDefault()
    void post(t, 'follow-up-authorization', {
      basis,
      note: note.trim(),
      ...(needsReturnWork && returnWorkId.trim() ? { returnWorkId: returnWorkId.trim() } : {}),
    })
  }
  return (
    <form className="staff-request__form" onSubmit={submit} data-testid="follow-up-form">
      <fieldset className="staff-request__check">
        <legend>{t('visits.followUp.basis')}</legend>
        <div className="staff-request__outcomes">
          {FOLLOW_UP_BASES.map((b) => (
            <label key={b}>
              <input type="radio" name="follow-up-basis" checked={basis === b} onChange={() => setBasis(b)} />
              {codeLabel(t, 'followUpBasis', b)}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label={t('visits.followUp.note')} required value={note} onChange={(e) => setNote(e.target.value)} />
      {needsReturnWork ? (
        <Field
          label={t('visits.followUp.returnWork')}
          required
          value={returnWorkId}
          onChange={(e) => setReturnWorkId(e.target.value)}
        />
      ) : null}
      {refusal ? <StateView kind="error" title={t('visits.followUp.refused')} reasons={refusal} /> : null}
      <div className="hh-button-row">
        <Button type="submit" pending={pending}>
          {t('visits.followUp.submit')}
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          {t('offers.form.cancel')}
        </Button>
      </div>
    </form>
  )
}

/** The visit's inspection and follow-up authorizations, and the forms the caller may use. */
export function VisitAuthorizations<V>({
  t,
  fetchImpl,
  visit,
  authorizations: a,
  when,
  onChanged,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  visit: { id: string; version: number; purpose: string; state: string }
  authorizations: VisitAuthorizationsView | null | undefined
  when: (iso: string) => string
  onChanged: (d: V | null) => void
}) {
  if (!a) return null
  const followUpNeeded = a.jobCompleted && visit.purpose !== 'site_estimate'
  if (!a.inspection && !a.actions.authorizeInspection && !followUpNeeded) return null
  return (
    <div data-testid="visit-authorizations">
      <p>
        <strong>{t('visits.authorizations.title')}</strong>
      </p>
      {a.inspection || a.actions.authorizeInspection ? (
        <div data-testid="visit-inspection">
          <p className="staff-request__hint">{t('visits.inspection.title')}</p>
          {a.inspection ? (
            <p data-testid="visit-inspection-recorded">
              {t('visits.inspection.recorded', {
                name: name(t, a.inspection.authorizedBy),
                time: when(a.inspection.authorizedAt),
                person: a.inspection.qualifiedPerson,
                qualification: a.inspection.qualification,
                conditions: a.inspection.safetyConditions,
                reason: a.inspection.reason,
              })}
            </p>
          ) : (
            <>
              <p className="staff-request__hint">{t('visits.inspection.hint')}</p>
              <InspectionForm<V>
                key={`${visit.id}-${visit.version}`}
                t={t}
                fetchImpl={fetchImpl}
                visit={visit}
                onDone={onChanged}
              />
            </>
          )}
        </div>
      ) : null}
      {followUpNeeded ? (
        <div data-testid="visit-follow-up">
          <p className="staff-request__hint">{t('visits.followUp.title')}</p>
          {a.followUp ? (
            <p data-testid="visit-follow-up-recorded">
              {t('visits.followUp.recorded', {
                basis: codeLabel(t, 'followUpBasis', a.followUp.basis),
                name: name(t, a.followUp.authorizedBy),
                time: when(a.followUp.authorizedAt),
                note: a.followUp.note,
              })}
            </p>
          ) : (
            <>
              <p className="staff-request__hint">{t('visits.followUp.hint')}</p>
              {visit.state === 'tentative' ? (
                <p className="staff-request__hint">{t('visits.followUp.missing')}</p>
              ) : null}
              {a.actions.authorizeFollowUp ? (
                <FollowUpForm<V>
                  key={`${visit.id}-${visit.version}`}
                  t={t}
                  fetchImpl={fetchImpl}
                  visit={visit}
                  onDone={onChanged}
                />
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
