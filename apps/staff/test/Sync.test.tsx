// The sync queue on the phone (TSK-0080; HH-OFF-05, HH-OFF-06, HH-OFF-07, T27, T51, T52). The API is a synthetic
// stand-in and the store is the memory store; every id and name is synthetic (RULE-SYNTHETIC-DATA).
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Fetch } from '../src/api'
import { FieldEventPage } from '../src/FieldEvents'
import { announceUpdate, SignOutWarning, SyncStatus, UpdateBanner } from '../src/offline/SyncStatus'
import { memoryStore, setOfflineStore, type OfflineStore, type StoredDraft } from '../src/offline/store'
import { clientIdOf, DRAFTS_CHANGED, SETTLED_KEEP_MS, syncDrafts } from '../src/offline/sync'

const ME = '11111111-1111-4111-8111-111111111180'
const OTHER = '22222222-2222-4222-8222-222222222280'
const VISIT = '33333333-3333-4333-8333-333333333380'
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa80'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb80'
const t = staffTranslator('en').t

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const draft = (id: string, tap: string, at: string, extra: Partial<StoredDraft> = {}): StoredDraft => ({
  id,
  kind: 'tap',
  staffUserId: ME,
  jobId: 'job-80',
  visitId: VISIT,
  deviceRecordedAt: at,
  payload: { tap },
  state: 'saved_on_phone',
  attempts: 0,
  ...extra,
})
type Sent = { body: Record<string, unknown>; key: string | null }
/** A stand-in server: answers each upload from `answer`, recording what was sent. */
function server(answer: (body: Record<string, unknown>) => Response | 'offline') {
  const sent: Sent[] = []
  const fetchImpl: Fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    const a = answer(body)
    if (a === 'offline') throw new TypeError('Failed to fetch')
    sent.push({ body, key: new Headers(init?.headers).get('idempotency-key') })
    return a
  }
  return { sent, fetchImpl }
}
const answered =
  (state: string, outcome: string, detail: string | null = null) =>
  (b: Record<string, unknown>) =>
    json(200, {
      clientId: b['clientId'],
      state,
      outcome,
      detail,
      visitId: VISIT,
      receivedAt: new Date().toISOString(),
      ingested: true,
    })

let store: OfflineStore
beforeEach(() => {
  store = memoryStore()
  setOfflineStore(store)
})
afterEach(() => {
  cleanup()
  setOfflineStore(null)
})

