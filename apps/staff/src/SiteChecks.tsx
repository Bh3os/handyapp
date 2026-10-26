// The three first-visit site checks on a project's visits (TSK-0126; OWN-DEC-167, OWN-DEC-179, HH-SCH-06). Each is
// a checkbox with what it rests on shown beside it, so nothing is confirmed blind:
// 1. the verified property address: the current address (with its unit) and its pre-validation; staff check the
//    complete address and record its county (the property record's address-and-county check, TSK-0127);
// 2. the authorized site contact: the customer (prefilled from their record, never typed again) or a person they
//    named, with name, role, phone or email, and what they may do: give access, coordinate the visit. Never money or
//    contract changes;
// 3. the coverage of the verified county: SERVED accepted by staff; OUTSIDE only with the Owner's exception and a
//    reason. An exception never lifts a hold, the approval or the deposit.
// Staff text is English or Spanish (staff catalogs); the server decides every write and names what is still missing.
import { SERVICE_AREA } from '@handyhub/domain/areas'
import { LABEL_FAMILIES, type StaffKey } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type Fetch } from './api'
import { countyVerificationText, formatAddress, type CountyVerification } from './Property'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string
type StaffRef = { id: string; name: string | null }
type Address = { street: string; unit: string | null; city: string; state: string; zip: string }

export type SiteChecks = {
  property: { id: string; version: number; addressVersion: number; address: Address }
  address: { done: boolean; problems: string[]; verification: (CountyVerification & { id: string }) | null }
  siteContact: {
    done: boolean
    problem: string | null
    current: {
      version: number
      designation: 'customer' | 'other'
      name: string
      role: string | null
      phone: string | null
      email: string | null
      authority: string[]
      source: string
      note: string | null
      recordedBy: StaffRef
      recordedAt: string
    } | null
    customer: { name: string; phone: string | null; email: string | null } | null
  }
  coverage: {
    done: boolean
    outcome: 'served' | 'outside' | null
    countyVerificationId: string | null
    acceptance: {
      outcome: 'served' | 'outside'
      exceptionReason: string | null
      acceptedBy: StaffRef
      acceptedAt: string
    } | null
  }
  actions: { verifyAddress: boolean; recordSiteContact: boolean; acceptCoverage: boolean; approveException: boolean }
}

const AUTHORITIES = LABEL_FAMILIES.siteContactAuthority
const SOURCES = LABEL_FAMILIES.detailSource.filter((s) => s !== 'request_form')
const OTHER_COUNTY = 'other'
const who = (t: T, r: StaffRef) => r.name ?? t('property.staffMember')

/** A refusal as staff read it: each code the server named, or the general message. */
function refusalText(t: T, e: ApiErrorBody): string[] {
  if (e.code === 'STALE_VERSION') return [t('property.stale')]
  if (e.code === 'FORBIDDEN') return [t('error.FORBIDDEN')]
  const named = [...new Set(e.fieldErrors.map((f) => codeLabel(t, 'visitProblem', f.code)))]
  return named.length > 0 ? named : [t('request.saveFailed')]
}

/** One write: an idempotency key kept across a lost reply, the refusal named, the visits reloaded after. */
function useSend(t: T, fetchImpl: Fetch, onDone: () => void) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string[] | null>(null)
  const key = useRef<string | null>(null)
  async function send(path: string, body: unknown, version?: number) {
    setPending(true)
    key.current = key.current ?? idempotencyKey()
    const r = await call(fetchImpl, path, {
      method: 'POST',
      body,
      headers: { 'idempotency-key': key.current, ...(version === undefined ? {} : { 'if-match': `"${version}"` }) },
    })
    setPending(false)
    if (r.ok || r.status < 500) key.current = null
    if (!r.ok) return setError(refusalText(t, r.error))
    setError(null)
    onDone()
  }
  return { pending, error, send }
}

function Check({
  testId,
  title,
  done,
  t,
  children,
}: {
  testId: string
  title: string
  done: boolean
  t: T
  children: ReactNode
}) {
  return (
    <li data-testid={testId} data-done={done ? 'true' : 'false'}>
      <p>
        <strong>{title}</strong>{' '}
        <StatusBadge tone={done ? 'success' : 'warning'}>
          {done ? t('siteChecks.done') : t('siteChecks.missing')}
        </StatusBadge>
      </p>
      {children}
    </li>
  )
}

