// Staff app (TSK-0014; HH-STAFF-01, OWN-DEC-114): sign-in with the mandatory authenticator (TSK-0154, OWN-DEC-202:
// enrolment on the first sign-in, the code afterwards), "Forgot password?", setting a password from an invite or
// reset link, and the signed-in shell (TSK-0040: role navigation, EN/ES switch, offline indicator, search box) with
// Sign out (TSK-0053: the estimates list and the estimate builder; TSK-0065: the scheduling board; TSK-0098: the audit log; TSK-0119: message delivery and templates; TSK-0099: the retention reviews; TSK-0100: Delete or Archive, the deletion log and privacy requests; TSK-0069: the job packet and the worker's packet list on My Day; TSK-0071: the job loadout; TSK-0070: My Day and the visit times; TSK-0073, TSK-0074: the Start Work briefing and gate and the review of holds and exceptions). Text comes from the staff catalogs (HH-LANG-02); the signed-in staff member's stored locale replaces the
// default once the session is known, and switching it keeps every open form as it is (HH-OPS-04).
import { staffTranslator, type StaffKey, type StaffLocale } from '@handyhub/i18n'
import { Button, Card, Field, StateView } from '@handyhub/ui'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { call, setCsrfToken, type ApiErrorBody, type Fetch } from './api'
import { AuditLogScreen } from './AuditLog'
import { MessagesScreen } from './Messages'
import { EstimatePublishingSetting } from './EstimateLifecycle'
import { ApprovalThresholdSetting } from './OwnerApproval'
import { BusinessCalendarSetting } from './BusinessCalendar'
import { LegalDocumentsView, MailingAddressSetting } from './BusinessSettings'
import { EstimateBuilder, EstimatesScreen } from './Estimates'
import { CasePage, CasesScreen } from './Cases'
import { CustomerRecord, CustomersScreen } from './Customers'
import { InboxRecord, InboxScreen } from './Inbox'
import { PropertyRecord } from './Property'
import { JobDepositPage } from './JobDeposit'
import { JobPacketPage } from './JobPacket'
import { LoadoutPage } from './Loadout'
import { MyDay } from './MyDay'
import { JobNotesPage, ReplyProposalPage } from './ReplyProposals'
import { OwnerDashboard } from './OwnerDashboard'
import { QualityReviewPage } from './QualityReview'
import { ChangeOrdersPage, ChangeOrderVersionLink } from './ChangeOrders'
import { VisitOutcomePage } from './VisitOutcomes'
import { FieldEventPage } from './FieldEvents'
import { offlineStore } from './offline/store'
import { SignOutWarning, SyncStatus, UpdateBanner, draftCounts } from './offline/SyncStatus'
import { isUnsynced, setSignedInStaff } from './offline/sync'
import { ChecklistPage } from './Checklist'
import { QueueHome } from './Queue'
import { AccessHelpScreen } from './AccessHelp'
import { ReconciliationScreen } from './Reconciliation'
import { InvoiceRemindersPage } from './InvoiceReminders'
import { CloseoutPage } from './Closeout'
import { RepeatServicePage } from './RepeatService'
import { JobCostsPage } from './JobCosts'
import { LaborRatesSetting, MarginTargetSetting } from './JobMargin'
import { MergeReview, RelinkRequest } from './RecordLinks'
import { RequestRecord } from './Record'
import { RequestsScreen } from './Requests'
import { PrivacyScreen } from './Privacy'
import { RetentionScreen } from './Retention'
import { ScheduleBoard } from './Schedule'
import { SearchScreen, Screen, Shell, type Navigation } from './Shell'
import { StaffScreen } from './StaffManagement'
import { JobPhotosPage } from './JobPhotos'
import { StartReviewPage, StartWorkPage } from './StartWork'
import { JobSafety, SafetyHoldPage, flushPendingStops } from './StopWork'
import { OwnerEscalationPhone, flushPendingEscalations, rememberOwnerContact } from './Escalation'
import { StagingTools } from './StagingTools'
import { LaunchPhaseSetting } from './LaunchPhase'
import { OfflineActionsSetting } from './OfflineActions'
import { PreparationDefaultsSetting } from './PreparationDefaults'
import { ConfigurationScreen, HealthScreen } from './System'
import { VisitTimesPage } from './VisitTimes'
import { VisitAccessPage } from './VisitAccess'

type Session = {
  staffUserId: string
  displayName: string | null
  email: string
  locale: StaffLocale
  roles: string[]
  mfaEnrolled: boolean
  csrfToken: string
  /** The menu for these roles, decided on the server from the permission matrix (TSK-0040). */
  navigation?: Navigation
}

/**
 * TSK-0079 (HH-OFF-01): the last session's non-secret details (name, roles, language, menu; never the CSRF token, and
 * the session cookie stays HttpOnly), kept on this device so the app can open its offline copies when the server
 * cannot be reached. The server still decides everything; this is only what the screen shows. Removed at sign-out.
 */
const OFFLINE_SESSION_KEY = 'hh.staff.offlineSession'
function rememberSession(s: Session | null): void {
  try {
    if (!s) return window.localStorage.removeItem(OFFLINE_SESSION_KEY)
    const shown: Partial<Session> = { ...s }
    delete shown.csrfToken
    window.localStorage.setItem(OFFLINE_SESSION_KEY, JSON.stringify(shown))
  } catch {
    // Storage unavailable: offline the app shows the sign-in page, as before.
  }
}
function rememberedSession(): Session | null {
  try {
    const raw = window.localStorage.getItem(OFFLINE_SESSION_KEY)
    return raw ? ({ ...(JSON.parse(raw) as Omit<Session, 'csrfToken'>), csrfToken: '' } as Session) : null
  } catch {
    return null
  }
}

/** PROPOSED password minimum (apps/server/src/modules/identity/passwords.ts PASSWORD_MIN_LENGTH). */
const PASSWORD_MIN = 15

