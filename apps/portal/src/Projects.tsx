// /portal: the projects this session opens (TSK-0038; HH-PORT-02, HH-PORT-06, HH-ARC-10, OWN-DEC-106). A guest link
// opens one project; an account (TSK-0036) its linked projects. Each shows its status and who is waiting.
// TSK-0124 (HH-ID-14, OWN-DEC-160): the permanent dashboard. The projects sit in three sections, Active, Project
// History (completed) and Cancelled and archived, each with a link to its documents; the page offers a new request;
// and an account adds another guest project with a code sent to that project's own verified contact (Add a project:
// the answer to the code request says the same whatever was typed, HH-ID-03). The wording is PROPOSED
// (OQ-CUSTOMER-DASHBOARD-DETAILS) except "Project History", the owner's words.
// TSK-0113 (HH-ID-12, OWN-DEC-113): an account's dashboard links to its saved properties and preferences, and each of its
// projects offers Request This Service Again (the request form starts from that project's services, address and
// contact, which the customer confirms are still current). A guest link's session offers neither. Wording PROPOSED
// (OQ-SAVED-PROPERTIES-DETAILS) except "Request This Service Again", the owner's words.
// TSK-0118 (HH-ID-13): an account's dashboard links to its organizations, and a project shared with it through an
// organization membership says by which organization (it offers no Request This Service Again: the request belongs to
// the project's own customer). Wording PROPOSED (OQ-ORGANIZATION-ACCOUNTS-DETAILS).
import type { CustomerKey } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { REFERENCE, SECTIONS, portalApi, type ClaimFailure, type Fetch, type ProjectSummary, type Section } from './api'
import { SITUATION_LABEL, t, WAITING_LABEL } from './labels'
import { useLive } from './live'
import { NotShown, RefreshLine } from './States'

const SECTION: Record<Section, { title: CustomerKey; empty: CustomerKey }> = {
  active: { title: 'portal.projects.section.active', empty: 'portal.projects.section.activeEmpty' },
  completed: { title: 'portal.projects.section.completed', empty: 'portal.projects.section.completedEmpty' },
  archived: { title: 'portal.projects.section.archived', empty: 'portal.projects.section.archivedEmpty' },
}

function Item({ p, account }: { p: ProjectSummary; account: boolean }) {
  return (
    <li className="portal-projects__item" aria-label={t('portal.project.title', { reference: p.reference })}>
      <h3 className="hh-h3">
        <a href={`/portal/p/${encodeURIComponent(p.reference)}`}>
          {t('portal.projects.open', { reference: p.reference })}
        </a>
      </h3>
      <p>{[...p.services, ...(p.notSure ? [t('request.services.notSure')] : [])].join(', ')}</p>
      {p.organization ? (
        <p className="hh-small">
          <StatusBadge tone="info">{t('portal.projects.sharedBy', { organization: p.organization.name })}</StatusBadge>
        </p>
      ) : null}
      <p>
        <strong>{t(SITUATION_LABEL[p.status.situation])}</strong>{' '}
        <StatusBadge tone={p.status.waitingOn === 'customer' ? 'warning' : 'neutral'}>
          {t(WAITING_LABEL[p.status.waitingOn])}
        </StatusBadge>
      </p>
      <p>
        <a href={`/portal/p/${encodeURIComponent(p.reference)}/documents`}>
          {t('portal.projects.documents.link', { reference: p.reference })}
        </a>{' '}
        <span className="hh-small hh-muted">{t('portal.projects.documents.count', { count: p.documents })}</span>
      </p>
      {account && !p.organization ? (
        <p>
          <a
            className="hh-button hh-button--secondary"
            href={`/request?again=${encodeURIComponent(p.reference)}`}
            aria-label={t('portal.projects.againLabel', { reference: p.reference })}
          >
            {t('portal.projects.again')}
          </a>
        </p>
      ) : null}
    </li>
  )
}

const CLAIM_PROBLEM: Record<Exclude<ClaimFailure, 'invalid_reference' | 'invalid_contact'>, CustomerKey> = {
  expired: 'portal.expired.title',
  unavailable: 'portal.claim.failed',
  texts_unavailable: 'account.textsUnavailable',
  invalid_code: 'request.verify.error.invalidCode',
  rate_limited: 'portal.estimate.failure.rate_limited',
  not_configured: 'portal.claim.notConfigured',
  failed: 'portal.claim.failed',
}

