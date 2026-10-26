// "Reset & Create Fresh Test Data" (TSK-0141; HH-OPS-05, OWN-DEC-191, RULE-SYNTHETIC-DATA, RULE-NO-INVENTED-FACTS,
// RULE-SAFETY-GATES). After a completed reset, a fixed set of fictional scenarios is created through the server's own
// routes and functions (invoke.ts), each scenario in its own transaction:
// - every contact value comes from the synthetic seed framework (syntheticContacts: reserved test domains and the
//   fictional 555-01xx numbers), each name and address says it is fictional test data, and each run's addresses are
//   its own (the run's short id), so a fresh customer never signs in to a kept reusable account;
// - nothing is written around the business rules: a scenario the configuration or a gate refuses is reported as
//   blocked, with the step and the refusal codes, and is rolled back whole; nothing is marked done that did not
//   happen. Workflows the system does not have yet (starting and completing work, change orders, invoices) are
//   reported as not available yet, with the task that builds them; no job is ever moved past the Start Work gate here;
// - the only amount used is a fictional one derived from configuration (PROPOSED): one line just above the configured
//   deposit threshold, so the deposit path is exercised; labelled as a fictional test amount, never a price;
// - messages these records cause go through the normal outbox: outside production only the approved test
//   destinations ever receive one (TEST_EMAIL_DESTINATIONS, TEST_PHONE_DESTINATIONS); the fictional addresses are on
//   reserved test domains that no provider delivers to. A test payment is recorded by staff as cash: no payment
//   provider or account is called.
import { randomUUID } from 'node:crypto'
import { syntheticContacts, withTx, type Db, type SeedContext, type Tx } from '@handyhub/db'
import { addLocalDays, localDateOf } from '@handyhub/domain'
import type { SubmitBody } from '@handyhub/domain/request-form'
import type { StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import type { RouteDef } from '../../api/route.js'
import { audit } from '../../platform/audit.js'
import { loadConfig } from '../../platform/config/index.js'
import { enroll, sendEnrollmentCode } from '../accounts/accounts.js'
import { eligibleRoles } from '../capacity/resources.js'
import { deriveCode } from '../identity/keys.js'
import type { CodeKeySettings } from '../identity/index.js'
import { customerActor, resolveCustomerSession, startCustomerSession } from '../identity/customer-sessions.js'
import { sendContactCode, verifyContactCode } from '../verification/contact-verification.js'
import { routeInvoker, type Caller } from './invoke.js'

export const SCENARIOS = [
  'guest_customer_request',
  'registered_customer',
  'estimate_awaiting_approval',
  'estimate_visit',
  'approved_estimate',
  'test_payment',
  'confirmed_work_visit',
  'customer_conversation',
  'job_in_progress',
  'completed_job',
  'change_order',
  'test_invoice',
] as const
export type ScenarioId = (typeof SCENARIOS)[number]

/** The workflows the system does not have yet, with the task that builds each (reported, never imitated). */
export const NOT_AVAILABLE: Partial<Record<ScenarioId, string>> = {
  job_in_progress: 'TSK-0073',
  completed_job: 'TSK-0083',
  change_order: 'TSK-0081',
  test_invoice: 'TSK-0085',
}

export type ScenarioOutcome = {
  id: ScenarioId
  state: 'created' | 'blocked' | 'not_available' | 'failed'
  /** Project references created (public references that grant nothing). */
  references: string[]
  /** The step that was refused, and the refusal's codes. */
  step: string | null
  codes: string[]
  /** For not_available: the task that builds the workflow. */
  task: string | null
}

class Blocked extends Error {
  constructor(
    readonly step: string,
    readonly codes: string[],
  ) {
    super(`blocked at ${step}`)
  }
}

const codesOf = (err: ApiError) => [err.code, ...(err.options.fieldErrors ?? []).map((f) => `${f.field}:${f.code}`)]

async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof ApiError) throw new Blocked(name, codesOf(err))
    if ((err as { code?: string })?.code === 'NOT_CONFIGURED') throw new Blocked(name, ['NOT_CONFIGURED'])
    throw err
  }
}

const FICTIONAL = 'TEST DATA (fictional)'

