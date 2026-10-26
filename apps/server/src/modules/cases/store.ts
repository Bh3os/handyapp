// Case records (TSK-0093; HH-QA-06, HH-INC-01, HH-INC-02, HH-INC-04, ENT-Case, OWN-DEC-124, OWN-DEC-143,
// RULE-HUMAN-REVIEW, RULE-SERVER-AUTHZ). Every write runs in the route's transaction under the case's row lock; every
// read builds one of three projections, and nothing else leaves the server:
// - the summary: that a case exists, its number, project and status. Office reads exactly this of a restricted case
//   (OWN-DEC-143), never its kind, reporter, job or anything it says;
// - the detail: the handling fields of a case (category, severity, assignee, due date, hold link, resolution, re-check,
//   follow-ups, customer updates, history; complaint notes and photos). Office reads it for complaints; the Owner for
//   every case. Professional referrals are the Owner's alone;
// - the restricted section: the incident report, restricted notes and photos, read only by the Owner and the staff
//   member who reported it (incident.view_restricted), and each Owner read is audited.
// No projection holds fault, liability, coverage or compensation: no such field exists (RULE-HUMAN-REVIEW).
import { createHash, randomUUID } from 'node:crypto'
import type { Db, Tx } from '@handyhub/db'
import {
  caseMachineOf,
  customerUpdateText,
  forbiddenCaseWording,
  initialStateOf,
  isActiveCase,
  isRestrictedKind,
  kindOfIncident,
  notifiesOwner,
  reviewAreasOf,
  safetyPauseTruthful,
  transition,
  type CaseEvent,
  type CaseFacts,
  type CaseKind,
  type CaseState,
  type CustomerUpdateKind,
  type IncidentType,
} from '@handyhub/domain'
import { decide, type Action, type StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import { loadConfig } from '../../platform/config/index.js'
import { outbox } from '../../platform/outbox.js'
import type { ObjectStorage } from '../../providers/index.js'
import { contentProblems } from '../photos/content.js'
import { photoLimits } from '../photos/photos.js'
import { syncProjectFollowUps } from '../closeout/follow-ups.js'
import { syncProjectRepeatReminders } from '../repeat-service/reminders.js'
import { openQueueItem, resolveQueueItem } from '../queue/items.js'

type Reader = Db | Tx

export const CASE_OPENED_EVENT = 'case.opened'
/** PROPOSED: the most cases one list read returns (newest first). */
export const CASE_LIST_LIMIT = 200

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })
export const conflict = (fields: FieldError[]) => new ApiError('CONFLICT', { fieldErrors: fields })
const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null)
const dateText = (d: Date | string | null): string | null =>
  d === null ? null : typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10)

export const allows = (actor: StaffActor, action: Action, resource: Parameters<typeof decide>[2] = {}) =>
  decide(actor, action, resource, { now: new Date(), online: true }).effect === 'allow'

export type CaseRow = {
  id: string
  number: number
  project_id: string
  job_id: string | null
  kind: CaseKind
  incident_type: string | null
  category: string | null
  severity: string | null
  source: string
  state: CaseState
  reported_by: string
  reported_at: Date
  assigned_to: string | null
  due_on: string | null
  reviewer_id: string | null
  hold_id: string | null
  hazard_report_id: string | null
  resolution: string | null
  resolved_by: string | null
  resolved_at: Date | null
  recheck_required: boolean
  recheck_note: string | null
  recheck_by: string | null
  recheck_at: Date | null
  closed_by: string | null
  closed_at: Date | null
  reopen_count: number
  version: number
}

const CASE_COLUMNS = [
  'id',
  'number',
  'project_id',
  'job_id',
  'kind',
  'incident_type',
  'category',
  'severity',
  'source',
  'state',
  'reported_by',
  'reported_at',
  'assigned_to',
  'due_on',
  'reviewer_id',
  'hold_id',
  'hazard_report_id',
  'resolution',
  'resolved_by',
  'resolved_at',
  'recheck_required',
  'recheck_note',
  'recheck_by',
  'recheck_at',
  'closed_by',
  'closed_at',
  'reopen_count',
  'version',
] as const

export async function readCase(db: Reader, caseId: string): Promise<CaseRow | null> {
  const row = await db.selectFrom('quality.cases').select(CASE_COLUMNS).where('id', '=', caseId).executeTakeFirst()
  return (row as unknown as CaseRow | undefined) ?? null
}

/** The case under its row lock, at the version the caller saw (when given). */
export async function lockedCase(tx: Tx, caseId: string, expected?: number): Promise<CaseRow> {
  const row = await tx
    .selectFrom('quality.cases')
    .select(CASE_COLUMNS)
    .where('id', '=', caseId)
    .forUpdate()
    .executeTakeFirst()
  if (!row) throw new ApiError('NOT_FOUND')
  const c = row as unknown as CaseRow
  if (expected !== undefined && c.version !== expected)
    throw new ApiError('STALE_VERSION', { current: { version: c.version, values: { state: c.state } } })
  return c
}

const restricted = (c: Pick<CaseRow, 'kind'>) => isRestrictedKind(c.kind)

/**
 * Working a case: complaints with case.manage (the Owner, Office); a restricted case only by the Owner (case.triage),
 * since everyone else sees no more than its status (OWN-DEC-143).
 */
export function requireHandling(actor: StaffActor, c: Pick<CaseRow, 'kind' | 'project_id'>): void {
  const action: Action = restricted(c) ? 'case.triage' : 'case.manage'
  if (!allows(actor, action, { projectId: c.project_id })) throw new ApiError('FORBIDDEN')
}

async function activeOwners(db: Reader): Promise<{ id: string; email: string; locale: string }[]> {
  return db
    .selectFrom('identity.staff_users as s')
    .innerJoin('identity.role_grants as g', 'g.staff_user_id', 's.id')
    .select(['s.id', 's.email', 's.locale'])
    .where('g.kind', '=', 'role')
    .where('g.name', '=', 'owner')
    .where('g.ended_at', 'is', null)
    .where('s.status', '=', 'active')
    .orderBy('s.created_at')
    .execute()
}
export { activeOwners }

