// /account: sign in to an optional customer account, and the signed-in account (TSK-0036; HH-ID-10, HH-ID-11,
// HH-ID-03, HH-PORT-09, OWN-DEC-63, OWN-DEC-87, RULE-LANGUAGES). A React island; English only.
// - Sign in: the customer types the email or mobile phone of their account and enters the one-time code. The page
//   says the same thing whether or not an account has those details; there is no password.
// - Signed in: the account's sign-in email and phone (masked), its linked projects (one at a time, switching between
//   them), Sign Out, and Change your sign-in email. A contact change needs a fresh sign-in (the customer confirms it's
//   them with a new code first), sends a notice to the old email and signs the account out everywhere else. While
//   that notice cannot be sent the page says the change isn't available (OQ-ACCOUNT-CONTACT-NOTICE).
import { customerTranslator, type CustomerKey } from '@handyhub/i18n'
import { Button, Field, StateView } from '@handyhub/ui'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ProjectGlanceView } from '../access/AccessLanding.js'
import { accessApi, type ProjectGlance } from '../access/access.js'
import { minutesLeft, noticeText, type Fetch, type Notice } from '../request/verification.js'
import { accountApi, accountNotice, contactProblem, signInSentText, type AccountSummary } from './account.js'

const t = (key: CustomerKey, values?: Record<string, string | number>) => customerTranslator().t(key, values)
const browserFetch: Fetch = (input, init) => fetch(input, init)

/** Sign in (or confirm it's you): the contact, then the code. */
function SignIn({
  fetchImpl,
  title,
  text,
  level = 2,
  onSignedIn,
}: {
  fetchImpl: Fetch
  title: CustomerKey
  text: CustomerKey
  /** The heading level: 2 for the page's sign-in, 4 inside the email change. */
  level?: 2 | 4
  onSignedIn: (account: AccountSummary) => void
}) {
  const Heading = level === 2 ? 'h2' : 'h4'
  const [contact, setContact] = useState('')
  const [sent, setSent] = useState<{ minutes: number } | null>(null)
  const [code, setCode] = useState('')
  const [contactError, setContactError] = useState<CustomerKey | null>(null)
  const [codeError, setCodeError] = useState<Notice | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState<'send' | 'sign-in' | null>(null)
  const area = useRef<HTMLElement>(null)

  useEffect(() => {
    if (sent) area.current?.querySelector<HTMLInputElement>('input[name="account-code"]')?.focus()
  }, [sent])

  const send = async (event?: FormEvent) => {
    event?.preventDefault()
    if (busy) return
    const problem = contactProblem(contact)
    if (problem) {
      setContactError(problem)
      return area.current?.querySelector<HTMLInputElement>('input[name="account-contact"]')?.focus()
    }
    setContactError(null)
    setNotice(null)
    setCodeError(null)
    setBusy('send')
    const r = await accountApi.sendSignInCode(fetchImpl, contact)
    setBusy(null)
    if (!r.ok) {
      if (r.field === 'invalid_contact') return setContactError('access.recover.error.contact')
      return setNotice(accountNotice(r))
    }
    setCode('')
    setSent({ minutes: r.data.minutes })
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (!code.trim()) return setCodeError({ key: 'request.verify.error.invalidCode' })
    setBusy('sign-in')
    setNotice(null)
    setCodeError(null)
    const r = await accountApi.signIn(fetchImpl, contact, code)
    setBusy(null)
    if (!r.ok) {
      if (r.field === 'invalid_code') return setCodeError(r.notice)
      return setNotice(accountNotice(r))
    }
    setCode('')
    onSignedIn(r.data)
  }

  return (
    <section ref={area} className="hh-receipt__section hh-verify" aria-labelledby={`hh-account-sign-in-${level}`}>
      <Heading id={`hh-account-sign-in-${level}`} className={level === 2 ? 'hh-h2' : 'hh-h3'} tabIndex={-1}>
        {t(title)}
      </Heading>
      <p>{t(text)}</p>
      <form className="hh-verify__form" onSubmit={(e) => void send(e)} noValidate>
        <Field
          label={t('account.signIn.contact')}
          name="account-contact"
          autoComplete="username"
          spellCheck={false}
          maxLength={320}
          value={contact}
          onChange={(e) => {
            setContact(e.target.value)
            setSent(null)
          }}
          {...(contactError ? { error: t(contactError) } : {})}
        />
        <Button type="submit" variant={sent ? 'secondary' : 'primary'} pending={busy === 'send'}>
          {sent ? t('request.verify.resend') : t('account.signIn.send')}
        </Button>
      </form>
      {sent ? (
        <>
          <p role="status">{signInSentText(sent.minutes)}</p>
          <form className="hh-verify__form" onSubmit={(e) => void submit(e)} noValidate>
            <Field
              label={t('request.verify.code')}
              name="account-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={10}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              {...(codeError ? { error: noticeText(codeError) } : {})}
            />
            <Button type="submit" pending={busy === 'sign-in'}>
              {t('account.signIn.submit')}
            </Button>
          </form>
        </>
      ) : null}
      <p role="status" className="hh-verify__notice">
        {notice ? noticeText(notice) : ''}
      </p>
    </section>
  )
}

