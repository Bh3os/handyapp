// /portal/organizations: the signed-in account's organizations (TSK-0118; HH-ID-13, HH-ID-03, HH-ID-02). One page:
// - Invitations to the account's own sign-in email: accept or decline. Before accepting, only the organization's name,
//   the privileges and how many projects; nothing is reachable until the customer accepts.
// - Organizations the account belongs to: the privileges and the projects shared with it now; Leave.
// - Organizations the account manages: the projects it shares (only its own; Stop sharing removes one from every
//   scope), the people (invited or members, each with a scope and privileges: Change access, Remove or Withdraw), the
//   invitation of one exact email address (nothing is sent) and the history.
// - Set up an organization.
// Every change is decided on the server, which answers with the whole page again; the page never assumes success. The
// wording is PROPOSED (OQ-ORGANIZATION-ACCOUNTS-DETAILS).
import type { CustomerKey } from '@handyhub/i18n'
import { Button, Field, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import {
  portalApi,
  type AccountOrganizations,
  type AdministeredOrganization,
  type Fetch,
  type Failure,
  type MemberScope,
  type OrganizationFailure,
  type OrganizationHistoryEntry,
  type OrganizationMember,
} from './api'
import { t, when } from './labels'
import { NotShown } from './States'

type Load =
  | { phase: 'loading' }
  | { phase: 'failed'; failure: Failure; retrying: boolean }
  | { phase: 'ready'; data: AccountOrganizations }

const PROBLEM: Record<OrganizationFailure, CustomerKey> = {
  expired: 'portal.expired.title',
  unavailable: 'portal.organizations.error.failed',
  invalid_name: 'portal.organizations.error.name',
  invalid_email: 'portal.organizations.error.email',
  own_email: 'portal.organizations.error.ownEmail',
  already_invited: 'portal.organizations.error.alreadyInvited',
  already_shared: 'portal.organizations.error.alreadyShared',
  already_member: 'portal.organizations.error.alreadyMember',
  invalid_scope: 'portal.organizations.error.scope',
  rate_limited: 'portal.estimate.failure.rate_limited',
  failed: 'portal.organizations.error.failed',
}

/** PROPOSED: an organization's name is 1 to 80 characters (the server checks the same). */
const NAME_MAX = 80

type Act = (
  run: () => ReturnType<typeof portalApi.createOrganization>,
  done: string,
) => Promise<{ ok: true } | { ok: false; problem: CustomerKey }>

function Privileges({ approve, pay }: { approve: boolean; pay: boolean }) {
  return (
    <ul className="portal-organizations__privileges">
      <li>{t('portal.organizations.privilege.view')}</li>
      {approve ? <li>{t('portal.organizations.privilege.approve')}</li> : null}
      {pay ? <li>{t('portal.organizations.privilege.pay')}</li> : null}
    </ul>
  )
}

/** The scope and privileges of a membership: the shared projects it reaches, approve and pay. */
function ScopeFields({
  name,
  shared,
  scope,
  onChange,
}: {
  name: string
  shared: string[]
  scope: MemberScope
  onChange: (s: MemberScope) => void
}) {
  const toggle = (reference: string, on: boolean) =>
    onChange({
      ...scope,
      projects: on ? [...scope.projects, reference] : scope.projects.filter((r) => r !== reference),
    })
  return (
    <>
      <fieldset className="portal-estimate__options">
        <legend>{t('portal.organizations.scope.projects')}</legend>
        {shared.map((reference) => (
          <label key={reference} className="portal-estimate__check">
            <input
              type="checkbox"
              name={`${name}-project`}
              checked={scope.projects.includes(reference)}
              onChange={(ev) => toggle(reference, ev.currentTarget.checked)}
            />
            <span>{t('portal.project.title', { reference })}</span>
          </label>
        ))}
      </fieldset>
      <label className="portal-estimate__check">
        <input
          type="checkbox"
          name={`${name}-approve`}
          checked={scope.approve}
          onChange={(ev) => onChange({ ...scope, approve: ev.currentTarget.checked })}
        />
        <span>{t('portal.organizations.scope.approve')}</span>
      </label>
      <label className="portal-estimate__check">
        <input
          type="checkbox"
          name={`${name}-pay`}
          checked={scope.pay}
          onChange={(ev) => onChange({ ...scope, pay: ev.currentTarget.checked })}
        />
        <span>{t('portal.organizations.scope.pay')}</span>
      </label>
    </>
  )
}

function Member({
  org,
  m,
  act,
  fetchImpl,
}: {
  org: AdministeredOrganization
  m: OrganizationMember
  act: Act
  fetchImpl: Fetch
}) {
  const [editing, setEditing] = useState(false)
  const [scope, setScope] = useState<MemberScope>({ approve: m.approve, pay: m.pay, projects: m.projects })
  const [error, setError] = useState<CustomerKey | null>(null)
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null)
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (scope.projects.length === 0) return setError('portal.organizations.error.scope')
    setBusy('save')
    const r = await act(
      () => portalApi.changeMember(fetchImpl, org.id, m.id, scope),
      t('portal.organizations.done.changed', { email: m.email }),
    )
    setBusy(null)
    if (!r.ok) return setError(r.problem)
    setError(null)
    setEditing(false)
  }
  const invited = m.state === 'invited'
  return (
    <li className="portal-properties__item" aria-label={m.email}>
      <h4 className="hh-h3">
        {m.email}{' '}
        <StatusBadge tone={invited ? 'warning' : 'neutral'}>
          {t(invited ? 'portal.organizations.member.invited' : 'portal.organizations.member.active')}
        </StatusBadge>
      </h4>
      <Privileges approve={m.approve} pay={m.pay} />
      <p className="hh-small hh-muted">
        {t('portal.organizations.member.projects', { projects: m.projects.join(', ') })}
      </p>
      {editing ? (
        <form className="portal-organizations__form" onSubmit={(e) => void save(e)} noValidate>
          <ScopeFields name={`member-${m.id}`} shared={org.projects} scope={scope} onChange={setScope} />
          {error ? (
            <p className="hh-field__error" role="alert">
              {t(error)}
            </p>
          ) : null}
          <p className="portal-properties__actions">
            <Button type="submit" pending={busy === 'save'}>
              {t('portal.organizations.member.save')}
            </Button>
            <Button
              type="button"
              variant="quiet"
              onClick={() => {
                setEditing(false)
                setScope({ approve: m.approve, pay: m.pay, projects: m.projects })
                setError(null)
              }}
            >
              {t('portal.organizations.member.cancel')}
            </Button>
          </p>
        </form>
      ) : (
        <p className="portal-properties__actions">
          <Button
            variant="secondary"
            aria-label={t('portal.organizations.member.editLabel', { email: m.email })}
            onClick={() => setEditing(true)}
          >
            {t('portal.organizations.member.edit')}
          </Button>
          <Button
            variant="quiet"
            pending={busy === 'remove'}
            aria-label={t(
              invited ? 'portal.organizations.member.withdrawLabel' : 'portal.organizations.member.removeLabel',
              { email: m.email },
            )}
            onClick={() => {
              if (busy) return
              setBusy('remove')
              void act(
                () => portalApi.removeMember(fetchImpl, org.id, m.id),
                // TSK-0150 (OWN-DEC-199): an invitee never had access, so withdrawing says the invitation is withdrawn.
                t(invited ? 'portal.organizations.done.withdrawn' : 'portal.organizations.done.removed', {
                  email: m.email,
                }),
              ).then(() => setBusy(null))
            }}
          >
            {t(invited ? 'portal.organizations.member.withdraw' : 'portal.organizations.member.remove')}
          </Button>
        </p>
      )}
    </li>
  )
}

