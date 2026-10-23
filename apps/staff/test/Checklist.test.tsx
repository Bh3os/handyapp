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
  textEs: null,
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
        sop: { versionId: 'v', title: 'Synthetic SOP', pendingReview: true, spanishStatus: 'pending', titleEs: null },
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
    handoffs: [],
    workers: [{ id: 'w-2', name: 'Synthetic Cara' }],
    actions: { handoff: true },
    ...over,
  }
}

const COMPLETION = {
  jobId: JOB,
  jobState: 'in_progress',
  packages: [{ code: 'PT-01', checklistComplete: false, beforePhotos: 1, afterPhotos: 0 }],
  problems: [
    { code: 'CHECKLIST_INCOMPLETE', workPackage: 'PT-01' },
    { code: 'AFTER_PHOTO_MISSING', workPackage: 'PT-01' },
  ],
  submission: null,
  actions: { submit: false },
}

describe('ChecklistPage (TSK-0075)', () => {
  it('[HH-WORK-11] shows the stages in order, locks the later ones and sends a step event with its version', async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) =>
      String(url).endsWith('/completion') ? json(200, COMPLETION) : json(200, data()),
    )
    render(<ChecklistPage t={t('en')} fetchImpl={fetchImpl} jobId={JOB} href={href} />)
    expect(await screen.findByRole('heading', { name: 'Job checklist · HH-SYNTH075' })).toBeTruthy()
    const stages = screen.getAllByTestId('checklist-stage')
    expect(stages).toHaveLength(2)
    expect(stages[1]?.textContent).toContain('Locked until the earlier stages are done')
    const first = screen.getAllByTestId('checklist-step')[0] as HTMLElement
    fireEvent.click(within(first).getByRole('button', { name: 'Start' }))
    await waitFor(() => expect(fetchImpl.mock.calls.some(([, i]) => i?.method === 'POST')).toBe(true))
    const [url, init] = fetchImpl.mock.calls.find(([, i]) => i?.method === 'POST') as [string, RequestInit]
    expect(url).toContain(`/staff/jobs/${JOB}/checklist/steps/start`)
    expect(JSON.parse(String(init.body))).toEqual({ workPackageId: WP, stepId: '1.1', version: 0 })
  })

  it('[HH-WORK-05] says why the worker cannot act yet, in Spanish', async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) =>
      String(url).endsWith('/completion')
        ? json(200, COMPLETION)
        : json(200, data({ blockers: ['WORK_NOT_STARTED'], actions: { handoff: false } })),
    )
    render(<ChecklistPage t={t('es')} fetchImpl={fetchImpl} jobId={JOB} href={href} />)
    const blockers = await screen.findByTestId('checklist-blockers')
    expect(blockers.textContent).toContain('No ha empezado el trabajo en este trabajo')
    expect(screen.queryByRole('form', { name: 'Entregar' })).toBeNull()
  })

  it('[HH-QA-01][T55] Finished lists what is missing and offers no submission until the evidence is there', async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) =>
      String(url).endsWith('/completion') ? json(200, COMPLETION) : json(200, data()),
    )
    render(<ChecklistPage t={t('en')} fetchImpl={fetchImpl} jobId={JOB} href={href} />)
    const problems = await screen.findByTestId('completion-problems')
    expect(problems.textContent).toContain('PT-01: An after photo is missing.')
    expect(screen.queryByRole('button', { name: 'Finished: submit for quality review' })).toBeNull()
  })

  it('[HH-QA-03] customer unavailable names nobody and says it is never acceptance', async () => {
    const posted: unknown[] = []
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).endsWith('/completion')) {
        if (init?.method === 'POST') {
          posted.push(JSON.parse(String(init.body)))
          return json(201, {})
        }
        return json(200, { ...COMPLETION, problems: [], actions: { submit: true } })
      }
      return json(200, data())
    })
    render(<ChecklistPage t={t('en')} fetchImpl={fetchImpl} jobId={JOB} href={href} />)
    const panel = await screen.findByTestId('completion')
    fireEvent.click(within(panel).getByLabelText('Customer unavailable'))
    expect(within(panel).getByText(/never acceptance/)).toBeTruthy()
    expect(within(panel).queryByLabelText('Who did the walkthrough')).toBeNull()
    fireEvent.click(within(panel).getByRole('button', { name: 'Finished: submit for quality review' }))
    await waitFor(() => expect(posted).toEqual([{ outcome: 'customer_unavailable' }]))
  })

  it('[T45][T70][HH-LANG-04] Spanish-reading workers see released Spanish steps; pending ones stay English and blocked', async () => {
    // The completion panel reads its own route.
    const serve = (body: ChecklistData) =>
      vi.fn(async (url: RequestInfo | URL) =>
        String(url).endsWith('/completion') ? json(200, COMPLETION) : json(200, body),
      )
    const released = data()
    const pkg = released.packages[0] as ChecklistData['packages'][number]
    pkg.sop = {
      versionId: 'v',
      title: 'Synthetic SOP',
      pendingReview: true,
      spanishStatus: 'ai_reviewed',
      titleEs: 'SOP sintético',
    }
    pkg.stages = pkg.stages.map((st) => ({
      ...st,
      steps: st.steps.map((x) => ({ ...x, textEs: 'Sintético: cubra el piso' })),
    }))
    render(<ChecklistPage t={t('es')} locale="es" fetchImpl={serve(released)} jobId={JOB} href={href} />)
    const first = (await screen.findAllByTestId('checklist-step'))[0] as HTMLElement
    expect(within(first).getByText('Sintético: cubra el piso').closest('[lang]')?.getAttribute('lang')).toBe('es')
    expect(screen.getByTestId('checklist-language').textContent).toBe(
      'Revisado por IA Los pasos del SOP se muestran en español, revisados por IA frente a la versión en inglés.',
    )
    expect(screen.queryByText('Revisión de seguridad en español pendiente')).toBeNull()
    cleanup()
    // Not released: the English text, "Spanish safety review pending" for the Spanish reader.
    render(<ChecklistPage t={t('es')} locale="es" fetchImpl={serve(data())} jobId={JOB} href={href} />)
    const pending = (await screen.findAllByTestId('checklist-step'))[0] as HTMLElement
    expect(within(pending).getByText('Synthetic: cover the floor').closest('[lang]')?.getAttribute('lang')).toBe('en')
    expect(screen.getByText('Revisión de seguridad en español pendiente')).toBeTruthy()
    cleanup()
    // English readers always read the English text.
    render(<ChecklistPage t={t('en')} locale="en" fetchImpl={serve(released)} jobId={JOB} href={href} />)
    expect(await screen.findAllByText('Synthetic: cover the floor')).toBeTruthy()
    expect(screen.queryByText('Sintético: cubra el piso')).toBeNull()
  })
})