export type Route =
  | { page: 'home' }
  | { page: 'sign-in' }
  | { page: 'set-password'; purpose: 'invite' | 'reset'; token: string }
  | { page: 'account' }
  | { page: 'search'; query: string }
  | { page: 'screen'; id: string }
  /** A record below a screen, as the action queue's deep links open it (TSK-0041): `/<screen>/<record id>`. */
  | { page: 'record'; screen: string; id: string }
  /** A step on a record (TSK-0046): `/customers/<id>/merge?into=<id>`, `/requests/<id>/relink`. */
  | { page: 'record-step'; screen: string; id: string; step: 'merge' | 'relink'; params: Record<string, string> }

/** The page for a path (with its query) below the app's base (/staff/ when served by the server). */
export function routeOf(path: string, base = '/'): Route {
  const [pathname = '', search = ''] = path.split('?', 2)
  const rest = pathname.startsWith(base) ? pathname.slice(base.length - 1) : pathname
  const m = /^\/(invite|reset)\/([A-Za-z0-9_-]{1,100})\/?$/.exec(rest)
  if (m) return { page: 'set-password', purpose: m[1] as 'invite' | 'reset', token: m[2] as string }
  if (/^\/sign-in\/?$/.test(rest)) return { page: 'sign-in' }
  if (/^\/account\/?$/.test(rest)) return { page: 'account' }
  if (/^\/search\/?$/.test(rest)) return { page: 'search', query: new URLSearchParams(search).get('q') ?? '' }
  const step = /^\/([a-z-]{1,40})\/([0-9a-fA-F-]{36})\/(merge|relink)\/?$/.exec(rest)
  if (step)
    return {
      page: 'record-step',
      screen: step[1] as string,
      id: (step[2] as string).toLowerCase(),
      step: step[3] as 'merge' | 'relink',
      params: Object.fromEntries(new URLSearchParams(search)),
    }
  const record = /^\/([a-z-]{1,40})\/([0-9a-fA-F-]{36})\/?$/.exec(rest)
  if (record) return { page: 'record', screen: record[1] as string, id: (record[2] as string).toLowerCase() }
  const screen = /^\/([a-z-]{1,40})\/?$/.exec(rest)
  if (screen) return { page: 'screen', id: screen[1] as string }
  return { page: 'home' }
}

const signedInPage = (route: Route) => route.page !== 'sign-in' && route.page !== 'set-password'

const FIELD_KEYS: Record<string, StaffKey> = {
  required: 'error.field.required',
  minLength: 'error.field.tooShort',
  maxLength: 'error.field.tooLong',
  passwordCommon: 'error.field.passwordCommon',
}

function useT(locale: StaffLocale) {
  return staffTranslator(locale).t
}

function errorText(t: ReturnType<typeof useT>, error: ApiErrorBody): string {
  const key = `error.${error.code}` as StaffKey
  try {
    return t(key)
  } catch {
    return t('error.INTERNAL')
  }
}

function fieldText(t: ReturnType<typeof useT>, error: ApiErrorBody | null, field: string): string | undefined {
  const f = error?.fieldErrors.find((e) => e.field === `body.${field}`)
  return f ? t(FIELD_KEYS[f.code] ?? 'error.field.invalid') : undefined
}

/**
 * The app's base at run time (TSK-0017): the build's base (/staff/) on the single staging host, where the app lives
 * under /staff; '/' on staff.handyhub247.com, where it is the whole host (the server serves the same files at both).
 */
export function runtimeBase(pathname: string, buildBase = '/'): string {
  const bare = buildBase.replace(/\/$/, '')
  return bare && (pathname === bare || pathname.startsWith(`${bare}/`)) ? `${bare}/` : '/'
}

export interface AppProps {
  locale?: StaffLocale
  /** The current path; defaults to the browser location. */
  path?: string
  /** The app's base path; defaults to runtimeBase() of the browser location. */
  base?: string
  fetchImpl?: Fetch
  navigate?: (to: string) => void
}

