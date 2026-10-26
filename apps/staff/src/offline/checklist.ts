// The job checklist without a connection (TSK-0115; HH-OFF-08, HH-OFF-03, HH-OFF-05, HH-OFF-06, HH-OFF-07, OWN-DEC-121,
// RULE-SAFETY-GATES). Only while the Owner has turned offline checklist steps on (the server says so in the checklist
// view: offline.events); otherwise nothing here stores or saves anything and the checklist needs a connection.
// - The copy: the checklist view the server last answered this worker after their own Start Work, kept with the job's
//   packet copy (it leaves the phone with it: end of the service day, assignment ended, sign-out). The handoff notes and
//   the worker list stay off the phone. "Kept for offline use" only once written and read back unchanged.
// - Offline, a step is started, paused, resumed or completed (with the evidence it asks for) as a draft saved on this
//   phone with the device time and its own event ID; skipping and reopening need a connection. The phone applies the
//   same table the server applies (the domain machine: stage order, evidence) to the copy plus its drafts, so the
//   sequence holds offline too, and shows each such step as "Saved on this phone" until the server has it.
// - Nothing is possible when the copy says something blocks the worker (no Start Work, a hold, the job not in
//   progress) or when a Stop Work is saved on this phone and not sent yet: a stop always wins over the checklist.
// - On upload the server decides each draft again and applies it as the online route would; a draft whose step moved
//   since (another worker, a hold raised) is kept for the Owner's review and never applied (sync.ts, server sync.ts).
import {
  CHECKLIST_STEP_MACHINE,
  checklistSummary,
  currentStage,
  earlierOpen,
  transition,
  type ChecklistStepEvent,
  type RecordedStep,
  type SopEvidenceKind,
} from '@handyhub/domain'
import type { ChecklistData, ChecklistStep } from '../Checklist'
import { readOfflineCopy } from './packet'
import { draftId, type DraftState, type OfflineStore, type StoredDraft } from './store'

/** The step events the phone may save offline now (the server's list; empty while the Owner has not turned it on). */
export const offlineEvents = (view: Pick<ChecklistData, 'offline'>): readonly string[] => view.offline?.events ?? []

/**
 * Keeps the checklist copy with the job's packet copy (none without a packet copy: the packet copy decides how long
 * anything of the job stays on the phone). With offline steps turned off, any earlier copy leaves the phone.
 */
export async function storeChecklistCopy(store: OfflineStore, view: ChecklistData, now = new Date()): Promise<boolean> {
  try {
    const packet = await store.getPacket(view.jobId)
    if (!packet) return false
    if (offlineEvents(view).length === 0) {
      if (packet.checklist) await store.putPacket({ ...packet, checklist: null })
      return false
    }
    const copy: ChecklistData = { ...view, handoffs: [], workers: [] }
    await store.putPacket({ ...packet, checklist: { savedAt: now.toISOString(), view: copy } })
    const back = await store.getPacket(view.jobId)
    return JSON.stringify(back?.checklist?.view) === JSON.stringify(copy)
  } catch {
    return false
  }
}

/** The checklist copy of a job, if its packet copy is still valid (an expired copy is purged, never shown). */
export async function readChecklistCopy(store: OfflineStore, jobId: string, now = new Date()) {
  const p = await readOfflineCopy(store, jobId, now)
  const c = p?.checklist
  return c ? { savedAt: c.savedAt, view: c.view as ChecklistData } : null
}

const stepKey = (workPackageId: string, stepId: string) => `${workPackageId}:${stepId}`
/** Drafts that change the copy: still on this phone, or synchronized after the copy was taken. */
const LIVE: readonly DraftState[] = ['saved_on_phone', 'pending_upload', 'synced']

export type OfflineChecklist = {
  view: ChecklistData
  /** Per step (work package : step), the state of the latest draft that changed it on this phone. */
  local: Map<string, DraftState>
}

/**
 * The copy as this phone now sees it: each draft of the job applied in the order it was saved, when it was based on
 * the step's version then (one already in the copy was based on an older version and is skipped); then the stages,
 * summaries and the actions the phone may take offline, from the same domain table the server applies.
 */
