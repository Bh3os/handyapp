// The estimate terms in the portal (TSK-0056; HH-EST-13, OWN-DEC-127, RULE-NO-INVENTED-FACTS, RULE-LANGUAGES).
// - The wording is the versioned document of @handyhub/domain/legal (ESTIMATE_TERMS) in the English customer catalog,
//   in numbered sections, with the decided values the document states (its `values`, kept equal to the active
//   configuration by a server test). The server decides which document a version pinned and whether its recorded
//   version matches this exact wording; the portal only shows a document it holds under that ID.
// - While the terms are not approved for real customers they carry the banner "TEST — wording pending owner approval
//   for real customer use" and say they are not in effect: unapproved wording is never presented as binding.
// - Shown two ways (HH-EST-13): an expandable section on the estimate, and a page of its own (/portal/terms/<id>).
import {
  estimateTermsDocument,
  legalDocument,
  type EstimateTermsDocument,
  type LegalBlock,
} from '@handyhub/domain/legal'
import type { CustomerKey } from '@handyhub/i18n'
import { cents, formatUsd } from '@handyhub/money'
import { StateView } from '@handyhub/ui'
import { t } from './labels'

/** The ICU values of the document: whole numbers as they are, an amount (`fooCents`) as en-US currency (`foo`). */
export function termsValues(doc: EstimateTermsDocument): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const [name, value] of Object.entries(doc.values)) {
    if (name.endsWith('Cents')) out[name.slice(0, -'Cents'.length)] = formatUsd(cents(value))
    else out[name] = value
  }
  return out
}

/** "October 21, 2026" from YYYY-MM-DD, whatever the browser's time zone. */
function dayText(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  )
}

function Block({ b, values }: { b: LegalBlock; values: Record<string, string | number> }) {
  const tx = (key: string) => t(key as CustomerKey, values)
  switch (b.kind) {
    case 'p':
      return <p>{tx(b.key)}</p>
    case 'list':
      return (
        <ul>
          {b.keys.map((k) => (
            <li key={k}>{tx(k)}</li>
          ))}
        </ul>
      )
    case 'link':
      return (
        <p>
          <a href={legalDocument(b.to).path}>{tx(b.key)}</a>
        </p>
      )
    default:
      // The estimate terms hold no pending or contact block: nothing is shown in their place.
      return null
  }
}

/** The banner of terms that are not approved for real customers, and that they are not in effect. */
export function NotInEffect() {
  return (
    <div className="portal-terms__banner" role="note" data-testid="terms-test-banner">
      <p className="portal-terms__banner-title">
        <strong>{t('legal.estimateTerms.testBanner')}</strong>
      </p>
      <p>{t('legal.estimateTerms.notInEffect')}</p>
    </div>
  )
}

/** The full wording of one terms document, numbered by section. `level` is the heading level of its sections. */
export function TermsText({ doc, level = 3 }: { doc: EstimateTermsDocument; level?: 2 | 3 | 4 }) {
  const values = termsValues(doc)
  const H = `h${level}` as 'h2' | 'h3' | 'h4'
  return (
    <div className="portal-terms" data-document-id={doc.documentId}>
      <p className="hh-small hh-muted">
        {t('legal.estimateTerms.version', {
          label: doc.label,
          preparedOn: dayText(doc.preparedOn),
          documentId: doc.documentId,
        })}
      </p>
      <p>{t(doc.summary as CustomerKey)}</p>
      <ol className="portal-terms__sections">
        {doc.sections.map((s) => (
          <li key={s.id} id={`terms-${s.id}`}>
            <H className="portal-terms__heading">{t(s.heading as CustomerKey)}</H>
            {s.blocks.map((b, i) => (
              <Block key={i} b={b} values={values} />
            ))}
          </li>
        ))}
      </ol>
    </div>
  )
}

/** The page of its own: /portal/terms/<document id>. Any other ID is a truthful "not available". */
export function TermsPage({ documentId }: { documentId: string }) {
  const doc = estimateTermsDocument(documentId)
  return (
    <>
      <p className="portal-back">
        <a href="/portal/">{t('portal.terms.back')}</a>
      </p>
      {doc ? (
        <article aria-labelledby="portal-terms-title">
          <h1 id="portal-terms-title" className="hh-h2">
            {t(doc.title as CustomerKey)}
          </h1>
          {doc.status !== 'approved' || !doc.attorneyReviewed ? <NotInEffect /> : null}
          <TermsText doc={doc} level={2} />
        </article>
      ) : (
        <StateView kind="blocked" title={t('portal.terms.unknown.title')}>
          <p>{t('portal.terms.unknown.text')}</p>
        </StateView>
      )}
    </>
  )
}