function Invite({ org, act, fetchImpl }: { org: AdministeredOrganization; act: Act; fetchImpl: Fetch }) {
  const [email, setEmail] = useState('')
  const [scope, setScope] = useState<MemberScope>({ approve: false, pay: false, projects: [] })
  const [error, setError] = useState<CustomerKey | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (!/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email.trim())) return setError('portal.organizations.error.email')
    if (scope.projects.length === 0) return setError('portal.organizations.error.scope')
    setBusy(true)
    const r = await act(
      () => portalApi.inviteMember(fetchImpl, org.id, email.trim(), scope),
      t('portal.organizations.done.invited', { email: email.trim().toLowerCase() }),
    )
    setBusy(false)
    if (!r.ok) return setError(r.problem)
    setError(null)
    setEmail('')
    setScope({ approve: false, pay: false, projects: [] })
  }
  if (org.projects.length === 0) return null
  return (
    <form className="portal-organizations__form" onSubmit={(e) => void submit(e)} noValidate>
      <h4 className="hh-h3">{t('portal.organizations.invite.title')}</h4>
      <p className="hh-small">{t('portal.organizations.invite.text')}</p>
      <Field
        label={t('portal.organizations.invite.email')}
        name={`invite-${org.id}`}
        type="email"
        autoComplete="off"
        spellCheck={false}
        maxLength={320}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <ScopeFields name={`invite-${org.id}`} shared={org.projects} scope={scope} onChange={setScope} />
      {error ? (
        <p className="hh-field__error" role="alert">
          {t(error)}
        </p>
      ) : null}
      <Button type="submit" pending={busy}>
        {t('portal.organizations.invite.submit')}
      </Button>
    </form>
  )
}

