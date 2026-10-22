// Business settings and the legal documents on the Owner's Settings screen (TSK-0144; OWN-DEC-183, OWN-DEC-187,
// HH-FIN-04, HH-EST-13, FACT-BUSINESS-ADDRESS, RULE-LANGUAGES).
// - MailingAddressSetting: the mailing address in force, or NOT CONFIGURED (documents then omit the line). The Owner
//   enters it (one line per row), or removes it, with a reason and a fresh sign-in; the server records a new
//   configuration version and audits the change without the address itself. The value is the Owner's own entry on
//   staging and production; nothing here or in the tests holds a real address.
// - LegalDocumentsView: each legal document's recorded version, its status, the owner's sign-off of the estimate
//   terms (OWN-DEC-187) and what still waits on review: attorney review is shown as open, never as done.
// Both are hidden when the server refuses them (another role).
import type { StaffKey } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { call, type ApiErrorBody, type Fetch } from './api'
import { ReauthForm, useOwnerWrite } from './OwnerWrite'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

/** The server's limits (apps/server/src/modules/business MAILING_ADDRESS_MAX_LINES and _MAX_LINE). */
const MAX_LINES = 4
const MAX_LINE = 120

export type MailingAddress = {
  state: 'CONFIGURED' | 'NOT_CONFIGURED'
  version: number | null
  lines: string[] | null
  sourceIds: string[]
}

function refusal(t: T, err: ApiErrorBody): string[] {
  if (err.code === 'STALE_VERSION') return [t('ownerApproval.stale')]
  if (err.code === 'FRESH_AUTH_REQUIRED') return [t('ownerApproval.freshSignIn')]
  return [t('ownerApproval.failed')]
}

/** The address lines typed in the box: one per row, blank rows dropped. */
export function addressLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l !== '')
}

export function MailingAddressSetting({
  t,
  fetchImpl,
  onSession,
}: {
  t: T
  fetchImpl: Fetch
  onSession?: (s: { csrfToken: string }) => void
}) {
  const ids = useId()
  const [setting, setSetting] = useState<MailingAddress | null>(null)
  const [text, setText] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<{ text?: string; reason?: string }>({})
  const [result, setResult] = useState<{ ok: boolean; cleared: boolean; text: string[] } | null>(null)
  const w = useOwnerWrite(fetchImpl, onSession)
  useEffect(() => {
    void call<{ mailingAddress: MailingAddress }>(fetchImpl, '/staff/settings/business-details').then((r) =>
      setSetting(r.ok && typeof r.data?.mailingAddress?.state === 'string' ? r.data.mailingAddress : null),
    )
  }, [fetchImpl])
  if (!setting) return null

  async function save(lines: string[] | null) {
    if (!setting) return
    const next: { text?: string; reason?: string } = {}
    if (lines !== null && lines.length === 0) next.text = t('businessDetails.address.empty')
    if (lines !== null && (lines.length > MAX_LINES || lines.some((l) => l.length > MAX_LINE)))
      next.text = t('businessDetails.address.tooLong', { max: MAX_LINES, length: MAX_LINE })
    if (reason.trim() === '') next.reason = t('businessDetails.address.reasonRequired')
    setErrors(next)
    if (next.text || next.reason) return
    setResult(null)
    await w.send<MailingAddress>(
      '/staff/settings/business-details/mailing-address',
      { lines, reason: reason.trim() },
      (r) => {
        if (!r.ok) return setResult({ ok: false, cleared: false, text: refusal(t, r.error) })
        setSetting(r.data)
        setText('')
        setReason('')
        setResult({ ok: true, cleared: r.data.state === 'NOT_CONFIGURED', text: [] })
      },
      { 'if-match': `"${setting.version ?? 0}"` },
      'PUT',
    )
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    void save(addressLines(text))
  }

  return (
    <section className="staff-request__section" aria-labelledby={`${ids}-business`} data-testid="business-details">
      <h2 id={`${ids}-business`} className="staff-queue__heading">
        {t('businessDetails.title')}
      </h2>
      {setting.state === 'CONFIGURED' && setting.lines ? (
        <div data-testid="mailing-address-current">
          <p>{t('businessDetails.address.current', { n: setting.version ?? 0 })}</p>
          <address>
            {setting.lines.map((l, i) => (
              <span key={i}>
                {l}
                <br />
              </span>
            ))}
          </address>
        </div>
      ) : (
        <p data-testid="mailing-address-current">
          <StatusBadge tone="warning">{t('businessDetails.notConfigured')}</StatusBadge>{' '}
          {t('businessDetails.address.notConfigured')}
        </p>
      )}
      <p className="staff-request__hint">{t('businessDetails.address.hint')}</p>
      <p className="staff-request__hint">{t('businessDetails.address.legalQuestion')}</p>
      <ReauthForm t={t} w={w} />
      {!w.reauth ? (
        <form onSubmit={submit} noValidate aria-label={t('businessDetails.address.change')}>
          <Field
            multiline
            label={t('businessDetails.address.label', { max: MAX_LINES })}
            name="mailingAddress"
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
            {...(errors.text ? { error: errors.text } : {})}
          />
          <Field
            multiline
            label={t('businessDetails.address.reason')}
            name="mailingAddressReason"
            value={reason}
            maxLength={1000}
            onChange={(e) => setReason(e.target.value)}
            {...(errors.reason ? { error: errors.reason } : {})}
          />
          <div className="hh-button-row">
            <Button type="submit" pending={w.pending}>
              {t('businessDetails.address.save')}
            </Button>
            {setting.state === 'CONFIGURED' ? (
              <Button variant="quiet" onClick={() => void save(null)}>
                {t('businessDetails.address.clear')}
              </Button>
            ) : null}
          </div>
        </form>
      ) : null}
      {result?.ok ? (
        <StateView
          kind="success"
          title={result.cleared ? t('businessDetails.address.cleared') : t('businessDetails.address.saved')}
        />
      ) : null}
      {result && !result.ok ? (
        <StateView kind="error" title={t('ownerApproval.refused')} reasons={result.text} />
      ) : null}
    </section>
  )
}

