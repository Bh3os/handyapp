// The SOP checklist pinned on a work package (TSK-0068; HH-PKT-03, HH-WORK-11, T43, T45, OWN-DEC-17, OWN-DEC-108). The
// API is a synthetic stand-in and the checklist lines are synthetic (RULE-SYNTHETIC-DATA).
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkPackageSop, type WorkPackageSopView } from '../src/WorkPackageSop'

afterEach(cleanup)

const WP = '33333333-3333-4333-8333-333333333333'
const SOP = '44444444-4444-4444-8444-444444444444'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const KEYS = ['site_preparation', 'setup_checks', 'work_steps', 'quality_checks', 'cleanup_waste', 'final_checks']

function pinned(over: Partial<WorkPackageSopView> = {}): WorkPackageSopView {
  return {
    workPackage: { id: WP, serviceCode: 'HI-01', state: 'planned', jobId: 'job-1' },
    pin: { state: 'pinned', pinnedAt: '2026-10-21T15:00:00.000Z', source: 'approval' },
    readiness: { ok: true, blockers: [], pendingReviewBanner: true },
    sop: {
      id: SOP,
      sopId: 'SOP-HI-01',
      version: 1,
      title: 'SOP HI-01: Synthetic title',
      reviewState: 'pending_competent_review',
      current: true,
      spanishStatus: 'pending',
      sourceFile: 'Standard Of Operations/synthetic.md',
      contentSha256: 'a'.repeat(64),
      hazardSha256: 'b'.repeat(64),
      qualitySha256: 'c'.repeat(64),
      rowVersion: 1,
      signOff: null,
      stages: KEYS.map((key, i) => ({
        stage: i + 1,
        key,
        heading: key,
        steps: key === 'quality_checks' ? 0 : 1,
        items:
          key === 'work_steps'
            ? [
                {
                  id: '3.1',
                  kind: 'control',
                  section: 'From "12. Synthetic procedure"',
                  line: 40,
                  text: 'HOLD (C-X-01): synthetic hold.',
                  control: 'HOLD',
                  ref: 'C-X-01',
                },
                {
                  id: '3.2',
                  kind: 'step',
                  section: 'From "12. Synthetic procedure"',
                  line: 42,
                  text: '**Synthetic Step:** do the synthetic thing.',
                  checkbox: true,
                  evidence: ['photo'],
                  required: true,
                  holdBefore: ['3.1'],
                },
              ]
            : key === 'quality_checks'
              ? [{ id: '4.1', kind: 'note', section: null, line: null, text: 'Synthetic graph note [[FACT-X]].' }]
              : [{ id: `${i + 1}.1`, kind: 'step', section: null, line: 10 + i, text: `Synthetic step ${i + 1}.` }],
      })),
      hazards: {
        controls: [{ id: '3.1', kind: 'control', section: null, line: 40, text: 'HOLD (C-X-01): synthetic hold.' }],
        stopWork: [{ id: 'stop.1', kind: 'step', section: null, line: 90, text: 'Synthetic stop trigger.' }],
      },
      openQuestions: [{ id: 'oq.1', kind: 'step', section: null, line: 99, text: 'Synthetic open question.' }],
    },
    actions: { signOff: false },
    ...over,
  }
}

function renderSop(fetchImpl: ReturnType<typeof vi.fn>, locale: 'en' | 'es' = 'en') {
  const { t } = staffTranslator(locale)
  render(
    <WorkPackageSop
      t={t}
      locale={locale}
      fetchImpl={fetchImpl as unknown as typeof fetch}
      workPackageId={WP}
      when={(iso) => iso.slice(0, 10)}
    />,
  )
}