describe('syncDrafts (TSK-0080)', () => {
  it('[HH-OFF-05][HH-OFF-07] uploads oldest first with the phone’s UUID, then shows Synced or Needs review', async () => {
    await store.putDraft(draft(B, 'arrived', '2026-10-23T14:10:00.000Z'))
    await store.putDraft(draft(A, 'on-my-way', '2026-10-23T14:00:00.000Z'))
    const { sent, fetchImpl } = server((b) =>
      b['type'] === 'tap_on_my_way'
        ? answered('synchronized', 'applied')(b)
        : answered('needs_review', 'conflict', 'VISIT_NOT_ACTIVE')(b),
    )
    let changed = 0
    const on = () => changed++
    window.addEventListener(DRAFTS_CHANGED, on)
    const out = await syncDrafts(store, fetchImpl, ME)
    window.removeEventListener(DRAFTS_CHANGED, on)
    expect(out).toEqual({ synced: 1, review: 1, failed: 0, waiting: 0, signedOut: false })
    expect(changed).toBe(1)
    expect(sent).toEqual([
      {
        body: {
          clientId: A,
          type: 'tap_on_my_way',
          visitId: VISIT,
          deviceRecordedAt: '2026-10-23T14:00:00.000Z',
          attempt: 1,
        },
        key: `${A}-1`,
      },
      {
        body: {
          clientId: B,
          type: 'tap_arrived',
          visitId: VISIT,
          deviceRecordedAt: '2026-10-23T14:10:00.000Z',
          attempt: 1,
        },
        key: `${B}-1`,
      },
    ])
    const after = Object.fromEntries((await store.listDrafts()).map((d) => [d.id, [d.state, d.problem]]))
    expect(after).toEqual({ [A]: ['synced', null], [B]: ['needs_review', 'VISIT_NOT_ACTIVE'] })
  })

  it('[HH-OFF-05][T51] without an answer it stays Pending upload; the retry sends the same UUID, once answered', async () => {
    await store.putDraft(draft(A, 'arrived', '2026-10-23T14:00:00.000Z'))
    await store.putDraft(draft(B, 'finished', '2026-10-23T15:00:00.000Z'))
    const off = server(() => 'offline')
    expect(await syncDrafts(store, off.fetchImpl, ME)).toMatchObject({ synced: 0, waiting: 2 })
    expect((await store.listDrafts()).map((d) => [d.id, d.state, d.attempts])).toEqual([
      [A, 'pending_upload', 1],
      [B, 'saved_on_phone', 0],
    ])
    const on = server(answered('synchronized', 'applied'))
    expect(await syncDrafts(store, on.fetchImpl, ME)).toMatchObject({ synced: 2, waiting: 0 })
    expect(on.sent.map((s) => [s.body['clientId'], s.body['attempt'], s.key])).toEqual([
      [A, 2, `${A}-2`],
      [B, 1, `${B}-1`],
    ])
  })

  it('[HH-OFF-07][T27] a refused upload is Upload failed and kept; an ended session stops and keeps everything', async () => {
    await store.putDraft(draft(A, 'arrived', '2026-10-23T14:00:00.000Z'))
    const refused = server(() =>
      json(409, { error: { code: 'CONFLICT', fieldErrors: [{ field: 'body.clientId', code: 'CLIENT_ID_REUSED' }] } }),
    )
    expect(await syncDrafts(store, refused.fetchImpl, ME)).toMatchObject({ failed: 1 })
    expect(await store.listDrafts()).toMatchObject([{ id: A, state: 'failed', problem: 'CLIENT_ID_REUSED' }])
    await store.putDraft(draft(B, 'finished', '2026-10-23T15:00:00.000Z'))
    const ended = server(() => json(401, { error: { code: 'UNAUTHENTICATED', fieldErrors: [] } }))
    expect(await syncDrafts(store, ended.fetchImpl, ME)).toMatchObject({ signedOut: true, waiting: 2 })
    expect(ended.sent).toHaveLength(1)
    expect((await store.listDrafts()).map((d) => d.id).sort()).toEqual([A, B])
  })

  it('[HH-OFF-06][T27] another account’s drafts are never uploaded as mine; the Owner’s recovery names who recorded them', async () => {
    await store.putDraft(draft(A, 'arrived', '2026-10-23T14:00:00.000Z', { staffUserId: OTHER }))
    const mine = server(answered('synchronized', 'applied'))
    expect(await syncDrafts(store, mine.fetchImpl, ME)).toMatchObject({ synced: 0, waiting: 0 })
    expect(mine.sent).toEqual([])
    const owner = server(answered('needs_review', 'recovered'))
    expect(await syncDrafts(store, owner.fetchImpl, ME, { recover: true })).toMatchObject({ review: 1 })
    expect(owner.sent[0]?.body).toMatchObject({ clientId: A, actorId: OTHER })
  })

  it('[HH-OFF-05] a TSK-0079 draft (its request key, no owner) uploads under the UUID form of its key', async () => {
    const legacy = draft('staff-0123456789abcdef0123456789abcdef', 'on-my-way', '2026-10-23T14:00:00.000Z')
    delete legacy.staffUserId
    expect(clientIdOf(legacy)).toBe('01234567-89ab-cdef-0123-456789abcdef')
    await store.putDraft(legacy)
    const s = server(answered('synchronized', 'applied'))
    await syncDrafts(store, s.fetchImpl, ME)
    expect(s.sent[0]?.body['clientId']).toBe('01234567-89ab-cdef-0123-456789abcdef')
  })

  it('[HH-OFF-07] settled drafts leave the phone 12 hours after the server answered; unsynced ones never do', async () => {
    const now = new Date('2026-10-24T12:00:00.000Z')
    const old = new Date(now.getTime() - SETTLED_KEEP_MS - 1000).toISOString()
    await store.putDraft(draft(A, 'arrived', old, { state: 'synced', settledAt: old }))
    await store.putDraft(draft(B, 'finished', old, { state: 'needs_review', settledAt: now.toISOString() }))
    await store.putDraft(draft('cccccccc-cccc-4ccc-8ccc-cccccccccc80', 'finished', old, { state: 'failed' }))
    await syncDrafts(store, server(() => 'offline').fetchImpl, ME, { now: () => now })
    expect((await store.listDrafts()).map((d) => d.id).sort()).toEqual([B, 'cccccccc-cccc-4ccc-8ccc-cccccccccc80'])
  })
})

