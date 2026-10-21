// Capacity in the staff app (TSK-0062; HH-SCH-03, HH-SCH-04, T38, T39, OWN-DEC-123). The API is a synthetic stand-in
// (RULE-SYNTHETIC-DATA): names, hours and items are test inputs, not business facts. Times are read in the business
// zone, whatever this machine's zone is.
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AvailabilityScreen, ConfirmVisit, type Availability, type CapacityDay } from '../src/Capacity'
import { ProjectVisitsSection, type ProjectVisits, type Visit } from '../src/Visits'

afterEach(cleanup)

const ZONE = 'America/Kentucky/Louisville'
const VISIT = '44444444-4444-4444-8444-444444444444'
const ANN = '11111111-1111-4111-8111-111111111111'
const BEN = '22222222-2222-4222-8222-222222222222'
const LADDER = '66666666-6666-4666-8666-666666666666'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const day = (over: Partial<CapacityDay> = {}): CapacityDay => ({
  date: '2026-11-04',
  timeZone: ZONE,
  timeZoneProposed: true,
  visitHours: { open: '08:00', close: '22:00', periods: [] },
  workers: [
    {
      id: ANN,
      name: 'Synthetic Ann',
      roles: ['worker'],
      eligibleFor: { estimateVisits: true, workVisits: true },
      scheduleVersion: 1,
      working: [{ startsAt: '2026-11-04T13:00:00.000Z', endsAt: '2026-11-04T23:00:00.000Z' }],
      timeOff: [],
      reservations: [],
      free: [{ startsAt: '2026-11-04T13:00:00.000Z', endsAt: '2026-11-04T23:00:00.000Z' }],
    },
    {
      id: BEN,
      name: 'Synthetic Ben',
      roles: ['worker'],
      eligibleFor: { estimateVisits: true, workVisits: true },
      scheduleVersion: null,
      working: [],
      timeOff: [],
      reservations: [],
      free: [],
    },
  ],
  equipment: [{ id: LADDER, name: 'Synthetic ladder', reservations: [], free: [] }],
  ...over,
})

const tentative = {
  id: VISIT,
  purpose: 'site_estimate',
  version: 3,
  window: { localDate: '2026-11-04', timeZone: ZONE },
  requiredWorkers: 1,
  equipment: ['Ladder'],
}

function renderConfirm(fetchImpl: ReturnType<typeof vi.fn>, onConfirmed = vi.fn(), locale: 'en' | 'es' = 'en') {
  const { t } = staffTranslator(locale)
  render(
    <ConfirmVisit
      t={t}
      locale={locale}
      fetchImpl={fetchImpl as unknown as typeof fetch}
      visit={tentative}
      onConfirmed={onConfirmed}
    />,
  )
  return onConfirmed
}

describe('[HH-SCH-04][T38] confirming a visit with its workers and items', () => {
  it('[HH-SCH-03][T38] shows who is free that day, sends the chosen team with the version shown, then hands back the visits', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, ...(init ? { init } : {}) })
      if (url.startsWith('/api/v1/staff/capacity')) return json(200, day())
      return json(200, { visits: [] })
    })
    const onConfirmed = renderConfirm(fetchImpl)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm with workers' }))
    const form = await screen.findByTestId('confirm-visit')
    await within(form).findByText(/Synthetic Ann/)
    expect(calls[0]?.url).toBe('/api/v1/staff/capacity?date=2026-11-04')
    expect(form.textContent).toContain('free 8:00 AM EST – 6:00 PM EST')
    expect(form.textContent).toContain('no working hours set')
    fireEvent.click(within(form).getByLabelText(/Synthetic Ann/))
    expect(form.textContent).toContain('Synthetic Ann (lead)')
    fireEvent.click(within(form).getByLabelText(/Synthetic ladder/))
    fireEvent.click(within(form).getByRole('button', { name: 'Reserve and confirm' }))
    await waitFor(() => expect(onConfirmed).toHaveBeenCalled())
    const post = calls.find((c) => c.url.endsWith('/confirm'))
    expect(post?.url).toBe(`/api/v1/staff/visits/${VISIT}/confirm`)
    expect(JSON.parse(String(post?.init?.body))).toEqual({ workerIds: [ANN], equipmentIds: [LADDER] })
    const headers = post?.init?.headers as Record<string, string>
    expect(headers['if-match']).toBe('"3"')
    expect(headers['idempotency-key']).toBeTruthy()
  })

  it('[T38][HH-SCH-04] a conflict names each problem with its person and lists the alternatives; nothing was saved', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.startsWith('/api/v1/staff/capacity')) return json(200, day())
      return json(409, {
        error: {
          code: 'CONFLICT',
          message: '',
          requestId: 'r',
          retryable: false,
          fieldErrors: [{ field: `workers.${ANN}`, code: 'WORKER_BOOKED', message: '' }],
          alternatives: {
            workers: [{ id: BEN, name: 'Synthetic Ben' }],
            equipment: [],
            periods: [{ startsAt: '2026-11-04T17:00:00.000Z', endsAt: '2026-11-04T21:00:00.000Z' }],
          },
        },
      })
    })
    const onConfirmed = renderConfirm(fetchImpl)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm with workers' }))
    const form = await screen.findByTestId('confirm-visit')
    fireEvent.click(await within(form).findByLabelText(/Synthetic Ann/))
    fireEvent.click(within(form).getByRole('button', { name: 'Reserve and confirm' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('The visit was not confirmed. Nothing was saved.')
    expect(alert.textContent).toContain('Synthetic Ann: Already booked or held for another visit at that time.')
    expect(within(alert).getByTestId('capacity-alternatives').textContent).toContain(
      'Free workers for the same time: Synthetic Ben',
    )
    expect(within(alert).getByTestId('capacity-alt-periods').textContent).toContain('12:00 PM EST – 4:00 PM EST')
    expect(onConfirmed).not.toHaveBeenCalled()
  })

  it('[HH-LANG-02] the confirmation reads in Spanish', async () => {
    renderConfirm(
      vi.fn(async () => json(200, day())),
      vi.fn(),
      'es',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar con trabajadores' }))
    const form = await screen.findByTestId('confirm-visit')
    await within(form).findByText(/Synthetic Ann/)
    expect(form.textContent).toContain('sin horario de trabajo')
    expect(within(form).getByRole('button', { name: 'Reservar y confirmar' })).toBeTruthy()
  })
})