async function activeStaff(db: Reader, id: string): Promise<boolean> {
  const r = await db
    .selectFrom('identity.staff_users')
    .select('id')
    .where('id', '=', id)
    .where('status', '=', 'active')
    .executeTakeFirst()
  return Boolean(r)
}

async function event(
  tx: Tx,
  c: Pick<CaseRow, 'id'>,
  name: string,
  from: string | null,
  to: string,
  actorId: string,
  note?: string | null,
) {
  await tx
    .insertInto('quality.case_events')
    .values({ case_id: c.id, event: name, from_state: from, to_state: to, actor_id: actorId, note: note ?? null })
    .execute()
}

/** The queue items of a case (HH-INC-04, S01): the open case for Owner and Office, and the Owner's notification. */
export async function syncCaseItems(tx: Tx, caseId: string): Promise<void> {
  const c = await tx
    .selectFrom('quality.cases as c')
    .innerJoin('crm.projects as p', 'p.id', 'c.project_id')
    .select(['c.id', 'c.kind', 'c.state', 'c.assigned_to', 'c.reported_at', 'c.project_id', 'p.reference'])
    .where('c.id', '=', caseId)
    .executeTakeFirstOrThrow()
  const reason =
    c.kind === 'complaint'
      ? 'complaint_recorded'
      : c.kind === 'damage'
        ? 'damage_reported'
        : c.kind === 'injury'
          ? 'injury_reported'
          : c.kind === 'dispute'
            ? 'dispute_reported'
            : 'case_opened'
  if (isActiveCase(c.state))
    await openQueueItem(tx, {
      type: 'case_open',
      subjectId: c.id,
      reason,
      projectId: c.project_id,
      reference: c.reference,
      status: c.state,
      assignedStaffId: c.assigned_to,
      openedAt: c.reported_at,
    })
  else await resolveQueueItem(tx, { type: 'case_open', subjectId: c.id, resolution: 'closed' })
  // TSK-0092 (HH-QA-10, OWN-DEC-113): the project's satisfaction check and review requests pause while a case is
  // open and are offered again once every case is closed.
  await syncProjectFollowUps(tx, c.project_id)
  // TSK-0114 (T67): so are the repeat-service reminders of a schedule on the project or one of its occurrences'.
  await syncProjectRepeatReminders(tx, c.project_id)
  if (notifiesOwner(c.kind) && c.state === 'reported')
    await openQueueItem(tx, {
      type: 'incident_notification',
      subjectId: c.id,
      reason,
      // PROPOSED: a reported injury is a safety matter, first in the Owner's list (OWN-DEC-115).
      ...(c.kind === 'injury' ? { band: 'safety' as const } : {}),
      projectId: c.project_id,
      reference: c.reference,
      status: c.state,
      openedAt: c.reported_at,
    })
  else await resolveQueueItem(tx, { type: 'incident_notification', subjectId: c.id, resolution: c.state })
}

// --- Creating cases ------------------------------------------------------------------------------------------------

export type ComplaintInput = {
  category: string
  severity: string
  source: string
  assignedTo: string
  dueOn: string
  description: string
  jobId?: string
}

async function checkJob(tx: Tx, projectId: string, jobId: string | undefined | null): Promise<void> {
  if (!jobId) return
  const j = await tx
    .selectFrom('work.jobs')
    .select('id')
    .where('id', '=', jobId)
    .where('project_id', '=', projectId)
    .executeTakeFirst()
  if (!j) throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.jobId', 'unknown_job')] })
}

async function lockedProject(tx: Tx, projectId: string): Promise<{ id: string; reference: string }> {
  const p = await tx
    .selectFrom('crm.projects')
    .select(['id', 'reference'])
    .where('id', '=', projectId)
    .forUpdate()
    .executeTakeFirst()
  if (!p) throw new ApiError('NOT_FOUND')
  return p
}

/** The open complaint of a project in a category, if any ("add to existing case"). */
export async function openComplaintOf(db: Reader, projectId: string, category: string) {
  return db
    .selectFrom('quality.cases')
    .select(['id', 'number', 'state', 'version'])
    .where('project_id', '=', projectId)
    .where('kind', '=', 'complaint')
    .where('category', '=', category)
    .where('state', '<>', 'closed')
    .executeTakeFirst()
}

function duplicate(existing: { id: string; number: number; state: string; version: number }) {
  return new ApiError('CONFLICT', {
    fieldErrors: [field('body.category', 'DUPLICATE_OPEN_CASE')],
    current: {
      version: existing.version,
      values: { caseId: existing.id, number: existing.number, state: existing.state },
    },
  })
}

export async function recordComplaint(tx: Tx, actor: StaffActor, projectId: string, input: ComplaintInput) {
  await lockedProject(tx, projectId)
  await checkJob(tx, projectId, input.jobId)
  if (!(await activeStaff(tx, input.assignedTo)))
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.assignedTo', 'unknown_staff')] })
  const existing = await openComplaintOf(tx, projectId, input.category)
  if (existing) throw duplicate(existing)
  const owners = await activeOwners(tx)
  const row = await tx
    .insertInto('quality.cases')
    .values({
      project_id: projectId,
      job_id: input.jobId ?? null,
      kind: 'complaint',
      category: input.category,
      severity: input.severity,
      source: input.source,
      state: initialStateOf('complaint'),
      reported_by: actor.userId,
      assigned_to: input.assignedTo,
      due_on: input.dueOn,
      reviewer_id: owners.length === 1 ? (owners[0]?.id ?? null) : null,
    })
    .returning(['id', 'number', 'state', 'version'])
    .executeTakeFirstOrThrow()
  await tx
    .insertInto('quality.case_notes')
    .values({
      case_id: row.id,
      kind: 'description',
      body: input.description.trim(),
      visibility_class: 'internal_operational',
      written_by: actor.userId,
    })
    .execute()
  await event(tx, row, 'record', null, row.state, actor.userId)
  await syncCaseItems(tx, row.id)
  return row
}

