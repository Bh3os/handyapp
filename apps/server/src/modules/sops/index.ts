// SOPs module (TSK-0068; HH-PKT-03, HH-WORK-11, ENT-SOPVersion, ENT-WorkPackage, OWN-DEC-17, OWN-DEC-108,
// OQ-SAFETY-REVIEW, RULE-SAFETY-GATES, RULE-HUMAN-REVIEW, RULE-SERVER-AUTHZ).
//   GET  /staff/work-packages/:workPackageId/sop    the SOP version pinned on a work package (job.view_packet)
//   POST /staff/sop-versions/:sopVersionId/sign-off the Owner records the competent-review sign-off (sop.sign_off_review)
// - The versions come from the SOP-* nodes verbatim (pnpm db:sops); the approval transaction pins the current version
//   on each work package of the job it creates (pinJobSops, @handyhub/db). Nothing here writes a step.
// - The sign-off is the activation path for production (OWN-DEC-17): the Owner records who reviewed the version, their
//   qualification and what was reviewed, on a version pending competent review, with the row version shown (If-Match).
//   The software records the entry; it does not judge competence, and no flag, role or AI signs off.
import type { Tx } from '@handyhub/db'
import { apply, type SopReviewState } from '@handyhub/domain'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import { jobAssignments } from '../packets/assignments.js'
import { SIGN_OFF_BODY, SOP_VERSION_PARAMS, WORK_PACKAGE_PARAMS, WORK_PACKAGE_SOP_VIEW } from './schemas.js'
import { workPackageSopView, type SopEnvironment } from './view.js'

const TEST = 'test/integration/sop-versions.test.ts'

export type SopsDeps = {
  /** Production needs the competent-review sign-off; unset counts as production (fail closed). */
  environment?: SopEnvironment
}

function staff(ctx: ApiContext) {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}

/** The record facts: the project, and (TSK-0069) the assignments on the package's job, so an assigned worker reads it. */
const workPackageProject: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { workPackageId } = req.params as { workPackageId: string }
  const w = await db
    .selectFrom('work.work_packages')
    .select(['project_id', 'job_id'])
    .where('id', '=', workPackageId)
    .executeTakeFirst()
  if (!w) return null
  return { projectId: w.project_id, assignments: w.job_id ? await jobAssignments(db, w.job_id) : [] }
}

export function sopsModule(deps: SopsDeps = {}): ApiModule {
  const environment = deps.environment ?? 'production'
  const view: RouteDef = {
    method: 'GET',
    path: '/staff/work-packages/:workPackageId/sop',
    operationId: 'getWorkPackageSop',
    summary: 'The SOP version pinned on a work package',
    description:
      'Staff with job.view_packet, inside their record scope (else 404; a worker: assigned to the job, TSK-0069). ' +
      'The exact SOP version pinned on the work ' +
      'package: the six checklist stages in order, every item verbatim with its vault line, the hazard checks (HOLD, ' +
      'GATE and FLAG controls and the stop-work section), the quality checks (stage 4), the open questions, the ' +
      'content, hazard and quality digests, the review state and the sign-off. NOT CONFIGURED (no SOP version when ' +
      'the job was created) has no checklist and blocks readiness; production also needs the sign-off. Staff only.',
    actors: ['staff'],
    permission: 'job.view_packet',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    resource: workPackageProject,
    schema: { params: WORK_PACKAGE_PARAMS, response: { 200: WORK_PACKAGE_SOP_VIEW } },
    handler: async (ctx) => {
      const { workPackageId } = ctx.req.params as { workPackageId: string }
      return { body: await workPackageSopView(ctx.db, staff(ctx), ctx.scope, workPackageId, environment) }
    },
  }

  const signOff: RouteDef = {
    method: 'POST',
    path: '/staff/sop-versions/:sopVersionId/sign-off',
    operationId: 'signOffSopVersion',
    summary: "Record the competent reviewer's sign-off of an SOP version",
    description:
      'The Owner (sop.sign_off_review), with If-Match: the SOP version row version shown. Records the competent ' +
      "reviewer's name, qualification and a note of what was reviewed on a version pending competent review (else " +
      '409 CONFLICT naming the unmet requirement); the version becomes approved for production use. A recorded ' +
      'sign-off is never changed; a later import of changed content is a new version pending review. Audited.',
    actors: ['staff'],
    permission: 'sop.sign_off_review',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'required',
    rateLimit: 'none',
    audit: 'sop.sign_off',
    pagination: false,
    test: TEST,
    schema: {
      params: SOP_VERSION_PARAMS,
      body: SIGN_OFF_BODY,
      response: {
        200: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'sopId', 'version', 'reviewState', 'rowVersion', 'signedOffAt'],
          properties: {
            id: { type: 'string' },
            sopId: { type: 'string' },
            version: { type: 'integer' },
            reviewState: { type: 'string' },
            rowVersion: { type: 'integer' },
            signedOffAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staff(ctx)
      const { sopVersionId } = ctx.req.params as { sopVersionId: string }
      const body = ctx.req.body as { reviewerName: string; reviewerQualification: string; reviewNote: string }
      const v = await tx
        .selectFrom('catalog.sop_versions')
        .select(['id', 'sop_id', 'version', 'review_state', 'row_version'])
        .where('id', '=', sopVersionId)
        .forUpdate()
        .executeTakeFirst()
      if (!v) throw new ApiError('NOT_FOUND')
      const expected = ctx.expectedVersion()
      if (expected !== v.row_version)
        throw new ApiError('STALE_VERSION', { current: { version: v.row_version, values: { state: v.review_state } } })
      const facts = {
        reviewerName: body.reviewerName.trim(),
        reviewerQualification: body.reviewerQualification.trim(),
        reviewNote: body.reviewNote.trim(),
      }
      const now = new Date()
      const moved = apply(
        { machine: 'sop_version.review', state: v.review_state as SopReviewState, version: v.row_version },
        'sign_off',
        { actor: 'staff', expectedVersion: v.row_version, now, facts },
      )
      if (!moved.ok) {
        const problems = moved.problems.length ? moved.problems : [{ code: moved.code }]
        throw new ApiError('CONFLICT', {
          fieldErrors: problems.map((p) => ({
            field: p.code === 'INVALID_TRANSITION' ? 'reviewState' : 'body',
            code: p.code,
            message: '',
          })),
        })
      }
      await tx
        .updateTable('catalog.sop_versions')
        .set({
          review_state: moved.to,
          row_version: moved.version,
          reviewer_name: facts.reviewerName,
          reviewer_qualification: facts.reviewerQualification,
          review_note: facts.reviewNote,
          signed_off_by: actor.userId,
          signed_off_at: now,
        })
        .where('id', '=', v.id)
        .execute()
      // The reviewer's name and qualification are the record itself; the audit names what changed and who recorded it.
      await ctx.audit({
        target: { type: 'sop_version', id: v.id, version: moved.version },
        summary: { sopId: v.sop_id, version: v.version, from: v.review_state, to: moved.to },
      })
      return {
        body: {
          id: v.id,
          sopId: v.sop_id,
          version: v.version,
          reviewState: moved.to,
          rowVersion: moved.version,
          signedOffAt: now,
        },
        version: moved.version,
      }
    },
  }

  return { name: 'sops', routes: [view, signOff] }
}
