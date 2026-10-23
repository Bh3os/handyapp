// The job checklist on the staff app (TSK-0075; HH-WORK-11, HH-WORK-05, T47). The API is a synthetic stand-in; every
// name, note and reference is synthetic (RULE-SYNTHETIC-DATA).
import { staffTranslator, type StaffLocale } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChecklistPage, type ChecklistData, type ChecklistStep } from '../src/Checklist'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const JOB = '33333333-3333-4333-8333-333333333375'
const WP = '44444444-4444-4444-8444-444444444475'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const href = (to: string) => `/staff${to}`
const t = (locale: StaffLocale) => staffTranslator(locale).t

const step = (over: Partial<ChecklistStep>): ChecklistStep => ({
  stepId: '1.1',
  text: 'Synthetic: cover the floor',
  line: 12,
  required: true,
  evidence: [],
  holdBefore: [],
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
    reference: 'HH-SYNTH075',
    jobState: 'in_progress',
    blockers: [],
    packages: [
      {
        workPackageId: WP,
        code: 'PT-01',
        state: 'in_progress',
        sop: { versionId: 'v', title: 'Synthetic SOP', pendingReview: true },
        currentStage: 1,
        summary: { steps: 2, completed: 0, skipped: 0, requiredSkipped: 0, requiredOpen: 2, complete: false },
        stages: [
          { stage: 1, key: 'site_preparation', heading: 'Prep', open: true, steps: [step({})] },
          {
            stage: 2,
            key: 'setup_checks',
            heading: 'Setup',
            open: false,
            steps: [step({ stepId: '2.1', evidence: ['note'], actions: ['skip'] })],
          },
        ],
      },
    ],
    photos: [],
    handoffs: [],
    workers: [{ id: 'w-2', name: 'Synthetic Cara' }],
    actions: { handoff: true },
    ...over,
  }
}

describe('ChecklistPage (TSK-0075)', () => {
  it('[HH-WORK-11] shows the stages in order, locks the later ones and sends a step event with its version', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => json(200, data()))
    render(<ChecklistPage t={t('en')} fetchImpl={fetchImpl} jobId={JOB} href={href} />)
    expect(await screen.findByRole('heading', { name: 'Job checklist · HH-SYNTH075' })).toBeTruthy()
    const stages = screen.getAllByTestId('checklist-stage')
    expect(stages).toHaveLength(2)
    expect(stages[1]?.textContent).toContain('Locked until the earlier stages are done')
    const first = screen.getAllByTestId('checklist-step')[0] as HTMLElement
    fireEvent.click(within(first).getByRole('button', { name: 'Start' }))
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(3))
    const [url, init] = fetchImpl.mock.calls[1] as [string, RequestInit]
    expect(url).toContain(`/staff/jobs/${JOB}/checklist/steps/start`)
    expect(JSON.parse(String(init.body))).toEqual({ workPackageId: WP, stepId: '1.1', version: 0 })
  })

  it('[HH-WORK-05] says why the worker cannot act yet, in Spanish', async () => {
    const fetchImpl = vi.fn(async () =>
      json(200, data({ blockers: ['WORK_NOT_STARTED'], actions: { handoff: false } })),
    )
    render(<ChecklistPage t={t('es')} fetchImpl={fetchImpl} jobId={JOB} href={href} />)
    const blockers = await screen.findByTestId('checklist-blockers')
    expect(blockers.textContent).toContain('No ha empezado el trabajo en este trabajo')
    expect(screen.queryByRole('form', { name: 'Entregar' })).toBeNull()
  })
})