export type IncidentInput = {
  type: IncidentType
  source?: string
  occurredAt?: string
  whatHappened: string
  peopleAffected?: string
  workAreas?: string
  immediateActions?: string
  medicalDetail?: string
}

const text = (v: string | undefined) => (v && v.trim() ? v.trim() : null)

export async function reportIncident(
  tx: Tx,
  actor: StaffActor,
  target: { projectId: string; jobId: string | null },
  input: IncidentInput,
  requestId: string,
) {
  await lockedProject(tx, target.projectId)
  await checkJob(tx, target.projectId, target.jobId)
  const kind = kindOfIncident(input.type)
  const owners = await activeOwners(tx)
  const row = await tx
    .insertInto('quality.cases')
    .values({
      project_id: target.projectId,
      job_id: target.jobId,
      kind,
      incident_type: input.type,
      source: input.source ?? 'worker_report',
      state: initialStateOf(kind),
      reported_by: actor.userId,
      reviewer_id: owners.length === 1 ? (owners[0]?.id ?? null) : null,
    })
    .returning(['id', 'number', 'state', 'version', 'kind'])
    .executeTakeFirstOrThrow()
  await tx
    .insertInto('quality.incident_reports')
    .values({
      case_id: row.id,
      occurred_at: input.occurredAt ? new Date(input.occurredAt) : null,
      what_happened: input.whatHappened.trim(),
      people_affected: text(input.peopleAffected),
      work_areas: text(input.workAreas),
      immediate_actions: text(input.immediateActions),
      medical_detail: text(input.medicalDetail),
      reported_by: actor.userId,
    })
    .execute()
  await event(tx, row, 'report', null, row.state, actor.userId)
  await syncCaseItems(tx, row.id)
  // Damage, injury and disputes notify the Owner at once (HH-INC-04): the Owner Decisions item above and the staff
  // notification of this committed event (identifiers only; never what the report says).
  if (notifiesOwner(kind))
    await outbox.add(tx, {
      type: CASE_OPENED_EVENT,
      aggregate: { type: 'case', id: row.id, version: row.version },
      payload: { caseId: row.id },
      idempotencyKey: `${CASE_OPENED_EVENT}:${row.id}`,
      requestId,
    })
  return row
}

// --- Notes and attachments -----------------------------------------------------------------------------------------

export async function addNote(
  tx: Tx,
  actor: StaffActor,
  caseId: string,
  input: { body: string; source?: string },
  section: 'case' | 'restricted',
) {
  const c = await lockedCase(tx, caseId)
  if (section === 'case' && restricted(c)) throw conflict([field('case', 'RESTRICTED_CASE')])
  if (section === 'restricted' && !restricted(c)) throw new ApiError('NOT_FOUND')
  if (section === 'case') requireHandling(actor, c)
  const row = await tx
    .insertInto('quality.case_notes')
    .values({
      case_id: c.id,
      kind: input.source ? 'addition' : 'note',
      source: input.source ?? null,
      body: input.body.trim(),
      visibility_class: restricted(c) ? 'restricted_incident' : 'internal_operational',
      written_by: actor.userId,
    })
    .returning(['id', 'written_at'])
    .executeTakeFirstOrThrow()
  return { id: row.id, writtenAt: row.written_at, case: c }
}

export class CaseAttachmentError extends Error {
  constructor(readonly problem: string) {
    super(problem)
  }
}

export async function addAttachment(
  tx: Tx,
  actor: StaffActor,
  caseId: string,
  input: { bytes: Uint8Array; declaredType: string; storage: ObjectStorage | null },
  section: 'case' | 'restricted',
) {
  const c = await lockedCase(tx, caseId)
  if (section === 'case' && restricted(c)) throw conflict([field('case', 'RESTRICTED_CASE')])
  if (section === 'restricted' && !restricted(c)) throw new ApiError('NOT_FOUND')
  if (section === 'case') requireHandling(actor, c)
  const limits = photoLimits(await loadConfig(tx))
  if (!limits || !input.storage) throw new CaseAttachmentError('not_configured')
  const declared = input.declaredType.split(';')[0]?.trim().toLowerCase() ?? ''
  if (input.bytes.length === 0) throw new CaseAttachmentError('empty')
  if (input.bytes.length > limits.maxFileBytes) throw new CaseAttachmentError('too_large')
  if (!limits.types.includes(declared)) throw new CaseAttachmentError('type_not_allowed')
  const problem = contentProblems(input.bytes, declared)[0]
  if (problem) throw new CaseAttachmentError(problem)
  const sha256 = createHash('sha256').update(input.bytes).digest('hex')
  const existing = await tx
    .selectFrom('quality.case_attachments')
    .select(['id', 'uploaded_at'])
    .where('case_id', '=', c.id)
    .where('sha256', '=', sha256)
    .executeTakeFirst()
  if (existing) return { id: existing.id, uploadedAt: existing.uploaded_at, created: false, case: c }
  const id = randomUUID()
  // Opaque key, never a name or a file name; private to the case, never in a gallery or feed.
  const key = `cases/attachments/${id}`
  const row = await tx
    .insertInto('quality.case_attachments')
    .values({
      id,
      case_id: c.id,
      object_key: key,
      content_type: declared,
      byte_size: input.bytes.length,
      sha256,
      visibility_class: restricted(c) ? 'restricted_incident' : 'internal_operational',
      uploaded_by: actor.userId,
    })
    .returning(['id', 'uploaded_at'])
    .executeTakeFirstOrThrow()
  await input.storage.put(key, input.bytes, declared)
  return { id: row.id, uploadedAt: row.uploaded_at, created: true, case: c }
}

/** The bytes of an attachment of the section the caller may read; null when there is none. */
export async function readAttachment(
  db: Reader,
  caseId: string,
  attachmentId: string,
  section: 'case' | 'restricted',
  storage: ObjectStorage | null,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const a = await db
    .selectFrom('quality.case_attachments')
    .select(['object_key', 'content_type', 'sha256', 'visibility_class'])
    .where('id', '=', attachmentId)
    .where('case_id', '=', caseId)
    .executeTakeFirst()
  if (!a) return null
  if ((a.visibility_class === 'restricted_incident') !== (section === 'restricted')) return null
  if (!storage) throw new CaseAttachmentError('not_configured')
  const { bytes } = await storage.get(a.object_key)
  if (createHash('sha256').update(bytes).digest('hex') !== a.sha256)
    throw new Error('stored case attachment does not match its hash')
  return { bytes, contentType: a.content_type }
}

