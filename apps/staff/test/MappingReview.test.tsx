// The table-to-retention mapping review in the staff app (TSK-0152; OWN-DEC-201 I5, HH-PRIV-01, HH-PRIV-05). The API is a
// synthetic stand-in (RULE-SYNTHETIC-DATA): the digest, tables and names are test inputs.
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MappingReview, type MappingStatus } from '../src/MappingReview'

afterEach(cleanup)

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const t = staffTranslator('en').t
const DIGEST = 'a'.repeat(64)

const status = (over: Partial<MappingStatus> = {}): MappingStatus => ({
  digest: DIGEST,
  tables: 3,
  environment: 'production',
  productionDeletion: 'disabled',
  latest: null,
  current: false,
  findings: [
    { finding: 'no_scheduled_period', tables: 1 },
    { finding: 'provisional_period', tables: 2 },
  ],
  categories: [{ category: 'audit_log', status: 'decided', scan: 'scanned', tables: ['platform.audit_events'] }],
  live: { unannotated: ['public.synthetic_table'], missing: [] },
  ...over,
})

describe('table-to-retention mapping review (TSK-0152, OWN-DEC-201 I5)', () => {
  it('[HH-PRIV-01][OWN-DEC-201] shows deletion disabled, the findings and the live audit; records a review once', async () => {
    const reviewed = status({
      productionDeletion: 'enabled',
      current: true,
      latest: {
        id: 'r1',
        digest: DIGEST,
        tables: 3,
        cpaConfirmed: true,
        attorneyConfirmed: true,
        note: 'Synthetic review',
        recordedBy: { id: 'o1', name: 'Synthetic Owner' },
        recordedAt: '2026-10-26T15:00:00.000Z',
      },
    })
    let current = status()
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/staff/retention-mapping/reviews')) {
        current = reviewed
        return json(200, reviewed.latest)
      }
      if (url.endsWith('/staff/retention-mapping') && (init?.method ?? 'GET') === 'GET') return json(200, current)
      return json(404, { error: { code: 'NOT_FOUND', fieldErrors: [] } })
    })
    render(<MappingReview t={t} locale="en" fetchImpl={fetchImpl as unknown as typeof fetch} />)
    const box = await screen.findByTestId('mapping-review')
    expect(within(box).getByText('Production deletion disabled')).toBeTruthy()
    expect(within(box).getByText('Not reviewed yet')).toBeTruthy()
    expect(within(box).getByText('Not in the inventory: public.synthetic_table')).toBeTruthy()
    expect(within(box).getByText('A provisional period not yet confirmed: 2 tables')).toBeTruthy()
    const submit = within(box).getByRole('button', { name: /^Record the review/ }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    fireEvent.click(within(box).getByLabelText('The CPA confirmed this mapping'))
    fireEvent.click(within(box).getByLabelText('The attorney confirmed this mapping'))
    fireEvent.change(within(box).getByLabelText('Note (required)'), { target: { value: 'Synthetic review' } })
    fireEvent.click(within(box).getByRole('button', { name: 'Record the review' }))
    expect(await within(box).findByText('Production deletion enabled')).toBeTruthy()
    const sent = fetchImpl.mock.calls.filter((c) => String(c[0]).endsWith('/reviews'))
    expect(sent).toHaveLength(1)
    expect(JSON.parse(String((sent[0]?.[1] as RequestInit).body))).toEqual({
      digest: DIGEST,
      cpaConfirmed: true,
      attorneyConfirmed: true,
      note: 'Synthetic review',
    })
  })

  it('[HH-PRIV-01] a changed mapping is refused and labelled', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('/reviews')
        ? json(409, { error: { code: 'CONFLICT', fieldErrors: [{ field: 'body.digest', code: 'STALE_MAPPING' }] } })
        : json(200, status()),
    )
    render(<MappingReview t={t} locale="en" fetchImpl={fetchImpl as unknown as typeof fetch} />)
    const box = await screen.findByTestId('mapping-review')
    fireEvent.change(within(box).getByLabelText('Note (required)'), { target: { value: 'Synthetic' } })
    fireEvent.click(within(box).getByRole('button', { name: 'Record the review' }))
    expect(await within(box).findByText(/^The mapping changed since this page was loaded/)).toBeTruthy()
  })

  it('[HH-LANG-02] the section is translated into Spanish', async () => {
    const es = staffTranslator('es').t
    render(
      <MappingReview
        t={es}
        locale="es"
        fetchImpl={vi.fn(async () => json(200, status())) as unknown as typeof fetch}
      />,
    )
    expect(await screen.findByText('Eliminación en producción desactivada')).toBeTruthy()
  })
})