export type FreshDataDeps = {
  db: Db
  routes: readonly RouteDef[]
  owner: { actor: StaffActor; authenticatedAt: Date | undefined }
  codeKey: CodeKeySettings
  requestId: string
  runId: string
}

type Project = {
  requestId: string
  projectId: string
  reference: string
  contactId: string
  fullName: string
  version: number
}

/** A fixed fictional identity (the designated test accounts, TSK-0142) in place of a run's own generated one. */
export type TestIdentity = { email: string; fullName: string }

/**
 * The scenario steps, sharing one run's counters and fictional contacts. TSK-0105: the performance dataset
 * (test/perf/dataset.ts) drives the same steps at volume, with its own pool of fictional contacts.
 */
export function freshDataKit(
  deps: FreshDataDeps,
  contacts: Pick<SeedContext, 'email' | 'phone'> = syntheticContacts(),
) {
  const invoke = routeInvoker(deps.routes, deps.requestId)
  const tag = deps.runId.slice(0, 8)
  const owner: Caller = {
    actor: deps.owner.actor,
    ...(deps.owner.authenticatedAt ? { authenticatedAt: deps.owner.authenticatedAt } : {}),
  }
  let n = 0
  // Each booked visit takes a later day than the one before, so the fictional appointments never compete for a worker.
  let firstDay = 2

  // A Kentucky ZIP of the active coverage rules that lies in one service county (SERVED), with that county: the
  // fictional property's address uses the ZIP, and staff's address-and-county check records the county the rules
  // name for it (TSK-0127). A ZIP outside every list is "coverage unknown": the request is still taken, for staff to
  // review, and no county is known for it.
  const zip = async (tx: Tx): Promise<{ zip5: string; county: string | null }> => {
    const { rows } = await sql<{ zip5: string; county: string }>`SELECT r.zip5, r.counties[1] AS county
      FROM platform.coverage_rules r JOIN platform.coverage_rule_sets s ON s.version = r.rule_set
      WHERE s.status = 'active' AND r.disposition = 'in_coverage' AND cardinality(r.counties) = 1
        AND r.counties[1] LIKE 'KY:%'
      ORDER BY r.zip5 LIMIT 1`.execute(tx)
    const row = rows[0]
    return row ? { zip5: row.zip5, county: row.county.slice(3) } : { zip5: '40000', county: null }
  }

  const services = async (tx: Tx): Promise<string[]> => {
    const rows = await tx
      .selectFrom('catalog.services')
      .select(['id'])
      .where('public_status', '<>', 'draft')
      .orderBy('id')
      .limit(2)
      .execute()
    if (rows.length) return rows.map((r) => r.id)
    return (await tx.selectFrom('catalog.services').select('id').orderBy('id').limit(2).execute()).map((r) => r.id)
  }

  /** A new request through the public submission (guest), with fictional contact and property. */
  async function submit(tx: Tx, label: string, identity?: TestIdentity): Promise<Project> {
    n++
    const config = await loadConfig(tx)
    const notice = config.get('legal.privacy_notice')
    const fullName = (identity?.fullName ?? `${FICTIONAL} ${label} ${tag}-${n}`).slice(0, 120)
    const email = identity?.email ?? contacts.email(`test-${label}-${tag}`)
    const phone = contacts.phone()
    const serviceIds = await services(tx)
    const body: SubmitBody = {
      formVersion: 'staging-test-data-1',
      privacyNoticeVersion: notice.state === 'CONFIGURED' ? notice.value.documentId : 'not-configured-1',
      services: serviceIds.map((serviceId) => ({ serviceId })),
      notSure: serviceIds.length === 0,
      description: `${FICTIONAL}: a made-up request for the Owner's test journey. Not a real customer.`,
      answers: [],
      property: {
        street: `${n} Fictional Test Lane`,
        unit: `Test ${tag}`,
        city: 'Testville',
        state: 'KY',
        zip: (await zip(tx)).zip5,
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: { fullName, email, phone: phone.slice(2), preferredChannel: 'email' },
      smsOptIn: false,
      marketingOptIn: false,
    }
    const submitted = (await step('submit_request', () =>
      invoke(tx, 'submitRequest', { body, as: { actor: { kind: 'guest' } } }),
    )) as { body: { reference: string } }
    const row = await tx
      .selectFrom('intake.requests')
      .select(['id', 'project_id', 'reference', 'contact_id', 'state_version'])
      .where('reference', '=', submitted.body.reference)
      .executeTakeFirstOrThrow()
    return {
      requestId: row.id,
      projectId: row.project_id,
      reference: row.reference,
      contactId: row.contact_id,
      fullName,
      version: row.state_version,
    }
  }

  const ALL_OK = Object.fromEntries(
    ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
      (c) => [c, { outcome: 'ok', note: `${FICTIONAL}: qualified for the test journey.` }],
    ),
  )

  async function qualify(tx: Tx, p: Project) {
    await step('qualify_request', () =>
      invoke(tx, 'qualifyRequest', {
        params: { requestId: p.requestId },
        body: { checks: ALL_OK },
        version: 0,
        as: owner,
      }),
    )
  }

  const requestVersion = async (tx: Tx, p: Project) =>
    (
      await tx
        .selectFrom('intake.requests')
        .select('state_version')
        .where('id', '=', p.requestId)
        .executeTakeFirstOrThrow()
    ).state_version

  /** Qualified, estimated online, and an estimate published to the customer (awaiting approval). */
  async function published(tx: Tx, label: string) {
    const p = await submit(tx, label)
    await qualify(tx, p)
    const packages = (
      await tx
        .selectFrom('intake.request_services')
        .select('service_id')
        .where('request_id', '=', p.requestId)
        .execute()
    ).map((s) => s.service_id)
    await step('prepare_online_estimate', async () =>
      invoke(tx, 'prepareOnlineEstimate', {
        params: { requestId: p.requestId },
        body: { workPackages: packages },
        version: await requestVersion(tx, p),
        as: owner,
      }),
    )
    const created = (await step('write_estimate', () =>
      invoke(tx, 'writeEstimate', { params: { projectId: p.projectId }, body: {}, as: owner }),
    )) as { body: { versionId: string; number: string; rowVersion: number } }
    const { versionId, number } = created.body
    const wp = await tx
      .selectFrom('work.work_packages')
      .select('id')
      .where('project_id', '=', p.projectId)
      .orderBy('id')
      .executeTakeFirst()
    const config = await loadConfig(tx)
    const deposit = config.get('deposit.rule')
    // PROPOSED: the one fictional amount, from configuration (just above the deposit threshold), never a price.
    const unitPriceCents = deposit.state === 'CONFIGURED' ? deposit.value.thresholdCents + 100 : 100
    const saved = (await step('save_estimate_draft', () =>
      invoke(tx, 'saveEstimateDraft', {
        params: { versionId },
        body: {
          lines: [
            {
              kind: 'base',
              workPackageId: wp?.id ?? null,
              description: `${FICTIONAL}: a made-up line item; the amount is a fictional test amount, not a price.`,
              quantity: '1',
              unit: 'test',
              unitPriceCents,
            },
          ],
          texts: {
            exclusions: [`${FICTIONAL}: nothing here describes real work.`],
            assumptions: [`${FICTIONAL}: created for the Owner's test journey.`],
          },
        },
        version: created.body.rowVersion,
        as: owner,
      }),
    )) as { body: { rowVersion: number } }
    await step('publish_estimate', () =>
      invoke(tx, 'publishEstimateVersion', {
        params: { versionId },
        body: {},
        version: saved.body.rowVersion,
        as: owner,
      }),
    )
    return { ...p, versionId, number }
  }

  /** The customer's own approval of the published version, through a session of the project's access grant. */
  async function approved(tx: Tx, label: string) {
    const e = await published(tx, label)
    const grant = await tx
      .selectFrom('identity.project_access_grants')
      .select('id')
      .where('request_id', '=', e.requestId)
      .executeTakeFirst()
    if (!grant) throw new Blocked('customer_session', ['NOT_CONFIGURED', 'access:NO_PROJECT_ACCESS_GRANT'])
    const started = await step('customer_session', () =>
      startCustomerSession(tx, {
        contactRef: e.contactId,
        via: 'grant',
        projectIds: [e.projectId],
        verifiedAt: new Date(),
        grantId: grant.id,
      }),
    )
    const cookie = `__Host-hh_customer=${started.token}`
    const session = await resolveCustomerSession(tx, started.token)
    if (!session) throw new Blocked('customer_session', ['UNAUTHENTICATED'])
    const customer: Caller = { actor: customerActor(session), cookie }
    const params = { reference: e.reference, number: e.number, version: '1' }
    const view = (await step('view_estimate', () => invoke(tx, 'getCustomerEstimate', { params, as: customer }))) as {
      body: {
        totalCents: number
        approval: {
          contentDigest: string
          selection: { options: number[]; totalCents: number; deposit: { amountCents: number | null } } | null
        }
      }
    }
    const terms = (await loadConfig(tx)).get('legal.estimate_terms')
    if (terms.state !== 'CONFIGURED')
      throw new Blocked('approve_estimate', ['NOT_CONFIGURED', 'terms:legal.estimate_terms'])
    const s = view.body.approval.selection
    await step('approve_estimate', () =>
      invoke(tx, 'approveEstimate', {
        params,
        body: {
          contentDigest: view.body.approval.contentDigest,
          options: s?.options ?? [],
          totalCents: s?.totalCents ?? view.body.totalCents,
          depositCents: s?.deposit.amountCents ?? null,
          termsDocumentId: terms.value.documentId,
          termsSha256: terms.value.contentSha256,
          acceptTerms: true,
          fullName: e.fullName,
        },
        as: customer,
      }),
    )
    const job = await tx.selectFrom('work.jobs').select('id').where('project_id', '=', e.projectId).executeTakeFirst()
    if (!job) throw new Blocked('approve_estimate', ['NO_JOB'])
    return { ...e, jobId: job.id }
  }

  /** The deposit, when one is required, recorded by staff as a verified cash payment (no provider is called). */
  async function paid(tx: Tx, a: Awaited<ReturnType<typeof approved>>) {
    const view = (await step('read_deposit', () =>
      invoke(tx, 'getJobDeposit', { params: { jobId: a.jobId }, as: owner }),
    )) as { body: { required: boolean; remainingCents: number | null } }
    if (!view.body.required || !view.body.remainingCents) return false
    const zone = (await loadConfig(tx)).get('business.timezone')
    const today = localDateOf(new Date(), zone.state === 'CONFIGURED' ? zone.value.zone : 'UTC')
    await step('record_test_payment', () =>
      invoke(tx, 'recordDepositPayment', {
        params: { jobId: a.jobId },
        body: {
          method: 'cash',
          amountCents: view.body.remainingCents,
          receivedOn: today,
          payerName: `${FICTIONAL} payer`,
        },
        as: owner,
      }),
    )
    return true
  }

  /**
   * Staff's property checks before a visit, through the property and site-check routes (audited like any staff
   * change): the property's time zone (TSK-0123, OWN-DEC-159: an unknown zone plans nothing) and the three site checks
   * a first confirmation needs (TSK-0127, TSK-0126, OWN-DEC-167). The fictional property lies in the county the coverage rules
   * name for its ZIP, in the business zone (PROPOSED for test data only, never a statement about a real address).
   */
  async function propertyChecked(tx: Tx, projectId: string, zone: string) {
    const area = await zip(tx)
    if (!area.county) throw new Blocked('verify_county', ['NOT_CONFIGURED', 'coverage.rules'])
    const property = async () =>
      tx
        .selectFrom('crm.projects as pj')
        .innerJoin('crm.properties as p', 'p.id', 'pj.property_id')
        .select(['p.id', 'p.version', 'p.address_version', 'p.time_zone_status'])
        .where('pj.id', '=', projectId)
        .executeTakeFirstOrThrow()
    let p = await property()
    if (p.time_zone_status === 'unknown')
      await step('verify_time_zone', () =>
        invoke(tx, 'verifyPropertyTimeZone', {
          params: { propertyId: p.id },
          body: { timeZone: zone, county: area.county, reason: `${FICTIONAL}: the test property's time zone.` },
          version: p.version,
          as: owner,
        }),
      )
    p = await property()
    const checked = await tx
      .selectFrom('crm.property_county_verifications')
      .select('id')
      .where('property_id', '=', p.id)
      .where('address_version', '=', p.address_version)
      .where('in_area', '=', true)
      .executeTakeFirst()
    if (!checked)
      await step('verify_county', () =>
        invoke(tx, 'verifyPropertyCounty', {
          params: { propertyId: p.id },
          body: {
            addressVersion: p.address_version,
            addressChecked: true,
            state: 'KY',
            county: area.county,
            note: `${FICTIONAL}: the county of the test property's ZIP code in the coverage rules.`,
          },
          version: p.version,
          as: owner,
        }),
      )
    // TSK-0126 (OWN-DEC-167): the other two site checks. The fictional customer is their own site contact, with both
    // authorities, and the SERVED coverage of the verified county is accepted.
    const contact = await tx
      .selectFrom('crm.project_site_contacts')
      .select('version')
      .where('project_id', '=', projectId)
      .orderBy('version', 'desc')
      .executeTakeFirst()
    if (!contact)
      await step('record_site_contact', () =>
        invoke(tx, 'recordSiteContact', {
          params: { projectId },
          body: {
            currentVersion: 0,
            designation: 'customer',
            authority: ['property_access', 'visit_coordination'],
            source: 'office_record',
            note: `${FICTIONAL}: the test customer is their own site contact.`,
          },
          as: owner,
        }),
      )
    const county = await tx
      .selectFrom('crm.property_county_verifications as v')
      .innerJoin('crm.properties as pr', (j) =>
        j.onRef('pr.id', '=', 'v.property_id').onRef('pr.address_version', '=', 'v.address_version'),
      )
      .leftJoin('crm.project_coverage_acceptances as a', (j) =>
        j.onRef('a.county_verification_id', '=', 'v.id').on('a.project_id', '=', projectId),
      )
      .select(['v.id', 'a.id as accepted'])
      .where('v.property_id', '=', p.id)
      .orderBy('v.seq', 'desc')
      .executeTakeFirstOrThrow()
    if (!county.accepted)
      await step('accept_coverage', () =>
        invoke(tx, 'acceptProjectCoverage', {
          params: { projectId },
          body: { countyVerificationId: county.id },
          as: owner,
        }),
      )
  }

  /** A tentative visit planned and confirmed with an eligible worker inside their hours and the visit hours. */
  async function booked(tx: Tx, projectId: string, purpose: 'site_estimate' | 'service') {
    const config = await loadConfig(tx)
    const zone = config.get('business.timezone')
    const hours = config.get('contact.hours')
    if (zone.state !== 'CONFIGURED' || hours.state !== 'CONFIGURED')
      throw new Blocked('plan_visit', ['NOT_CONFIGURED', 'business.timezone|contact.hours'])
    await propertyChecked(tx, projectId, zone.value.zone)
    const minutes = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5))
    const workers = await tx
      .selectFrom('identity.staff_users as u')
      .innerJoin('identity.role_grants as g', 'g.staff_user_id', 'u.id')
      .innerJoin('work.worker_schedules as s', 's.staff_user_id', 'u.id')
      .select(['u.id', 's.version'])
      .distinct()
      .where('u.status', '=', 'active')
      .where('g.kind', '=', 'role')
      .where('g.ended_at', 'is', null)
      .where('g.name', 'in', [...eligibleRoles(purpose)])
      .where(({ eb, selectFrom }) =>
        eb(
          's.version',
          '=',
          selectFrom('work.worker_schedules as l')
            .select((x) => x.fn.max('l.version').as('v'))
            .whereRef('l.staff_user_id', '=', 'u.id'),
        ),
      )
      .orderBy('u.id')
      .execute()
    const today = localDateOf(new Date(), zone.value.zone)
    for (const w of workers) {
      const periods = await tx
        .selectFrom('work.working_hours')
        .select(['weekday', 'start_minute', 'end_minute'])
        .where('staff_user_id', '=', w.id)
        .where('version', '=', w.version)
        .execute()
      for (let d = firstDay; d <= firstDay + 7; d++) {
        const date = addLocalDays(today, d)
        const day = new Date(`${date}T12:00:00Z`).getUTCDay() || 7
        for (const p of periods.filter((x) => x.weekday === day)) {
          const start = Math.ceil(Math.max(p.start_minute, minutes(hours.value.open)) / 60) * 60 + 60
          const end = Math.min(p.end_minute, minutes(hours.value.close))
          if (start + 120 + 60 + 30 > end) continue
          const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
          await step('plan_visit', () =>
            invoke(tx, 'planVisit', {
              params: { projectId },
              body: {
                purpose,
                localDate: date,
                windowStart: hm(start),
                windowEnd: hm(start + 120),
                expectedDurationMinutes: 60,
                requiredWorkers: 1,
              },
              as: owner,
            }),
          )
          const visit = await tx
            .selectFrom('work.visits')
            .select(['id', 'version'])
            .where('project_id', '=', projectId)
            .where('purpose', '=', purpose)
            .orderBy('created_at', 'desc')
            .executeTakeFirstOrThrow()
          await step('confirm_visit', () =>
            invoke(tx, 'confirmVisit', {
              params: { visitId: visit.id },
              body: { workerIds: [w.id], reason: `${FICTIONAL}: test journey appointment.` },
              version: visit.version,
              as: owner,
            }),
          )
          firstDay = d + 1
          return
        }
      }
    }
    throw new Blocked('confirm_visit', ['CONFLICT', 'body.workerIds:NO_ELIGIBLE_WORKER_WITH_HOURS'])
  }

  async function registered(tx: Tx, identity?: TestIdentity) {
    const p = await submit(tx, 'registered-customer', identity)
    const key = deps.codeKey
    if (key.state !== 'configured') throw new Blocked('verify_contact', ['NOT_CONFIGURED', ...key.missing])
    const digits = (await loadConfig(tx)).get('verification.limits')
    if (digits.state !== 'CONFIGURED') throw new Blocked('verify_contact', ['NOT_CONFIGURED', 'verification.limits'])
    const latestCode = async () =>
      tx
        .selectFrom('identity.verification_codes')
        .select(['id', 'nonce'])
        .orderBy('created_at', 'desc')
        .orderBy('id', 'desc')
        .executeTakeFirstOrThrow()
    const code = async () => {
      const row = await latestCode()
      return deriveCode(key.key, row.id, row.nonce, digits.value.codeDigits)
    }
    const sent = await sendContactCode(tx, key, {
      requestId: p.requestId,
      channel: 'email',
      httpRequestId: deps.requestId,
    })
    if (sent.status !== 'sent') throw new Blocked('verify_contact', [sent.status])
    const verified = await verifyContactCode(tx, key, { requestId: p.requestId, channel: 'email', code: await code() })
    if (!(verified as { ok?: boolean }).ok) throw new Blocked('verify_contact', ['CODE_NOT_ACCEPTED'])
    const source = { requestId: p.requestId, contactId: p.contactId, via: 'receipt_offer' as const }
    const offered = await sendEnrollmentCode(tx, key, { source, channel: 'email', httpRequestId: deps.requestId })
    if (offered.status !== 'sent') throw new Blocked('create_account', [offered.status])
    const enrolled = await enroll(tx, key, { source, channel: 'email', code: await code() })
    if (!enrolled.ok) throw new Blocked('create_account', ['CODE_NOT_ACCEPTED'])
    return p
  }

  const run = async (id: ScenarioId, fn: (tx: Tx) => Promise<Project[]>): Promise<ScenarioOutcome> => {
    const task = NOT_AVAILABLE[id]
    if (task) return { id, state: 'not_available', references: [], step: null, codes: [], task }
    try {
      const projects = await withTx(deps.db, async (tx) => {
        const out = await fn(tx)
        for (const p of out)
          await audit.record(tx, {
            actor: { kind: 'staff', id: deps.owner.actor.userId, roles: deps.owner.actor.roles },
            action: 'staging.fresh_data_create',
            target: { type: 'project', id: p.projectId },
            summary: { scenario: id, reference: p.reference, runId: deps.runId },
            requestId: deps.requestId,
          })
        return out
      })
      return { id, state: 'created', references: projects.map((p) => p.reference), step: null, codes: [], task: null }
    } catch (err) {
      if (err instanceof Blocked)
        return { id, state: 'blocked', references: [], step: err.step, codes: err.codes, task: null }
      return {
        id,
        state: 'failed',
        references: [],
        step: null,
        codes: ['INTERNAL', err instanceof Error ? err.name : 'Error'],
        task: null,
      }
    }
  }

  return {
    run,
    submit,
    registered,
    published,
    qualify,
    invoke,
    requestVersion,
    owner,
    booked,
    approved,
    paid,
    propertyChecked,
  }
}