describe('[HH-SCH-03][T39] reservations on the visit', () => {
  it('[T39][OWN-DEC-123] lists the team with the lead, flags for review and the earlier reservations', async () => {
    const base: Visit = {
      id: VISIT,
      purpose: 'service',
      state: 'confirmed',
      version: 4,
      jobId: '55555555-5555-4555-8555-555555555555',
      window: {
        localDate: '2026-11-04',
        start: '09:00',
        end: '10:00',
        timeZone: ZONE,
        startOffset: '-05:00',
        endOffset: '-05:00',
        startsAt: '2026-11-04T14:00:00.000Z',
        endsAt: '2026-11-04T15:00:00.000Z',
        withinVisitHours: true,
      },
      windowVersion: 1,
      expectedDurationMinutes: 120,
      preparationBufferMinutes: null,
      travelBufferMinutes: 30,
      requiredWorkers: 2,
      equipment: [],
      reservedRange: { startsAt: '2026-11-04T13:30:00.000Z', endsAt: '2026-11-04T17:00:00.000Z' },
      assignments: [ANN, BEN].map((id, i) => ({
        id: `r-${i}`,
        resource: 'worker',
        worker: { id, name: i === 0 ? 'Synthetic Ann' : 'Synthetic Ben' },
        equipment: null,
        role: i === 0 ? 'lead' : 'member',
        kind: 'confirmed',
        startsAt: '2026-11-04T13:30:00.000Z',
        endsAt: '2026-11-04T17:00:00.000Z',
        holdExpiresAt: null,
        endedAt: null,
        endedReason: null,
        flags: i === 1 ? ['time_off_recorded'] : [],
      })),
      createdBy: { id: 'staff-1', name: 'Synthetic Office' },
      createdAt: '2026-10-21T15:00:00.000Z',
      history: [],
      actions: { changeWindow: true, confirm: false },
    }
    const ended = {
      ...(base.assignments?.[0] as NonNullable<Visit['assignments']>[number]),
      id: 'r-old',
      startsAt: '2026-11-03T13:30:00.000Z',
      endsAt: '2026-11-03T17:00:00.000Z',
      endedAt: '2026-10-21T16:00:00.000Z',
      endedReason: 'rescheduled',
    }
    const data: ProjectVisits = {
      projectId: '33333333-3333-4333-8333-333333333333',
      projectState: 'approved',
      timeZone: ZONE,
      businessTimeZone: { zone: ZONE, proposed: true },
      visitHours: { open: '08:00', close: '22:00' },
      job: { id: '55555555-5555-4555-8555-555555555555', scopeVersion: 1 },
      schedulingTask: { state: 'fulfilled' },
      actions: { planEstimateVisit: false, planWorkVisit: true },
      visits: [{ ...base, assignments: [...(base.assignments ?? []), ended] }],
    }
    const { t } = staffTranslator('en')
    render(
      <ProjectVisitsSection
        t={t}
        locale="en"
        fetchImpl={vi.fn(async () => json(200, data)) as unknown as typeof fetch}
        projectId={data.projectId}
      />,
    )
    const list = await screen.findByTestId('visit-assignments')
    expect(list.textContent).toContain('Synthetic Ann (lead), confirmed, 8:30 AM EST – 12:00 PM EST')
    expect(list.textContent).toContain('Synthetic Ben (team), confirmed')
    expect(within(list).getByText('Review: time off recorded')).toBeTruthy()
    expect(screen.getByTestId('visit-assignments-ended').textContent).toContain('(rescheduled)')
    expect(screen.getByTestId('visit-reserved-range').textContent).toContain('8:30 AM EST – 12:00 PM EST')
    expect(screen.queryByRole('button', { name: 'Confirm with workers' })).toBeNull()
  })
})