export function App({ locale: initialLocale = 'en', path, base, fetchImpl, navigate }: AppProps) {
  const appBase = base ?? runtimeBase(window.location.pathname, import.meta.env.BASE_URL || '/')
  const doFetch: Fetch = fetchImpl ?? ((...a) => fetch(...a))
  const [current, setCurrent] = useState(() => path ?? `${window.location.pathname}${window.location.search}`)
  const href = (to: string) => `${appBase.replace(/\/$/, '')}${to}`
  const go = (to: string) => {
    const target = href(to)
    if (navigate) navigate(target)
    else window.history.pushState(null, '', target)
    setCurrent(target)
  }
  const route = routeOf(current, appBase)
  const needsSession = signedInPage(route)
  const [session, setSessionState] = useState<Session | null | undefined>(needsSession ? undefined : null)
  const [signingOut, setSigningOut] = useState(false)
  // TSK-0080 (HH-OFF-07, T52): sign-out with unsynced work asks first.
  const [signOutAsked, setSignOutAsked] = useState(false)
  // Every session response carries the session's CSRF token for unsafe requests (TSK-0015).
  const setSession = (s: Session | null | undefined) => {
    setCsrfToken(s?.csrfToken ?? null)
    setSessionState(s)
  }
  const locale = session?.locale ?? initialLocale
  const t = useT(locale)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  // The browser's back and forward buttons move between screens too.
  useEffect(() => {
    if (path !== undefined) return
    const pop = () => setCurrent(`${window.location.pathname}${window.location.search}`)
    window.addEventListener('popstate', pop)
    return () => window.removeEventListener('popstate', pop)
  }, [path])

  useEffect(() => {
    if (!needsSession || session) return
    let live = true
    void call<Session>(doFetch, '/staff/auth/session').then((r) => {
      if (!live) return
      if (r.ok) {
        rememberSession(r.data)
        return setSession(r.data)
      }
      // No connection: the remembered details open the app on its offline copies; every write still needs the server.
      const remembered = r.status === 0 ? rememberedSession() : null
      if (remembered) return setSession(remembered)
      setSession(null)
      go('/sign-in')
    })
    return () => {
      live = false
    }
  }, [needsSession])

  // TSK-0077 (HH-OFF-03): a Stop Work saved on this phone while offline is sent once a session exists and whenever the
  // phone is back online, with its own key (recorded once).
  useEffect(() => {
    if (!session) return
    // TSK-0129: so are the Call Owner / Call 911 taps saved on this phone (each with its own UUID).
    const flush = () => void flushPendingStops(doFetch).then(() => flushPendingEscalations(doFetch))
    flush()
    window.addEventListener('online', flush)
    return () => window.removeEventListener('online', flush)
  }, [session])

  // TSK-0080: drafts saved now belong to the signed-in staff member.
  useEffect(() => {
    setSignedInStaff(session?.staffUserId ?? null)
  }, [session?.staffUserId])

  /** Sign-out: with unsynced work on this phone, the warning first (T52); otherwise at once. */
  async function requestSignOut() {
    if (!session) return
    const c = await draftCounts(session.staffUserId)
    if (c.waiting + c.failed > 0) return setSignOutAsked(true)
    await signOut()
  }

  async function signOut() {
    setSignOutAsked(false)
    setSigningOut(true)
    await call(doFetch, '/staff/auth/sign-out', { method: 'POST' })
    // TSK-0079 (HH-OFF-02): the offline copies never stay on the device after sign-out. TSK-0080 (HH-OFF-07): drafts
    // the server has are cleared too; unsynced ones stay on this phone, only after the warning said so.
    rememberSession(null)
    // TSK-0129: the Owner's number kept for Call Owner offline goes with the offline copies.
    rememberOwnerContact(null)
    const store = offlineStore()
    try {
      for (const p of await store.listPackets()) await store.deletePacket(p.jobId)
      for (const d of await store.listDrafts()) if (!isUnsynced(d)) await store.deleteDraft(d.id)
    } catch {
      // Storage unavailable: nothing more to clear.
    }
    setSigningOut(false)
    setSession(null)
    go('/sign-in')
  }

  /** Saves the staff locale on the person's staff identity (HH-OPS-04); the screen re-renders in place. */
  async function changeLocale(next: 'en' | 'es'): Promise<boolean> {
    const r = await call<Session>(doFetch, '/staff/auth/session/locale', { method: 'PUT', body: { locale: next } })
    if (!r.ok) return false
    setSession(r.data)
    return true
  }

  if (needsSession && session) {
    const nav = session.navigation
    const shown =
      route.page === 'screen'
        ? // TSK-0149: help with customer access sits below the privacy requests (the Owner's customer-account work).
          route.id === 'access-help'
          ? 'privacy'
          : route.id
        : route.page === 'record' || route.page === 'record-step'
          ? // A property record sits below the customer records (TSK-0045): the same menu entry and permission.
            // TSK-0114: so does a project's customer-agreed repeat-service schedule.
            route.screen === 'properties' || route.screen === 'repeat-service'
            ? 'customers'
            : // A job packet (TSK-0069) is reached from My Day or the board; the server decides who may open it.
              // TSK-0073: the Start Work briefing is reached from My Day (a link, never a direct start).
              // TSK-0093: a worker opens their own incident report from the job packet (the server decides who reads it).
              // TSK-0076: a job's field photos likewise.
              route.screen === 'packets' ||
                route.screen === 'loadouts' ||
                route.screen === 'start' ||
                route.screen === 'job-photos' ||
                // TSK-0084: a worker opens their own punch items from the job; the Owner reviews from Owner Decisions.
                (route.screen === 'quality-reviews' && !nav?.items.includes('queue')) ||
                // TSK-0075: the job checklist, from the job packet.
                route.screen === 'checklist' ||
                // TSK-0081: a job's change orders, from the job packet and the checklist.
                route.screen === 'change-orders' ||
                route.screen === 'change-order-versions' ||
                (route.screen === 'cases' && !nav?.items.includes('cases'))
              ? nav?.items.includes('my-day')
                ? 'my-day'
                : 'schedule'
              : // TSK-0070: a visit's Arrived and Finished times sit below the schedule; the server decides who sees them.
                route.screen === 'visit-times' ||
                  // TSK-0128: a visit's worker access and the Owner's extensions, from the project's visits.
                  route.screen === 'visit-access' ||
                  // TSK-0078: a recorded visit outcome's follow-up, from the staff queue.
                  route.screen === 'visit-outcomes' ||
                  // TSK-0080: a phone update kept for the Owner's review, from the staff queue.
                  route.screen === 'field-events' ||
                  route.screen === 'start-review' ||
                  route.screen === 'safety-holds' ||
                  route.screen === 'quality-reviews' ||
                  // TSK-0092: a job's closeout and follow-ups, from Owner Decisions, the staff queue and the review.
                  route.screen === 'closeout'
                ? 'schedule'
                : // TSK-0090: one reconciliation item, from the staff queue, sits below Payments.
                  // TSK-0091: an invoice's reminders, from the staff queue and Owner Decisions, too.
                  // TSK-0095: a job's estimated-versus-actual costs, from its closeout (the server keeps them to the Owner).
                  route.screen === 'reconciliation' ||
                    route.screen === 'invoice-reminders' ||
                    route.screen === 'job-costs'
                  ? 'payments'
                  : // TSK-0149: one access help request, from the staff queue, sits below the privacy requests.
                    route.screen === 'access-help'
                    ? 'privacy'
                    : route.screen
          : route.page === 'home'
            ? (nav?.home ?? 'home')
            : route.page
    const allowed = (nav?.items ?? []).includes(shown)
    return (
      <div className="staff-app" lang={locale}>
        <Shell
          t={t}
          name={session.displayName ?? session.email}
          locale={locale}
          navigation={nav}
          current={shown}
          go={go}
          href={href}
          onLocale={changeLocale}
          onSignOut={() => void requestSignOut()}
          signingOut={signingOut}
        >
          {/* TSK-0080 (HH-OFF-05, HH-OFF-07, T52): the sync bar, the sign-out warning and the app update. */}
          {signOutAsked ? (
            <SignOutWarning
              t={t}
              fetchImpl={doFetch}
              staffUserId={session.staffUserId}
              onSignOut={() => void signOut()}
              onCancel={() => setSignOutAsked(false)}
            />
          ) : null}
          <UpdateBanner t={t} fetchImpl={doFetch} staffUserId={session.staffUserId} />
          <SyncStatus
            t={t}
            fetchImpl={doFetch}
            staffUserId={session.staffUserId}
            isOwner={session.roles.includes('owner')}
          />
          {route.page === 'account' ? (
            <Account
              t={t}
              fetchImpl={doFetch}
              session={session}
              onSignedOut={() => (setSession(null), go('/sign-in'))}
              onSession={(s) => setSession({ ...session, ...(s as Partial<Session>) })}
            />
          ) : route.page === 'search' ? (
            <SearchScreen t={t} query={route.query} />
          ) : route.page === 'home' && !nav?.home ? (
            <StateView kind="blocked" title={t('shell.noNavigation')} />
          ) : shown === 'queue' && allowed && route.page !== 'record' ? (
            <QueueHome
              t={t}
              locale={locale}
              fetchImpl={doFetch}
              go={go}
              href={href}
              staffUserId={session.staffUserId}
            />
          ) : route.page === 'screen' && shown === 'dashboard' && allowed ? (
            // TSK-0096: the Owner Dashboard; TSK-0141: with Staging Tools, shown only where the server has them (never
            // in production, where the staging routes do not exist).
            <>
              <OwnerDashboard
                t={t}
                locale={locale}
                fetchImpl={doFetch}
                go={go}
                href={href}
                onSession={(s) => setSession({ ...session, ...(s as Partial<Session>) })}
              />
              <StagingTools
                t={t}
                locale={locale}
                fetchImpl={doFetch}
                onSession={(s) => setSession({ ...session, ...(s as Partial<Session>) })}
              />
            </>
          ) : route.page === 'screen' && shown === 'health' && allowed ? (
            <HealthScreen t={t} locale={locale} fetchImpl={doFetch} go={go} href={href} />
          ) : route.page === 'screen' && shown === 'settings' && allowed ? (
            <>
              <ConfigurationScreen t={t} locale={locale} fetchImpl={doFetch} go={go} href={href} />
              <EstimatePublishingSetting t={t} fetchImpl={doFetch} />
              <ApprovalThresholdSetting
                t={t}
                fetchImpl={doFetch}
                onSession={(s) => setSession({ ...session, ...(s as Partial<Session>) })}
              />
              {/* TSK-0131: the advisory target gross margin and the labor cost rates the Owner enters per worker. */}
              <MarginTargetSetting
                t={t}
                fetchImpl={doFetch}
                onSession={(s) => setSession({ ...session, ...(s as Partial<Session>) })}
              />
              <LaborRatesSetting t={t} fetchImpl={doFetch} />
              {/* TSK-0115: the offline actions beyond the minimal set (nothing on until the Owner turns it on). */}
              <OfflineActionsSetting
                t={t}
                fetchImpl={doFetch}
                onSession={(s) => setSession({ ...session, ...(s as Partial<Session>) })}
              />
              {/* TSK-0142: the launch phase and its switches (the Owner only; phase 1 until the Owner approves more). */}
              <LaunchPhaseSetting
                t={t}
                locale={locale}
                fetchImpl={doFetch}
                onSession={(s) => setSession({ ...session, ...(s as Partial<Session>) })}
              />
              <MailingAddressSetting
                t={t}
                fetchImpl={doFetch}
                onSession={(s) => setSession({ ...session, ...(s as Partial<Session>) })}
              />
              {/* TSK-0136: the internal business-day calendar (the substantive privacy acknowledgment). */}
              <BusinessCalendarSetting
                t={t}
                locale={locale}
                fetchImpl={doFetch}
                onSession={(s) => setSession({ ...session, ...(s as Partial<Session>) })}
              />
              <LegalDocumentsView t={t} fetchImpl={doFetch} />
              {/* TSK-0146: the Owner-approved default preparation instructions offers start from. */}
              <PreparationDefaultsSetting t={t} locale={locale} fetchImpl={doFetch} />
            </>
          ) : (route.page === 'screen' || route.page === 'record') && shown === 'staff' && allowed ? (
            // TSK-0151: an Owner Decisions permission review opens the person's record (/staff/<id>).
            <StaffScreen
              key={route.page === 'record' ? route.id : 'staff'}
              t={t}
              locale={locale}
              fetchImpl={doFetch}
              onSession={(s) => setSession({ ...session, ...(s as Partial<Session>) })}
              {...(route.page === 'record' ? { openId: route.id } : {})}
            />
          ) : route.page === 'screen' && shown === 'audit' && allowed ? (
            <AuditLogScreen t={t} locale={locale} fetchImpl={doFetch} />
          ) : route.page === 'screen' && shown === 'messages' && allowed ? (
            <MessagesScreen t={t} locale={locale} fetchImpl={doFetch} />
          ) : route.page === 'screen' && shown === 'retention' && allowed ? (
            <RetentionScreen
              t={t}
              locale={locale}
              fetchImpl={doFetch}
              onSession={(s) => setSession({ ...session, ...(s as Partial<Session>) })}
            />
          ) : route.page === 'screen' && route.id === 'access-help' && allowed ? (
            // TSK-0149: help with customer access (the requests, the lookup and the Owner's actions).
            <AccessHelpScreen t={t} locale={locale} fetchImpl={doFetch} href={href} />
          ) : route.page === 'record' && route.screen === 'access-help' && allowed ? (
            <AccessHelpScreen
              key={route.id}
              t={t}
              locale={locale}
              fetchImpl={doFetch}
              href={href}
              requestId={route.id}
            />
          ) : (route.page === 'screen' || route.page === 'record') && shown === 'privacy' && allowed ? (
            // TSK-0136: an Owner Decisions item opens its request (/privacy/<id>).
            <PrivacyScreen
              key={route.page === 'record' ? route.id : 'privacy'}
              t={t}
              locale={locale}
              fetchImpl={doFetch}
              href={href}
              {...(route.page === 'record' ? { requestId: route.id } : {})}
              onSession={(s) => setSession({ ...session, ...(s as Partial<Session>) })}
            />
          ) : route.page === 'screen' && shown === 'cases' && allowed ? (
            <CasesScreen t={t} locale={locale} fetchImpl={doFetch} href={href} />
          ) : route.page === 'record' && route.screen === 'cases' ? (
            // TSK-0093: a case, from the Cases screen, a queue item or the job packet; the server decides what it shows.
            <CasePage key={route.id} t={t} locale={locale} fetchImpl={doFetch} caseId={route.id} href={href} />
          ) : route.page === 'record' && route.screen === 'packets' ? (
            // TSK-0077: Stop Work / Report Hazard and Report an issue on the job's screen, before the packet loads.
            <>
              <JobSafety key={`safety-${route.id}`} t={t} locale={locale} fetchImpl={doFetch} jobId={route.id} issues />
              <JobPacketPage key={route.id} t={t} locale={locale} fetchImpl={doFetch} jobId={route.id} href={href} />
            </>
          ) : route.page === 'record' && route.screen === 'job-notes' ? (
            // TSK-0155: a job's internal notes and proposed customer replies (the assigned worker).
            <JobNotesPage key={route.id} t={t} locale={locale} fetchImpl={doFetch} jobId={route.id} href={href} />
          ) : route.page === 'record' && route.screen === 'reply-proposals' ? (
            // TSK-0155: the Owner's and Office's review of a proposed reply (the reply_proposal queue item's link).
            <ReplyProposalPage
              key={route.id}
              t={t}
              locale={locale}
              fetchImpl={doFetch}
              proposalId={route.id}
              href={href}
            />
          ) : route.page === 'record' && route.screen === 'loadouts' ? (
            // A job's loadout (TSK-0071), from its packet or the Owner's loadout_shortage queue item.
            <>
              <JobSafety key={`safety-${route.id}`} t={t} locale={locale} fetchImpl={doFetch} jobId={route.id} />
              <LoadoutPage key={route.id} t={t} locale={locale} fetchImpl={doFetch} jobId={route.id} href={href} />
            </>
          ) : route.page === 'record' && route.screen === 'start' ? (
            <StartWorkPage key={route.id} t={t} locale={locale} fetchImpl={doFetch} visitId={route.id} href={href} />
          ) : route.page === 'record' && route.screen === 'job-photos' ? (
            <JobPhotosPage key={route.id} t={t} locale={locale} fetchImpl={doFetch} jobId={route.id} />
          ) : route.page === 'record' && route.screen === 'start-review' ? (
            <StartReviewPage key={route.id} t={t} locale={locale} fetchImpl={doFetch} jobId={route.id} href={href} />
          ) : route.page === 'record' && route.screen === 'checklist' ? (
            // TSK-0075: the job checklist in six ordered stages; the server decides who may read and act.
            <>
              <JobSafety key={`safety-${route.id}`} t={t} locale={locale} fetchImpl={doFetch} jobId={route.id} />
              <ChecklistPage key={route.id} t={t} locale={locale} fetchImpl={doFetch} jobId={route.id} href={href} />
            </>
          ) : route.page === 'record' && route.screen === 'visit-outcomes' ? (
            // TSK-0078: one visit outcome and its follow-up (the Owner and Office).
            <VisitOutcomePage key={route.id} t={t} fetchImpl={doFetch} outcomeId={route.id} />
          ) : route.page === 'record' && route.screen === 'field-events' ? (
            // TSK-0080: a phone update the server kept for the Owner's review.
            <FieldEventPage key={route.id} t={t} fetchImpl={doFetch} clientId={route.id} href={href} />
          ) : route.page === 'record' && route.screen === 'change-order-versions' ? (
            // TSK-0082: an Owner Decisions item names the change-order version; open its job's change orders.
            <ChangeOrderVersionLink key={route.id} t={t} fetchImpl={doFetch} versionId={route.id} href={href} />
          ) : route.page === 'record' && route.screen === 'change-orders' ? (
            // TSK-0081: a job's change orders: proposals and drafts, apart from the approved scope.
            <ChangeOrdersPage key={route.id} t={t} fetchImpl={doFetch} jobId={route.id} href={href} />
          ) : route.page === 'record' && route.screen === 'quality-reviews' ? (
            // TSK-0084: a job's quality review and punch items (the Owner), or a worker's own punch items on it.
            <QualityReviewPage key={route.id} t={t} fetchImpl={doFetch} jobId={route.id} href={href} />
          ) : route.page === 'record' && route.screen === 'repeat-service' && allowed ? (
            // TSK-0114: a project's customer-agreed repeat-service schedule and its reminders.
            <RepeatServicePage key={route.id} t={t} fetchImpl={doFetch} projectId={route.id} href={href} />
          ) : route.page === 'record' && route.screen === 'closeout' && allowed ? (
            // TSK-0092: a job's closeout, the Owner's reopen and its follow-ups.
            <CloseoutPage key={route.id} t={t} fetchImpl={doFetch} jobId={route.id} href={href} />
          ) : route.page === 'record' && route.screen === 'job-costs' && allowed ? (
            // TSK-0095: a job's estimated versus actual costs; missing cost is shown incomplete, never $0.00.
            <JobCostsPage key={route.id} t={t} locale={locale} fetchImpl={doFetch} jobId={route.id} href={href} />
          ) : route.page === 'record' && route.screen === 'safety-holds' ? (
            // TSK-0077: a safety queue item's link (a critical hold) opens its job's review page.
            <SafetyHoldPage
              key={route.id}
              t={t}
              fetchImpl={doFetch}
              holdId={route.id}
              render={(jobId) => (
                <StartReviewPage key={jobId} t={t} locale={locale} fetchImpl={doFetch} jobId={jobId} href={href} />
              )}
            />
          ) : route.page === 'record' && route.screen === 'visit-times' ? (
            <VisitTimesPage key={route.id} t={t} locale={locale} fetchImpl={doFetch} visitId={route.id} />
          ) : route.page === 'record' && route.screen === 'visit-access' ? (
            <VisitAccessPage key={route.id} t={t} locale={locale} fetchImpl={doFetch} visitId={route.id} />
          ) : (route.page === 'screen' || route.page === 'home') && shown === 'my-day' && allowed ? (
            <MyDay t={t} locale={locale} fetchImpl={doFetch} href={href} />
          ) : route.page === 'screen' && shown === 'schedule' && allowed ? (
            <ScheduleBoard t={t} locale={locale} fetchImpl={doFetch} go={go} href={href} />
          ) : route.page === 'record' && route.screen === 'schedule' && allowed ? (
            // A queue item's link to a visit (TSK-0097 visit_flagged): the board opens on that visit (TSK-0065).
            <ScheduleBoard
              key={route.id}
              t={t}
              locale={locale}
              fetchImpl={doFetch}
              go={go}
              href={href}
              focusVisitId={route.id}
            />
          ) : shown === 'requests' && allowed && route.page === 'screen' ? (
            <RequestsScreen t={t} locale={locale} fetchImpl={doFetch} go={go} href={href} />
          ) : shown === 'estimates' && allowed && route.page === 'screen' ? (
            <EstimatesScreen t={t} locale={locale} fetchImpl={doFetch} go={go} href={href} />
          ) : route.page === 'record' && route.screen === 'estimates' && allowed ? (
            <EstimateBuilder key={route.id} t={t} fetchImpl={doFetch} id={route.id} go={go} href={href} />
          ) : shown === 'customers' && allowed && route.page === 'screen' ? (
            <CustomersScreen t={t} locale={locale} fetchImpl={doFetch} go={go} href={href} />
          ) : route.page === 'record' && route.screen === 'customers' && allowed ? (
            <CustomerRecord
              key={route.id}
              t={t}
              locale={locale}
              fetchImpl={doFetch}
              id={route.id}
              go={go}
              href={href}
            />
          ) : shown === 'inbox' && allowed && route.page === 'screen' ? (
            <InboxScreen t={t} locale={locale} fetchImpl={doFetch} go={go} href={href} />
          ) : route.page === 'record' && route.screen === 'inbox' && allowed ? (
            <InboxRecord key={route.id} t={t} locale={locale} fetchImpl={doFetch} id={route.id} go={go} href={href} />
          ) : route.page === 'record-step' && route.screen === 'customers' && route.step === 'merge' && allowed ? (
            <MergeReview
              key={`${route.id}-${route.params['into'] ?? ''}`}
              t={t}
              locale={locale}
              fetchImpl={doFetch}
              id={route.id}
              into={route.params['into'] ?? ''}
              go={go}
              href={href}
            />
          ) : route.page === 'record-step' && route.screen === 'requests' && route.step === 'relink' && allowed ? (
            <RelinkRequest
              key={route.id}
              t={t}
              locale={locale}
              fetchImpl={doFetch}
              requestId={route.id}
              go={go}
              href={href}
            />
          ) : route.page === 'record' && route.screen === 'properties' && allowed ? (
            <PropertyRecord
              key={route.id}
              t={t}
              locale={locale}
              fetchImpl={doFetch}
              id={route.id}
              go={go}
              href={href}
            />
          ) : route.page === 'screen' && shown === 'payments' && allowed ? (
            // TSK-0090: the Payments screen is the reconciliation queue.
            <ReconciliationScreen t={t} fetchImpl={doFetch} href={href} />
          ) : route.page === 'record' && route.screen === 'reconciliation' && allowed ? (
            <ReconciliationScreen key={route.id} t={t} fetchImpl={doFetch} href={href} itemId={route.id} />
          ) : route.page === 'record' && route.screen === 'invoice-reminders' && allowed ? (
            <InvoiceRemindersPage key={route.id} t={t} fetchImpl={doFetch} href={href} invoiceId={route.id} />
          ) : route.page === 'record' && route.screen === 'payments' && allowed ? (
            <JobDepositPage key={route.id} t={t} fetchImpl={doFetch} jobId={route.id} />
          ) : route.page === 'record' && route.screen === 'requests' && allowed ? (
            <RequestRecord key={route.id} t={t} locale={locale} fetchImpl={doFetch} id={route.id} go={go} href={href} />
          ) : (
            <Screen t={t} id={shown} allowed={allowed} />
          )}
        </Shell>
      </div>
    )
  }

  return (
    <div className="staff-app" lang={locale}>
      <header className="staff-app__bar">
        <p className="staff-app__brand">{t('app.title')}</p>
      </header>
      <main className="staff-app__main">
        {route.page === 'sign-in' ? (
          <SignIn t={t} fetchImpl={doFetch} onSignedIn={(s) => (setSession(s), go('/'))} />
        ) : route.page === 'set-password' ? (
          <SetPassword
            t={t}
            fetchImpl={doFetch}
            purpose={route.purpose}
            token={route.token}
            onDone={() => go('/sign-in')}
          />
        ) : (
          <StateView kind="loading" title={t('common.loading')} />
        )}
      </main>
    </div>
  )
}