/** Runs every scenario; one outcome per scenario, in order. */
export async function createFreshTestData(deps: FreshDataDeps): Promise<ScenarioOutcome[]> {
  const { run, submit, registered, published, qualify, invoke, requestVersion, owner, booked, approved, paid } =
    freshDataKit(deps)
  const outcomes: ScenarioOutcome[] = []
  outcomes.push(await run('guest_customer_request', async (tx) => [await submit(tx, 'guest-customer')]))
  outcomes.push(await run('registered_customer', async (tx) => [await registered(tx)]))
  outcomes.push(await run('estimate_awaiting_approval', async (tx) => [await published(tx, 'estimate-awaiting')]))
  outcomes.push(
    await run('estimate_visit', async (tx) => {
      const p = await submit(tx, 'estimate-visit')
      await qualify(tx, p)
      const packages = (
        await tx
          .selectFrom('intake.request_services')
          .select('service_id')
          .where('request_id', '=', p.requestId)
          .execute()
      ).map((s) => s.service_id)
      await step('arrange_estimate_visit', async () =>
        invoke(tx, 'arrangeEstimateVisit', {
          params: { requestId: p.requestId },
          body: { customerExplanation: `${FICTIONAL}: a site visit for the test journey.`, workPackages: packages },
          version: await requestVersion(tx, p),
          as: owner,
        }),
      )
      await booked(tx, p.projectId, 'site_estimate')
      return [p]
    }),
  )
  outcomes.push(await run('approved_estimate', async (tx) => [await approved(tx, 'approved-estimate')]))
  outcomes.push(
    await run('test_payment', async (tx) => {
      const a = await approved(tx, 'test-payment')
      if (!(await paid(tx, a))) throw new Blocked('record_test_payment', ['DEPOSIT_NOT_REQUIRED'])
      return [a]
    }),
  )
  outcomes.push(
    await run('confirmed_work_visit', async (tx) => {
      const a = await approved(tx, 'work-visit')
      await paid(tx, a)
      await booked(tx, a.projectId, 'service')
      return [a]
    }),
  )
  outcomes.push(
    await run('customer_conversation', async (tx) => {
      const p = await submit(tx, 'conversation')
      await step('publish_question', async () =>
        invoke(tx, 'publishRequestQuestion', {
          params: { requestId: p.requestId },
          body: {
            text: `${FICTIONAL}: which room should the test visit start in?`,
            kind: 'general',
            noHazardInspection: true,
          },
          version: await requestVersion(tx, p),
          as: owner,
        }),
      )
      return [p]
    }),
  )
  for (const id of ['job_in_progress', 'completed_job', 'change_order', 'test_invoice'] as const)
    outcomes.push(await run(id, async () => []))
  return outcomes
}

