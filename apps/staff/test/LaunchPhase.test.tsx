// Settings -> Launch phase (TSK-0142; HH-OPS-06, OWN-DEC-191, HH-LANG-02). Responses are synthetic; the server decides
// everything, these tests check what the screen shows and sends: the switches off in phase 1, a move only with the
// Owner's approval and the typed words, and nothing shown to anyone the server refuses.
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LaunchPhaseSetting, type LaunchView } from '../src/LaunchPhase'

afterEach(cleanup)

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const PHASE1: LaunchView = {
  environment: 'staging',
  phase: 'owner_acceptance_testing',
  phaseNumber: 1,
  version: 1,
  changedAt: '2026-10-22T12:00:00.000Z',
  changedBy: null,
  approval: 'Phase 1, Owner Acceptance Testing.',
  switches: [
    { id: 'invited_customers', on: false },
    { id: 'public_submissions', on: false },
    { id: 'search_indexing', on: false },
  ],
  effect: { submissions: 'testers_only', indexing: false },
  moves: [{ to: 'invited_customers', confirmation: 'APPROVE PHASE 2' }],
  freshAuthMinutes: 5,
  history: [
    {
      version: 1,
      phase: 'owner_acceptance_testing',
      changedAt: '2026-10-22T12:00:00.000Z',
      changedBy: null,
      approval: 'Phase 1, Owner Acceptance Testing.',
    },
  ],
}
const PHASE2: LaunchView = {
  ...PHASE1,
  phase: 'invited_customers',
  phaseNumber: 2,
  version: 2,
  changedBy: { id: 'u-owner', name: 'Synthetic owner' },
  approval: 'Synthetic approval',
  switches: [
    { id: 'invited_customers', on: true },
    { id: 'public_submissions', on: false },
    { id: 'search_indexing', on: false },
  ],
  moves: [
    { to: 'owner_acceptance_testing', confirmation: 'RETURN TO PHASE 1' },
    { to: 'public', confirmation: 'APPROVE PHASE 3' },
  ],
}

describe('LaunchPhaseSetting (TSK-0142, HH-OPS-06)', () => {
  it('[HH-OPS-06] phase 1 shows every switch off; a move needs the approval and the exact words', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json(200, PHASE1)).mockResolvedValueOnce(json(200, PHASE2))
    const { t } = staffTranslator('en')
    render(<LaunchPhaseSetting t={t} locale="en" fetchImpl={fetchImpl as unknown as typeof fetch} />)
    const section = await screen.findByTestId('launch-phase')
    expect(within(section).getByText('Phase 1: Owner Acceptance Testing')).toBeTruthy()
    for (const id of ['invited_customers', 'public_submissions', 'search_indexing'])
      expect(within(screen.getByTestId(`launch-switch-${id}`)).getByText('Off')).toBeTruthy()
    expect(within(section).getByText(/This is not production/)).toBeTruthy()
    fireEvent.click(within(section).getByRole('button', { name: 'Approve Invited customers' }))
    const dialog = await screen.findByTestId('launch-dialog')
    const confirm = screen.getByRole('button', { name: 'Record and change the phase' })
    fireEvent.click(confirm)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    fireEvent.change(within(dialog).getByLabelText('Your approval, in your own words'), {
      target: { value: 'Synthetic approval' },
    })
    fireEvent.change(within(dialog).getByLabelText('Type APPROVE PHASE 2 to confirm'), {
      target: { value: 'APPROVE PHASE 2' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Record and change the phase' }))
    await waitFor(() => expect(screen.getByText('Launch phase changed and recorded.')).toBeTruthy())
    const [url, init] = fetchImpl.mock.calls[1] as [string, RequestInit]
    expect(url).toBe('/api/v1/staff/launch/phase')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(String(init.body))).toEqual({
      phase: 'invited_customers',
      confirmation: 'APPROVE PHASE 2',
      reason: 'Synthetic approval',
    })
    expect((init.headers as Record<string, string>)['if-match']).toBe('"1"')
    expect(screen.getByText('Phase 2: Invited customers')).toBeTruthy()
    expect(within(screen.getByTestId('launch-switch-invited_customers')).getByText('On')).toBeTruthy()
  })

  it('is hidden when the server refuses it (not the Owner)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(403, { error: { code: 'FORBIDDEN', fieldErrors: [] } }))
    const { t } = staffTranslator('en')
    const { container } = render(
      <LaunchPhaseSetting t={t} locale="en" fetchImpl={fetchImpl as unknown as typeof fetch} />,
    )
    await waitFor(() => expect(fetchImpl).toHaveBeenCalled())
    await waitFor(() => expect(container.textContent).toBe(''))
  })

  it('[HH-LANG-02] reads in Spanish for staff', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, PHASE1))
    const { t } = staffTranslator('es')
    render(<LaunchPhaseSetting t={t} locale="es" fetchImpl={fetchImpl as unknown as typeof fetch} />)
    expect(await screen.findByText('Fase 1: Pruebas de aceptación del Propietario')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Aprobar Clientes invitados' })).toBeTruthy()
  })
})