type T = ReturnType<typeof useT>

function SignIn({ t, fetchImpl, onSignedIn }: { t: T; fetchImpl: Fetch; onSignedIn: (s: Session) => void }) {
  const [mode, setMode] = useState<'sign-in' | 'forgot' | 'sent' | 'mfa' | 'enroll'>('sign-in')
  const [useRecovery, setUseRecovery] = useState(false)
  const [error, setError] = useState<ApiErrorBody | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    setError(null)
    if (mode === 'forgot') {
      const r = await call(fetchImpl, '/staff/auth/password/forgot', {
        method: 'POST',
        body: { email: form.get('email') },
      })
      setPending(false)
      if (r.ok) setMode('sent')
      else setError(r.error)
      return
    }
    if (mode === 'mfa') {
      const value = form.get('code')
      const r = await call<Session>(fetchImpl, '/staff/auth/mfa/verify', {
        method: 'POST',
        body: useRecovery ? { recoveryCode: value } : { code: value },
      })
      setPending(false)
      if (r.ok) onSignedIn(r.data)
      else {
        // An ended sign-in step (UNAUTHENTICATED) starts over from the password.
        if (r.error.code === 'UNAUTHENTICATED') setMode('sign-in')
        setError(r.error)
      }
      return
    }
    // The password never completes a sign-in (TSK-0154, OWN-DEC-202): the server asks for the authenticator code, or
    // for setting up the authenticator first.
    const r = await call<{ mfaRequired: true; step: 'verify' | 'enroll' }>(fetchImpl, '/staff/auth/sign-in', {
      method: 'POST',
      body: { email: form.get('email'), password: form.get('password') },
    })
    setPending(false)
    if (r.ok) setMode(r.data.step === 'enroll' ? 'enroll' : 'mfa')
    else setError(r.error)
  }

  if (mode === 'enroll')
    return (
      <Enrol t={t} fetchImpl={fetchImpl} onSignedIn={onSignedIn} onRestart={(e) => (setMode('sign-in'), setError(e))} />
    )

  if (mode === 'mfa')
    return (
      <section className="staff-auth">
        <h1 className="hh-h3">{t('mfa.heading')}</h1>
        <p>{t('mfa.intro')}</p>
        {error ? (
          <StateView
            kind="error"
            title={error.code === 'INVALID_CREDENTIALS' ? t('mfa.invalid') : errorText(t, error)}
          />
        ) : null}
        <form className="staff-auth__form" onSubmit={(e) => void submit(e)} noValidate>
          <Field
            key={useRecovery ? 'recovery' : 'code'}
            label={useRecovery ? t('mfa.recoveryCode') : t('mfa.code')}
            name="code"
            autoComplete="one-time-code"
            inputMode={useRecovery ? 'text' : 'numeric'}
            required
          />
          <Button type="submit" pending={pending}>
            {t('mfa.submit')}
          </Button>
        </form>
        <Button variant="quiet" onClick={() => (setError(null), setUseRecovery(!useRecovery))}>
          {useRecovery ? t('mfa.useCode') : t('mfa.useRecovery')}
        </Button>
        <p className="staff-auth__hint">{t('mfa.lost')}</p>
      </section>
    )

  if (mode === 'sent')
    return (
      <Card title={t('forgot.heading')} headingLevel={2}>
        <StateView kind="success" title={t('forgot.sent')} />
        <Button variant="quiet" onClick={() => setMode('sign-in')}>
          {t('forgot.back')}
        </Button>
      </Card>
    )

  return (
    <section className="staff-auth">
      <h1 className="hh-h3">{mode === 'forgot' ? t('forgot.heading') : t('signIn.heading')}</h1>
      {mode === 'forgot' ? <p>{t('forgot.intro')}</p> : null}
      {error && error.fieldErrors.some((f) => f.code === 'MFA_NOT_CONFIGURED') ? (
        <StateView kind="blocked" title={t('signIn.mfaNotConfigured')} />
      ) : error && error.fieldErrors.some((f) => f.code === 'MFA_REQUIRED') ? (
        <StateView kind="error" title={t('mfa.expired')} />
      ) : error && error.fieldErrors.length === 0 ? (
        <StateView kind="error" title={errorText(t, error)} />
      ) : null}
      <form className="staff-auth__form" onSubmit={(e) => void submit(e)} noValidate>
        <Field
          label={t('signIn.email')}
          name="email"
          type="email"
          autoComplete="username"
          required
          {...optional(fieldText(t, error, 'email'))}
        />
        {mode === 'sign-in' ? (
          <Field
            label={t('signIn.password')}
            name="password"
            type="password"
            autoComplete="current-password"
            required
            {...optional(fieldText(t, error, 'password'))}
          />
        ) : null}
        <Button type="submit" pending={pending}>
          {mode === 'forgot' ? t('forgot.submit') : t('signIn.submit')}
        </Button>
      </form>
      <Button variant="quiet" onClick={() => (setError(null), setMode(mode === 'forgot' ? 'sign-in' : 'forgot'))}>
        {mode === 'forgot' ? t('forgot.back') : t('signIn.forgot')}
      </Button>
    </section>
  )
}