// --- Handling, hold link, transitions ------------------------------------------------------------------------------

export async function setHandling(
  tx: Tx,
  actor: StaffActor,
  caseId: string,
  expected: number,
  input: { severity?: string; assignedTo?: string | null; dueOn?: string | null },
) {
  const c = await lockedCase(tx, caseId, expected)
  requireHandling(actor, c)
  if (c.state === 'closed') throw conflict([field('state', 'CASE_CLOSED')])
  if (input.assignedTo && !(await activeStaff(tx, input.assignedTo)))
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.assignedTo', 'unknown_staff')] })
  if (c.kind === 'complaint' && (input.assignedTo === null || input.dueOn === null))
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body', 'complaint_needs_assignee_and_due_date')] })
  const row = await tx
    .updateTable('quality.cases')
    .set({
      ...(input.severity !== undefined ? { severity: input.severity } : {}),
      ...(input.assignedTo !== undefined ? { assigned_to: input.assignedTo } : {}),
      ...(input.dueOn !== undefined ? { due_on: input.dueOn } : {}),
      version: c.version + 1,
      updated_at: sql<Date>`now()`,
    })
    .where('id', '=', c.id)
    .returning(['version'])
    .executeTakeFirstOrThrow()
  await syncCaseItems(tx, c.id)
  return { case: c, version: row.version }
}

export async function linkHold(tx: Tx, caseId: string, expected: number, holdId: string | null) {
  const c = await lockedCase(tx, caseId, expected)
  if (holdId) {
    const h = await tx
      .selectFrom('work.holds')
      .select('id')
      .where('id', '=', holdId)
      .where('project_id', '=', c.project_id)
      .executeTakeFirst()
    if (!h) throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.holdId', 'unknown_hold')] })
  }
  const row = await tx
    .updateTable('quality.cases')
    .set({ hold_id: holdId, version: c.version + 1, updated_at: sql<Date>`now()` })
    .where('id', '=', c.id)
    .returning(['version'])
    .executeTakeFirstOrThrow()
  return { case: c, version: row.version }
}

/** Who sends which event (ROLE-MATRIX rows; PROPOSED mapping, OQ-CASE-DETAILS). */
export const EVENT_ACTION: Readonly<Record<CaseEvent, Action>> = {
  acknowledge: 'case.manage',
  investigate: 'case.manage',
  await_action: 'case.manage',
  resolve: 'case.triage',
  reopen: 'case.triage',
  triage: 'case.triage',
  submit_resolution: 'case.triage',
  return_to_action: 'case.triage',
  close: 'case.close',
}

export type EventInput = {
  note?: string
  resolution?: string
  recheckRequired?: boolean
  reason?: string
  severity?: string
}

export async function applyEvent(
  tx: Tx,
  actor: StaffActor,
  caseId: string,
  expected: number,
  name: CaseEvent,
  input: EventInput,
) {
  const c = await lockedCase(tx, caseId)
  // A restricted case's events are all the Owner's (await_action included).
  if (restricted(c) && !allows(actor, 'case.triage', { projectId: c.project_id })) throw new ApiError('FORBIDDEN')
  const machine = caseMachineOf(c.kind) as unknown as Parameters<typeof transition>[0]
  const open = await tx
    .selectFrom('quality.case_follow_ups')
    .select(sql<string>`count(*)::text`.as('n'))
    .where('case_id', '=', c.id)
    .where('state', '=', 'open')
    .executeTakeFirstOrThrow()
  // TSK-0094 (HH-QA-07, HH-QA-08): a case with return work closes once the Owner decided its coverage and price and
  // every return-visit punch item is re-checked (migration 0102 checks the same).
  if (name === 'close') {
    const problems = await returnWorkCloseProblems(tx, c.id)
    if (problems.length) throw conflict(problems.map((p) => field('returnWork', p)))
  }
  const resolving = name === 'resolve' || name === 'submit_resolution'
  const facts: CaseFacts = {
    resolution: resolving ? (input.resolution ?? null) : c.resolution,
    recheckRequired: c.recheck_required,
    recheckDone: c.recheck_at !== null,
    openFollowUps: Number(open.n),
    ...(input.reason !== undefined ? { reason: input.reason } : {}),
  }
  const out = transition(machine, { state: c.state, version: c.version }, name, {
    actor: 'staff',
    expectedVersion: expected,
    now: new Date(),
    facts,
  })
  if (!out.ok) {
    if (out.code === 'STALE_VERSION')
      throw new ApiError('STALE_VERSION', { current: { version: c.version, values: { state: c.state } } })
    if (out.code === 'GUARD_FAILED')
      throw conflict(out.problems.map((p) => field(p.code === 'REASON_REQUIRED' ? 'body' : 'state', p.code)))
    throw conflict([field('state', out.code)])
  }
  const to = out.to as CaseState
  const set: Record<string, unknown> = { state: to, version: out.version, updated_at: sql<Date>`now()` }
  if (resolving) {
    set['resolution'] = (input.resolution ?? '').trim()
    set['resolved_by'] = actor.userId
    set['resolved_at'] = sql<Date>`now()`
    set['recheck_required'] = input.recheckRequired === true
    set['recheck_note'] = null
    set['recheck_by'] = null
    set['recheck_at'] = null
  }
  if (name === 'triage') {
    set['reviewer_id'] = actor.userId
    if (input.severity) set['severity'] = input.severity
  }
  if (name === 'close') {
    set['closed_by'] = actor.userId
    set['closed_at'] = sql<Date>`now()`
  }
  if (name === 'reopen') {
    set['closed_by'] = null
    set['closed_at'] = null
    set['reopen_count'] = c.reopen_count + 1
  }
  try {
    await tx.updateTable('quality.cases').set(set).where('id', '=', c.id).execute()
  } catch (err) {
    // Reopening a complaint while another open complaint of its category exists on the project.
    if ((err as { code?: string }).code === '23505' && name === 'reopen') {
      const other = await openComplaintOf(tx, c.project_id, c.category ?? '')
      if (other) throw duplicate(other)
    }
    throw err
  }
  const note = name === 'reopen' ? input.reason : resolving ? input.resolution : input.note
  await event(tx, c, name, c.state, to, actor.userId, note?.trim() || null)
  await syncCaseItems(tx, c.id)
  return { case: c, from: c.state, to, version: out.version }
}