export function withDrafts(
  copy: ChecklistData,
  drafts: readonly StoredDraft[],
  opts: { stopSaved?: boolean } = {},
): OfflineChecklist {
  const view = JSON.parse(JSON.stringify(copy)) as ChecklistData
  const local = new Map<string, DraftState>()
  const steps = new Map<string, ChecklistStep>()
  for (const p of view.packages)
    for (const st of p.stages) for (const s of st.steps) steps.set(stepKey(p.workPackageId, s.stepId), s)
  const mine = drafts
    .filter((d) => d.kind === 'step' && d.jobId === view.jobId && LIVE.includes(d.state))
    .sort((a, b) => a.deviceRecordedAt.localeCompare(b.deviceRecordedAt))
  for (const d of mine) {
    const p = d.payload as { workPackageId?: string; stepId?: string; event?: string; version?: number }
    const s = steps.get(stepKey(String(p.workPackageId), String(p.stepId)))
    const t = CHECKLIST_STEP_MACHINE.transitions.find((x) => x.event === p.event)
    if (!s || !t || p.version !== s.version || !(t.from as readonly string[]).includes(s.state)) continue
    s.state = t.to
    s.version += 1
    const e = d.payload as { measurement?: string; note?: string; photoIds?: string[] }
    if (e.measurement?.trim()) s.measurement = e.measurement.trim()
    if (e.note?.trim()) s.note = e.note.trim()
    if (e.photoIds?.length) s.photoIds = [...e.photoIds]
    local.set(stepKey(String(p.workPackageId), s.stepId), d.state)
  }
  const allowed = new Set(offlineEvents(view))
  const blocked = view.blockers.length > 0 || opts.stopSaved === true
  for (const p of view.packages) {
    const all = p.stages.flatMap((st) => st.steps.map((s) => ({ id: s.stepId, stage: st.stage, required: s.required })))
    const recorded: RecordedStep[] = p.stages.flatMap((st) =>
      st.steps
        .filter((s) => s.state !== 'not_started')
        .map((s) => ({ stepId: s.stepId, stage: st.stage, state: s.state })),
    )
    p.currentStage = currentStage(all, recorded)
    p.summary = checklistSummary(all, recorded)
    for (const st of p.stages) {
      st.open = earlierOpen(all, recorded, st.stage) === 0
      for (const s of st.steps)
        s.actions =
          blocked || p.state !== 'in_progress'
            ? []
            : CHECKLIST_STEP_MACHINE.transitions
                .filter((t) => (t.from as readonly string[]).includes(s.state))
                .filter((t) => st.open || t.event === 'pause')
                .filter((t) => s.waitsForChangeOrders.length === 0 || t.event === 'pause')
                .map((t) => t.event)
                .filter((e) => allowed.has(e))
    }
  }
  return { view, local }
}

export type StepEvidence = { measurement?: string; note?: string; photoIds?: string[] }

/**
 * Saves one step event on this phone, after the same checks the server makes on the copy plus the drafts (stage
 * order, evidence, the version). Answers the refusal codes instead when they fail; nothing is saved then.
 */
export async function saveStepDraft(
  store: OfflineStore,
  offline: OfflineChecklist,
  input: {
    visitId: string
    workPackageId: string
    step: ChecklistStep
    event: ChecklistStepEvent
    evidence: StepEvidence
    staffUserId: string | null
  },
  now = new Date(),
): Promise<{ ok: true } | { ok: false; codes: string[] }> {
  const { step, event, evidence } = input
  if (!step.actions.includes(event)) return { ok: false, codes: ['INVALID_STATE'] }
  const p = offline.view.packages.find((x) => x.workPackageId === input.workPackageId)
  const stage = p?.stages.find((st) => st.steps.some((s) => s.stepId === step.stepId))
  const all = (p?.stages ?? []).flatMap((st) => st.steps.map((s) => ({ id: s.stepId, stage: st.stage })))
  const recorded: RecordedStep[] = (p?.stages ?? []).flatMap((st) =>
    st.steps.map((s) => ({ stepId: s.stepId, stage: st.stage, state: s.state })),
  )
  const measurement = evidence.measurement?.trim() || step.measurement || null
  const note = evidence.note?.trim() || step.note || null
  const photos = evidence.photoIds?.length ? evidence.photoIds.length : step.photoIds.length
  const t = transition(CHECKLIST_STEP_MACHINE, { state: step.state, version: step.version }, event, {
    actor: 'staff',
    expectedVersion: step.version,
    now,
    facts: {
      earlierOpen: earlierOpen(all, recorded, stage?.stage ?? 1),
      evidence: step.evidence as readonly SopEvidenceKind[],
      photos,
      measurement,
      note,
    },
  })
  if (!t.ok) return { ok: false, codes: t.code === 'GUARD_FAILED' ? t.problems.map((x) => x.code) : ['INVALID_STATE'] }
  const payload = {
    workPackageId: input.workPackageId,
    stepId: step.stepId,
    event,
    version: step.version,
    ...(event === 'complete' && evidence.measurement?.trim() ? { measurement: evidence.measurement.trim() } : {}),
    ...(event === 'complete' && evidence.note?.trim() ? { note: evidence.note.trim() } : {}),
    ...(event === 'complete' && evidence.photoIds?.length ? { photoIds: [...evidence.photoIds] } : {}),
  }
  try {
    await store.putDraft({
      id: draftId(),
      kind: 'step',
      ...(input.staffUserId ? { staffUserId: input.staffUserId } : {}),
      jobId: offline.view.jobId,
      visitId: input.visitId,
      deviceRecordedAt: now.toISOString(),
      payload,
      state: 'saved_on_phone',
      attempts: 0,
    })
    return { ok: true }
  } catch {
    return { ok: false, codes: ['NOT_SAVED'] }
  }
}

export const isLocal = (offline: OfflineChecklist, workPackageId: string, stepId: string) =>
  offline.local.get(stepKey(workPackageId, stepId)) ?? null
