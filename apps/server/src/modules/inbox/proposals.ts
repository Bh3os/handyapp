// Worker notes and proposed replies, and their Owner/Office review (TSK-0155; HH-COM-16, HH-COM-08, HH-COM-01,
// HH-COM-03, ENT-Message, ENT-QueueItem, ENT-AuditEvent, OWN-DEC-211, OWN-DEC-162, OWN-DEC-120, RULE-LANGUAGES,
// RULE-AI-WAVE2, RULE-SERVER-AUTHZ).
//   GET  /staff/jobs/:jobId/notes-and-replies             the worker's own notes and proposals on an assigned job
//   POST /staff/jobs/:jobId/notes                         an internal note from the job (job.add_note)
//   POST /staff/jobs/:jobId/reply-proposals               a proposed customer reply, kept as a draft or sent for review
//   GET  /staff/reply-proposals/mine                      the worker's own proposals and their status
//   PUT  /staff/reply-proposals/:proposalId               change a draft's text (If-Match)
//   POST /staff/reply-proposals/:proposalId/submit        send a draft for review
//   POST /staff/reply-proposals/:proposalId/clarification-answer   answer the reviewer's question
//   GET  /staff/reply-proposals/:proposalId               the review page (Owner, Office)
//   POST /staff/reply-proposals/:proposalId/clarification ask the worker for clarification
//   POST /staff/reply-proposals/:proposalId/reject        reject it with a reason (it never sends)
//   POST /staff/reply-proposals/:proposalId/send          the reviewer's English message, explicitly approved and sent
// - Workers write in Spanish or English (their staff screens are in their language); nothing a worker writes reaches a
//   customer as written. A note is a staff-only message in the project's internal conversation (separate from the
//   customer conversation; migration 0122 keeps internal messages out of it). A proposal is stored apart from the
//   messages in comms.reply_proposals; no route that renders a portal conversation, an email, a text or a customer
//   document reads that table.
// - Only Owner or Office review and send (message.review_proposal; the database refuses any other decider). Send is
//   the reviewer's own staff reply (replies.ts sendReply): the English text the reviewer wrote, through the customer's
//   permitted channel, with the English reply template (HH-COM-03), and the delivery rules of every staff reply. The
//   reviewer approves it explicitly (approveEnglish) when pressing Send. The worker's original stays with the proposal,
//   which names the sent message, and the staff conversation shows it beside the reply; the audit names the proposal,
//   the project and the channel, never a text.
// - No translation exists (RULE-AI-WAVE2: wave 2 stays disabled): the reviewer writes the English message.
// - The review item (reply_proposal) is the Owner's and Office's notice: opened when a proposal is submitted or the
//   worker answers a question, resolved when the reviewer asks a question, rejects or sends. The worker follows the
//   status (Draft, Awaiting Review, Sent, Rejected) and any open question on My Day and on the job's page.
import type { Db, Tx } from '@handyhub/db'
import { looksLikeCardNumber } from '@handyhub/domain'
import type { StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, RouteDef } from '../../api/route.js'
import { projectInScope } from '../../platform/data-scope.js'
import { releaseAutomation } from '../notifications/index.js'
import { jobAssignments } from '../packets/assignments.js'
import { openQueueItem, resolveQueueItem } from '../queue/index.js'
import { ensureConversation, touchConversation } from './conversations.js'
import { ReplyError, sendReply, type ReplyChannel, type SentReply, type ReplyDeps } from './replies.js'
import {
  EMPTY_BODY,
  JOB_NOTES,
  JOB_PARAMS,
  OWN_PROPOSAL,
  OWN_PROPOSALS,
  PROPOSAL_PARAMS,
  PROPOSAL_REVIEW,
  PROPOSAL_SEND_BODY,
  PROPOSE_BODY,
  REJECT_BODY,
  REPLY_MAX_LENGTH,
  REPLY_RESULT,
  TEXT_BODY,
  WORKER_NOTE,
  WORKER_NOTE_BODY,
} from './schemas.js'

const TEST = 'test/integration/reply-proposals.test.ts'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** PROPOSED: the most of the worker's own proposals (newest first) and notes one read lists. */
export const OWN_PROPOSALS_LIMIT = 100
export const OWN_NOTES_LIMIT = 200
const QUEUE_TYPE = 'reply_proposal'