function AddressCheck({ t, fetchImpl, data, when, onDone }: Props) {
  const ids = useId()
  const [choice, setChoice] = useState('')
  const [state, setState] = useState('')
  const [county, setCounty] = useState('')
  const [checked, setChecked] = useState(false)
  const s = useSend(t, fetchImpl, onDone)
  const { property, address } = data
  const picked = SERVICE_AREA.find((c) => `${c.state}:${c.county}` === choice)
  const ready = checked && (picked !== undefined || (choice === OTHER_COUNTY && state.trim() && county.trim()))
  function submit(e: FormEvent) {
    e.preventDefault()
    if (!ready) return
    void s.send(
      `/staff/properties/${encodeURIComponent(property.id)}/county-verification`,
      {
        addressVersion: property.addressVersion,
        addressChecked: true,
        state: picked ? picked.state : state.trim(),
        county: picked ? picked.county : county.trim(),
      },
      property.version,
    )
  }
  return (
    <Check testId="site-check-address" title={t('siteChecks.address.title')} done={address.done} t={t}>
      <p data-testid="site-check-address-value">
        {t('siteChecks.address.value', { address: formatAddress(property.address), version: property.addressVersion })}
      </p>
      <p>{address.verification ? countyVerificationText(t, address.verification, when) : t('property.county.none')}</p>
      {address.problems.length > 0 ? (
        <StateView
          kind="blocked"
          title={t('siteChecks.address.problems')}
          reasons={address.problems.map((c) => codeLabel(t, 'visitProblem', c))}
        />
      ) : null}
      {!address.done && address.problems.length === 0 && data.actions.verifyAddress ? (
        <form className="staff-request__form" aria-label={t('siteChecks.address.record')} onSubmit={submit}>
          <div className="staff-queue__select">
            <label htmlFor={`${ids}-county`}>{t('property.county.county')}</label>
            <select id={`${ids}-county`} value={choice} required onChange={(e) => setChoice(e.target.value)}>
              <option value="">{t('property.county.choose')}</option>
              {SERVICE_AREA.map((c) => (
                <option key={`${c.state}:${c.county}`} value={`${c.state}:${c.county}`}>
                  {t('property.county.name', { county: c.county, state: c.state })}
                </option>
              ))}
              <option value={OTHER_COUNTY}>{t('property.county.other')}</option>
            </select>
          </div>
          {choice === OTHER_COUNTY ? (
            <>
              <Field
                label={t('property.state')}
                value={state}
                maxLength={2}
                required
                onChange={(e) => setState(e.target.value)}
              />
              <Field
                label={t('property.county.otherName')}
                value={county}
                maxLength={100}
                required
                onChange={(e) => setCounty(e.target.value)}
              />
            </>
          ) : null}
          <label className="staff-request__check">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />{' '}
            {t('property.county.addressChecked')}
          </label>
          {s.error ? <StateView kind="error" title={t('siteChecks.refused')} reasons={s.error} /> : null}
          <Button type="submit" pending={s.pending} {...(ready ? {} : { disabledReason: t('property.county.needed') })}>
            {t('siteChecks.address.record')}
          </Button>
        </form>
      ) : null}
    </Check>
  )
}

function contactText(t: T, c: NonNullable<SiteChecks['siteContact']['current']>): string {
  const reach = [c.phone, c.email].filter((x): x is string => x !== null).join(' · ')
  return c.designation === 'customer'
    ? t('siteChecks.contact.customerValue', { name: c.name, reach })
    : t('siteChecks.contact.otherValue', { name: c.name, role: c.role ?? '', reach })
}

