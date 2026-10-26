// Staff routes of the first-visit site checks (TSK-0126; OWN-DEC-167, OWN-DEC-179, HH-SCH-06, RULE-SERVER-AUTHZ).
//   POST /staff/projects/:projectId/site-contact          record the authorized site contact (visit.confirm)
//   POST /staff/projects/:projectId/coverage-acceptance   accept SERVED coverage of the verified county (visit.confirm)
//   POST /staff/projects/:projectId/coverage-exception    the Owner's exception for an OUTSIDE county, with a reason
//                                                         (visit.approve_coverage_exception)
// The address check is the address-and-county check on the property record (POST
// /staff/properties/:propertyId/county-verification, TSK-0127). The three checks show on the project's visits
// (siteChecks). Every write is audited; an audit summary never holds the contact's phone or email.
import type { Tx } from '@handyhub/db'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, RouteDef } from '../../api/route.js'
import {
  COVERAGE_ACCEPT_BODY,
  COVERAGE_EXCEPTION_BODY,
  COVERAGE_RESULT,
  PROJECT_PARAMS,
  SITE_CONTACT_BODY,
  SITE_CONTACT_RESULT,
} from './schemas.js'
import { recordCoverage, recordSiteContact, type SiteContactInput } from './site-checks.js'

const TEST = 'test/integration/confirmation-preconditions.test.ts'

const staffActor = (ctx: ApiContext) => {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}

const projectOf: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { projectId } = req.params as { projectId: string }
  const p = await db.selectFrom('crm.projects').select('id').where('id', '=', projectId).executeTakeFirst()
  return p ? { projectId: p.id } : null
}

const write = (r: Pick<RouteDef, 'path' | 'operationId' | 'summary' | 'description' | 'permission' | 'audit'>) =>
  ({
    method: 'POST',
    actors: ['staff'],
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    pagination: false,
    test: TEST,
    resource: projectOf,
    ...r,
  }) as const

export function siteCheckRoutes(): RouteDef[] {
  const siteContact: RouteDef = {
    ...write({
      path: '/staff/projects/:projectId/site-contact',
      operationId: 'recordSiteContact',
      summary: 'Record the authorized site contact of a project',
      description:
        'Staff with visit.confirm (Owner, Office). The person the customer designated as site contact (OWN-DEC-167): ' +
        'the customer themselves (designation customer: name, phone and email come from their contact record and ' +
        'are not typed again; NOT_FOR_CUSTOMER otherwise) or a person they named (designation other: fullName, role ' +
        'and a phone or email; NAME_REQUIRED, ROLE_REQUIRED, CONTACT_REQUIRED, PHONE_INVALID, EMAIL_INVALID), with ' +
        'what staff confirmed the person may do: authority property_access and/or visit_coordination, nothing else ' +
        '(never money or contract changes). An empty authority records the designation with the check still unmet ' +
        '(SITE_CONTACT_NOT_AUTHORIZED). Recorded as the next version with its source and an optional note; ' +
        'currentVersion is the version the caller saw (0 for none; STALE_VERSION otherwise). A confirmation needs ' +
        'the current version authorized, and for the customer their contact record unchanged since ' +
        '(SITE_CONTACT_CHANGED).',
      permission: 'visit.confirm',
      audit: 'visit.site_contact',
    }),
    schema: { params: PROJECT_PARAMS, body: SITE_CONTACT_BODY, response: { 200: SITE_CONTACT_RESULT } },
    handler: async (ctx) => {
      const { projectId } = ctx.req.params as { projectId: string }
      const out = await recordSiteContact(
        ctx.tx as Tx,
        staffActor(ctx),
        ctx.scope,
        projectId,
        ctx.req.body as SiteContactInput,
      )
      await ctx.audit({
        target: { type: 'project', id: projectId },
        summary: {
          siteContactVersion: out.version,
          designation: out.designation,
          authority: out.authority,
          authorized: out.authority.length > 0,
          source: (ctx.req.body as SiteContactInput).source,
        },
        ...(out.note ? { reason: out.note } : {}),
      })
      return { body: { id: out.id, version: out.version, authorized: out.authority.length > 0 } }
    },
  }

  const coverageRoute = (kind: 'accept' | 'exception'): RouteDef => ({
    ...write(
      kind === 'accept'
        ? {
            path: '/staff/projects/:projectId/coverage-acceptance',
            operationId: 'acceptProjectCoverage',
            summary: 'Accept the service-area coverage of the verified county',
            description:
              'Staff with visit.confirm (Owner, Office). Confirms that the county verified for the property’s current ' +
              'address version (countyVerificationId, as shown; COUNTY_CHECK_CHANGED otherwise; COUNTY_NOT_VERIFIED ' +
              'before any) lies in the service area: SERVED, with no owner approval (OWN-DEC-179). A county outside ' +
              'the area needs the Owner’s exception instead (COUNTY_OUTSIDE_AREA). Once per county check ' +
              '(COVERAGE_ACCEPTED); a new address version or county check needs it again.',
            permission: 'visit.confirm',
            audit: 'visit.accept_coverage',
          }
        : {
            path: '/staff/projects/:projectId/coverage-exception',
            operationId: 'approveCoverageException',
            summary: 'Approve a coverage exception for a county outside the service area',
            description:
              'The Owner only (visit.approve_coverage_exception), with a written reason (REASON_REQUIRED). Approves ' +
              'serving a property whose verified county (countyVerificationId, as shown; COUNTY_CHECK_CHANGED ' +
              'otherwise) lies outside the service area: OUTSIDE (OWN-DEC-167). A county inside the area needs no ' +
              'exception (EXCEPTION_NOT_NEEDED). The exception lifts the coverage check only: the approval, the ' +
              'deposit gate and every blocking hold (legal, licensing, safety) still apply. Once per county check ' +
              '(COVERAGE_ACCEPTED).',
            permission: 'visit.approve_coverage_exception',
            audit: 'visit.coverage_exception',
          },
    ),
    schema: {
      params: PROJECT_PARAMS,
      body: kind === 'accept' ? COVERAGE_ACCEPT_BODY : COVERAGE_EXCEPTION_BODY,
      response: { 200: COVERAGE_RESULT },
    },
    handler: async (ctx) => {
      const { projectId } = ctx.req.params as { projectId: string }
      const body = ctx.req.body as { countyVerificationId: string; reason?: string }
      const out = await recordCoverage(
        ctx.tx as Tx,
        staffActor(ctx),
        ctx.scope,
        projectId,
        { countyVerificationId: body.countyVerificationId, exceptionReason: body.reason ?? null },
        kind,
      )
      await ctx.audit({
        target: { type: 'project', id: projectId },
        summary: {
          outcome: out.outcome,
          countyVerificationId: out.countyVerificationId,
          addressVersion: out.addressVersion,
          state: out.state,
          county: out.county,
        },
        ...(out.reason ? { reason: out.reason } : {}),
      })
      return { body: { id: out.id, outcome: out.outcome } }
    },
  })

  return [siteContact, coverageRoute('accept'), coverageRoute('exception')]
}