/** What the case's return work still needs before the case closes (TSK-0094). */
async function returnWorkCloseProblems(tx: Tx, caseId: string): Promise<string[]> {
  const r = await tx
    .selectFrom('quality.return_work')
    .select(['id', 'decided_at'])
    .where('case_id', '=', caseId)
    .executeTakeFirst()
  if (!r) return []
  const open = await tx
    .selectFrom('quality.return_work_items')
    .select('id')
    .where('return_work_id', '=', r.id)
    .where('state', '<>', 'rechecked')
    .executeTakeFirst()
  return [...(r.decided_at === null ? ['RETURN_WORK_UNDECIDED'] : []), ...(open ? ['RETURN_ITEMS_OPEN'] : [])]
}

export async function recordRecheck(tx: Tx, actor: StaffActor, caseId: string, expected: number, note: string) {
  const c = await lockedCase(tx, caseId, expected)
  if (!c.recheck_required) throw conflict([field('recheck', 'RECHECK_NOT_REQUIRED')])
  if (c.recheck_at !== null) throw conflict([field('recheck', 'RECHECK_RECORDED')])
  if (!['resolved', 'resolution_review'].includes(c.state)) throw conflict([field('state', 'RESOLUTION_FIRST')])
  const row = await tx
    .updateTable('quality.cases')
    .set({
      recheck_note: note.trim(),
      recheck_by: actor.userId,
      recheck_at: sql<Date>`now()`,
      version: c.version + 1,
      updated_at: sql<Date>`now()`,
    })
    .where('id', '=', c.id)
    .returning(['version'])
    .executeTakeFirstOrThrow()
  await event(tx, c, 'recheck', c.state, c.state, actor.userId, note.trim())
  return { case: c, version: row.version }
}

// --- Follow-ups, referrals, customer updates -----------------------------------------------------------------------

export async function addFollowUp(
  tx: Tx,
  actor: StaffActor,
  caseId: string,
  input: { description: string; assignedTo: string; dueOn: string },
) {
  const c = await lockedCase(tx, caseId)
  requireHandling(actor, c)
  if (c.state === 'closed') throw conflict([field('state', 'CASE_CLOSED')])
  if (!(await activeStaff(tx, input.assignedTo)))
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.assignedTo', 'unknown_staff')] })
  const row = await tx
    .insertInto('quality.case_follow_ups')
    .values({
      case_id: c.id,
      description: input.description.trim(),
      assigned_to: input.assignedTo,
      due_on: input.dueOn,
      created_by: actor.userId,
    })
    .returning(['id', 'version'])
    .executeTakeFirstOrThrow()
  return { id: row.id, version: row.version, case: c }
}

export async function followUpCase(db: Reader, followUpId: string) {
  return db
    .selectFrom('quality.case_follow_ups as f')
    .innerJoin('quality.cases as c', 'c.id', 'f.case_id')
    .select(['c.id as case_id', 'c.project_id', 'c.kind'])
    .where('f.id', '=', followUpId)
    .executeTakeFirst()
}

export async function settleFollowUp(
  tx: Tx,
  actor: StaffActor,
  followUpId: string,
  expected: number,
  outcome: 'done' | 'canceled',
  note: string,
) {
  const first = await followUpCase(tx, followUpId)
  if (!first) throw new ApiError('NOT_FOUND')
  const c = await lockedCase(tx, first.case_id)
  requireHandling(actor, c)
  const f = await tx
    .selectFrom('quality.case_follow_ups')
    .select(['id', 'state', 'version'])
    .where('id', '=', followUpId)
    .forUpdate()
    .executeTakeFirstOrThrow()
  if (f.version !== expected)
    throw new ApiError('STALE_VERSION', { current: { version: f.version, values: { state: f.state } } })
  if (f.state !== 'open') throw conflict([field('state', 'FOLLOW_UP_SETTLED')])
  const row = await tx
    .updateTable('quality.case_follow_ups')
    .set({
      state: outcome,
      done_note: note.trim(),
      done_by: actor.userId,
      done_at: sql<Date>`now()`,
      version: f.version + 1,
    })
    .where('id', '=', f.id)
    .returning(['version'])
    .executeTakeFirstOrThrow()
  return { case: c, version: row.version }
}

export async function recordReferral(
  tx: Tx,
  actor: StaffActor,
  caseId: string,
  input: { professional: string; note: string; referredOn: string },
) {
  const c = await lockedCase(tx, caseId)
  const row = await tx
    .insertInto('quality.case_referrals')
    .values({
      case_id: c.id,
      professional: input.professional,
      note: input.note.trim(),
      referred_on: input.referredOn,
      recorded_by: actor.userId,
    })
    .returning(['id', 'recorded_at'])
    .executeTakeFirstOrThrow()
  return { id: row.id, recordedAt: row.recorded_at, case: c }
}

/** Fault, liability, coverage or compensation wording refuses the text (HH-INC-04); the words are never echoed. */
function wordingRefusal(found: string[]): ApiError | null {
  return found.length > 0
    ? new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.detail', 'FORBIDDEN_WORDING')] })
    : null
}

async function holdState(db: Reader, holdId: string | null): Promise<string | null> {
  if (!holdId) return null
  const h = await db.selectFrom('work.holds').select('state').where('id', '=', holdId).executeTakeFirst()
  return h?.state ?? null
}