function ContactCheck({ t, fetchImpl, data, when, onDone }: Props) {
  const ids = useId()
  const { siteContact } = data
  const [open, setOpen] = useState(false)
  const [designation, setDesignation] = useState<'customer' | 'other'>('customer')
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [authority, setAuthority] = useState<string[]>([])
  const [source, setSource] = useState<string>(SOURCES[0] ?? 'customer_call')
  const [note, setNote] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const s = useSend(t, fetchImpl, () => (setOpen(false), setConfirmed(false), onDone()))
  const current = siteContact.current
  const ready =
    confirmed && (designation === 'customer' || (name.trim() && role.trim() && (phone.trim() || email.trim())))
  function submit(e: FormEvent) {
    e.preventDefault()
    if (!ready) return
    const person =
      designation === 'other'
        ? { fullName: name.trim(), role: role.trim(), phone: phone.trim() || null, email: email.trim() || null }
        : {}
    void s.send(`/staff/projects/${encodeURIComponent(data.projectId)}/site-contact`, {
      currentVersion: current?.version ?? 0,
      designation,
      ...person,
      authority,
      source,
      note: note.trim() || null,
    })
  }
  return (
    <Check testId="site-check-contact" title={t('siteChecks.contact.title')} done={siteContact.done} t={t}>
      <p data-testid="site-check-contact-value">
        {current
          ? t('siteChecks.contact.recorded', {
              contact: contactText(t, current),
              authority:
                current.authority.length > 0
                  ? current.authority.map((a) => codeLabel(t, 'siteContactAuthority', a)).join(', ')
                  : t('siteChecks.contact.noAuthority'),
              name: who(t, current.recordedBy),
              time: when(current.recordedAt),
            })
          : t('siteChecks.contact.none')}
      </p>
      {siteContact.problem && siteContact.problem !== 'SITE_CONTACT_MISSING' ? (
        <StateView kind="blocked" title={codeLabel(t, 'visitProblem', siteContact.problem)} />
      ) : null}
      <p className="staff-request__hint">{t('siteChecks.contact.limits')}</p>
      {data.actions.recordSiteContact && !open ? (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {t('siteChecks.contact.record')}
        </Button>
      ) : null}
      {open ? (
        <form className="staff-request__form" aria-label={t('siteChecks.contact.record')} onSubmit={submit}>
          <fieldset className="staff-request__check">
            <legend>{t('siteChecks.contact.who')}</legend>
            {(['customer', 'other'] as const).map((d) => (
              <label key={d} className="staff-request__check">
                <input
                  type="radio"
                  name={`${ids}-designation`}
                  checked={designation === d}
                  onChange={() => setDesignation(d)}
                />{' '}
                {codeLabel(t, 'siteContactDesignation', d)}
              </label>
            ))}
          </fieldset>
          {designation === 'customer' ? (
            <p data-testid="site-contact-customer">
              {siteContact.customer
                ? t('siteChecks.contact.customerValue', {
                    name: siteContact.customer.name,
                    reach: [siteContact.customer.phone, siteContact.customer.email].filter(Boolean).join(' · '),
                  })
                : t('siteChecks.contact.noCustomer')}
            </p>
          ) : (
            <>
              <Field
                label={t('siteChecks.contact.name')}
                value={name}
                maxLength={200}
                required
                onChange={(e) => setName(e.target.value)}
              />
              <Field
                label={t('siteChecks.contact.role')}
                hint={t('siteChecks.contact.roleHint')}
                value={role}
                maxLength={100}
                required
                onChange={(e) => setRole(e.target.value)}
              />
              <Field
                label={t('siteChecks.contact.phone')}
                value={phone}
                maxLength={40}
                type="tel"
                onChange={(e) => setPhone(e.target.value)}
              />
              <Field
                label={t('siteChecks.contact.email')}
                value={email}
                maxLength={254}
                type="email"
                onChange={(e) => setEmail(e.target.value)}
              />
            </>
          )}
          <fieldset className="staff-request__check">
            <legend>{t('siteChecks.contact.authority')}</legend>
            {AUTHORITIES.map((a) => (
              <label key={a} className="staff-request__check">
                <input
                  type="checkbox"
                  checked={authority.includes(a)}
                  onChange={() => setAuthority((l) => (l.includes(a) ? l.filter((x) => x !== a) : [...l, a]))}
                />{' '}
                {codeLabel(t, 'siteContactAuthority', a)}
              </label>
            ))}
          </fieldset>
          <div className="staff-queue__select">
            <label htmlFor={`${ids}-source`}>{t('siteChecks.contact.source')}</label>
            <select id={`${ids}-source`} value={source} onChange={(e) => setSource(e.target.value)}>
              {SOURCES.map((x) => (
                <option key={x} value={x}>
                  {codeLabel(t, 'detailSource', x)}
                </option>
              ))}
            </select>
          </div>
          <Field
            label={t('siteChecks.contact.note')}
            value={note}
            maxLength={1000}
            onChange={(e) => setNote(e.target.value)}
          />
          <label className="staff-request__check">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />{' '}
            {t('siteChecks.contact.confirmed')}
          </label>
          {s.error ? <StateView kind="error" title={t('siteChecks.refused')} reasons={s.error} /> : null}
          <div className="hh-button-row">
            <Button
              type="submit"
              pending={s.pending}
              {...(ready ? {} : { disabledReason: t('siteChecks.contact.needed') })}
            >
              {t('siteChecks.contact.record')}
            </Button>
            <Button variant="quiet" onClick={() => setOpen(false)}>
              {t('customer.cancel')}
            </Button>
          </div>
        </form>
      ) : null}
    </Check>
  )
}