type Reader = Db | Tx
type ProposalRow = {
  id: string
  project_id: string
  job_id: string
  author_staff_id: string
  original_text: string
  state: 'draft' | 'awaiting_review' | 'sent' | 'rejected'
  clarification_open: boolean
  submitted_at: Date | null
  decided_by: string | null
  decided_at: Date | null
  reject_reason: string | null
  sent_message_id: string | null
  created_at: Date
  version: number
}
type EventRow = {
  proposal_id: string
  kind: string
  staff_id: string
  staff_name: string | null
  text: string | null
  recorded_at: Date
}

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null)
const invalid = (field: string, code: string) =>
  new ApiError('VALIDATION_FAILED', { fieldErrors: [{ field, code, message: '' }] })
const conflict = (field: string, code: string) =>
  new ApiError('CONFLICT', { fieldErrors: [{ field, code, message: '' }] })

function staffActor(ctx: ApiContext): StaffActor {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}

/** A worker's text: trimmed, never empty, never a card number (like every staff message). */
function checkedText(field: string, value: string): string {
  const text = value.trim()
  if (!text) throw invalid(field, 'empty')
  if (looksLikeCardNumber(text)) throw invalid(field, 'card_number')
  return text
}

const PROPOSAL_COLUMNS = [
  'p.id',
  'p.project_id',
  'p.job_id',
  'p.author_staff_id',
  'p.original_text',
  'p.state',
  'p.clarification_open',
  'p.submitted_at',
  'p.decided_by',
  'p.decided_at',
  'p.reject_reason',
  'p.sent_message_id',
  'p.created_at',
  'p.version',
] as const

async function proposalOf(db: Reader, id: string, lock = false): Promise<ProposalRow | undefined> {
  if (!UUID_RE.test(id)) return undefined
  let q = db.selectFrom('comms.reply_proposals as p').select(PROPOSAL_COLUMNS).where('p.id', '=', id)
  if (lock) q = q.forUpdate()
  return (await q.executeTakeFirst()) as ProposalRow | undefined
}

async function eventsOf(db: Reader, ids: readonly string[]): Promise<EventRow[]> {
  if (ids.length === 0) return []
  return db
    .selectFrom('comms.reply_proposal_events as e')
    .leftJoin('identity.staff_users as u', 'u.id', 'e.staff_id')
    .select(['e.proposal_id', 'e.kind', 'e.staff_id', 'u.display_name as staff_name', 'e.text', 'e.recorded_at'])
    .where('e.proposal_id', 'in', ids)
    .orderBy('e.seq')
    .execute()
}

const eventView = (e: EventRow) => ({
  kind: e.kind,
  by: { id: e.staff_id, name: e.staff_name },
  text: e.text,
  at: iso(e.recorded_at) as string,
})

/** The worker's own view of a proposal: its status and the open question, never the English message sent. */
function ownView(p: ProposalRow & { reference: string }, events: EventRow[]) {
  const mine = events.filter((e) => e.proposal_id === p.id)
  const asked = [...mine].reverse().find((e) => e.kind === 'clarification_requested')
  return {
    id: p.id,
    version: p.version,
    jobId: p.job_id,
    reference: p.reference,
    status: p.state,
    text: p.original_text,
    clarification:
      p.clarification_open && asked
        ? { question: asked.text as string, askedAt: iso(asked.recorded_at) as string }
        : null,
    rejectReason: p.reject_reason,
    createdAt: iso(p.created_at) as string,
    submittedAt: iso(p.submitted_at),
    decidedAt: iso(p.decided_at),
    events: mine.map(eventView),
    actions: {
      edit: p.state === 'draft',
      submit: p.state === 'draft',
      answer: p.state === 'awaiting_review' && p.clarification_open,
    },
  }
}

async function ownProposals(db: Reader, staffId: string, where: { projectId?: string } = {}) {
  let q = db
    .selectFrom('comms.reply_proposals as p')
    .innerJoin('crm.projects as pr', 'pr.id', 'p.project_id')
    .select([...PROPOSAL_COLUMNS, 'pr.reference'])
    .where('p.author_staff_id', '=', staffId)
  if (where.projectId) q = q.where('p.project_id', '=', where.projectId)
  const rows = (await q
    .orderBy('p.created_at', 'desc')
    .orderBy('p.id', 'desc')
    .limit(OWN_PROPOSALS_LIMIT)
    .execute()) as (ProposalRow & { reference: string })[]
  const events = await eventsOf(
    db,
    rows.map((r) => r.id),
  )
  return rows.map((r) => ownView(r, events))
}

async function ownProposal(db: Reader, id: string) {
  const row = (await db
    .selectFrom('comms.reply_proposals as p')
    .innerJoin('crm.projects as pr', 'pr.id', 'p.project_id')
    .select([...PROPOSAL_COLUMNS, 'pr.reference'])
    .where('p.id', '=', id)
    .executeTakeFirstOrThrow()) as ProposalRow & { reference: string }
  return ownView(row, await eventsOf(db, [id]))
}