export type LegalDocumentEntry = {
  key: string
  state: 'CONFIGURED' | 'NOT_CONFIGURED'
  version: number | null
  documentId: string | null
  status: 'draft' | 'owner_review_pending' | 'approved' | null
  attorneyReviewed: boolean | null
  attorneyReviewRequired: boolean | null
  ownerSignOff: { by: string; decisionId: string; source: string; signedOn: string; wording: string } | null
  inEffect: boolean | null
  wordingMatches: boolean
  effectiveFrom: string | null
  waitsOn: string[]
  realUseWaitsOn: string[]
}

const DOCUMENT_NAMES: Record<string, StaffKey> = {
  'legal.privacy_notice': 'legalDocuments.name.privacyNotice',
  'legal.sms_terms': 'legalDocuments.name.smsTerms',
  'legal.website_terms': 'legalDocuments.name.websiteTerms',
  'legal.sms_disclosure': 'legalDocuments.name.smsDisclosure',
  'legal.estimate_terms': 'legalDocuments.name.estimateTerms',
}
const STATUS: Record<NonNullable<LegalDocumentEntry['status']>, StaffKey> = {
  draft: 'legalDocuments.status.draft',
  owner_review_pending: 'legalDocuments.status.ownerReviewPending',
  approved: 'legalDocuments.status.approved',
}

function DocumentItem({ t, d }: { t: T; d: LegalDocumentEntry }) {
  const name = DOCUMENT_NAMES[d.key]
  const title = name ? t(name) : d.key
  return (
    <li className="staff-queue__item" aria-label={title} data-testid={`legal-document-${d.key}`}>
      <h3 className="staff-queue__title">{title}</h3>
      {d.state === 'NOT_CONFIGURED' || d.status === null ? (
        <p>
          <StatusBadge tone="warning">{t('businessDetails.notConfigured')}</StatusBadge>
        </p>
      ) : (
        <>
          <p>
            <StatusBadge tone={d.status === 'approved' ? 'success' : 'warning'}>{t(STATUS[d.status])}</StatusBadge>{' '}
            {t('legalDocuments.version', { documentId: d.documentId ?? '', n: d.version ?? 0 })}
          </p>
          {d.ownerSignOff ? (
            <p>
              {t('legalDocuments.signOff', {
                decisionId: d.ownerSignOff.decisionId,
                signedOn: d.ownerSignOff.signedOn,
                source: d.ownerSignOff.source,
                wording: d.ownerSignOff.wording,
              })}
            </p>
          ) : null}
          <p>{d.attorneyReviewed ? t('legalDocuments.attorney.reviewed') : t('legalDocuments.attorney.notReviewed')}</p>
          {d.attorneyReviewRequired === false && !d.attorneyReviewed ? (
            <p>{t('legalDocuments.attorney.notRequired')}</p>
          ) : null}
          {d.inEffect === null ? null : (
            <p>{d.inEffect ? t('legalDocuments.inEffect') : t('legalDocuments.notInEffect')}</p>
          )}
          {d.wordingMatches ? null : <p>{t('legalDocuments.wordingMismatch')}</p>}
        </>
      )}
      {d.waitsOn.length > 0 ? <p>{t('legalDocuments.waitsOn', { ids: d.waitsOn.join(', ') })}</p> : null}
      {d.realUseWaitsOn.length > 0 ? (
        <p>{t('legalDocuments.realUseWaitsOn', { ids: d.realUseWaitsOn.join(', ') })}</p>
      ) : null}
    </li>
  )
}

export function LegalDocumentsView({ t, fetchImpl }: { t: T; fetchImpl: Fetch }) {
  const ids = useId()
  const [docs, setDocs] = useState<LegalDocumentEntry[] | null>(null)
  useEffect(() => {
    void call<{ documents: LegalDocumentEntry[] }>(fetchImpl, '/staff/settings/legal-documents').then((r) =>
      setDocs(r.ok && Array.isArray(r.data?.documents) ? r.data.documents : null),
    )
  }, [fetchImpl])
  if (!docs) return null
  return (
    <section className="staff-request__section" aria-labelledby={`${ids}-legal`} data-testid="legal-documents">
      <h2 id={`${ids}-legal`} className="staff-queue__heading">
        {t('legalDocuments.title')}
      </h2>
      <p className="staff-request__hint">{t('legalDocuments.hint')}</p>
      <ul className="staff-queue__items" aria-label={t('legalDocuments.title')}>
        {docs.map((d) => (
          <DocumentItem key={d.key} t={t} d={d} />
        ))}
      </ul>
    </section>
  )
}
