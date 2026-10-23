// Portal module (TSK-0038; HH-PORT-02, HH-PORT-03, HH-PORT-06, HH-ARC-10, HH-PORT-01, HH-ARC-04, RULE-SERVER-AUTHZ):
// the customer project workspace frame.
//   GET /customer/projects                      the projects the caller's session opens, with their status
//   GET /customer/projects/:reference/overview  one project's Overview: status, next action, timeline, summaries
//   GET /customer/projects/:reference/<tab>     the Messages, Documents, Photos, Appointments and Payments tabs
//                                                (TSK-0039; HH-PORT-09): each tab's truthful state today
//   GET/POST /customer/projects/:reference/estimates/:number/versions/:version[/...]  the customer estimate view,
//                                                Request Changes, Decline, Request an Updated Estimate (TSK-0056),
//                                                the selected options and Approve Estimate (TSK-0057)
//   GET/POST /customer/session/verification[/codes]   fresh verification inside the session (TSK-0057, HH-ID-07)
//   POST /customer/projects/:reference/window-offers/:number/(select|other-times)  the customer's answer to offered
//                                                windows (TSK-0063; HH-SCH-11, HH-LEAD-07)
//   GET/POST /customer/projects/:reference/change-orders[/:number/versions/:version/(approve|reject)]  the change
//                                                orders sent to the customer and their decision (TSK-0082)
// The Overview is authorized by the policy (ROLE-MATRIX "View intake queue and original requests": Customer "V (own)")
// and scoped by the session (TSK-0037): another project, an unknown or a malformed reference is the same NOT_FOUND.
// The list names no record, so like GET /customer/access/session it starts from the session itself; each project
// is then read inside the request.view scope of the same matrix row, so nothing outside it is ever listed.
// The answers are explicit customer views (records/projections.ts); no internal note, staff name, qualification,
// Owner routing or internal decision is read. They carry the server's time and the configured refresh interval, so
// the page can say when it last refreshed and poll modestly (HH-ARC-10).
import { dataScope } from '@handyhub/policy'
import { ApiError } from '../../api/errors.js'
import { AUTHENTICATION, type ApiModule, type RouteDef } from '../../api/route.js'
import { projectIdOf } from '../access/projects.js'
import type { CodeKeySettings } from '../identity/index.js'
import {
  PROJECT_APPOINTMENTS,
  PROJECT_DOCUMENTS,
  PROJECT_LIST,
  PROJECT_MESSAGES,
  PROJECT_OVERVIEW,
  PROJECT_PAYMENTS,
  PROJECT_PHOTOS,
  type CustomerView,
} from '../records/index.js'
import { projectOverview, projectSummaries, refreshSeconds } from './overview.js'
import { portalAppointmentRoutes, type PortalAppointmentDeps } from './appointments.js'
import { portalChangeOrderRoutes } from './change-orders.js'
import { portalEstimateRoutes, type PortalEstimateDeps } from './estimates.js'
import { sessionVerificationRoutes, type SessionVerificationDeps } from './verification.js'
import { projectTab, type WorkspaceTab } from './tabs.js'

export { projectOverview, projectSummaries, refreshSeconds } from './overview.js'
export type { ProjectOverview, ProjectSummary, TimelineEntry } from './overview.js'
export { projectTab, WORKSPACE_TABS, type TabAnswer, type WorkspaceTab } from './tabs.js'

const TEST = 'test/integration/portal.test.ts'
const read = {
  method: 'GET',
  actors: ['customer'],
  kind: 'read',
  idempotency: 'none',
  expectedVersion: 'none',
  rateLimit: 'none',
  audit: 'none',
  pagination: false,
  test: TEST,
} as const

export {
  ESTIMATE_APPROVAL_RATE_LIMIT,
  ESTIMATE_RESPONSE_RATE_LIMIT,
  ESTIMATE_SELECTION_RATE_LIMIT,
  type PortalEstimateDeps,
} from './estimates.js'
export { reverifyTargets, type SessionVerificationDeps } from './verification.js'

const NO_CODE_KEY: CodeKeySettings = { state: 'not_configured', missing: ['CODE_HASH_KEY'] }

export { WINDOW_ANSWER_RATE_LIMIT, type PortalAppointmentDeps } from './appointments.js'