/** Opens (or updates) the Owner/Office review item of a proposal: their notice that it needs attention. */
async function openReviewItem(tx: Tx, p: ProposalRow, reason: 'reply_proposed' | 'clarification_answered') {
  const project = await tx
    .selectFrom('crm.projects')
    .select('reference')
    .where('id', '=', p.project_id)
    .executeTakeFirstOrThrow()
  await openQueueItem(tx, {
    type: QUEUE_TYPE,
    subjectId: p.id,
    reason,
    projectId: p.project_id,
    reference: project.reference,
    status: 'awaiting_review',
    ...(p.submitted_at ? { openedAt: p.submitted_at } : {}),
  })
}

const resolveReviewItem = (tx: Tx, proposalId: string, resolution: string) =>
  resolveQueueItem(tx, { type: QUEUE_TYPE, subjectId: proposalId, resolution })

async function addEvent(tx: Tx, proposalId: string, kind: string, staffId: string, text: string | null = null) {
  await tx
    .insertInto('comms.reply_proposal_events')
    .values({ proposal_id: proposalId, kind, staff_id: staffId, text })
    .execute()
}

// --- Record facts the policy decides on -----------------------------------------------------------------------------

const jobFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { jobId } = req.params as { jobId: string }
  if (!UUID_RE.test(jobId)) return null
  const j = await db.selectFrom('work.jobs').select('project_id').where('id', '=', jobId).executeTakeFirst()
  return j ? { projectId: j.project_id, assignments: await jobAssignments(db, jobId) } : null
}
/** A proposal's author is its owner (message.follow_own_proposal: the worker's own proposals only). */
const proposalFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { proposalId } = req.params as { proposalId: string }
  const p = await proposalOf(db, proposalId)
  return p ? { projectId: p.project_id, ownerStaffId: p.author_staff_id } : null
}

function write(def: Omit<RouteDef, 'actors' | 'kind' | 'idempotency' | 'rateLimit' | 'pagination' | 'test'>): RouteDef {
  return {
    ...def,
    actors: ['staff'],
    kind: 'write',
    idempotency: 'required',
    rateLimit: 'none',
    pagination: false,
    test: TEST,
  }
}
function read(
  def: Omit<
    RouteDef,
    'actors' | 'kind' | 'idempotency' | 'expectedVersion' | 'rateLimit' | 'audit' | 'pagination' | 'test'
  >,
): RouteDef {
  return {
    ...def,
    actors: ['staff'],
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
  }
}

// --- The worker's routes --------------------------------------------------------------------------------------------

async function jobOf(db: Reader, jobId: string) {
  const j = await db
    .selectFrom('work.jobs as j')
    .innerJoin('crm.projects as p', 'p.id', 'j.project_id')
    .select(['j.id', 'j.project_id', 'p.reference'])
    .where('j.id', '=', jobId)
    .executeTakeFirst()
  if (!j) throw new ApiError('NOT_FOUND')
  return j
}

async function ownNotes(db: Reader, projectId: string, staffId: string) {
  const rows = await db
    .selectFrom('comms.messages as m')
    .innerJoin('comms.conversations as cv', 'cv.id', 'm.conversation_id')
    .select(['m.id', 'm.body_text', 'm.received_at'])
    .where('cv.project_id', '=', projectId)
    .where('cv.audience', '=', 'internal')
    .where('m.direction', '=', 'internal')
    .where('m.author_staff_id', '=', staffId)
    .orderBy('m.received_at', 'desc')
    .orderBy('m.seq', 'desc')
    .limit(OWN_NOTES_LIMIT)
    .execute()
  return rows.map((m) => ({ id: m.id, body: m.body_text ?? '', at: iso(m.received_at) as string }))
}

const jobNotes = read({
  method: 'GET',
  path: '/staff/jobs/:jobId/notes-and-replies',
  operationId: 'getJobNotesAndReplies',
  summary: "The caller's own notes and proposed replies on a job",
  description:
    'Workers assigned to the job, inside its access window (message.propose_reply; otherwise refused). The caller’s ' +
    'own internal notes on the job’s project (staff-only, never sent) and their own proposed customer replies on it ' +
    'with their status (draft, awaiting review, sent, rejected), any open clarification question and the reason of a ' +
    'rejection; never the English message a reviewer sent, and nobody else’s notes.',
  permission: 'message.propose_reply',
  resource: jobFacts,
  schema: { params: JOB_PARAMS, response: { 200: JOB_NOTES } },
  handler: async (ctx) => {
    const staff = staffActor(ctx)
    const { jobId } = ctx.req.params as { jobId: string }
    const j = await jobOf(ctx.db, jobId)
    return {
      body: {
        jobId: j.id,
        reference: j.reference,
        notes: await ownNotes(ctx.db, j.project_id, staff.userId),
        proposals: (await ownProposals(ctx.db, staff.userId, { projectId: j.project_id })).filter(
          (p) => p.jobId === j.id,
        ),
        maxLength: REPLY_MAX_LENGTH,
      },
    }
  },
})