const optional = (error: string | undefined) => (error === undefined ? {} : { error })

function SetPassword({
  t,
  fetchImpl,
  purpose,
  token,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  purpose: 'invite' | 'reset'
  token: string
  onDone: () => void
}) {
  const [error, setError] = useState<ApiErrorBody | null>(null)
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const password = new FormData(e.currentTarget).get('password')
    setPending(true)
    setError(null)
    const r = await call(fetchImpl, '/staff/auth/password/set', { method: 'POST', body: { token, password } })
    setPending(false)
    if (r.ok) setDone(true)
    else setError(r.error)
  }

  const heading = purpose === 'invite' ? t('setPassword.headingInvite') : t('setPassword.headingReset')
  if (done)
    return (
      <section className="staff-auth">
        <h1 className="hh-h3">{heading}</h1>
        <StateView
          kind="success"
          title={t('setPassword.done')}
          action={<Button onClick={onDone}>{t('signIn.submit')}</Button>}
        />
      </section>
    )
  if (error?.code === 'LINK_INVALID')
    return (
      <section className="staff-auth">
        <h1 className="hh-h3">{heading}</h1>
        <StateView
          kind="blocked"
          title={t('setPassword.invalid')}
          action={
            <Button variant="secondary" onClick={onDone}>
              {t('forgot.back')}
            </Button>
          }
        />
      </section>
    )
  return (
    <section className="staff-auth">
      <h1 className="hh-h3">{heading}</h1>
      {error && error.fieldErrors.length === 0 ? <StateView kind="error" title={errorText(t, error)} /> : null}
      <form className="staff-auth__form" onSubmit={(e) => void submit(e)} noValidate>
        <Field
          label={t('setPassword.password')}
          name="password"
          type="password"
          autoComplete="new-password"
          hint={t('setPassword.hint', { min: PASSWORD_MIN })}
          required
          {...optional(fieldText(t, error, 'password'))}
        />
        <Button type="submit" pending={pending}>
          {t('setPassword.submit')}
        </Button>
      </form>
    </section>
  )
}