/** Add a project: the request reference and the contact on that request, then the code sent to that contact. */
function AddProject({ listed, fetchImpl, onAdded }: { listed: string[]; fetchImpl: Fetch; onAdded: () => void }) {
  const [reference, setReference] = useState('')
  const [contact, setContact] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState<{ minutes: number } | null>(null)
  const [errors, setErrors] = useState<{ reference?: CustomerKey; contact?: CustomerKey; code?: CustomerKey }>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<'send' | 'claim' | null>(null)
  const area = useRef<HTMLElement>(null)
  const focus = (name: string) => area.current?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.focus()

  useEffect(() => {
    if (sent) focus('claim-code')
  }, [sent])

  const problem = (f: ClaimFailure) => {
    if (f === 'invalid_reference') return setErrors({ reference: 'portal.claim.error.reference' })
    if (f === 'invalid_contact') return setErrors({ contact: 'access.recover.error.contact' })
    if (f === 'invalid_code') return setErrors({ code: CLAIM_PROBLEM.invalid_code })
    setNotice(t(CLAIM_PROBLEM[f]))
  }

  const send = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const ref = reference.trim().toUpperCase()
    setNotice(null)
    if (!REFERENCE.test(ref)) {
      setErrors({ reference: 'portal.claim.error.reference' })
      return focus('claim-reference')
    }
    if (!contact.trim()) {
      setErrors({ contact: 'access.recover.error.contact' })
      return focus('claim-contact')
    }
    setErrors({})
    // Already on this page: nothing to send (the server would answer the same as for any other details).
    if (listed.includes(ref)) return setNotice(t('portal.claim.already'))
    setBusy('send')
    const r = await portalApi.sendClaimCode(fetchImpl, ref, contact)
    setBusy(null)
    if (!r.ok) return problem(r.failure)
    setCode('')
    setSent({ minutes: r.minutes })
  }

  const claim = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (!code.trim()) return setErrors({ code: 'request.verify.error.invalidCode' })
    setBusy('claim')
    setNotice(null)
    setErrors({})
    const r = await portalApi.claimProject(fetchImpl, reference.trim().toUpperCase(), contact, code)
    setBusy(null)
    if (!r.ok) return problem(r.failure)
    setReference('')
    setContact('')
    setCode('')
    setSent(null)
    setNotice(t('portal.claim.done', { reference: r.reference }))
    onAdded()
  }

  return (
    <section ref={area} className="portal-section portal-claim" aria-labelledby="portal-claim-title">
      <h2 id="portal-claim-title" className="hh-h3">
        {t('portal.claim.title')}
      </h2>
      <p>{t('portal.claim.text')}</p>
      <form className="portal-claim__form" onSubmit={(e) => void send(e)} noValidate>
        <Field
          label={t('portal.claim.reference')}
          name="claim-reference"
          autoComplete="off"
          spellCheck={false}
          maxLength={40}
          value={reference}
          onChange={(e) => {
            setReference(e.target.value)
            setSent(null)
          }}
          {...(errors.reference ? { error: t(errors.reference) } : {})}
        />
        <Field
          label={t('account.signIn.contact')}
          name="claim-contact"
          autoComplete="off"
          spellCheck={false}
          maxLength={320}
          value={contact}
          onChange={(e) => {
            setContact(e.target.value)
            setSent(null)
          }}
          {...(errors.contact ? { error: t(errors.contact) } : {})}
        />
        <Button type="submit" variant={sent ? 'secondary' : 'primary'} pending={busy === 'send'}>
          {sent ? t('request.verify.resend') : t('account.signIn.send')}
        </Button>
      </form>
      {sent ? (
        <>
          <p role="status">{t('portal.claim.sent', { minutes: sent.minutes })}</p>
          <form className="portal-claim__form" onSubmit={(e) => void claim(e)} noValidate>
            <Field
              label={t('request.verify.code')}
              name="claim-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={10}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              {...(errors.code ? { error: t(errors.code) } : {})}
            />
            <Button type="submit" pending={busy === 'claim'}>
              {t('portal.claim.submit')}
            </Button>
          </form>
        </>
      ) : null}
      <p role="status" className="portal-claim__notice">
        {notice ?? ''}
      </p>
    </section>
  )
}

export function Projects({ fetchImpl }: { fetchImpl: Fetch }) {
  const { live, refresh } = useLive(() => portalApi.projects(fetchImpl), 'projects')
  return (
    <>
      <h1 className="hh-h2">{t('portal.projects.title')}</h1>
      {live.phase !== 'ready' ? (
        <NotShown
          live={live}
          loading="portal.projects.loading"
          failedTitle="portal.projects.failed.title"
          onRetry={() => void refresh()}
        />
      ) : (
        <>
          <RefreshLine
            refreshedAt={live.refreshedAt}
            stale={live.stale}
            refreshing={live.refreshing}
            onRefresh={() => void refresh()}
          />
          <p className="portal-dashboard__actions">
            <a className="hh-button hh-button--secondary" href="/request">
              {t('site.cta.request')}
            </a>
          </p>
          {live.data.access === 'account' ? (
            <nav className="portal-account__links" aria-label={t('portal.account.links')}>
              <a href="/portal/properties">{t('portal.account.properties')}</a>
              <a href="/portal/preferences">{t('portal.account.preferences')}</a>
              <a href="/portal/organizations">{t('portal.account.organizations')}</a>
            </nav>
          ) : null}
          {live.data.projects.length === 0 ? (
            <StateView kind="empty" title={t('portal.projects.empty.title')}>
              <p>{t('portal.projects.empty.text')}</p>
            </StateView>
          ) : (
            SECTIONS.map((section) => {
              const projects = live.data.projects.filter((p) => p.section === section)
              return (
                <section
                  key={section}
                  className="portal-dashboard__section"
                  aria-labelledby={`portal-section-${section}`}
                >
                  <h2 id={`portal-section-${section}`} className="hh-h3">
                    {t(SECTION[section].title)}
                  </h2>
                  {projects.length === 0 ? (
                    <p className="hh-muted">{t(SECTION[section].empty)}</p>
                  ) : (
                    <ul className={live.stale ? 'portal-projects portal-section--stale' : 'portal-projects'}>
                      {projects.map((p) => (
                        <Item key={p.reference} p={p} account={live.data.access === 'account'} />
                      ))}
                    </ul>
                  )}
                </section>
              )
            })
          )}
          {live.data.access === 'account' ? (
            <AddProject
              listed={live.data.projects.map((p) => p.reference)}
              fetchImpl={fetchImpl}
              onAdded={() => void refresh()}
            />
          ) : null}
        </>
      )}
    </>
  )
}