export async function draftCustomerUpdate(
  tx: Tx,
  actor: StaffActor,
  caseId: string,
  input: { kind: CustomerUpdateKind; detail?: string },
) {
  const c = await lockedCase(tx, caseId)
  requireHandling(actor, c)
  if (c.state === 'closed') throw conflict([field('state', 'CASE_CLOSED')])
  const takesDetail = input.kind === 'progress' || input.kind === 'next_step'
  const detail = text(input.detail)
  if (takesDetail !== (detail !== null))
    throw new ApiError('VALIDATION_FAILED', {
      fieldErrors: [field('body.detail', takesDetail ? 'detail_required' : 'detail_not_taken')],
    })
  const body = customerUpdateText(input.kind, detail)
  const refusal = wordingRefusal(forbiddenCaseWording(body))
  if (refusal) throw refusal
  if (input.kind === 'safety_pause' && !safetyPauseTruthful(await holdState(tx, c.hold_id)))
    throw conflict([field('body.kind', 'NO_ACTIVE_HOLD')])
  const row = await tx
    .insertInto('quality.case_customer_updates')
    .values({ case_id: c.id, kind: input.kind, detail, body, drafted_by: actor.userId })
    .returning(['id', 'version'])
    .executeTakeFirstOrThrow()
  return { id: row.id, version: row.version, case: c }
}

export async function updateCase(db: Reader, updateId: string) {
  return db
    .selectFrom('quality.case_customer_updates as u')
    .innerJoin('quality.cases as c', 'c.id', 'u.case_id')
    .select(['c.id as case_id', 'c.project_id', 'c.kind'])
    .where('u.id', '=', updateId)
    .executeTakeFirst()
}

export async function settleCustomerUpdate(
  tx: Tx,
  actor: StaffActor,
  updateId: string,
  expected: number,
  outcome: 'released' | 'withdrawn',
) {
  const first = await updateCase(tx, updateId)
  if (!first) throw new ApiError('NOT_FOUND')
  const c = await lockedCase(tx, first.case_id)
  requireHandling(actor, c)
  const u = await tx
    .selectFrom('quality.case_customer_updates')
    .select(['id', 'kind', 'body', 'state', 'version'])
    .where('id', '=', updateId)
    .forUpdate()
    .executeTakeFirstOrThrow()
  if (u.version !== expected)
    throw new ApiError('STALE_VERSION', { current: { version: u.version, values: { state: u.state } } })
  if (u.state !== 'draft') throw conflict([field('state', 'UPDATE_SETTLED')])
  if (outcome === 'released') {
    // Checked again at release: the exact text the reviewer releases, and a safety pause only while it is true.
    const refusal = wordingRefusal(forbiddenCaseWording(u.body))
    if (refusal) throw refusal
    if (u.kind === 'safety_pause' && !safetyPauseTruthful(await holdState(tx, c.hold_id)))
      throw conflict([field('kind', 'NO_ACTIVE_HOLD')])
    if (c.state === 'closed') throw conflict([field('state', 'CASE_CLOSED')])
  }
  const row = await tx
    .updateTable('quality.case_customer_updates')
    .set(
      outcome === 'released'
        ? { state: 'released', released_by: actor.userId, released_at: sql<Date>`now()`, version: u.version + 1 }
        : { state: 'withdrawn', withdrawn_by: actor.userId, withdrawn_at: sql<Date>`now()`, version: u.version + 1 },
    )
    .where('id', '=', u.id)
    .returning(['version'])
    .executeTakeFirstOrThrow()
  return { case: c, version: row.version, kind: u.kind }
}

// --- Reads ---------------------------------------------------------------------------------------------------------

async function names(db: Reader, ids: (string | null)[]): Promise<Map<string, string | null>> {
  const list = [...new Set(ids.filter((x): x is string => typeof x === 'string'))]
  if (list.length === 0) return new Map()
  const rows = await db
    .selectFrom('identity.staff_users')
    .select(['id', 'display_name'])
    .where('id', 'in', list)
    .execute()
  return new Map(rows.map((r) => [r.id, r.display_name]))
}
const ref = (id: string | null, n: Map<string, string | null>) => (id ? { id, name: n.get(id) ?? null } : null)

/** That a case exists and its status: all Office reads of a restricted case (OWN-DEC-143). */
export function summaryOf(c: CaseRow & { reference: string }, showKind: boolean) {
  return {
    id: c.id,
    number: c.number,
    projectId: c.project_id,
    projectReference: c.reference,
    restricted: restricted(c),
    kind: showKind ? c.kind : null,
    state: c.state,
    reportedAt: c.reported_at.toISOString(),
    closedAt: iso(c.closed_at),
    version: c.version,
  }
}

/** May this actor see the kind and handling fields of the case (not only its status)? */
export const seesDetail = (actor: StaffActor, c: Pick<CaseRow, 'kind' | 'project_id'>) =>
  !restricted(c) || allows(actor, 'case.triage', { projectId: c.project_id })

export async function listCases(
  db: Reader,
  actor: StaffActor,
  filter: { state: 'open' | 'closed' | 'all'; projectId?: string },
) {
  let q = db
    .selectFrom('quality.cases as c')
    .innerJoin('crm.projects as p', 'p.id', 'c.project_id')
    .select([...CASE_COLUMNS.map((k) => `c.${k}` as const), 'p.reference'])
  if (filter.state === 'open') q = q.where('c.state', '<>', 'closed')
  if (filter.state === 'closed') q = q.where('c.state', '=', 'closed')
  if (filter.projectId) q = q.where('c.project_id', '=', filter.projectId)
  const rows = (await q
    .orderBy('c.reported_at', 'desc')
    .orderBy('c.number', 'desc')
    .limit(CASE_LIST_LIMIT)
    .execute()) as unknown as (CaseRow & { reference: string })[]
  return rows.map((c) => {
    const detail = seesDetail(actor, c)
    return {
      ...summaryOf(c, detail),
      category: detail ? c.category : null,
      severity: detail ? c.severity : null,
      dueOn: detail ? dateText(c.due_on) : null,
      assignedTo: detail ? c.assigned_to : null,
    }
  })
}

