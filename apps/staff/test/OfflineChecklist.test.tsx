// Checklist steps saved offline (TSK-0115; HH-OFF-08, HH-OFF-03, HH-OFF-05, RULE-SAFETY-GATES). The API is a synthetic
// stand-in and the store is the memory store; every id, note and reference is synthetic (RULE-SYNTHETIC-DATA).
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Fetch } from '../src/api'
import { ChecklistPage, type ChecklistData, type ChecklistStep } from '../src/Checklist'
import { saveStepDraft, storeChecklistCopy, withDrafts } from '../src/offline/checklist'
import { memoryStore, setOfflineStore, type OfflineStore, type StoredDraft } from '../src/offline/store'
import { setSignedInStaff, syncDrafts } from '../src/offline/sync'

const ME = '11111111-1111-4111-8111-111111111115'
const JOB = '33333333-3333-4333-8333-333333333115'
const WP = '44444444-4444-4444-8444-444444444115'
const VISIT = '55555555-5555-4555-8555-555555555115'
const t = staffTranslator('en').t
const href = (to: string) => `/staff${to}`
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const EVENTS = ['start', 'pause', 'resume', 'complete']

const step = (over: Partial<ChecklistStep>): ChecklistStep => ({
  stepId: '1.1',
  text: 'Synthetic: cover the floor',
  textEs: null,
  line: 12,
  required: true,
  evidence: [],
  holdBefore: [],
  waitsForChangeOrders: [],
  state: 'not_started',
  version: 0,
  measurement: null,
  note: null,
  photoIds: [],
  skipReason: null,
  worker: null,
  completedBy: null,
  completedAt: null,
  actions: ['start', 'complete', 'skip'],
  ...over,
})
function data(over: Partial<ChecklistData> = {}): ChecklistData {
  return {
    jobId: JOB,
    reference: 'HH-SYNTH115',
    jobState: 'in_progress',
    blockers: [],
    packages: [
      {
        workPackageId: WP,
        code: 'PT-01',
        state: 'in_progress',
        sop: { versionId: 'v', title: 'Synthetic SOP', pendingReview: false, spanishStatus: 'pending', titleEs: null },
        currentStage: 1,
        summary: { steps: 2, completed: 0, skipped: 0, requiredSkipped: 0, requiredOpen: 2, complete: false },
        stages: [
          { stage: 1, key: 'site_preparation', heading: 'Prep', headingEs: null, open: true, steps: [step({})] },
          {
            stage: 2,
            key: 'setup_checks',
            heading: 'Setup',
            headingEs: null,
            open: false,
            steps: [step({ stepId: '2.1', evidence: ['note'], actions: ['skip'] })],
          },
        ],
      },
    ],
    photos: [],
    handoffs: [{ id: 'h', workPackageId: null, from: { id: ME, name: 'Synthetic' }, to: null, note: 'x', at: '' }],
    workers: [{ id: 'w-2', name: 'Synthetic Cara' }],
    actions: { handoff: true },
    offline: { events: EVENTS, visitId: VISIT },
    ...over,
  }
}
const draft = (payload: Record<string, unknown>, at: string, extra: Partial<StoredDraft> = {}): StoredDraft => ({
  id: crypto.randomUUID(),
  kind: 'step',
  staffUserId: ME,
  jobId: JOB,
  visitId: VISIT,
  deviceRecordedAt: at,
  payload: { workPackageId: WP, ...payload },
  state: 'saved_on_phone',
  attempts: 0,
  ...extra,
})
const COMPLETION = {
  jobId: JOB,
  jobState: 'in_progress',
  packages: [{ code: 'PT-01', checklistComplete: false, beforePhotos: 1, afterPhotos: 0 }],
  problems: [{ code: 'CHECKLIST_INCOMPLETE', workPackage: 'PT-01' }],
  submission: null,
  actions: { submit: false },
}
const stepOf = (v: ChecklistData, id: string) =>
  v.packages[0]?.stages.flatMap((s) => s.steps).find((s) => s.stepId === id) as ChecklistStep

let store: OfflineStore
beforeEach(async () => {
  store = memoryStore()
  setOfflineStore(store)
  setSignedInStaff(ME)
  // The packet copy My Day took: the checklist copy goes with it.
  await store.putPacket({
    jobId: JOB,
    projectReference: 'HH-SYNTH115',
    version: 1,
    contentSha256: 'x',
    savedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    view: {},
    sops: {},
  })
})
afterEach(() => {
  cleanup()
  setOfflineStore(null)
  setSignedInStaff(null)
  vi.restoreAllMocks()
})