/** Change the sign-in email: a code to the new address, entered here (HH-ID-11). */
function ChangeEmail({
  account,
  fetchImpl,
  onChanged,
  onConfirmed,
}: {
  account: AccountSummary
  fetchImpl: Fetch
  onChanged: (account: AccountSummary) => void
  onConfirmed: (account: AccountSummary) => void
}) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState<{ sentTo: string; minutes: number } | null>(null)
  const [code, setCode] = useState('')
  const [emailError, setEmailError] = useState<Notice | null>(null)
  const [codeError, setCodeError] = useState<Notice | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState<'send' | 'change' | null>(null)
  const area = useRef<HTMLElement>(null)

  useEffect(() => {
    if (sent) area.current?.querySelector<HTMLInputElement>('input[name="email-code"]')?.focus()
  }, [sent])

  if (account.emailChange === 'not_configured')
    return (
      <section className="hh-receipt__section" aria-labelledby="hh-account-email">
        <h3 id="hh-account-email" className="hh-h3">
          {t('account.email.title')}
        </h3>
        <p>{t('account.email.notConfigured')}</p>
      </section>
    )

  const send = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (!email.trim()) return setEmailError({ key: 'request.verify.error.invalidEmail' })
    setBusy('send')
    setNotice(null)
    setEmailError(null)
    setCodeError(null)
    const r = await accountApi.sendEmailCode(fetchImpl, email)
    setBusy(null)
    if (!r.ok) {
      const n = accountNotice(r)
      if (r.field === 'invalid_email' || r.field === 'unchanged') return setEmailError(n)
      return setNotice(n)
    }
    setCode('')
    setSent({ sentTo: r.data.sentTo, minutes: minutesLeft(r.data.expiresAt) })
  }

  const change = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (!code.trim()) return setCodeError({ key: 'request.verify.error.invalidCode' })
    setBusy('change')
    setNotice(null)
    setCodeError(null)
    const r = await accountApi.changeEmail(fetchImpl, email, code)
    setBusy(null)
    if (!r.ok) {
      if (r.field === 'invalid_code') return setCodeError(r.notice)
      return setNotice(accountNotice(r))
    }
    setOpen(false)
    setSent(null)
    setEmail('')
    setCode('')
    onChanged(r.data)
  }

  return (
    <section ref={area} className="hh-receipt__section hh-verify" aria-labelledby="hh-account-email">
      <h3 id="hh-account-email" className="hh-h3">
        {t('account.email.title')}
      </h3>
      <p>{t('account.email.text')}</p>
      {!open ? (
        <div className="hh-request__actions">
          <Button variant="secondary" onClick={() => setOpen(true)}>
            {t('account.email.start')}
          </Button>
        </div>
      ) : !account.freshVerification ? (
        <SignIn
          fetchImpl={fetchImpl}
          title="account.email.confirmTitle"
          text="account.email.confirmFirst"
          level={4}
          onSignedIn={onConfirmed}
        />
      ) : (
        <>
          <form className="hh-verify__form" onSubmit={(e) => void send(e)} noValidate>
            <Field
              label={t('request.verify.newEmail')}
              type="email"
              name="new-email"
              autoComplete="email"
              maxLength={254}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setSent(null)
              }}
              {...(emailError ? { error: noticeText(emailError) } : {})}
            />
            <Button type="submit" variant={sent ? 'secondary' : 'primary'} pending={busy === 'send'}>
              {sent ? t('request.verify.resend') : t('request.verify.changeSend')}
            </Button>
          </form>
          {sent ? (
            <>
              <p>
                {t('request.verify.sentTo', { destination: sent.sentTo })}{' '}
                {t('request.verify.expiresIn', { minutes: sent.minutes })}
              </p>
              <form className="hh-verify__form" onSubmit={(e) => void change(e)} noValidate>
                <Field
                  label={t('request.verify.code')}
                  name="email-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={10}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  {...(codeError ? { error: noticeText(codeError) } : {})}
                />
                <Button type="submit" pending={busy === 'change'}>
                  {t('account.email.submit')}
                </Button>
              </form>
            </>
          ) : null}
          <div className="hh-request__actions">
            <Button variant="quiet" onClick={() => setOpen(false)}>
              {t('request.verify.cancel')}
            </Button>
          </div>
        </>
      )}
      <p role="status" className="hh-verify__notice">
        {notice ? noticeText(notice) : ''}
      </p>
    </section>
  )
}

