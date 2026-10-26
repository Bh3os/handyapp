// The repeat-service schedule in the project workspace (TSK-0114; HH-SCH-10, HH-ID-12, OWN-DEC-113, OWN-DEC-148).
// The API is a synthetic stand-in; every reference and date is invented for the test (RULE-SYNTHETIC-DATA).
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { parseRepeatService, type Fetch, type RepeatService } from '../src/api'
import { RepeatServiceSection } from '../src/RepeatService'

afterEach(cleanup)

const REF = 'HH-7K2M9Q4D'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const active: RepeatService = {
  reference: REF,
  schedule: {
    state: 'active',
    nextDates: [
      { date: '2031-03-04', requested: false },
      { date: '2031-03-18', requested: true },
    ],
    interval: { unit: 'week', count: 2 },
    reminders: true,
    changeNoticeHours: 24,
    stoppedAt: null,
  },
}

describe('[HH-SCH-10][OWN-DEC-113] the customer’s repeat-service schedule', () => {
  it('shows nothing without a schedule', async () => {
    let read = false
    const f: Fetch = async () => ((read = true), json(200, { reference: REF, schedule: null }))
    const { container } = render(<RepeatServiceSection reference={REF} fetchImpl={f} />)
    await waitFor(() => expect(read).toBe(true))
    expect(container.textContent).toBe('')
  })

  it('[OWN-DEC-148] shows the dates in the property’s zone, stops reminders and changes the schedule', async () => {
    const posts: [string, unknown, string | null][] = []
    let state = active
    const f: Fetch = async (input, init) => {
      if (init?.method !== 'POST') return json(200, state)
      const body = JSON.parse(String(init.body)) as Record<string, unknown>
      posts.push([String(input), body, new Headers(init.headers).get('idempotency-key')])
      if (String(input).endsWith('/change'))
        return json(400, {
          error: { code: 'VALIDATION_FAILED', fieldErrors: [{ field: 'body.nextDate', code: 'WITHIN_CHANGE_NOTICE' }] },
        })
      state = {
        ...active,
        schedule: { ...(active.schedule as NonNullable<RepeatService['schedule']>), reminders: false },
      }
      return json(200, state)
    }
    render(<RepeatServiceSection reference={REF} fetchImpl={f} />)
    const section = await screen.findByTestId('portal-repeat-service')
    expect(within(section).getByRole('heading', { name: 'Repeat service' })).toBeTruthy()
    expect(section.textContent).toMatch(/Every 2 weeks/)
    expect(
      within(section)
        .getAllByRole('listitem')
        .map((l) => l.textContent),
    ).toEqual(['March 4, 2031', 'March 18, 2031 — requested'])
    expect(section.textContent).toMatch(/Changes apply to dates more than 24 hours away\./)
    fireEvent.click(within(section).getByRole('button', { name: 'Stop Reminders' }))
    expect(await within(section).findByText('Reminders are off. Your schedule stays as it is.')).toBeTruthy()
    expect(within(section).getByRole('button', { name: 'Turn Reminders Back On' })).toBeTruthy()

    fireEvent.click(within(section).getByRole('button', { name: 'Change the Schedule' }))
    const form = within(section).getByRole('form', { name: 'Change the Schedule' })
    expect((within(form).getByLabelText(/Next service date/) as HTMLInputElement).value).toBe('2031-03-04')
    fireEvent.change(within(form).getByLabelText('How often'), { target: { value: 'none' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save the Change' }))
    expect((await within(section).findByRole('alert')).textContent).toBe(
      'The next date must be more than 24 hours away.',
    )
    expect(posts.map(([url, body]) => [url, body])).toEqual([
      [`/api/v1/customer/projects/${REF}/repeat-service/reminders`, { on: false }],
      [`/api/v1/customer/projects/${REF}/repeat-service/change`, { nextDate: '2031-03-04', interval: null }],
    ])
    expect(posts.every(([, , key]) => key !== null)).toBe(true)
  })

  it('asks before stopping the schedule; a stopped schedule says so', async () => {
    const posts: string[] = []
    const stopped: RepeatService = {
      reference: REF,
      schedule: {
        state: 'stopped',
        nextDates: [],
        interval: { unit: 'month', count: 1 },
        reminders: true,
        changeNoticeHours: 24,
        stoppedAt: '2031-03-01T15:00:00.000Z',
      },
    }
    const f: Fetch = async (input, init) => {
      if (init?.method !== 'POST') return json(200, active)
      posts.push(String(input))
      return json(200, stopped)
    }
    render(<RepeatServiceSection reference={REF} fetchImpl={f} />)
    const section = await screen.findByTestId('portal-repeat-service')
    fireEvent.click(within(section).getByRole('button', { name: 'Stop the Schedule' }))
    expect(posts).toEqual([])
    fireEvent.click(within(section).getByRole('button', { name: 'Yes, Stop It' }))
    expect(await within(section).findByText('Your schedule is stopped.')).toBeTruthy()
    expect(section.textContent).toMatch(/This repeat-service schedule was stopped on March 1, 2031/)
    expect(posts).toEqual([`/api/v1/customer/projects/${REF}/repeat-service/stop`])
  })

  it('parses only the declared shape', () => {
    expect(parseRepeatService(active)).toEqual(active)
    expect(
      parseRepeatService({ reference: REF, schedule: { ...active.schedule, interval: { unit: 'year', count: 1 } } }),
    ).toBeNull()
  })
})