describe('the work package SOP checklist (TSK-0068, HH-PKT-03)', () => {
  it('[HH-PKT-03][T43] loads on demand and shows the pinned version, banner, stages, vault lines and holds', async () => {
    const fetchImpl = vi.fn(async () => json(200, pinned()))
    renderSop(fetchImpl)
    expect(fetchImpl).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Show the SOP checklist' }))
    const panel = await screen.findByTestId('work-package-sop')
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe(`/api/v1/staff/work-packages/${WP}/sop`)
    expect(within(panel).getByText('Pending competent review', { selector: '.hh-state__title' })).toBeTruthy()
    expect(within(panel).getByText('No procedure for licensed or hazardous work')).toBeTruthy()
    expect(within(panel).getByText(/SOP HI-01: Synthetic title/)).toBeTruthy()
    // Six stages in order; a stage with no step says so, never a made-up step.
    const stages = panel.querySelectorAll('[data-stage]')
    expect([...stages].map((s) => s.getAttribute('data-stage'))).toEqual(KEYS)
    const quality = panel.querySelector('[data-stage="quality_checks"]') as HTMLElement
    expect(within(quality).getByText('No SOP step recorded for this stage — ask the office')).toBeTruthy()
    expect(within(quality).getByText('Added in the graph, not a vault line')).toBeTruthy()
    const work = panel.querySelector('[data-stage="work_steps"]') as HTMLElement
    expect(within(work).getByText('Synthetic Step:').tagName).toBe('STRONG')
    expect(within(work).getByText('Vault line 42')).toBeTruthy()
    expect(within(work).getByText('Clear first: 3.1')).toBeTruthy()
    expect(within(work).getByText('Photo')).toBeTruthy()
    expect(within(work).getByText('HOLD')).toBeTruthy()
    expect(within(panel).getByText('1 HOLD, GATE or FLAG control')).toBeTruthy()
    // No sign-off form unless the server offers it.
    expect(screen.queryByRole('button', { name: 'Record the sign-off' })).toBeNull()
  })

  it('[HH-PKT-03] NOT CONFIGURED shows no checklist and says the package cannot become ready', async () => {
    const fetchImpl = vi.fn(async () =>
      json(
        200,
        pinned({
          pin: { state: 'not_configured', pinnedAt: '2026-10-21T15:00:00.000Z', source: 'approval' },
          readiness: { ok: false, blockers: ['SOP_NOT_CONFIGURED'], pendingReviewBanner: false },
          sop: null,
        }),
      ),
    )
    renderSop(fetchImpl)
    fireEvent.click(screen.getByRole('button', { name: 'Show the SOP checklist' }))
    expect(await screen.findByText('NOT CONFIGURED: no SOP version for this service')).toBeTruthy()
    expect(screen.queryByTestId('work-package-sop')).toBeNull()
    expect(screen.getByText(/cannot become ready until an SOP version is imported and pinned/)).toBeTruthy()
  })

  it('[OWN-DEC-17] in production pending review blocks readiness; the Owner records the sign-off', async () => {
    const view = pinned({
      readiness: { ok: false, blockers: ['SOP_PENDING_COMPETENT_REVIEW'], pendingReviewBanner: true },
      actions: { signOff: true },
    })
    const signed = pinned({
      readiness: { ok: true, blockers: [], pendingReviewBanner: false },
      sop: {
        ...(view.sop as NonNullable<WorkPackageSopView['sop']>),
        reviewState: 'approved',
        rowVersion: 2,
        signOff: {
          reviewerName: 'Synthetic Reviewer',
          reviewerQualification: 'Synthetic qualification',
          reviewNote: 'Synthetic note',
          signedOffBy: { id: 'staff-1', name: 'Synthetic Owner' },
          signedOffAt: '2026-10-21T16:00:00.000Z',
        },
      },
    })
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(200, view))
      .mockResolvedValueOnce(json(200, { id: SOP }))
      .mockResolvedValueOnce(json(200, signed))
    renderSop(fetchImpl)
    fireEvent.click(screen.getByRole('button', { name: 'Show the SOP checklist' }))
    expect(
      await screen.findByText(
        "Production use needs the competent reviewer's sign-off: this work package cannot become ready.",
      ),
    ).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Competent reviewer'), { target: { value: 'Synthetic Reviewer' } })
    fireEvent.change(screen.getByLabelText("Reviewer's qualification"), {
      target: { value: 'Synthetic qualification' },
    })
    fireEvent.change(screen.getByLabelText('What was reviewed'), { target: { value: 'Synthetic note' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record the sign-off' }))
    expect(
      await screen.findByText(
        'Synthetic Reviewer (Synthetic qualification), recorded by Synthetic Owner on 2026-10-21',
      ),
    ).toBeTruthy()
    const [url, init] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit]
    expect(url).toBe(`/api/v1/staff/sop-versions/${SOP}/sign-off`)
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['if-match']).toBe('"1"')
    expect((init.headers as Record<string, string>)['idempotency-key']).toBeTruthy()
    expect(JSON.parse(String(init.body))).toEqual({
      reviewerName: 'Synthetic Reviewer',
      reviewerQualification: 'Synthetic qualification',
      reviewNote: 'Synthetic note',
    })
    expect(screen.queryByText('Pending competent review', { selector: '.hh-state__title' })).toBeNull()
  })

  it('[T45][HH-LANG-02] Spanish staff see the Spanish labels and "Spanish safety review pending"; the SOP stays English', async () => {
    const fetchImpl = vi.fn(async () => json(200, pinned()))
    renderSop(fetchImpl, 'es')
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar la lista de verificación del SOP' }))
    const panel = await screen.findByTestId('work-package-sop')
    expect(
      within(panel).getByText('Revisión de seguridad en español pendiente: el texto del SOP se muestra en inglés.'),
    ).toBeTruthy()
    expect(within(panel).getByText('Pendiente de revisión competente', { selector: '.hh-state__title' })).toBeTruthy()
    const quality = panel.querySelector('[data-stage="quality_checks"]') as HTMLElement
    expect(
      within(quality).getByText('No hay un paso del SOP registrado para esta etapa: consulte a la oficina'),
    ).toBeTruthy()
    expect(within(panel).getByText('Synthetic step 1.').closest('[lang]')?.getAttribute('lang')).toBe('en')
  })

  it('shows a load failure and lets staff try again', async () => {
    const fetchImpl = vi.fn(async () => json(500, { error: { code: 'INTERNAL', fieldErrors: [] } }))
    renderSop(fetchImpl)
    fireEvent.click(screen.getByRole('button', { name: 'Show the SOP checklist' }))
    expect(await screen.findByText('The SOP checklist could not be loaded. Try again.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Show the SOP checklist' })).toBeTruthy()
  })
})