/** The signed-in account: its projects (one shown at a time), the email change and Sign Out. */
function Account({
  account,
  fetchImpl,
  onAccount,
  onSignedOut,
  changed,
}: {
  account: AccountSummary
  fetchImpl: Fetch
  onAccount: (account: AccountSummary, changed?: boolean) => void
  onSignedOut: () => void
  changed: boolean
}) {
  const [shown, setShown] = useState<ProjectGlance | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const projectRef = useRef<HTMLDivElement>(null)

  const show = async (reference: string) => {
    setBusy(`show-${reference}`)
    setNotice(null)
    const r = await accessApi.project(fetchImpl, reference)
    setBusy(null)
    if (!r.ok) return setNotice({ key: 'request.verify.error.failed' })
    setShown(r.data)
    requestAnimationFrame(() => projectRef.current?.querySelector<HTMLElement>('h3')?.focus())
  }

  const signOut = async () => {
    setBusy('sign-out')
    await accountApi.signOut(fetchImpl)
    setBusy(null)
    onSignedOut()
  }

  return (
    <section className="hh-receipt" aria-labelledby="hh-account-home">
      <h2 id="hh-account-home" className="hh-h2" tabIndex={-1}>
        {t('account.home.title')}
      </h2>
      {changed ? <p role="status">{t('account.email.done')}</p> : null}
      <dl>
        {account.email ? (
          <div>
            <dt>{t('account.home.email')}</dt>
            <dd>{account.email}</dd>
          </div>
        ) : null}
        {account.phone ? (
          <div>
            <dt>{t('account.home.phone')}</dt>
            <dd>{account.phone}</dd>
          </div>
        ) : null}
      </dl>
      <section className="hh-receipt__section" aria-labelledby="hh-account-projects">
        <h3 id="hh-account-projects" className="hh-h3">
          {t('account.projects.title')}
        </h3>
        {account.projects.length === 0 ? (
          <p>{t('account.projects.empty')}</p>
        ) : (
          <ul className="hh-access__channels">
            {account.projects.map((reference) => (
              <li key={reference}>
                <Button
                  variant={shown?.reference === reference ? 'primary' : 'secondary'}
                  pending={busy === `show-${reference}`}
                  aria-pressed={shown?.reference === reference}
                  onClick={() => void show(reference)}
                >
                  {t('account.projects.view', { reference })}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div ref={projectRef}>{shown ? <ProjectGlanceView glance={shown} level={3} /> : null}</div>
      </section>
      <ChangeEmail
        account={account}
        fetchImpl={fetchImpl}
        onChanged={(a) => onAccount(a, true)}
        onConfirmed={(a) => onAccount(a)}
      />
      <div className="hh-request__actions">
        <a className="hh-button hh-button--secondary" href="/request">
          {t('site.cta.request')}
        </a>
        <Button variant="secondary" pending={busy === 'sign-out'} onClick={() => void signOut()}>
          {t('account.signOut')}
        </Button>
      </div>
      <p role="status" className="hh-verify__notice">
        {notice ? noticeText(notice) : ''}
      </p>
    </section>
  )
}

export default function AccountPage({ fetchImpl = browserFetch }: { fetchImpl?: Fetch }) {
  const [account, setAccount] = useState<AccountSummary | null | 'loading'>('loading')
  const [signedOut, setSignedOut] = useState(false)
  const [changed, setChanged] = useState(false)
  const area = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void accountApi.account(fetchImpl).then((r) => setAccount(r.ok ? r.data : null))
    // Once per page load.
  }, [])

  // A new view takes the focus on its heading, so keyboard and screen-reader users land on it.
  const signedIn = account !== null && account !== 'loading'
  useEffect(() => {
    if (account === 'loading') return
    area.current?.querySelector<HTMLElement>('h2')?.focus()
  }, [signedIn])

  return (
    <div ref={area} className="hh-access">
      {account === 'loading' ? (
        <StateView kind="loading" title={t('account.loading')} />
      ) : account ? (
        <Account
          account={account}
          fetchImpl={fetchImpl}
          changed={changed}
          onAccount={(a, didChange = false) => {
            setChanged(didChange)
            setAccount(a)
          }}
          onSignedOut={() => {
            setChanged(false)
            setSignedOut(true)
            setAccount(null)
          }}
        />
      ) : (
        <>
          {signedOut ? <p role="status">{t('account.signedOut')}</p> : null}
          <SignIn
            fetchImpl={fetchImpl}
            title="account.signIn.title"
            text="account.signIn.text"
            onSignedIn={(a) => {
              setSignedOut(false)
              setAccount(a)
            }}
          />
          <p>{t('account.signIn.noAccount')}</p>
        </>
      )}
      <a className="hh-button hh-button--secondary" href="/">
        {t('request.home')}
      </a>
    </div>
  )
}