/** The case with what this actor may see of it: its status only, or its handling detail. */
export async function caseView(db: Reader, actor: StaffActor, caseId: string) {
  const c = (await db
    .selectFrom('quality.cases as c')
    .innerJoin('crm.projects as p', 'p.id', 'c.project_id')
    .select([...CASE_COLUMNS.map((k) => `c.${k}` as const), 'p.reference'])
    .where('c.id', '=', caseId)
    .executeTakeFirst()) as unknown as (CaseRow & { reference: string }) | undefined
  if (!c) return null
  const resource = { projectId: c.project_id }
  const detail = seesDetail(actor, c)
  const summary = summaryOf(c, detail)
  if (!detail) return { ...summary, detail: null }
  const [followUps, updates, notes, attachments, events, referrals, hold] = await Promise.all([
    db
      .selectFrom('quality.case_follow_ups')
      .selectAll()
      .where('case_id', '=', c.id)
      .orderBy('created_at')
      .orderBy('id')
      .execute(),
    db
      .selectFrom('quality.case_customer_updates')
      .selectAll()
      .where('case_id', '=', c.id)
      .orderBy('drafted_at')
      .orderBy('id')
      .execute(),
    restricted(c)
      ? Promise.resolve([])
      : db
          .selectFrom('quality.case_notes')
          .select(['id', 'kind', 'source', 'body', 'written_by', 'written_at'])
          .where('case_id', '=', c.id)
          .where('visibility_class', '=', 'internal_operational')
          .orderBy('written_at')
          .orderBy('id')
          .execute(),
    restricted(c)
      ? Promise.resolve([])
      : db
          .selectFrom('quality.case_attachments')
          .select(['id', 'content_type', 'byte_size', 'uploaded_by', 'uploaded_at'])
          .where('case_id', '=', c.id)
          .where('visibility_class', '=', 'internal_operational')
          .orderBy('uploaded_at')
          .execute(),
    db
      .selectFrom('quality.case_events')
      .select(['event', 'from_state', 'to_state', 'actor_id', 'note', 'at'])
      .where('case_id', '=', c.id)
      .orderBy('at')
      .orderBy('id')
      .execute(),
    allows(actor, 'case.refer_professional', resource)
      ? db
          .selectFrom('quality.case_referrals')
          .select(['id', 'professional', 'note', 'referred_on', 'recorded_by', 'recorded_at'])
          .where('case_id', '=', c.id)
          .orderBy('recorded_at')
          .execute()
      : Promise.resolve(null),
    c.hold_id
      ? db
          .selectFrom('work.holds')
          .select(['id', 'kind', 'state', 'category'])
          .where('id', '=', c.hold_id)
          .executeTakeFirst()
      : Promise.resolve(undefined),
  ])
  const n = await names(db, [
    c.reported_by,
    c.assigned_to,
    c.reviewer_id,
    c.resolved_by,
    c.recheck_by,
    c.closed_by,
    ...followUps.flatMap((f) => [f.assigned_to, f.done_by]),
    ...updates.flatMap((u) => [u.drafted_by, u.released_by]),
    ...notes.map((x) => x.written_by),
    ...attachments.map((a) => a.uploaded_by),
    ...events.map((e) => e.actor_id),
    ...(referrals ?? []).map((r) => r.recorded_by),
  ])
  const manage = allows(actor, restricted(c) ? 'case.triage' : 'case.manage', resource)
  const triage = allows(actor, 'case.triage', resource)
  // The holds of the project the Owner may link as the case's current hold (blocking ones, and the linked one).
  const holdOptions = triage
    ? await db
        .selectFrom('work.holds')
        .select(['id', 'kind', 'state', 'category'])
        .where('project_id', '=', c.project_id)
        .where((eb) =>
          eb.or([eb('state', 'in', ['open', 'under_review']), ...(c.hold_id ? [eb('id', '=', c.hold_id)] : [])]),
        )
        .orderBy('raised_at')
        .execute()
    : []
  const machine = caseMachineOf(c.kind)
  const events_ = machine.transitions
    .filter((t) => (t.from as readonly string[]).includes(c.state))
    .map((t) => t.event as CaseEvent)
    .filter((e) => allows(actor, EVENT_ACTION[e], resource) && (!restricted(c) || triage))
  return {
    ...summary,
    detail: {
      jobId: c.job_id,
      incidentType: c.incident_type,
      category: c.category,
      severity: c.severity,
      source: c.source,
      reportedBy: restricted(c) ? null : ref(c.reported_by, n),
      assignedTo: ref(c.assigned_to, n),
      dueOn: dateText(c.due_on),
      reviewer: ref(c.reviewer_id, n),
      reviewAreas: reviewAreasOf(c.kind),
      hold: hold ? { id: hold.id, kind: hold.kind, state: hold.state, category: hold.category } : null,
      holdOptions: holdOptions.map((h) => ({ id: h.id, kind: h.kind, state: h.state, category: h.category })),
      hazardReportId: c.hazard_report_id,
      resolution: c.resolution,
      resolvedBy: ref(c.resolved_by, n),
      resolvedAt: iso(c.resolved_at),
      recheckRequired: c.recheck_required,
      recheck: c.recheck_at
        ? { note: c.recheck_note ?? '', by: ref(c.recheck_by, n), at: iso(c.recheck_at) as string }
        : null,
      closedBy: ref(c.closed_by, n),
      reopenCount: c.reopen_count,
      followUps: followUps.map((f) => ({
        id: f.id,
        description: f.description,
        assignedTo: ref(f.assigned_to, n),
        dueOn: dateText(f.due_on),
        state: f.state,
        doneNote: f.done_note,
        doneBy: ref(f.done_by, n),
        doneAt: iso(f.done_at),
        version: f.version,
      })),
      customerUpdates: updates.map((u) => ({
        id: u.id,
        kind: u.kind,
        body: u.body,
        state: u.state,
        draftedBy: ref(u.drafted_by, n),
        draftedAt: u.drafted_at.toISOString(),
        releasedBy: ref(u.released_by, n),
        releasedAt: iso(u.released_at),
        version: u.version,
      })),
      notes: notes.map((x) => ({
        id: x.id,
        kind: x.kind,
        source: x.source,
        body: x.body,
        writtenBy: ref(x.written_by, n),
        writtenAt: x.written_at.toISOString(),
      })),
      attachments: attachments.map((a) => ({
        id: a.id,
        contentType: a.content_type,
        byteSize: a.byte_size,
        uploadedBy: ref(a.uploaded_by, n),
        uploadedAt: a.uploaded_at.toISOString(),
      })),
      // The Owner's own record of each referral; null for everyone else. Nothing else says anyone was contacted.
      referrals:
        referrals?.map((r) => ({
          id: r.id,
          professional: r.professional,
          note: r.note,
          referredOn: dateText(r.referred_on) as string,
          recordedBy: ref(r.recorded_by, n),
          recordedAt: r.recorded_at.toISOString(),
        })) ?? null,
      history: events.map((e) => ({
        event: e.event,
        from: e.from_state,
        to: e.to_state,
        by: ref(e.actor_id, n),
        note: e.note,
        at: e.at.toISOString(),
      })),
      actions: {
        events: c.state === 'closed' && c.kind !== 'complaint' ? [] : events_,
        manage: manage && c.state !== 'closed',
        linkHold: triage && c.state !== 'closed',
        recheck:
          triage && c.recheck_required && c.recheck_at === null && ['resolved', 'resolution_review'].includes(c.state),
        refer: allows(actor, 'case.refer_professional', resource),
        restricted: restricted(c) && allows(actor, 'incident.view_restricted', { ownerStaffId: c.reported_by }),
      },
    },
  }
}