const HISTORY: Record<OrganizationHistoryEntry['kind'], CustomerKey> = {
  created: 'portal.organizations.history.created',
  project_added: 'portal.organizations.history.project_added',
  project_removed: 'portal.organizations.history.project_removed',
  member_invited: 'portal.organizations.history.member_invited',
  invitation_withdrawn: 'portal.organizations.history.invitation_withdrawn',
  invitation_accepted: 'portal.organizations.history.invitation_accepted',
  invitation_declined: 'portal.organizations.history.invitation_declined',
  member_changed: 'portal.organizations.history.member_changed',
  member_removed: 'portal.organizations.history.member_removed',
  member_left: 'portal.organizations.history.member_left',
  membership_ended_account_closed: 'portal.organizations.history.membership_ended_account_closed',
}

function historyText(h: OrganizationHistoryEntry): string {
  return t(HISTORY[h.kind], {
    email: h.email ?? '',
    reference: h.reference ?? t('portal.organizations.history.unknown'),
  })
}

function Managed({
  org,
  linked,
  act,
  fetchImpl,
}: {
  org: AdministeredOrganization
  linked: string[]
  act: Act
  fetchImpl: Fetch
}) {
  const ids = useId()
  const shareable = linked.filter((r) => !org.projects.includes(r))
  const [pick, setPick] = useState('')
  const [error, setError] = useState<CustomerKey | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const share = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || !pick) return
    setBusy('share')
    const r = await act(
      () => portalApi.shareProject(fetchImpl, org.id, pick),
      t('portal.organizations.done.shared', { reference: pick }),
    )
    setBusy(null)
    if (!r.ok) return setError(r.problem)
    setError(null)
    setPick('')
  }
  return (
    <section className="portal-dashboard__section" aria-labelledby={`${ids}-org`}>
      <h3 id={`${ids}-org`} className="hh-h3">
        {org.name}
      </h3>
      <h4 className="hh-h3">{t('portal.organizations.projects.title')}</h4>
      {org.projects.length === 0 ? (
        <p className="hh-muted">{t('portal.organizations.projects.none')}</p>
      ) : (
        <ul className="portal-organizations__projects">
          {org.projects.map((reference) => (
            <li key={reference}>
              <a href={`/portal/p/${encodeURIComponent(reference)}`}>{t('portal.project.title', { reference })}</a>{' '}
              <Button
                variant="quiet"
                pending={busy === reference}
                aria-label={t('portal.organizations.projects.removeLabel', { reference })}
                onClick={() => {
                  if (busy) return
                  setBusy(reference)
                  void act(
                    () => portalApi.unshareProject(fetchImpl, org.id, reference),
                    t('portal.organizations.done.unshared', { reference }),
                  ).then(() => setBusy(null))
                }}
              >
                {t('portal.organizations.projects.remove')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {shareable.length === 0 ? (
        <p className="hh-small hh-muted">{t('portal.organizations.projects.allShared')}</p>
      ) : (
        <form className="portal-claim__form" onSubmit={(e) => void share(e)} noValidate>
          <label className="hh-field">
            <span className="hh-field__label">{t('portal.organizations.projects.add')}</span>
            <select
              className="hh-field__control"
              name={`share-${org.id}`}
              value={pick}
              onChange={(e) => setPick(e.target.value)}
            >
              <option value="">{t('portal.organizations.projects.choose')}</option>
              {shareable.map((reference) => (
                <option key={reference} value={reference}>
                  {reference}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="secondary" pending={busy === 'share'}>
            {t('portal.organizations.projects.share')}
          </Button>
        </form>
      )}
      {error ? (
        <p className="hh-field__error" role="alert">
          {t(error)}
        </p>
      ) : null}
      <h4 className="hh-h3">{t('portal.organizations.members.title')}</h4>
      {org.members.length === 0 ? (
        <p className="hh-muted">{t('portal.organizations.members.none')}</p>
      ) : (
        <ul className="portal-projects">
          {org.members.map((m) => (
            <Member
              key={`${m.id}-${m.approve}-${m.pay}-${m.projects.join()}`}
              org={org}
              m={m}
              act={act}
              fetchImpl={fetchImpl}
            />
          ))}
        </ul>
      )}
      <Invite org={org} act={act} fetchImpl={fetchImpl} />
      <details className="portal-organizations__history">
        <summary>{t('portal.organizations.history.title')}</summary>
        <ol>
          {org.history.map((h, i) => (
            <li key={`${h.at}-${i}`}>
              <span className="hh-small hh-muted">{when(h.at)}</span> {historyText(h)}
            </li>
          ))}
        </ol>
      </details>
    </section>
  )
}

function Create({ act, fetchImpl }: { act: Act; fetchImpl: Fetch }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<CustomerKey | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const n = name.trim()
    if (n.length < 1 || n.length > NAME_MAX) return setError('portal.organizations.error.name')
    setBusy(true)
    const r = await act(
      () => portalApi.createOrganization(fetchImpl, n),
      t('portal.organizations.done.created', { name: n }),
    )
    setBusy(false)
    if (!r.ok) return setError(r.problem)
    setError(null)
    setName('')
  }
  return (
    <section className="portal-section portal-claim" aria-labelledby="portal-organizations-create">
      <h2 id="portal-organizations-create" className="hh-h3">
        {t('portal.organizations.create.title')}
      </h2>
      <form className="portal-claim__form" onSubmit={(e) => void submit(e)} noValidate>
        <Field
          label={t('portal.organizations.create.name')}
          hint={t('portal.organizations.create.hint')}
          name="organization-name"
          autoComplete="organization"
          maxLength={NAME_MAX + 20}
          value={name}
          onChange={(e) => setName(e.target.value)}
          {...(error ? { error: t(error) } : {})}
        />
        <Button type="submit" variant="secondary" pending={busy}>
          {t('portal.organizations.create.submit')}
        </Button>
      </form>
    </section>
  )
}

export function OrganizationsPage({ fetchImpl }: { fetchImpl: Fetch }) {
  const [load, setLoad] = useState<Load>({ phase: 'loading' })
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const refresh = useCallback(async () => {
    setLoad((l) => (l.phase === 'failed' ? { ...l, retrying: true } : l))
    const r = await portalApi.organizations(fetchImpl)
    setLoad(r.ok ? { phase: 'ready', data: r.data } : { phase: 'failed', failure: r.failure, retrying: false })
  }, [fetchImpl])
  useEffect(() => {
    void refresh()
  }, [refresh])

  const act = useCallback<Act>(async (run, done) => {
    setNotice(null)
    const r = await run()
    if (r.ok) {
      setLoad({ phase: 'ready', data: r.data })
      setNotice(done)
      return { ok: true }
    }
    if (r.failure === 'expired') setLoad({ phase: 'failed', failure: 'expired', retrying: false })
    return { ok: false, problem: PROBLEM[r.failure] }
  }, [])
  /** A one-click change (accept, decline, leave): its problem is the page notice. */
  const quick = (key: string, run: () => ReturnType<typeof portalApi.createOrganization>, done: string) => {
    if (busy) return
    setBusy(key)
    void act(run, done).then((r) => {
      setBusy(null)
      if (!r.ok) setNotice(t(r.problem))
    })
  }

  return (
    <>
      <p className="portal-back">
        <a href="/portal/">{t('portal.account.back')}</a>
      </p>
      <h1 className="hh-h2">{t('portal.organizations.title')}</h1>
      {load.phase !== 'ready' ? (
        <NotShown
          live={load}
          loading="portal.organizations.loading"
          failedTitle="portal.organizations.failed"
          onRetry={() => void refresh()}
        />
      ) : (
        <>
          <p>{t('portal.organizations.intro')}</p>
          <p role="status" className="portal-claim__notice">
            {notice ?? ''}
          </p>
          {load.data.invitations.length ? (
            <section className="portal-dashboard__section" aria-labelledby="portal-organizations-invitations">
              <h2 id="portal-organizations-invitations" className="hh-h3">
                {t('portal.organizations.invitations.title')}
              </h2>
              <ul className="portal-projects">
                {load.data.invitations.map((i) => (
                  <li key={i.id} className="portal-properties__item" aria-label={i.organization}>
                    <p>
                      {t('portal.organizations.invitation.text', { organization: i.organization, count: i.projects })}
                    </p>
                    <Privileges approve={i.approve} pay={i.pay} />
                    <p className="portal-properties__actions">
                      <Button
                        pending={busy === `accept-${i.id}`}
                        aria-label={t('portal.organizations.invitation.acceptLabel', { organization: i.organization })}
                        onClick={() =>
                          quick(
                            `accept-${i.id}`,
                            () => portalApi.answerInvitation(fetchImpl, i.id, 'accept'),
                            t('portal.organizations.done.accepted', { organization: i.organization }),
                          )
                        }
                      >
                        {t('portal.organizations.invitation.accept')}
                      </Button>
                      <Button
                        variant="quiet"
                        pending={busy === `decline-${i.id}`}
                        aria-label={t('portal.organizations.invitation.declineLabel', { organization: i.organization })}
                        onClick={() =>
                          quick(
                            `decline-${i.id}`,
                            () => portalApi.answerInvitation(fetchImpl, i.id, 'decline'),
                            t('portal.organizations.done.declined', { organization: i.organization }),
                          )
                        }
                      >
                        {t('portal.organizations.invitation.decline')}
                      </Button>
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {load.data.memberships.length ? (
            <section className="portal-dashboard__section" aria-labelledby="portal-organizations-memberships">
              <h2 id="portal-organizations-memberships" className="hh-h3">
                {t('portal.organizations.memberships.title')}
              </h2>
              <ul className="portal-projects">
                {load.data.memberships.map((m) => (
                  <li key={m.id} className="portal-properties__item" aria-label={m.name}>
                    <h3 className="hh-h3">{m.name}</h3>
                    <Privileges approve={m.approve} pay={m.pay} />
                    <p>{t('portal.organizations.membership.projects')}</p>
                    {m.projects.length ? (
                      <ul className="portal-organizations__projects">
                        {m.projects.map((reference) => (
                          <li key={reference}>
                            <a href={`/portal/p/${encodeURIComponent(reference)}`}>
                              {t('portal.project.title', { reference })}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="hh-muted">{t('portal.organizations.membership.none')}</p>
                    )}
                    <p className="portal-properties__actions">
                      <Button
                        variant="quiet"
                        pending={busy === `leave-${m.id}`}
                        aria-label={t('portal.organizations.leaveLabel', { organization: m.name })}
                        onClick={() =>
                          quick(
                            `leave-${m.id}`,
                            () => portalApi.leaveOrganization(fetchImpl, m.id),
                            t('portal.organizations.done.left', { organization: m.name }),
                          )
                        }
                      >
                        {t('portal.organizations.leave')}
                      </Button>
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {load.data.administered.length ? (
            <section className="portal-dashboard__section" aria-labelledby="portal-organizations-managed">
              <h2 id="portal-organizations-managed" className="hh-h3">
                {t('portal.organizations.administered.title')}
              </h2>
              {load.data.administered.map((org) => (
                <Managed key={org.id} org={org} linked={load.data.linkedProjects} act={act} fetchImpl={fetchImpl} />
              ))}
            </section>
          ) : null}
          <Create act={act} fetchImpl={fetchImpl} />
        </>
      )}
    </>
  )
}