const addNote = write({
  method: 'POST',
  path: '/staff/jobs/:jobId/notes',
  operationId: 'addJobNote',
  summary: 'Add an internal note from a job',
  description:
    'Staff assigned to the job, inside its access window (job.add_note). Adds a staff-only note, in Spanish or ' +
    'English as written, to the project’s internal conversation: separate from the customer conversation, it never ' +
    'reaches an email, a text, the portal or a customer document (OWN-DEC-211). Card numbers are refused; never ' +
    'write passwords or access codes in a note. The audit event names the project, never the text.',
  permission: 'job.add_note',
  expectedVersion: 'none',
  audit: 'inbox.worker_note_added',
  resource: jobFacts,
  schema: { params: JOB_PARAMS, body: WORKER_NOTE_BODY, response: { 201: WORKER_NOTE } },
  handler: async (ctx) => {
    const staff = staffActor(ctx)
    const tx = ctx.tx as Tx
    const { jobId } = ctx.req.params as { jobId: string }
    const j = await jobOf(tx, jobId)
    const text = checkedText('body.body', (ctx.req.body as { body: string }).body)
    const conversationId = await ensureConversation(tx, j.project_id, 'internal')
    const now = new Date()
    const row = await tx
      .insertInto('comms.messages')
      .values({
        direction: 'internal',
        channel: 'internal',
        body_text: text,
        body_state: 'received',
        received_at: now,
        author_staff_id: staff.userId,
        link_state: 'matched',
        match_rule: 'staff',
        project_id: j.project_id,
        customer_id: sql<string>`(SELECT customer_id FROM crm.projects WHERE id = ${j.project_id})`,
        conversation_id: conversationId,
      })
      .returning(['id', 'received_at'])
      .executeTakeFirstOrThrow()
    await touchConversation(tx, conversationId, now, false)
    await ctx.audit({ target: { type: 'internal_message', id: row.id }, summary: { project: j.reference, jobId } })
    return { status: 201, body: { id: row.id, body: text, at: iso(row.received_at) as string } }
  },
})

const propose = write({
  method: 'POST',
  path: '/staff/jobs/:jobId/reply-proposals',
  operationId: 'proposeReply',
  summary: 'Propose a customer reply for review',
  description:
    'Workers assigned to the job, inside its access window (message.propose_reply). A proposed customer reply in ' +
    'Spanish or English, kept exactly as written and never sent as written (OWN-DEC-211). submit false keeps it a ' +
    'draft the worker may change; submit true sends it for review: the Owner and Office get a review item ' +
    '(reply_proposal) and one of them writes the English message and sends it, asks for clarification or rejects it. ' +
    'Card numbers are refused. The audit event names the proposal and the project, never the text.',
  permission: 'message.propose_reply',
  expectedVersion: 'none',
  audit: 'inbox.reply_proposed',
  resource: jobFacts,
  schema: { params: JOB_PARAMS, body: PROPOSE_BODY, response: { 201: OWN_PROPOSAL } },
  handler: async (ctx) => {
    const staff = staffActor(ctx)
    const tx = ctx.tx as Tx
    const { jobId } = ctx.req.params as { jobId: string }
    const j = await jobOf(tx, jobId)
    const b = ctx.req.body as { text: string; submit: boolean }
    const text = checkedText('body.text', b.text)
    const now = new Date()
    const row = (await tx
      .insertInto('comms.reply_proposals')
      .values({
        project_id: j.project_id,
        job_id: j.id,
        author_staff_id: staff.userId,
        original_text: text,
        state: b.submit ? 'awaiting_review' : 'draft',
        submitted_at: b.submit ? now : null,
      })
      .returning([
        'id',
        'project_id',
        'job_id',
        'author_staff_id',
        'original_text',
        'state',
        'clarification_open',
        'submitted_at',
        'decided_by',
        'decided_at',
        'reject_reason',
        'sent_message_id',
        'created_at',
        'version',
      ])
      .executeTakeFirstOrThrow()) as ProposalRow
    if (b.submit) {
      await addEvent(tx, row.id, 'submitted', staff.userId)
      await openReviewItem(tx, row, 'reply_proposed')
    }
    await ctx.audit({
      target: { type: 'reply_proposal', id: row.id },
      summary: { project: j.reference, jobId, submitted: b.submit },
    })
    const body = await ownProposal(tx, row.id)
    return { status: 201, body, version: body.version }
  },
})