/**
 * The person's own account: who is signed in, Sign out everywhere and the mandatory authenticator's status
 * (TSK-0014, TSK-0015, TSK-0154); for the Owner, the escalation number of every job packet (TSK-0129).
 */
function Account({
  t,
  fetchImpl,
  session,
  onSignedOut,
  onSession,
}: {
  t: T
  fetchImpl: Fetch
  session: Session
  onSignedOut: () => void
  onSession?: (s: { csrfToken: string }) => void
}) {
  const [pending, setPending] = useState(false)
  async function signOutEverywhere() {
    setPending(true)
    await call(fetchImpl, '/staff/auth/sessions/revoke-all', { method: 'POST' })
    setPending(false)
    onSignedOut()
  }
  return (
    <section className="staff-auth">
      <h1 className="hh-h3">{t('nav.account')}</h1>
      <p>{t('home.signedInAs', { name: session.displayName ?? session.email })}</p>
      <div className="hh-button-row">
        <Button variant="secondary" pending={pending} onClick={() => void signOutEverywhere()}>
          {t('security.signOutEverywhere')}
        </Button>
      </div>
      <Security t={t} fetchImpl={fetchImpl} />
      {/* TSK-0129 (HH-PKT-09): the Owner enters the number every packet's Call Owner dials (hidden for other roles). */}
      {session.roles.includes('owner') ? (
        <OwnerEscalationPhone t={t} fetchImpl={fetchImpl} {...(onSession ? { onSession } : {})} />
      ) : null}
    </section>
  )
}

