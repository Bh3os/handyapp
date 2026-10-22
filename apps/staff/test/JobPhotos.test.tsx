// A job's field photos (TSK-0076; HH-QA-05, HH-PORT-11, HH-PRIV-02, HH-DATA-07, RULE-LANGUAGES). The API is a
// synthetic stand-in; every name, label and reference is synthetic (RULE-SYNTHETIC-DATA).
import { staffTranslator, type StaffLocale } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JobPhotosPage, type FieldPhotoView, type JobPhotosView } from '../src/JobPhotos'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const JOB = '22222222-2222-4222-8222-222222222276'
const WP = '33333333-3333-4333-8333-333333333376'
const VISIT = '11111111-1111-4111-8111-111111111176'
const BEFORE = '44444444-4444-4444-8444-444444444476'
const AFTER = '55555555-5555-4555-8555-555555555576'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function photo(over: Partial<FieldPhotoView>): FieldPhotoView {
  return {
    id: BEFORE,
    workPackageId: WP,
    visitId: VISIT,
    visitNumber: 1,
    phase: 'before',
    areaLabel: null,
    pairOf: null,
    state: 'ready',
    rejectionReason: null,
    visibility: 'internal_operational',
    version: 2,
    uploadedAt: '2026-10-22T14:00:00.000Z',
    uploadedBy: { id: 'w', name: 'Synthetic Worker' },
    sharedAt: null,
    url: 'https://fake-r2.invalid/jobs/before-photos/x?sig=1',
    publication: [],
    actions: { share: true, stopSharing: false, recordPublication: false },
    ...over,
  }
}
function view(over: Partial<JobPhotosView> = {}): JobPhotosView {
  return {
    jobId: JOB,
    projectReference: 'HH-SYNTH-76',
    workPackages: [{ workPackageId: WP, serviceCode: 'DW-01' }],
    photos: [
      photo({}),
      photo({
        id: AFTER,
        phase: 'after',
        pairOf: BEFORE,
        areaLabel: 'Synthetic: hallway',
        visibility: 'customer_shared',
        sharedAt: '2026-10-22T15:00:00.000Z',
        actions: { share: false, stopSharing: true, recordPublication: true },
      }),
    ],
    uploadVisits: [],
    publicationNotice: null,
    ...over,
  }
}
function mount(locale: StaffLocale, fetchImpl: typeof fetch) {
  return render(<JobPhotosPage t={staffTranslator(locale).t} locale={locale} fetchImpl={fetchImpl} jobId={JOB} />)
}

describe('job photos (TSK-0076)', () => {
  it('[HH-PRIV-02][HH-QA-05] lists before and after photos with pair, sharing state and actions; sharing sends the version seen', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, ...(init ? { init } : {}) })
      if (init?.method === 'POST') return json(200, { photoId: BEFORE, shared: true, version: 3 })
      return json(200, view())
    }) as unknown as typeof fetch
    mount('en', fetchImpl)
    await screen.findByRole('heading', { level: 1, name: 'Job photos — HH-SYNTH-76' })
    const items = screen.getAllByTestId('field-photo')
    expect(items).toHaveLength(2)
    expect(within(items[0] as HTMLElement).getByText('Before photo 1')).toBeTruthy()
    expect(within(items[1] as HTMLElement).getByText('Pairs with before photo 1')).toBeTruthy()
    expect(
      within(items[1] as HTMLElement)
        .getByRole('img')
        .getAttribute('alt'),
    ).toBe('After photo 1 — Synthetic: hallway')
    expect(within(items[1] as HTMLElement).getByRole('button', { name: 'Stop sharing' })).toBeTruthy()
    expect(within(items[0] as HTMLElement).getByTestId('field-photo-publication').textContent).toBe(
      'Marketing use: no permission recorded.',
    )
    // The publication notice is NOT CONFIGURED: the Owner is told, and no form is offered.
    expect(
      within(items[1] as HTMLElement).getByText(
        'Marketing permission cannot be recorded yet: the photo publication notice is not configured.',
      ),
    ).toBeTruthy()
    fireEvent.click(within(items[0] as HTMLElement).getByRole('button', { name: 'Share with the customer' }))
    await waitFor(() => expect(calls.some((c) => c.init?.method === 'POST')).toBe(true))
    const post = calls.find((c) => c.init?.method === 'POST')
    expect(post?.url).toBe(`/api/v1/staff/field-photos/${BEFORE}/actions/share`)
    expect((post?.init?.headers as Record<string, string>)['if-match']).toBe('"2"')
  })

  it('[HH-PRIV-02] the Owner records a publication permission with evidence under the configured notice', async () => {
    const posts: unknown[] = []
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push(JSON.parse(String(init.body)))
        return json(201, { granted: true })
      }
      return json(200, view({ publicationNotice: 'photo-publication-notice-test-1' }))
    }) as unknown as typeof fetch
    mount('en', fetchImpl)
    const form = await screen.findByRole('form', { name: 'Record the customer’s permission to publish on the website' })
    fireEvent.change(within(form).getByLabelText(/Where the evidence is kept/), {
      target: { value: 'Synthetic: signed form in the office file' },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Record permission' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toEqual({
      purpose: 'marketing',
      channel: 'website',
      granted: true,
      noticeVersion: 'photo-publication-notice-test-1',
      evidenceKind: 'signed_form',
      evidenceReference: 'Synthetic: signed form in the office file',
    })
  })

  it('[RULE-LANGUAGES] Spanish staff see the page in Spanish; after photos wait for Start Work', async () => {
    const fetchImpl = vi.fn(async () =>
      json(200, view({ uploadVisits: [{ visitId: VISIT, visitNumber: 1, after: false }] })),
    ) as unknown as typeof fetch
    mount('es', fetchImpl)
    await screen.findByRole('heading', { level: 1, name: 'Fotos del trabajo — HH-SYNTH-76' })
    expect(screen.getByText('Las fotos de después se habilitan cuando inicia el trabajo en esta visita.')).toBeTruthy()
    const after = screen.getByLabelText('Después') as HTMLInputElement
    expect(after.disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Compartir con el cliente' })).toBeTruthy()
  })

  it('shows an error state when the server refuses the read', async () => {
    const fetchImpl = vi.fn(async () =>
      json(403, { error: { code: 'FORBIDDEN', fieldErrors: [] } }),
    ) as unknown as typeof fetch
    mount('en', fetchImpl)
    await screen.findByText('The job photos could not be shown.')
  })
})