describe('the sync bar and the warnings (TSK-0080)', () => {
  it('[HH-OFF-07] the bar says what waits, what needs review and what another account left; the Owner may upload it for review', async () => {
    await store.putDraft(draft(A, 'arrived', '2026-10-23T14:00:00.000Z'))
    await store.putDraft(draft(B, 'finished', '2026-10-23T14:00:00.000Z', { state: 'needs_review' }))
    await store.putDraft(
      draft('cccccccc-cccc-4ccc-8ccc-cccccccccc80', 'arrived', '2026-10-23T14:00:00.000Z', { staffUserId: OTHER }),
    )
    const { fetchImpl } = server(() => 'offline')
    render(<SyncStatus t={t} fetchImpl={fetchImpl} staffUserId={ME} isOwner />)
    const bar = await screen.findByTestId('sync-status')
    await waitFor(() =>
      expect(within(bar).getByTestId('sync-waiting').textContent).toBe(
        'Pending upload 1 item not uploaded yet. Uploads retry by themselves when there is a connection.',
      ),
    )
    expect(within(bar).getByTestId('sync-review').textContent).toContain(
      "1 item kept by the office for the Owner's review",
    )
    expect(within(bar).getByTestId('sync-others').textContent).toContain('Upload them for your review')
    expect(within(bar).getByRole('button', { name: 'Upload for review' })).toBeTruthy()
  })

  it('[T52] sign-out with unsynced work offers to upload first or to sign out and keep it; nothing is erased', async () => {
    await store.putDraft(draft(A, 'arrived', '2026-10-23T14:00:00.000Z'))
    const { sent, fetchImpl } = server(answered('synchronized', 'applied'))
    let signedOut = 0
    render(
      <SignOutWarning
        t={staffTranslator('es').t}
        fetchImpl={fetchImpl}
        staffUserId={ME}
        onSignOut={() => signedOut++}
        onCancel={() => undefined}
      />,
    )
    const w = await screen.findByTestId('signout-warning')
    await waitFor(() => expect(within(w).getByText(/1 elemento no está subido/)).toBeTruthy())
    expect(within(w).getByRole('button', { name: 'Cerrar sesión y guardarlos en este teléfono' })).toBeTruthy()
    fireEvent.click(within(w).getByRole('button', { name: 'Subir ahora' }))
    await waitFor(() => expect(within(w).getByText('Todo está subido.')).toBeTruthy())
    expect(sent).toHaveLength(1)
    expect(signedOut).toBe(0)
    fireEvent.click(within(w).getByRole('button', { name: 'Cerrar sesión' }))
    expect(signedOut).toBe(1)
  })

  it('[T52] an app update waits for the person and warns about unsynced work first', async () => {
    await store.putDraft(draft(A, 'arrived', '2026-10-23T14:00:00.000Z'))
    const posted: unknown[] = []
    const worker = { postMessage: (m: unknown) => posted.push(m) } as unknown as ServiceWorker
    const { fetchImpl } = server(() => 'offline')
    render(<UpdateBanner t={t} fetchImpl={fetchImpl} staffUserId={ME} />)
    expect(screen.queryByTestId('app-update')).toBeNull()
    announceUpdate(worker)
    const banner = await screen.findByTestId('app-update')
    await waitFor(() =>
      expect(within(banner).getByTestId('app-update-unsynced').textContent).toContain('1 item is not uploaded yet'),
    )
    expect(within(banner).getByRole('button', { name: 'Upload first' })).toBeTruthy()
    expect(posted).toEqual([])
    fireEvent.click(within(banner).getByRole('button', { name: 'Update now' }))
    expect(posted).toEqual([{ type: 'SKIP_WAITING' }])
    expect(await store.listDrafts()).toHaveLength(1)
  })
})

describe('FieldEventPage (TSK-0080)', () => {
  it('[HH-OFF-06][T51] the Owner reads what was not applied and why, and records the review once', async () => {
    const view = {
      clientId: A,
      type: 'tap_arrived',
      visitId: VISIT,
      reference: 'HH-SYNTH080',
      localDate: '2026-10-23',
      visitState: 'canceled',
      recordedBy: { id: ME, name: 'Synthetic Worker' },
      uploadedBy: { id: ME, name: 'Synthetic Worker' },
      deviceRecordedAt: '2026-10-23T14:00:00.000Z',
      receivedAt: '2026-10-23T15:00:00.000Z',
      attempts: 2,
      state: 'needs_review',
      outcome: 'conflict',
      detail: 'VISIT_NOT_ACTIVE',
      review: null,
      actions: { review: true },
    }
    const posts: unknown[] = []
    const fetchImpl: Fetch = async (input, init) => {
      if (init?.method === 'POST') {
        expect(String(input)).toBe(`/api/v1/staff/field-events/${A}/review`)
        posts.push(JSON.parse(String(init.body)))
        return json(200, {
          ...view,
          state: 'reviewed',
          review: {
            by: { id: 'o-1', name: 'Synthetic Owner' },
            at: '2026-10-23T16:00:00.000Z',
            note: 'Nothing to apply',
          },
          actions: { review: false },
        })
      }
      return json(200, view)
    }
    render(<FieldEventPage t={t} fetchImpl={fetchImpl} href={(to) => `/staff${to}`} clientId={A} />)
    const page = await screen.findByTestId('field-event-page')
    expect(within(page).getByRole('heading').textContent).toBe('Arrived from a phone · HH-SYNTH080')
    expect(within(page).getByTestId('field-event-outcome').textContent).toBe(
      'Not applied: it conflicts with a newer change The visit was canceled, expired or ended before this arrived.',
    )
    expect(within(page).getByRole('link', { name: "Open the visit's times" }).getAttribute('href')).toBe(
      `/staff/visit-times/${VISIT}`,
    )
    fireEvent.change(within(page).getByLabelText(/What was done/), { target: { value: ' Nothing to apply ' } })
    fireEvent.click(within(page).getByRole('button', { name: 'Record the review' }))
    expect(await within(page).findByTestId('field-event-reviewed')).toBeTruthy()
    expect(posts).toEqual([{ note: 'Nothing to apply' }])
    expect(within(page).queryByRole('button', { name: 'Record the review' })).toBeNull()
  })
})