/**
 * Sign-in security on the person's own account (TSK-0015, TSK-0154): MFA is mandatory for every staff role
 * (OWN-DEC-202), so the authenticator is always set up here and nobody removes it. The card says how many recovery
 * codes are left and what to do when the phone is lost: a recovery code at sign-in, or the Owner resets it.
 */
function Security({ t, fetchImpl }: { t: T; fetchImpl: Fetch }) {
  const [left, setLeft] = useState<number | null>(null)
  useEffect(() => {
    let live = true
    void call<{ recoveryCodesLeft: number }>(fetchImpl, '/staff/auth/mfa').then((r) => {
      if (live && r.ok) setLeft(r.data.recoveryCodesLeft)
    })
    return () => {
      live = false
    }
  }, [fetchImpl])
  return (
    <Card title={t('security.heading')} headingLevel={2}>
      <div className="staff-auth">
        <p>{t('security.enrolled')}</p>
        {left !== null ? <p>{t('security.recoveryLeft', { count: left })}</p> : null}
        <p>{t('security.lost')}</p>
      </div>
    </Card>
  )
}

/**
 * The mandatory authenticator enrolment right after the password (TSK-0154, OWN-DEC-202): the server shows the
 * setup key once, a code from the new authenticator confirms it, and the recovery codes are shown once before the
 * staff app opens. Without a confirmed authenticator the session reaches no staff screen.
 */