/** The restricted section: the Owner and the reporting staff member only (the route's policy decided it). */
export async function restrictedView(db: Reader, caseId: string) {
  const c = await readCase(db, caseId)
  if (!c || !restricted(c)) return null
  const [report, notes, attachments, project] = await Promise.all([
    db.selectFrom('quality.incident_reports').selectAll().where('case_id', '=', c.id).executeTakeFirst(),
    db
      .selectFrom('quality.case_notes')
      .select(['id', 'kind', 'body', 'written_by', 'written_at'])
      .where('case_id', '=', c.id)
      .where('visibility_class', '=', 'restricted_incident')
      .orderBy('written_at')
      .orderBy('id')
      .execute(),
    db
      .selectFrom('quality.case_attachments')
      .select(['id', 'content_type', 'byte_size', 'uploaded_by', 'uploaded_at'])
      .where('case_id', '=', c.id)
      .where('visibility_class', '=', 'restricted_incident')
      .orderBy('uploaded_at')
      .execute(),
    db.selectFrom('crm.projects').select('reference').where('id', '=', c.project_id).executeTakeFirstOrThrow(),
  ])
  const n = await names(db, [
    c.reported_by,
    ...notes.map((x) => x.written_by),
    ...attachments.map((a) => a.uploaded_by),
  ])
  return {
    caseId: c.id,
    number: c.number,
    projectReference: project.reference,
    jobId: c.job_id,
    kind: c.kind,
    incidentType: c.incident_type,
    state: c.state,
    reportedBy: ref(c.reported_by, n),
    reportedAt: c.reported_at.toISOString(),
    report: report
      ? {
          occurredAt: iso(report.occurred_at),
          whatHappened: report.what_happened,
          peopleAffected: report.people_affected,
          workAreas: report.work_areas,
          immediateActions: report.immediate_actions,
          medicalDetail: report.medical_detail,
          recordedAt: report.recorded_at.toISOString(),
        }
      : null,
    notes: notes.map((x) => ({
      id: x.id,
      body: x.body,
      writtenBy: ref(x.written_by, n),
      writtenAt: x.written_at.toISOString(),
    })),
    attachments: attachments.map((a) => ({
      id: a.id,
      contentType: a.content_type,
      byteSize: a.byte_size,
      uploadedBy: ref(a.uploaded_by, n),
      uploadedAt: a.uploaded_at.toISOString(),
    })),
  }
}

/** Active staff members a case or follow-up item may be assigned to (names only). */
export async function assignees(db: Reader) {
  const rows = await db
    .selectFrom('identity.staff_users')
    .select(['id', 'display_name'])
    .where('status', '=', 'active')
    .orderBy('display_name')
    .orderBy('id')
    .execute()
  return rows.map((r) => ({ id: r.id, name: r.display_name }))
}

/** The caller's own incident reports on a job (the job screen's list). */
export async function ownJobReports(db: Reader, actor: StaffActor, jobId: string) {
  const rows = await db
    .selectFrom('quality.cases')
    .select(['id', 'number', 'kind', 'incident_type', 'state', 'reported_at'])
    .where('job_id', '=', jobId)
    .where('reported_by', '=', actor.userId)
    .where('kind', '<>', 'complaint')
    .orderBy('reported_at', 'desc')
    .execute()
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    kind: r.kind,
    incidentType: r.incident_type,
    state: r.state,
    reportedAt: r.reported_at.toISOString(),
  }))
}

/** The customer's view: released updates only, per case, oldest first (HH-INC-02, HH-QA-06). */
export async function customerCaseUpdates(db: Reader, projectId: string) {
  const rows = await db
    .selectFrom('quality.case_customer_updates as u')
    .innerJoin('quality.cases as c', 'c.id', 'u.case_id')
    .select(['c.id as case_id', 'c.number', 'u.kind', 'u.body', 'u.released_at'])
    .where('c.project_id', '=', projectId)
    .where('u.state', '=', 'released')
    .orderBy('c.number')
    .orderBy('u.released_at')
    .orderBy('u.id')
    .execute()
  const byCase = new Map<string, { caseNumber: number; updates: { kind: string; text: string; releasedAt: Date }[] }>()
  for (const r of rows) {
    const entry = byCase.get(r.case_id) ?? { caseNumber: r.number, updates: [] }
    entry.updates.push({ kind: r.kind, text: r.body, releasedAt: r.released_at as Date })
    byCase.set(r.case_id, entry)
  }
  return [...byCase.values()]
}

export { activeCaseCounts, projectHasActiveCase } from './active.js'