describe('the offline checklist (TSK-0115)', () => {
  it('[HH-OFF-03] drafts apply in order on the copy; the stage opens; skip and reopen stay online', () => {
    const o = withDrafts(data(), [
      draft({ stepId: '1.1', event: 'start', version: 0 }, '2026-10-26T14:00:00Z'),
      draft({ stepId: '1.1', event: 'complete', version: 1 }, '2026-10-26T14:05:00Z', { state: 'pending_upload' }),
      // Kept for review: never applied on the phone either.
      draft({ stepId: '2.1', event: 'start', version: 0 }, '2026-10-26T14:06:00Z', { state: 'needs_review' }),
    ])
    expect(stepOf(o.view, '1.1')).toMatchObject({ state: 'completed', version: 2, actions: [] })
    expect(o.view.packages[0]?.stages[1]?.open).toBe(true)
    expect(stepOf(o.view, '2.1')).toMatchObject({ state: 'not_started', actions: ['start', 'complete'] })
    expect(o.local.get(`${WP}:1.1`)).toBe('pending_upload')
    // A draft already in the copy (based on an older version) is not applied twice.
    const copy = data()
    Object.assign(stepOf(copy, '1.1'), { state: 'in_progress', version: 1 })
    const again = withDrafts(copy, [draft({ stepId: '1.1', event: 'start', version: 0 }, '2026-10-26T14:00:00Z')])
    expect(stepOf(again.view, '1.1')).toMatchObject({ state: 'in_progress', version: 1 })
  })

  it('[RULE-SAFETY-GATES] nothing is possible offline behind a blocker or a stop saved on this phone', () => {
    const held = withDrafts(data({ blockers: ['HOLD_OPEN'] }), [])
    expect(stepOf(held.view, '1.1').actions).toEqual([])
    const stopped = withDrafts(data(), [], { stopSaved: true })
    expect(stepOf(stopped.view, '1.1').actions).toEqual([])
    const off = withDrafts(data({ offline: { events: [], visitId: VISIT } }), [])
    expect(stepOf(off.view, '1.1').actions).toEqual([])
  })

  it('[HH-OFF-03] a draft is saved only after the same checks as the server: stage order and evidence', async () => {
    const o = withDrafts(data(), [])
    const early = await saveStepDraft(store, o, {
      visitId: VISIT,
      workPackageId: WP,
      step: { ...stepOf(o.view, '2.1'), actions: ['start'] },
      event: 'start',
      evidence: {},
      staffUserId: ME,
    })
    expect(early).toEqual({ ok: false, codes: ['EARLIER_STAGE_OPEN'] })
    const done = await saveStepDraft(store, o, {
      visitId: VISIT,
      workPackageId: WP,
      step: stepOf(o.view, '1.1'),
      event: 'complete',
      evidence: { note: '  Synthetic: covered  ' },
      staffUserId: ME,
    })
    expect(done).toEqual({ ok: true })
    const opened = withDrafts(data(), await store.listDrafts())
    const missing = await saveStepDraft(store, opened, {
      visitId: VISIT,
      workPackageId: WP,
      step: stepOf(opened.view, '2.1'),
      event: 'complete',
      evidence: {},
      staffUserId: ME,
    })
    expect(missing).toEqual({ ok: false, codes: ['EVIDENCE_MISSING'] })
    expect((await store.listDrafts()).map((d) => [d.kind, d.visitId, d.payload])).toEqual([
      ['step', VISIT, { workPackageId: WP, stepId: '1.1', event: 'complete', version: 0, note: 'Synthetic: covered' }],
    ])
  })

  it('[HH-OFF-01] the copy leaves out handoff notes and workers, and leaves the phone when offline steps are off', async () => {
    expect(await storeChecklistCopy(store, data())).toBe(true)
    const kept = (await store.getPacket(JOB))?.checklist?.view as ChecklistData
    expect(kept.handoffs).toEqual([])
    expect(kept.workers).toEqual([])
    expect(await storeChecklistCopy(store, data({ offline: { events: [], visitId: VISIT } }))).toBe(false)
    expect((await store.getPacket(JOB))?.checklist).toBeNull()
  })

  it('[HH-OFF-03][HH-OFF-07] offline, the screen shows the copy and saves a tap on this phone, never as recorded', async () => {
    let online = true
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      if (!online) throw new TypeError('Failed to fetch')
      return String(url).endsWith('/completion') ? json(200, COMPLETION) : json(200, data())
    })
    const { unmount } = render(<ChecklistPage t={t} fetchImpl={fetchImpl} jobId={JOB} href={href} />)
    expect(await screen.findByRole('heading', { name: 'Job checklist · HH-SYNTH115' })).toBeTruthy()
    await waitFor(async () => expect((await store.getPacket(JOB))?.checklist).toBeTruthy())
    unmount()
    online = false
    render(<ChecklistPage t={t} fetchImpl={fetchImpl} jobId={JOB} href={href} />)
    expect((await screen.findByTestId('checklist-offline-copy')).textContent).toContain('Taken ')
    const first = screen.getAllByTestId('checklist-step')[0] as HTMLElement
    expect(within(first).queryByRole('button', { name: 'Skip' })).toBeNull()
    fireEvent.click(within(first).getByRole('button', { name: 'Start' }))
    await waitFor(async () => expect(await store.listDrafts()).toHaveLength(1))
    expect(
      await within(screen.getAllByTestId('checklist-step')[0] as HTMLElement).findByTestId('checklist-step-local'),
    ).toBeTruthy()
    expect(screen.getAllByTestId('checklist-step-local')[0]?.textContent).toContain('Saved on this phone')
    expect(screen.queryByRole('form', { name: 'Hand over' })).toBeNull()
    expect(screen.queryByTestId('completion')).toBeNull()
  })

  it('[HH-OFF-08] with offline steps off, offline the checklist needs a connection', async () => {
    const fetchImpl: Fetch = async () => {
      throw new TypeError('Failed to fetch')
    }
    render(<ChecklistPage t={t} fetchImpl={fetchImpl} jobId={JOB} href={href} />)
    expect(await screen.findByTestId('checklist-needs-connection')).toBeTruthy()
    expect(screen.getByText('The checklist needs a connection')).toBeTruthy()
  })

  it('[HH-OFF-05] a step draft uploads as a checklist_step event with its step and the phone’s UUID', async () => {
    const d = draft({ stepId: '1.1', event: 'start', version: 0 }, '2026-10-26T14:00:00Z')
    await store.putDraft(d)
    const sent: Record<string, unknown>[] = []
    const fetchImpl: Fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      sent.push(body)
      return json(200, {
        clientId: body['clientId'],
        state: 'synchronized',
        outcome: 'applied',
        detail: null,
        visitId: VISIT,
        receivedAt: new Date().toISOString(),
        ingested: true,
      })
    }
    expect(await syncDrafts(store, fetchImpl, ME)).toMatchObject({ synced: 1, failed: 0 })
    expect(sent).toEqual([
      {
        clientId: d.id,
        type: 'checklist_step',
        visitId: VISIT,
        deviceRecordedAt: d.deviceRecordedAt,
        attempt: 1,
        step: { workPackageId: WP, stepId: '1.1', event: 'start', version: 0 },
      },
    ])
    expect((await store.listDrafts())[0]?.state).toBe('synced')
  })

  it('[HH-OFF-07] a page opened offline reads the session again for its CSRF token, then sends the same attempt', async () => {
    const d = draft({ stepId: '1.1', event: 'start', version: 0 }, '2026-10-26T14:00:00Z')
    await store.putDraft(d)
    const calls: { url: string; csrf: string | null }[] = []
    const fetchImpl: Fetch = async (url, init) => {
      const csrf = new Headers(init?.headers).get('x-csrf-token')
      calls.push({ url: String(url), csrf })
      if (String(url).endsWith('/staff/auth/session')) return json(200, { csrfToken: 'synthetic-csrf-115' })
      if (csrf !== 'synthetic-csrf-115') return json(403, { error: { code: 'CSRF_TOKEN_INVALID', fieldErrors: [] } })
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      return json(200, {
        clientId: body['clientId'],
        state: 'synchronized',
        outcome: 'applied',
        detail: null,
        visitId: VISIT,
        receivedAt: new Date().toISOString(),
        ingested: true,
      })
    }
    expect(await syncDrafts(store, fetchImpl, ME)).toMatchObject({ synced: 1, failed: 0 })
    expect(calls.map((c) => [c.url.replace('/api/v1', ''), c.csrf])).toEqual([
      ['/staff/field-events', null],
      ['/staff/auth/session', null],
      ['/staff/field-events', 'synthetic-csrf-115'],
    ])
  })
})