const mine = read({
  method: 'GET',
  path: '/staff/reply-proposals/mine',
  operationId: 'listOwnReplyProposals',
  summary: "The caller's own proposed replies",
  description:
    'A worker’s own proposed replies (message.follow_own_proposal), newest first, with the project reference, the ' +
    'status (draft, awaiting review, sent, rejected), an open clarification question, the reason of a rejection and ' +
    'their history; nobody else’s, and never the English message a reviewer sent. At most the latest ' +
    `${OWN_PROPOSALS_LIMIT} (PROPOSED).`,
  permission: 'message.follow_own_proposal',
  resource: async ({ actor }) => (actor.kind === 'staff' ? { ownerStaffId: actor.userId } : {}),
  schema: { response: { 200: OWN_PROPOSALS } },
  handler: async (ctx) => {
    const staff = staffActor(ctx)
    return {
      body: {
        items: await ownProposals(ctx.db, staff.userId),
        limit: OWN_PROPOSALS_LIMIT,
        maxLength: REPLY_MAX_LENGTH,
      },
    }
  },
})

/** The caller's own proposal, locked; refused when its state does not allow `action`. */
async function lockOwn(tx: Tx, ctx: ApiContext, staff: StaffActor) {
  const { proposalId } = ctx.req.params as { proposalId: string }
  const p = await proposalOf(tx, proposalId, true)
  // The policy checked ownership on the facts it read; the locked row is checked again.
  if (!p || p.author_staff_id !== staff.userId) throw new ApiError('NOT_FOUND')
  return p
}

const editDraft = write({
  method: 'PUT',
  path: '/staff/reply-proposals/:proposalId',
  operationId: 'editReplyProposal',
  summary: 'Change the text of a draft proposed reply',
  description:
    'The author only (message.follow_own_proposal), with If-Match. Only a draft changes (CONFLICT ' +
    'PROPOSAL_NOT_DRAFT otherwise): once submitted, the text is kept exactly as submitted. Card numbers are refused.',
  permission: 'message.follow_own_proposal',
  expectedVersion: 'required',
  audit: 'inbox.reply_proposal_edited',
  resource: proposalFacts,
  schema: { params: PROPOSAL_PARAMS, body: TEXT_BODY, response: { 200: OWN_PROPOSAL } },
  handler: async (ctx) => {
    const staff = staffActor(ctx)
    const tx = ctx.tx as Tx
    const p = await lockOwn(tx, ctx, staff)
    if (p.version !== ctx.expectedVersion()) throw new ApiError('STALE_VERSION', { current: { version: p.version } })
    if (p.state !== 'draft') throw conflict('state', 'PROPOSAL_NOT_DRAFT')
    const text = checkedText('body.text', (ctx.req.body as { text: string }).text)
    await tx.updateTable('comms.reply_proposals').set({ original_text: text }).where('id', '=', p.id).execute()
    await ctx.audit({ target: { type: 'reply_proposal', id: p.id }, summary: { projectId: p.project_id } })
    const body = await ownProposal(tx, p.id)
    return { body, version: body.version }
  },
})

const submit = write({
  method: 'POST',
  path: '/staff/reply-proposals/:proposalId/submit',
  operationId: 'submitReplyProposal',
  summary: 'Send a draft proposed reply for review',
  description:
    'The author only (message.follow_own_proposal). The draft becomes Awaiting Review and its text is frozen; the ' +
    'Owner and Office get the review item (reply_proposal). A proposal already submitted, sent or rejected is ' +
    'CONFLICT PROPOSAL_NOT_DRAFT.',
  permission: 'message.follow_own_proposal',
  expectedVersion: 'none',
  audit: 'inbox.reply_proposal_submitted',
  resource: proposalFacts,
  schema: { params: PROPOSAL_PARAMS, body: EMPTY_BODY, response: { 200: OWN_PROPOSAL } },
  handler: async (ctx) => {
    const staff = staffActor(ctx)
    const tx = ctx.tx as Tx
    const p = await lockOwn(tx, ctx, staff)
    if (p.state !== 'draft') throw conflict('state', 'PROPOSAL_NOT_DRAFT')
    const now = new Date()
    await tx
      .updateTable('comms.reply_proposals')
      .set({ state: 'awaiting_review', submitted_at: now })
      .where('id', '=', p.id)
      .execute()
    await addEvent(tx, p.id, 'submitted', staff.userId)
    await openReviewItem(tx, { ...p, submitted_at: now }, 'reply_proposed')
    await ctx.audit({ target: { type: 'reply_proposal', id: p.id }, summary: { projectId: p.project_id } })
    const body = await ownProposal(tx, p.id)
    return { body, version: body.version }
  },
})