/**
 * TSK-0142: a registered customer account for a fixed fictional identity (the designated Customer test account),
 * through the same public request, contact verification and account offer a customer uses, inside the caller's
 * transaction. Blocked (with the step and the refusal codes) when configuration or a rule refuses a step.
 */
export async function createRegisteredTestCustomer(
  deps: FreshDataDeps,
  tx: Tx,
  identity: TestIdentity,
): Promise<{ state: 'created'; reference: string } | { state: 'blocked'; step: string; codes: string[] }> {
  try {
    const p = await freshDataKit(deps).registered(tx, identity)
    return { state: 'created', reference: p.reference }
  } catch (err) {
    if (err instanceof Blocked) return { state: 'blocked', step: err.step, codes: err.codes }
    throw err
  }
}

/** Records what the fresh data run created, after a completed reset (append-only). */
export async function recordSeeding(db: Db, runId: string, outcomes: ScenarioOutcome[], requestId: string) {
  const state = outcomes.every((o) => o.state === 'created' || o.state === 'not_available')
    ? 'completed'
    : outcomes.some((o) => o.state === 'created')
      ? 'partial'
      : 'failed'
  await db
    .insertInto('staging.test_data_seedings')
    .values({ id: randomUUID(), run_id: runId, state, outcomes: JSON.stringify(outcomes), request_id: requestId })
    .execute()
  return state
}