function Enrol({
  t,
  fetchImpl,
  onSignedIn,
  onRestart,
}: {
  t: T
  fetchImpl: Fetch
  onSignedIn: (s: Session) => void
  onRestart: (e: ApiErrorBody) => void
}) {
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null)
  const [done, setDone] = useState<{ recoveryCodes: string[]; session: Session } | null>(null)
  const [error, setError] = useState<ApiErrorBody | null>(null)
  const [pending, setPending] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    // Once per enrolment screen: a second start would replace the key shown.
    if (started.current) return
    started.current = true
    void call<{ secret: string; otpauthUri: string }>(fetchImpl, '/staff/auth/mfa/enroll', { method: 'POST' }).then(
      (r) => {
        if (r.ok) setSetup(r.data)
        else if (r.error.code === 'UNAUTHENTICATED') onRestart(r.error)
        else setError(r.error)
      },
    )
  }, [fetchImpl])

  async function confirm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(null)
    const r = await call<{ recoveryCodes: string[]; session: Session }>(fetchImpl, '/staff/auth/mfa/confirm', {
      method: 'POST',
      body: { code: new FormData(e.currentTarget).get('code') },
    })
    setPending(false)
    if (r.ok) setDone(r.data)
    else if (r.error.code === 'UNAUTHENTICATED') onRestart(r.error)
    else setError(r.error)
  }

  if (done)
    return (
      <section className="staff-auth">
        <h1 className="hh-h3">{t('enroll.codesHeading')}</h1>
        <p>{t('security.recoveryIntro')}</p>
        <ul className="staff-auth__codes" data-testid="mfa-recovery-codes">
          {done.recoveryCodes.map((c) => (
            <li key={c}>
              <code>{c}</code>
            </li>
          ))}
        </ul>
        <Button onClick={() => onSignedIn(done.session)}>{t('enroll.continue')}</Button>
      </section>
    )

  return (
    <section className="staff-auth">
      <h1 className="hh-h3">{t('enroll.heading')}</h1>
      <p>{t('enroll.intro')}</p>
      {error ? (
        <StateView kind="error" title={error.code === 'INVALID_CREDENTIALS' ? t('mfa.invalid') : errorText(t, error)} />
      ) : null}
      {setup ? (
        <form className="staff-auth__form" onSubmit={(e) => void confirm(e)} noValidate>
          <p>{t('security.secretIntro')}</p>
          <p>
            {t('security.secretLabel')}: <code data-testid="mfa-secret">{setup.secret}</code>
          </p>
          <p>
            <a href={setup.otpauthUri}>{t('enroll.openApp')}</a>
          </p>
          <Field label={t('mfa.code')} name="code" autoComplete="one-time-code" inputMode="numeric" required />
          <Button type="submit" pending={pending}>
            {t('security.confirm')}
          </Button>
        </form>
      ) : error ? null : (
        <StateView kind="loading" title={t('common.loading')} />
      )}
    </section>
  )
}