const answer = write({
  method: 'POST',
  path: '/staff/reply-proposals/:proposalId/clarification-answer',
  operationId: 'answerReplyProposalClarification',
  summary: "Answer the reviewer's clarification question",
  description:
    'The author only (message.follow_own_proposal), while the reviewer’s question is open (CONFLICT ' +
    'NO_OPEN_CLARIFICATION otherwise). The answer, in Spanish or English, is kept with the proposal (internal, never ' +
    'sent) and the proposal returns to the Owner and Office (review item reason clarification_answered).',
  permission: 'message.follow_own_proposal',
  expectedVersion: 'none',
  audit: 'inbox.reply_proposal_clarified',
  resource: proposalFacts,
  schema: { params: PROPOSAL_PARAMS, body: TEXT_BODY, response: { 200: OWN_PROPOSAL } },
  handler: async (ctx) => {
    const staff = staffActor(ctx)
    const tx = ctx.tx as Tx
    const p = await lockOwn(tx, ctx, staff)
    if (p.state !== 'awaiting_review' || !p.clarification_open) throw conflict('state', 'NO_OPEN_CLARIFICATION')
    const text = checkedText('body.text', (ctx.req.body as { text: string }).text)
    await tx.updateTable('comms.reply_proposals').set({ clarification_open: false }).where('id', '=', p.id).execute()
    await addEvent(tx, p.id, 'clarification_answered', staff.userId, text)
    await openReviewItem(tx, p, 'clarification_answered')
    await ctx.audit({ target: { type: 'reply_proposal', id: p.id }, summary: { projectId: p.project_id } })
    const body = await ownProposal(tx, p.id)
    return { body, version: body.version }
  },
})

// --- The Owner's and Office's review ----------------------------------------------------------------------------------

/** A proposal inside the reviewer's scope that has been submitted (a draft is the worker's alone). */
async function reviewable(db: Reader, ctx: ApiContext, lock = false) {
  const { proposalId } = ctx.req.params as { proposalId: string }
  if (!UUID_RE.test(proposalId)) throw new ApiError('NOT_FOUND')
  let q = db
    .selectFrom('comms.reply_proposals as p')
    .select(PROPOSAL_COLUMNS)
    .where('p.id', '=', proposalId)
    .where('p.state', '<>', 'draft')
    .where(projectInScope('p.project_id', ctx.scope))
  if (lock) q = q.forUpdate()
  const p = (await q.executeTakeFirst()) as ProposalRow | undefined
  if (!p) throw new ApiError('NOT_FOUND')
  return p
}

async function reviewView(db: Reader, p: ProposalRow) {
  const head = await db
    .selectFrom('crm.projects as pr')
    // The customer staff see the project under now (TSK-0046 merges and relinks).
    .innerJoin('crm.customers as cu', (j) => j.on('cu.id', '=', sql<string>`crm.project_customer(pr.id)`))
    .select(['pr.id', 'pr.reference', 'pr.state', 'cu.id as customer_id', 'cu.display_name'])
    .where('pr.id', '=', p.project_id)
    .executeTakeFirstOrThrow()
  const ids = [p.author_staff_id, ...(p.decided_by ? [p.decided_by] : [])]
  const people = await db
    .selectFrom('identity.staff_users')
    .select(['id', 'display_name'])
    .where('id', 'in', ids)
    .execute()
  const nameOf = (id: string) => people.find((u) => u.id === id)?.display_name ?? null
  const message = p.sent_message_id
    ? await db
        .selectFrom('comms.messages')
        .select('conversation_id')
        .where('id', '=', p.sent_message_id)
        .executeTakeFirst()
    : undefined
  const open = p.state === 'awaiting_review'
  return {
    id: p.id,
    version: p.version,
    status: p.state,
    clarificationOpen: p.clarification_open,
    project: { id: head.id, reference: head.reference, state: head.state },
    customer: { id: head.customer_id, displayName: head.display_name },
    jobId: p.job_id,
    author: { id: p.author_staff_id, name: nameOf(p.author_staff_id) },
    originalText: p.original_text,
    createdAt: iso(p.created_at) as string,
    submittedAt: iso(p.submitted_at),
    rejectReason: p.reject_reason,
    decided:
      p.decided_by && p.decided_at
        ? { by: { id: p.decided_by, name: nameOf(p.decided_by) }, at: iso(p.decided_at) as string }
        : null,
    sentMessage:
      p.sent_message_id && message?.conversation_id
        ? { id: p.sent_message_id, conversationId: message.conversation_id }
        : null,
    events: (await eventsOf(db, [p.id])).map(eventView),
    actions: { clarify: open && !p.clarification_open, reject: open, send: open },
    maxLength: REPLY_MAX_LENGTH,
  }
}