const availability = (over: Partial<Availability> = {}): Availability => ({
  businessTimeZone: { zone: ZONE, proposed: true },
  workers: [
    {
      id: ANN,
      name: 'Synthetic Ann',
      status: 'active',
      roles: ['worker'],
      eligibleFor: { estimateVisits: true, workVisits: true },
      schedule: null,
      timeOff: [],
    },
  ],
  equipment: [],
  ...over,
})

describe('[HH-SCH-03][OWN-DEC-123] the Staff screen: working hours, time off and equipment', () => {
  it('[HH-SCH-03] a person without hours says so; saving hours sends the version shown and reports flagged visits', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const after = availability({
      workers: [
        {
          ...(availability().workers[0] as Availability['workers'][number]),
          schedule: {
            version: 1,
            timeZone: ZONE,
            setAt: '2026-10-21T15:00:00.000Z',
            reason: null,
            periods: [{ weekday: 1, start: '08:00', end: '16:00' }],
          },
        },
      ],
    })
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, ...(init ? { init } : {}) })
      if (init?.method === 'PUT') return json(200, { flagged: 2, availability: after })
      return json(200, availability())
    })
    const { t } = staffTranslator('en')
    render(<AvailabilityScreen t={t} locale="en" fetchImpl={fetchImpl as unknown as typeof fetch} />)
    const card = await screen.findByTestId('availability-worker')
    expect(within(card).getByTestId('availability-hours').textContent).toBe(
      'Working hours not set: not reserved for any visit.',
    )
    const monday = within(card).getByRole('group', { name: 'Monday' })
    fireEvent.click(within(monday).getByLabelText('Works this day'))
    fireEvent.change(within(monday).getByLabelText(/^From/), { target: { value: '08:00' } })
    fireEvent.change(within(monday).getByLabelText(/^Until/), { target: { value: '16:00' } })
    fireEvent.click(within(card).getByRole('button', { name: 'Save working hours' }))
    await waitFor(() =>
      expect(screen.getByTestId('availability-hours').textContent).toBe(
        'Version 1: Monday 08:00–16:00 (America/Kentucky/Louisville)',
      ),
    )
    const put = calls.find((c) => c.init?.method === 'PUT')
    expect(put?.url).toBe(`/api/v1/staff/workers/${ANN}/working-hours`)
    expect(JSON.parse(String(put?.init?.body))).toEqual({ periods: [{ weekday: 1, start: '08:00', end: '16:00' }] })
    expect((put?.init?.headers as Record<string, string>)['if-match']).toBe('"0"')
  })

  it('[HH-SCH-03] equipment is registered by name; a refusal is written out', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST')
        return json(409, {
          error: {
            code: 'CONFLICT',
            message: '',
            requestId: 'r',
            retryable: false,
            fieldErrors: [{ field: 'body.name', code: 'EQUIPMENT_NAME_TAKEN', message: '' }],
          },
        })
      return json(
        200,
        availability({ equipment: [{ id: LADDER, name: 'Synthetic ladder', createdAt: '2026-10-21T15:00:00.000Z' }] }),
      )
    })
    const { t } = staffTranslator('es')
    render(<AvailabilityScreen t={t} locale="es" fetchImpl={fetchImpl as unknown as typeof fetch} />)
    const section = await screen.findByTestId('equipment')
    expect(section.textContent).toContain('Synthetic ladder')
    fireEvent.change(within(section).getByLabelText(/Nombre del artículo/), { target: { value: 'synthetic LADDER' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Registrar artículo' }))
    expect((await within(section).findByRole('alert')).textContent).toContain(
      'Ya hay un artículo activo con este nombre.',
    )
  })
})
