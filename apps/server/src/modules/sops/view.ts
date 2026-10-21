// The SOP pinned on a work package, as staff read it (TSK-0068; HH-PKT-03, HH-WORK-11, ENT-SOPVersion, ENT-WorkPackage,
// OWN-DEC-17, OWN-DEC-108, RULE-NO-INVENTED-FACTS, RULE-SERVER-AUTHZ).
// - The exact pinned version: its six stages in order with every item's verbatim text and vault line, its hazard checks
//   (the HOLD, GATE and FLAG controls and the stop-work section), its quality checks (stage 4) and the source SOP's
//   open questions; the three digests the package was pinned with; the review state and the Owner's sign-off record.
// - NOT CONFIGURED is reported as such (no checklist at all), and so is a package that is not part of a job yet.
// - The readiness part (sopReadiness) and the "Pending competent review" banner follow the environment: production
//   needs the sign-off. An unknown environment counts as production (fail closed).
// - Read inside the caller's DataScope: a package outside it is not found.
import type { Db, Tx } from '@handyhub/db'
import {
  hazardControls,
  itemText,
  type SopContent,
  type SopItem,
  sopReadiness,
  type SopReviewState,
  tableRows,
} from '@handyhub/domain'
import { decide, type DataScope, type StaffActor } from '@handyhub/policy'
import { ApiError } from '../../api/errors.js'
import { jobInScope, projectInScope } from '../../platform/data-scope.js'

type Reader = Db | Tx
export type SopEnvironment = 'local' | 'ci' | 'staging' | 'production'

export type SopItemView = {
  id: string
  kind: SopItem['kind']
  section: string | null
  line: number | null
  text: string
  checkbox?: boolean
  evidence?: string[]
  required?: boolean
  holdBefore?: string[]
  control?: 'HOLD' | 'GATE' | 'FLAG'
  ref?: string | null
  table?: { header: string[]; rows: string[][] }
}

/** One item for the screen: the verbatim text without list or quote markers, and its kind's fields. */
export function itemView(item: SopItem): SopItemView {
  const base = { id: item.id, kind: item.kind, section: item.section, line: item.line, text: itemText(item) }
  if (item.kind === 'step')
    return {
      ...base,
      checkbox: item.checkbox,
      evidence: [...item.evidence],
      required: item.required,
      holdBefore: [...item.holdBefore],
    }
  if (item.kind === 'control') return { ...base, control: item.control, ref: item.ref }
  if (item.kind === 'table') return { ...base, table: tableRows(item) }
  return base
}

export async function workPackageSopView(
  db: Reader,
  actor: StaffActor,
  scope: DataScope,
  workPackageId: string,
  environment: SopEnvironment,
) {
  const wp = await db
    .selectFrom('work.work_packages as w')
    .innerJoin('catalog.services as s', 's.id', 'w.service_id')
    .select([
      'w.id',
      'w.project_id',
      'w.service_id',
      's.code',
      'w.position',
      'w.state',
      'w.job_id',
      'w.sop_version_id',
      'w.sop_pinned_at',
    ])
    .where('w.id', '=', workPackageId)
    // TSK-0069: an assigned worker reaches the packages of the job they are assigned to (jobInScope).
    .where((eb) => eb.or([projectInScope('w.project_id', scope), jobInScope('w.job_id', scope)]))
    .executeTakeFirst()
  if (!wp) throw new ApiError('NOT_FOUND')
  // The record of the pinning (or of the NOT CONFIGURED outcome) that the package's state shows.
  const pin = await db
    .selectFrom('work.work_package_sop_pins')
    .select(['source', 'pinned_at'])
    .where('work_package_id', '=', wp.id)
    .where('outcome', '=', wp.sop_version_id ? 'pinned' : 'not_configured')
    .orderBy('pinned_at', 'desc')
    .orderBy('id')
    .limit(1)
    .executeTakeFirst()
  const v = wp.sop_version_id
    ? await db
        .selectFrom('catalog.sop_versions as v')
        .leftJoin('identity.staff_users as u', 'u.id', 'v.signed_off_by')
        .select([
          'v.id',
          'v.sop_id',
          'v.version',
          'v.title',
          'v.review_state',
          'v.spanish_status',
          'v.source_file',
          'v.content',
          'v.content_sha256',
          'v.hazard_sha256',
          'v.quality_sha256',
          'v.row_version',
          'v.reviewer_name',
          'v.reviewer_qualification',
          'v.review_note',
          'v.signed_off_by',
          'v.signed_off_at',
          'u.display_name',
        ])
        .where('v.id', '=', wp.sop_version_id)
        .executeTakeFirstOrThrow()
    : null
  const readiness = sopReadiness({
    pinned: v !== null,
    signedOff: v?.signed_off_at != null,
    environment,
  })
  const content = v ? (v.content as unknown as SopContent) : null
  const state = v ? 'pinned' : wp.job_id ? 'not_configured' : 'no_job'
  const mayReview =
    decide(actor, 'sop.sign_off_review', {}, { now: new Date(), online: true }).effect === 'allow' &&
    v?.review_state === 'pending_competent_review'
  return {
    workPackage: {
      id: wp.id,
      projectId: wp.project_id,
      serviceId: wp.service_id,
      serviceCode: wp.code,
      position: wp.position,
      state: wp.state,
      jobId: wp.job_id,
    },
    pin: {
      state,
      pinnedAt: v ? wp.sop_pinned_at : (pin?.pinned_at ?? null),
      source: (pin?.source as 'approval' | 'import' | undefined) ?? null,
    },
    readiness,
    sop:
      v && content
        ? {
            id: v.id,
            sopId: v.sop_id,
            version: v.version,
            title: v.title,
            reviewState: v.review_state as SopReviewState,
            current: v.review_state !== 'superseded',
            spanishStatus: v.spanish_status as 'pending',
            sourceFile: v.source_file,
            contentSha256: v.content_sha256,
            hazardSha256: v.hazard_sha256,
            qualitySha256: v.quality_sha256,
            rowVersion: v.row_version,
            signOff:
              v.signed_off_at && v.signed_off_by
                ? {
                    reviewerName: v.reviewer_name as string,
                    reviewerQualification: v.reviewer_qualification as string,
                    reviewNote: v.review_note as string,
                    signedOffBy: { id: v.signed_off_by, name: v.display_name },
                    signedOffAt: v.signed_off_at,
                  }
                : null,
            stages: content.stages.map((s) => ({
              stage: s.stage,
              key: s.key,
              heading: s.heading,
              steps: s.items.filter((i) => i.kind === 'step').length,
              items: s.items.map(itemView),
            })),
            hazards: { controls: hazardControls(content).map(itemView), stopWork: content.stopWork.map(itemView) },
            openQuestions: content.openQuestions.map(itemView),
          }
        : null,
    actions: { signOff: mayReview },
  }
}