const REVIEW_SCOPE =
  'Owner and Office (message.review_proposal), inside their scope; a draft, an unknown or an out-of-scope proposal ' +
  'is NOT_FOUND.'

const getReview = read({
  method: 'GET',
  path: '/staff/reply-proposals/:proposalId',
  operationId: 'getReplyProposal',
  summary: 'A proposed reply for review',
  description:
    `${REVIEW_SCOPE} The proposal’s project and customer, the worker, the original text exactly as written ` +
    '(internal, for context; never sent), its history (submission, clarification questions and answers, rejection, ' +
    'sending), who decided and when, the reply sent from it, and what the reviewer may do now.',
  permission: 'message.review_proposal',
  resource: proposalFacts,
  schema: { params: PROPOSAL_PARAMS, response: { 200: PROPOSAL_REVIEW } },
  handler: async (ctx) => {
    const p = await reviewable(ctx.db, ctx)
    const body = await reviewView(ctx.db, p)
    return { body, version: body.version }
  },
})

const NOT_OPEN = 'PROPOSAL_NOT_AWAITING_REVIEW'

const clarify = write({
  method: 'POST',
  path: '/staff/reply-proposals/:proposalId/clarification',
  operationId: 'requestReplyProposalClarification',
  summary: 'Ask the worker for clarification',
  description:
    `${REVIEW_SCOPE} While the proposal awaits review (CONFLICT ${NOT_OPEN} otherwise) and no question is open ` +
    '(CONFLICT CLARIFICATION_OPEN). The question (internal, never sent) is shown to the worker on My Day and the ' +
    'job’s page; the review item resolves until the worker answers. Nothing reaches the customer.',
  permission: 'message.review_proposal',
  expectedVersion: 'none',
  audit: 'inbox.reply_proposal_clarification_requested',
  resource: proposalFacts,
  schema: { params: PROPOSAL_PARAMS, body: TEXT_BODY, response: { 200: PROPOSAL_REVIEW } },
  handler: async (ctx) => {
    const staff = staffActor(ctx)
    const tx = ctx.tx as Tx
    const p = await reviewable(tx, ctx, true)
    if (p.state !== 'awaiting_review') throw conflict('state', NOT_OPEN)
    if (p.clarification_open) throw conflict('state', 'CLARIFICATION_OPEN')
    const text = checkedText('body.text', (ctx.req.body as { text: string }).text)
    await tx.updateTable('comms.reply_proposals').set({ clarification_open: true }).where('id', '=', p.id).execute()
    await addEvent(tx, p.id, 'clarification_requested', staff.userId, text)
    await resolveReviewItem(tx, p.id, 'clarification_requested')
    await ctx.audit({ target: { type: 'reply_proposal', id: p.id }, summary: { projectId: p.project_id } })
    const body = await reviewView(tx, (await proposalOf(tx, p.id)) as ProposalRow)
    return { body, version: body.version }
  },
})

const reject = write({
  method: 'POST',
  path: '/staff/reply-proposals/:proposalId/reject',
  operationId: 'rejectReplyProposal',
  summary: 'Reject a proposed reply',
  description:
    `${REVIEW_SCOPE} While the proposal awaits review (CONFLICT ${NOT_OPEN} otherwise). The reason (internal, ` +
    'shown to the worker) is kept; a rejected proposal is final and never sends. The review item resolves. The audit ' +
    'event names the proposal and the project, never the texts.',
  permission: 'message.review_proposal',
  expectedVersion: 'none',
  audit: 'inbox.reply_proposal_rejected',
  resource: proposalFacts,
  schema: { params: PROPOSAL_PARAMS, body: REJECT_BODY, response: { 200: PROPOSAL_REVIEW } },
  handler: async (ctx) => {
    const staff = staffActor(ctx)
    const tx = ctx.tx as Tx
    const p = await reviewable(tx, ctx, true)
    if (p.state !== 'awaiting_review') throw conflict('state', NOT_OPEN)
    const reason = checkedText('body.reason', (ctx.req.body as { reason: string }).reason)
    await tx
      .updateTable('comms.reply_proposals')
      .set({
        state: 'rejected',
        clarification_open: false,
        reject_reason: reason,
        decided_by: staff.userId,
        decided_at: new Date(),
      })
      .where('id', '=', p.id)
      .execute()
    await addEvent(tx, p.id, 'rejected', staff.userId, reason)
    await resolveReviewItem(tx, p.id, 'rejected')
    await ctx.audit({ target: { type: 'reply_proposal', id: p.id }, summary: { projectId: p.project_id } })
    const body = await reviewView(tx, (await proposalOf(tx, p.id)) as ProposalRow)
    return { body, version: body.version }
  },
})