function CoverageCheck({ t, fetchImpl, data, when, onDone }: Props) {
  const { coverage, address } = data
  const [checked, setChecked] = useState(false)
  const [reason, setReason] = useState('')
  const s = useSend(t, fetchImpl, onDone)
  const county = address.verification
  const a = coverage.acceptance
  const base = `/staff/projects/${encodeURIComponent(data.projectId)}`
  return (
    <Check testId="site-check-coverage" title={t('siteChecks.coverage.title')} done={coverage.done} t={t}>
      <p data-testid="site-check-coverage-value">
        {coverage.outcome && county
          ? t(coverage.outcome === 'served' ? 'siteChecks.coverage.served' : 'siteChecks.coverage.outside', {
              county: county.county,
              state: county.state,
            })
          : t('siteChecks.coverage.waiting')}
      </p>
      {a ? (
        <p data-testid="site-check-coverage-acceptance">
          {a.outcome === 'served'
            ? t('siteChecks.coverage.accepted', { name: who(t, a.acceptedBy), time: when(a.acceptedAt) })
            : t('siteChecks.coverage.exception', {
                name: who(t, a.acceptedBy),
                time: when(a.acceptedAt),
                reason: a.exceptionReason ?? '',
              })}
        </p>
      ) : null}
      {coverage.outcome === 'outside' && !a ? (
        <p className="staff-request__hint">{t('siteChecks.coverage.needsOwner')}</p>
      ) : null}
      {data.actions.acceptCoverage && coverage.countyVerificationId ? (
        <form
          className="staff-request__form"
          aria-label={t('siteChecks.coverage.accept')}
          onSubmit={(e) => {
            e.preventDefault()
            if (checked)
              void s.send(`${base}/coverage-acceptance`, { countyVerificationId: coverage.countyVerificationId })
          }}
        >
          <label className="staff-request__check">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />{' '}
            {t('siteChecks.coverage.acceptCheck', { county: county?.county ?? '', state: county?.state ?? '' })}
          </label>
          {s.error ? <StateView kind="error" title={t('siteChecks.refused')} reasons={s.error} /> : null}
          <Button
            type="submit"
            pending={s.pending}
            {...(checked ? {} : { disabledReason: t('siteChecks.coverage.acceptNeeded') })}
          >
            {t('siteChecks.coverage.accept')}
          </Button>
        </form>
      ) : null}
      {data.actions.approveException && coverage.countyVerificationId ? (
        <form
          className="staff-request__form"
          aria-label={t('siteChecks.coverage.approve')}
          onSubmit={(e) => {
            e.preventDefault()
            if (checked && reason.trim())
              void s.send(`${base}/coverage-exception`, {
                countyVerificationId: coverage.countyVerificationId,
                reason: reason.trim(),
              })
          }}
        >
          <p className="staff-request__hint">{t('siteChecks.coverage.exceptionLimits')}</p>
          <Field
            label={t('siteChecks.coverage.reason')}
            value={reason}
            maxLength={1000}
            required
            onChange={(e) => setReason(e.target.value)}
          />
          <label className="staff-request__check">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />{' '}
            {t('siteChecks.coverage.approveCheck', { county: county?.county ?? '', state: county?.state ?? '' })}
          </label>
          {s.error ? <StateView kind="error" title={t('siteChecks.refused')} reasons={s.error} /> : null}
          <Button
            type="submit"
            pending={s.pending}
            {...(checked && reason.trim() ? {} : { disabledReason: t('siteChecks.coverage.approveNeeded') })}
          >
            {t('siteChecks.coverage.approve')}
          </Button>
        </form>
      ) : null}
    </Check>
  )
}

type Props = {
  t: T
  fetchImpl: Fetch
  data: SiteChecks & { projectId: string }
  when: (iso: string) => string
  onDone: () => void
}

/** The three site checks of a project, with what each rests on; the visits reload after every record. */
export function SiteChecksPanel({
  t,
  fetchImpl,
  projectId,
  checks,
  when,
  onChanged,
}: {
  t: T
  fetchImpl: Fetch
  projectId: string
  checks: SiteChecks
  when: (iso: string) => string
  onChanged: () => void
}) {
  const ids = useId()
  const props: Props = { t, fetchImpl, data: { ...checks, projectId }, when, onDone: onChanged }
  return (
    <div aria-labelledby={`${ids}-checks`} data-testid="site-checks">
      <h3 id={`${ids}-checks`}>{t('siteChecks.title')}</h3>
      <p className="staff-request__hint">{t('siteChecks.hint')}</p>
      <ol className="staff-request__list">
        <AddressCheck {...props} />
        <ContactCheck {...props} />
        <CoverageCheck {...props} />
      </ol>
    </div>
  )
}