export function portalModule(
  deps: PortalEstimateDeps & PortalAppointmentDeps & Partial<SessionVerificationDeps> = {},
): ApiModule {
  const list: RouteDef = {
    ...read,
    path: '/customer/projects',
    operationId: 'listCustomerProjects',
    summary: 'The projects this session opens, with their status',
    description:
      'For a live customer session: every project it opens (a guest link session: exactly one; an account: its ' +
      'linked projects), each with its reference, services and customer status: the situation, its next step, ' +
      'who is waiting and the one next action. Without a session, 401. Nothing about any other project.',
    permission: AUTHENTICATION,
    projection: PROJECT_LIST,
    schema: { response: { 200: PROJECT_LIST.schema } },
    handler: async (ctx) => {
      const now = new Date()
      const projects = await projectSummaries(ctx.db, dataScope(ctx.actor, 'request.view', now), now)
      return {
        body: PROJECT_LIST.project({ projects, refreshedAt: now, refreshSeconds: await refreshSeconds(ctx.db) }),
      }
    },
  }

  const overview: RouteDef = {
    ...read,
    path: '/customer/projects/:reference/overview',
    operationId: 'getCustomerProjectOverview',
    summary: 'The project Overview',
    description:
      'The Overview of a project the caller’s session opens (HH-PORT-02, HH-PORT-03): the plain-language status as ' +
      'codes (situation, next step, who is waiting, one next action, since when, and the customer text staff ' +
      'published with it), the filtered timeline (the request and the decisions published to the customer, newest ' +
      'first), the confirmed appointment and the payment summary as separate fields, the server time of the read ' +
      'and the refresh interval (portal.refresh; 0 while NOT CONFIGURED). No internal note, staff detail, ' +
      'qualification or internal decision. Any other project, an unknown or a malformed reference is the same ' +
      'NOT_FOUND (T19), recorded as a security event when the project exists.',
    permission: 'request.view',
    resource: async ({ req, db }) => {
      const id = await projectIdOf(db, (req.params as { reference: string }).reference)
      return id ? { projectId: id } : null
    },
    projection: PROJECT_OVERVIEW,
    schema: {
      params: {
        type: 'object',
        additionalProperties: false,
        required: ['reference'],
        properties: { reference: { type: 'string', minLength: 1, maxLength: 40 } },
      },
      response: { 200: PROJECT_OVERVIEW.schema },
    },
    handler: async (ctx) => {
      const o = await projectOverview(ctx.db, ctx.scope, (ctx.req.params as { reference: string }).reference)
      if (!o) throw new ApiError('NOT_FOUND')
      return { body: PROJECT_OVERVIEW.project(o) }
    },
  }

  // The other five tabs (TSK-0039): the same permission, scope and NOT_FOUND as the Overview, each with its own view;
  // Messages (TSK-0050) is authorized by the matrix row of the project thread (message.reply, customer "V").
  const TABS: readonly {
    tab: WorkspaceTab
    operationId: string
    view: CustomerView<never>
    says: string
    permission?: RouteDef['permission']
  }[] = [
    {
      tab: 'messages',
      operationId: 'getCustomerProjectMessages',
      view: PROJECT_MESSAGES as CustomerView<never>,
      says:
        'The Messages tab (TSK-0050): the project’s customer conversation, oldest first: the customer’s own email and ' +
        'texts on the project (from the customer’s contacts only) and HandyHub’s replies (shown when staff press ' +
        'Send), each with who wrote it (you or HandyHub), the channel, the time and the text exactly as written, or ' +
        'why there is no text; attachments as a count (they are not imported). Never an internal message, a staff ' +
        'name, an address or a delivery detail. An empty list: no message yet. Authorized by message.reply (ROLE-MATRIX ' +
        '"V project thread").',
      permission: 'message.reply',
    },
    {
      tab: 'documents',
      operationId: 'getCustomerProjectDocuments',
      view: PROJECT_DOCUMENTS as CustomerView<never>,
      says:
        'The Documents tab (TSK-0056, HH-PORT-10). state "listed": the estimate versions the customer received, newest ' +
        'first, each with its number, version, status (current, approved, declined, expired, superseded, withdrawn), ' +
        'dates and stored total in integer cents, and for an approved version its approval receipt PDF (TSK-0058: ' +
        'preparing or issued); TSK-0085: the issued invoices (never a draft), newest first, each current or ' +
        'superseded, with its payment state, issue date, total, the balance still owed from confirmed payments and ' +
        'credits, any pending check and its PDF (preparing or issued). state "none": no customer document exists yet ' +
        '(receipts, change orders and care notes come with their own tasks).',
    },
    {
      tab: 'photos',
      operationId: 'getCustomerProjectPhotos',
      view: PROJECT_PHOTOS as CustomerView<never>,
      says:
        'The Photos tab (TSK-0076, HH-PORT-11): the customer’s own uploads (request and reply photos) counted by ' +
        'state (received: ready, processing: quarantined, failed: rejected) and listed, each ready one with a signed ' +
        'URL valid for linkSeconds; and the before and after photos staff shared with the customer, grouped by ' +
        'service and paired where staff paired them and both are shared. Internal and restricted photos are never ' +
        'read, listed or counted (OWN-DEC-106); no marketing state is sent.',
    },
    {
      tab: 'appointments',
      operationId: 'getCustomerProjectAppointments',
      view: PROJECT_APPOINTMENTS as CustomerView<never>,
      says:
        'The Appointments tab (TSK-0063, HH-LEAD-07, HH-SCH-11, T37). state "listed": the offers the customer can see ' +
        '(open and held until expiresAt, expired with no selection, or other times asked for), each named by its ' +
        'number with its windows (local date, arrival window, zone, UTC instants), and the confirmed visits with their ' +
        'purpose (estimate_visit: on the project, no job and no price approval; work_visit), status, window, property ' +
        'address and preparation instructions. state "none": no offered window or confirmed visit exists yet. Never ' +
        'a hold, a worker, a staff detail or an ID.',
    },
    {
      tab: 'payments',
      operationId: 'getCustomerProjectPayments',
      view: PROJECT_PAYMENTS as CustomerView<never>,
      says:
        'The Payments tab (TSK-0087, HH-PORT-12). state "listed": the approved total (the current approved scope), the ' +
        'deposit (due with what is verified and pending and its Pay by Card link, received, or none), each issued ' +
        'invoice with its total, credits, confirmed, pending (a check until cleared) and balance in integer cents and ' +
        'its Pay by Card link (only while a balance remains and staff pasted a Square link), the recorded payments ' +
        '(date, method, amount, confirmed, pending or returned; never who recorded them), the totals, and the payment ' +
        'instructions from configuration with their placeholder flag (a placeholder is never a payment destination). ' +
        'Nothing here, and no return from a Square link, marks anything paid: staff record verified payments. state ' +
        '"none": no approved total, deposit, invoice or recorded payment exists yet.',
    },
  ]
  const tabs: RouteDef[] = TABS.map(({ tab, operationId, view, says, permission }) => ({
    ...overview,
    ...(permission ? { permission } : {}),
    path: `/customer/projects/:reference/${tab}`,
    test: 'test/integration/portal-tabs.test.ts',
    operationId,
    summary: `The project ${tab[0]?.toUpperCase()}${tab.slice(1)} tab`,
    description:
      `${says} With the server time of the read and the refresh interval (portal.refresh; 0 while NOT ` +
      'CONFIGURED). Any other project, an unknown or a malformed reference is the same NOT_FOUND (T19).',
    projection: view,
    schema: { ...overview.schema, response: { 200: view.schema } },
    handler: async (ctx) => {
      const answer = await projectTab(
        ctx.db,
        ctx.scope,
        (ctx.req.params as { reference: string }).reference,
        tab,
        new Date(),
        deps.storage ?? null,
      )
      if (!answer) throw new ApiError('NOT_FOUND')
      return { body: view.project(answer as never) }
    },
  }))

  const verification = sessionVerificationRoutes({
    codeKey: deps.codeKey ?? NO_CODE_KEY,
    trustProxyHops: deps.trustProxyHops ?? 0,
  })
  return {
    name: 'portal',
    routes: [
      list,
      overview,
      ...tabs,
      ...portalEstimateRoutes(deps),
      ...portalAppointmentRoutes(deps),
      ...verification,
      // TSK-0082: the change orders sent to the customer, and their approval or rejection.
      ...portalChangeOrderRoutes(deps),
    ],
  }
}