export function proposalRoutes(deps: ReplyDeps = {}): RouteDef[] {
  const now = deps.now ?? (() => new Date())
  // Scheduling needs only the declaration; the worker's own instance (automations.ts) sends.
  const release = releaseAutomation({ email: null, sms: null })

  const send = write({
    method: 'POST',
    path: '/staff/reply-proposals/:proposalId/send',
    operationId: 'sendReplyProposal',
    summary: 'Send the reviewed English reply',
    description:
      `${REVIEW_SCOPE} While the proposal awaits review (CONFLICT ${NOT_OPEN} otherwise; a rejected or sent ` +
      'proposal never sends). The reviewer writes the English customer message and approves it explicitly ' +
      '(approveEnglish); it is sent as the reviewer’s own staff reply, exactly like Send on the project (the ' +
      'customer’s preferred permitted channel or a permitted one the reviewer chose, never switched silently; the ' +
      'English reply template; an email at once, a text inside the recipient’s permitted hours; the same refusals: ' +
      'CONFLICT PREFERRED_CHANNEL_AVAILABLE, CHANNEL_UNAVAILABLE, NO_PERMITTED_CHANNEL, NO_CONTACT; card numbers ' +
      'refused). The worker’s original text is never sent: it stays with the proposal, which names the sent message, ' +
      'for context and audit. The review item resolves. With the same Idempotency-Key a retried submission returns ' +
      'the first answer and sends nothing more. The audit event names the proposal, the project, the channel and the ' +
      'message, never a text.',
    permission: 'message.review_proposal',
    expectedVersion: 'none',
    audit: 'inbox.reply_proposal_sent',
    resource: proposalFacts,
    schema: { params: PROPOSAL_PARAMS, body: PROPOSAL_SEND_BODY, response: { 201: REPLY_RESULT } },
    handler: async (ctx) => {
      const staff = staffActor(ctx)
      const tx = ctx.tx as Tx
      const p = await reviewable(tx, ctx, true)
      if (p.state !== 'awaiting_review') throw conflict('state', NOT_OPEN)
      const b = ctx.req.body as { body: string; channel: ReplyChannel }
      const at = now()
      let sent: SentReply
      try {
        sent = await sendReply(tx, {
          projectId: p.project_id,
          staff: { id: staff.userId, roles: staff.roles },
          text: b.body,
          channel: b.channel,
          now: at,
          requestId: ctx.req.id,
          release,
        })
      } catch (e) {
        if (!(e instanceof ReplyError)) throw e
        if (e.code === 'card_number' || e.code === 'empty' || e.code === 'too_long') throw invalid('body.body', e.code)
        throw conflict('channel', e.code)
      }
      await tx
        .updateTable('comms.reply_proposals')
        .set({
          state: 'sent',
          clarification_open: false,
          sent_message_id: sent.id,
          decided_by: staff.userId,
          decided_at: at,
        })
        .where('id', '=', p.id)
        .execute()
      await addEvent(tx, p.id, 'sent', staff.userId)
      await resolveReviewItem(tx, p.id, 'sent')
      const project = await tx
        .selectFrom('crm.projects')
        .select('reference')
        .where('id', '=', p.project_id)
        .executeTakeFirstOrThrow()
      await ctx.audit({
        target: { type: 'reply_proposal', id: p.id },
        summary: {
          project: project.reference,
          message: sent.id,
          channel: sent.channel,
          delivery: sent.deliveryId,
          sendAt: sent.sendAt.toISOString(),
          heldForTextHours: sent.heldForTextHours,
        },
      })
      return {
        status: 201,
        body: {
          id: sent.id,
          conversationId: sent.conversationId,
          delivery: {
            id: sent.deliveryId,
            channel: sent.channel,
            state: 'queued',
            sendAt: sent.sendAt.toISOString(),
            heldForTextHours: sent.heldForTextHours,
          },
        },
      }
    },
  })

  return [jobNotes, addNote, propose, mine, editDraft, submit, answer, getReview, clarify, reject, send]
}
