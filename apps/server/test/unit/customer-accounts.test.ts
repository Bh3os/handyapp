// Optional customer accounts without a database (TSK-0036; HH-ID-10, HH-ID-11, HH-ID-03, RULE-SERVER-AUTHZ). Synthetic
// values only (RULE-SYNTHETIC-DATA).
import { describe, expect, it } from 'vitest'
import { AUTHENTICATION, routeProblems } from '../../src/api/route.js'
import { isPrivatePath } from '../../src/hosts.js'
import {
  accountRef,
  CONTACT_CHANGED_EVENT,
  CONTACT_CHANGED_MESSAGE_KEY,
  emailChangeSubject,
  enrollmentSubject,
  recoverySubject,
  signInSubject,
} from '../../src/modules/accounts/index.js'
import { MODULES } from '../../src/modules/index.js'
import { messageType, messageTypeProblems } from '../../src/modules/notifications/index.js'

const all = MODULES.find((m) => m.name === 'accounts')?.routes ?? []
const SECURITY_TEST = 'test/integration/account-security.test.ts'
// TSK-0036's routes; TSK-0149's account security routes are covered by their own file (below).
const routes = all.filter((r) => r.test !== SECURITY_TEST)
const security = all.filter((r) => r.test === SECURITY_TEST)
const route = (id: string) => {
  const r = all.find((x) => x.operationId === id)
  if (!r) throw new Error(id)
  return r
}

describe('the account routes (TSK-0036)', () => {
  it('[HH-ID-10][HH-ID-11][RULE-SERVER-AUTHZ] every route has a complete contract; enrollment and sign-in authenticate the caller', () => {
    expect(routes.map((r) => `${r.method} ${r.path}`).sort()).toEqual(
      [
        'GET /customer/account',
        'GET /customer/account/enrollment',
        'POST /customer/account/email',
        'POST /customer/account/email/codes',
        'POST /customer/account/enrollment',
        'POST /customer/account/enrollment/codes',
        'POST /customer/session/sign-out',
        'POST /public/account/sign-in',
        'POST /public/account/sign-in/codes',
        'POST /public/request-receipt/account',
        'POST /public/request-receipt/account/codes',
      ].sort(),
    )
    for (const r of routes) {
      expect(routeProblems(r), r.operationId).toEqual([])
      expect(r.permission, r.operationId).toBe(AUTHENTICATION)
      expect(r.test).toBe('test/integration/customer-accounts.test.ts')
    }
    // Only a signed-in customer reaches the account, its email change and Sign Out.
    for (const id of ['getCustomerAccount', 'sendAccountEmailCode', 'changeAccountEmail', 'customerSignOut'])
      expect(route(id).actors).toEqual(['customer'])
    // Every route that sends a code or checks one is limited per network (PROPOSED values).
    for (const id of [
      'sendReceiptAccountCode',
      'enrollFromReceipt',
      'sendAccountSignInCode',
      'accountSignIn',
      'sendAccountEmailCode',
      'changeAccountEmail',
    ])
      expect(route(id).rateLimit, id).not.toBe('none')
  })

  it('[HH-ID-03] the sign-in code answer is one fixed shape with no account detail', () => {
    const r = route('sendAccountSignInCode')
    expect(Object.keys(r.schema.response)).toEqual(['202'])
    expect(r.schema.response[202]).toMatchObject({ required: ['accepted', 'codeMinutes'] })
  })

  it('[HH-ID-10] codes are tied to what they prove: an enrollment to one request’s contact, a sign-in to one account', () => {
    expect(enrollmentSubject('r-1', 'c-1', 'email')).toBe('enroll:r-1:c-1:email')
    expect(signInSubject('a-1', 'phone')).toBe('account:a-1:phone')
    expect(emailChangeSubject('a-1')).toBe('account:a-1:email_change')
    expect(accountRef('a-1')).toBe('account:a-1')
    // Each fits the code row's subject and the session's contact reference (at most 200 and 100 characters).
    const uuid = '00000000-0000-4000-8000-000000000000'
    expect(enrollmentSubject(uuid, uuid, 'phone').length).toBeLessThanOrEqual(200)
    expect(accountRef(uuid).length).toBeLessThanOrEqual(100)
  })

  it("[HH-ID-11][HH-COM-13] the notice to the old email is its own message type, with the owner wording's variables and no credential", () => {
    const type = messageType(CONTACT_CHANGED_MESSAGE_KEY)
    expect(type.audience).toBe('customer')
    expect(type.triggerEvents).toEqual([CONTACT_CHANGED_EVENT])
    // TSK-0119: account_email_changed (OWN-DEC-151): the first name, when it changed, and the support contact.
    expect(Object.keys(type.variables).sort()).toEqual([
      'changeDate',
      'changeTime',
      'customerName',
      'supportContact',
      'timeZone',
    ])
    expect(Object.values(type.variables)).not.toContain('credential')
    expect(messageTypeProblems(type)).toEqual([])
  })

  it('[HH-ID-08] the account page is private under every name it can be fetched by', () => {
    for (const url of ['/account', '/account/', '/account.html']) expect(isPrivatePath('public', url), url).toBe(true)
  })
})

describe('the account security routes (TSK-0149, OWN-DEC-198)', () => {
  it('[HH-ID-11][HH-ID-09][RULE-SERVER-AUTHZ] every route has a complete contract; the Owner’s work is decided by the policy', () => {
    expect(security.map((r) => `${r.method} ${r.path}`).sort()).toEqual(
      [
        'GET /staff/access-help',
        'GET /staff/access-help/:id',
        'GET /staff/access-help/lookup',
        'POST /customer/account/sign-out-everywhere',
        'POST /public/access/help',
        'POST /staff/access-help/:id/close',
        'POST /staff/customer-accounts/:accountId/recovery',
        'POST /staff/customer-accounts/:accountId/recovery/cancel',
        'POST /staff/customer-accounts/:accountId/sign-out-everywhere',
        'POST /staff/projects/:projectId/access-link',
      ].sort(),
    )
    for (const r of security) {
      expect(routeProblems(r), r.operationId).toEqual([])
      if (r.path.startsWith('/staff/')) {
        expect(r.actors, r.operationId).toEqual(['staff'])
        expect(r.permission, r.operationId).not.toBe(AUTHENTICATION)
      } else expect(r.permission, r.operationId).toBe(AUTHENTICATION)
    }
    expect(route('customerSignOutEverywhere').actors).toEqual(['customer'])
    expect(route('revokeCustomerAccountSessions').permission).toBe('customer_account.revoke_sessions')
    expect(route('startCustomerAccountRecovery').permission).toBe('customer_account.assist_recovery')
    expect(route('sendProjectAccessLink').permission).toBe('project_access.send_link')
    // The visitor's help request is limited per network (PROPOSED) and has one fixed answer.
    expect(route('requestAccessHelp').rateLimit).not.toBe('none')
    expect(Object.keys(route('requestAccessHelp').schema.response)).toEqual(['202'])
  })

  it('[HH-ID-11] a staff-assisted recovery’s code is tied to that recovery', () => {
    expect(recoverySubject('r-1')).toBe('recovery:r-1')
    expect(recoverySubject('00000000-0000-4000-8000-000000000000').length).toBeLessThanOrEqual(200)
  })
})
