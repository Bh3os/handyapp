// Visit outcomes on the staff app (TSK-0078; HH-SCH-09, HH-WORK-03). The API is a synthetic stand-in; every name and
// note is synthetic (RULE-SYNTHETIC-DATA).
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Fetch } from '../src/api'
import { VisitOutcomeForm, VisitOutcomePage } from '../src/VisitOutcomes'

afterEach(cleanup)

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const VISIT = '55555555-5555-4555-8555-555555555578'
const OUTCOME = '66666666-6666-4666-8666-666666666678'

describe('VisitOutcomeForm (TSK-0078)', () => {
  it('[HH-SCH-09] the worker chooses what happened, sees what it does, writes a note and records it once', async () => {
    const posts: { url: string; body: unknown; key: string | null }[] = []
    let recorded: unknown = undefined
    const fetchImpl: Fetch = async (input, init) => {
      posts.push({
        url: String(input),
        body: JSON.parse(String(init?.body)),
        key: new Headers(init?.headers).get('idempotency-key'),
      })
      return json(201, { outcomeId: OUTCOME, visitId: VISIT, kind: 'no_access', visitState: 'no_access', visit: null })
    }
    render(
      <VisitOutcomeForm
        t={staffTranslator('en').t}
        fetchImpl={fetchImpl}
        visitId={VISIT}
        outcomes={[{ outcomeId: 'o-0', kind: 'delay', recordedAt: '2026-10-23T13:00:00.000Z', followedUp: false }]}
        onRecorded={(v) => (recorded = v)}
      />,
    )
    const form = screen.getByTestId('visit-outcome')
    expect(within(form).getByTestId('visit-outcome-list').textContent).toBe('Delay · follow-up open')
    fireEvent.click(within(form).getByRole('button', { name: 'Record the outcome' }))
    expect(posts).toEqual([])
    fireEvent.click(within(form).getByLabelText('No access'))
    expect(within(form).getByText(/The visit ends as "no access"\. Work is not done/)).toBeTruthy()
    fireEvent.change(within(form).getByLabelText(/What you saw/), {
      target: { value: ' Synthetic: gate locked ' },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Record the outcome' }))
    await waitFor(() => expect(within(form).getByTestId('visit-outcome-recorded')).toBeTruthy())
    expect(posts).toEqual([
      {
        url: `/api/v1/staff/visits/${VISIT}/outcomes`,
        body: { kind: 'no_access', note: 'Synthetic: gate locked' },
        key: expect.any(String),
      },
    ])
    expect(recorded).toBeNull()
  })

  it('[HH-SCH-09][HH-WORK-03] customer absent says work does not start; a refusal says why, in Spanish', async () => {
    const fetchImpl: Fetch = async () =>
      json(409, {
        error: {
          code: 'CONFLICT',
          message: '',
          fieldErrors: [{ field: 'visit', code: 'WORK_STARTED', message: '' }],
        },
      })
    render(
      <VisitOutcomeForm
        t={staffTranslator('es').t}
        fetchImpl={fetchImpl}
        visitId={VISIT}
        outcomes={[]}
        onRecorded={() => undefined}
      />,
    )
    const form = screen.getByTestId('visit-outcome')
    fireEvent.click(within(form).getByLabelText('Cliente no presente'))
    expect(within(form).getByText(/El trabajo no empieza a menos que el cliente esté presente/)).toBeTruthy()
    fireEvent.change(within(form).getByLabelText(/Lo que vio/), { target: { value: 'Sintético' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Registrar el resultado' }))
    expect((await within(form).findByRole('alert')).textContent).toBe(
      'El trabajo ya empezó en esta visita. Use Informar un problema o Detener el trabajo.',
    )
  })
})

describe('VisitOutcomePage (TSK-0078)', () => {
  it('[HH-SCH-09] the office reads the outcome and records the follow-up once', async () => {
    const view = {
      outcomeId: OUTCOME,
      visitId: VISIT,
      reference: 'HH-SYNTH078',
      kind: 'weather',
      note: 'Synthetic: storm',
      visitState: 'confirmed',
      visitNow: 'confirmed',
      localDate: '2026-10-23',
      recordedBy: { id: 'w-1', name: 'Synthetic Worker' },
      recordedAt: '2026-10-23T13:00:00.000Z',
      followUp: null,
      actions: { followUp: true },
    }
    const posts: unknown[] = []
    const fetchImpl: Fetch = async (input, init) => {
      if (init?.method === 'POST') {
        posts.push(JSON.parse(String(init.body)))
        return json(200, {
          ...view,
          followUp: { by: { id: 'o-1', name: 'Synthetic Office' }, at: '2026-10-23T14:00:00.000Z', note: 'Moved' },
          actions: { followUp: false },
        })
      }
      expect(String(input)).toBe(`/api/v1/staff/visit-outcomes/${OUTCOME}`)
      return json(200, view)
    }
    render(<VisitOutcomePage t={staffTranslator('en').t} fetchImpl={fetchImpl} outcomeId={OUTCOME} />)
    const page = await screen.findByTestId('visit-outcome-page')
    expect(within(page).getByRole('heading').textContent).toBe('Weather · HH-SYNTH078')
    expect(within(page).getByText('Synthetic: storm')).toBeTruthy()
    fireEvent.change(within(page).getByLabelText(/What was done/), { target: { value: 'Moved' } })
    fireEvent.click(within(page).getByRole('button', { name: 'Record the follow-up' }))
    expect(await within(page).findByTestId('visit-outcome-follow-up')).toBeTruthy()
    expect(posts).toEqual([{ note: 'Moved' }])
    expect(within(page).queryByRole('button', { name: 'Record the follow-up' })).toBeNull()
  })
})
