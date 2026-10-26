// Your data and privacy requests, and document downloads (TSK-0100; HH-PRIV-03, HH-PRIV-06, T68, RULE-LANGUAGES;
// TSK-0136: HH-PRIV-07, the acknowledgment and the dates). The API is a synthetic stand-in; every reference and text is
// invented for the test (RULE-SYNTHETIC-DATA).
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App, routeOf } from '../src/App'
import { parseDownloads, parsePrivacyList, type Fetch } from '../src/api'

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

const REF = 'HH-7K2M9Q4D'
const NOW = '2026-10-21T15:00:00.000Z'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const decided = {
  reference: 'PR-000001',
  kind: 'deletion',
  state: 'partially_completed',
  details: null,
  submittedAt: NOW,
  decidedAt: NOW,
  outcome: {
    deleted: [{ category: 'unaccepted_estimates', count: 1 }],
    retained: [
      {
        category: 'accepted_agreements',
        disposition: 'retain',
        count: 1,
        reason: 'protected_evidence',
        retention: 'accepted_agreements',
        years: 10,
        reviewAt: null,
      },
    ],
    excluded: [
      {
        category: 'third_party_contacts',
        disposition: 'exclude',
        count: 1,
        reason: 'third_party',
        retention: null,
        years: null,
        reviewAt: null,
      },
    ],
    exportReady: false,
    accessClosed: false,
  },
  acknowledgedAt: NOW,
  acknowledgmentDueOn: '2026-10-26',
  reviewStartedAt: NOW,
  targetOn: '2026-11-20',
  extensions: [],
}

function api(fresh: boolean, requests: unknown[] = [], answers: Record<string, (init?: RequestInit) => Response> = {}) {
  return vi.fn(async (input: string, init?: RequestInit) => {
    for (const [suffix, answer] of Object.entries(answers)) if (input.endsWith(suffix)) return answer(init)
    if (input.endsWith('/privacy-requests')) return json(200, { reference: REF, freshVerification: fresh, requests })
    if (input.endsWith('/customer/session/verification'))
      return json(200, { fresh, freshUntil: NOW, channels: [{ channel: 'email', destination: 's***@example.test' }] })
    return json(404, { error: { code: 'NOT_FOUND', fieldErrors: [] } })
  })
}

describe('your data and privacy requests (TSK-0100, HH-PRIV-03)', () => {
  it('[HH-PRIV-03] the privacy page has its own address below the project; the six tabs stay as they are', () => {
    expect(routeOf(`/portal/p/${REF}/privacy`)).toEqual({ page: 'privacy', reference: REF })
    expect(routeOf(`/portal/p/${REF.toLowerCase()}/privacy/`)).toEqual({ page: 'privacy', reference: REF })
  })

  it('[HH-PRIV-03] asking needs a new code first; nothing is asked before it', async () => {
    const fetchImpl = api(false)
    render(<App path={`/portal/p/${REF}/privacy`} fetchImpl={fetchImpl as unknown as Fetch} />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Your data and privacy requests' })).toBeTruthy()
    expect(await screen.findByText("To make a request, first confirm it's you with a new code.")).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ask to delete my data' })).toBeNull()
    expect(await screen.findByRole('button', { name: 'Email a code to s***@example.test' })).toBeTruthy()
    expect(screen.getByText("You haven't made a privacy request.")).toBeTruthy()
  })

  it('[HH-PRIV-03] a fresh session asks for deletion once; the outcome says what was deleted, kept and why', async () => {
    let asked = 0
    const fetchImpl = api(true, [decided], {
      '/privacy-requests/deletion': () => {
        asked += 1
        return json(201, { ...decided, reference: 'PR-000002', state: 'received', decidedAt: null, outcome: null })
      },
    })
    render(<App path={`/portal/p/${REF}/privacy`} fetchImpl={fetchImpl as unknown as Fetch} />)
    const mine = await screen.findByRole('list', { name: 'Your requests' })
    const item = within(mine).getByText('Deletion (PR-000001)').closest('li') as HTMLElement
    expect(within(item).getByText('Done, some records kept')).toBeTruthy()
    expect(within(item).getByText('Deleted: estimates you did not accept')).toBeTruthy()
    expect(
      within(item).getByText(
        'Kept: approved estimates and your approvals; it is the record of an approved agreement; kept 10 years',
      ),
    ).toBeTruthy()
    expect(within(item).getByText('Information about other people was left out.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ask to delete my data' }))
    expect(await screen.findByText("Your request was sent. HandyHub's owner will review it.")).toBeTruthy()
    expect(asked).toBe(1)
    const sent = fetchImpl.mock.calls.find((c) => String(c[0]).endsWith('/privacy-requests/deletion'))
    expect((sent?.[1] as RequestInit & { headers: Record<string, string> }).headers['idempotency-key']).toMatch(
      /^portal-/,
    )
  })

  it('[HH-PRIV-03] a correction needs the customer’s words; an open request of the same kind is said so', async () => {
    const fetchImpl = api(true, [], {
      '/privacy-requests/correction': () =>
        json(409, { error: { code: 'CONFLICT', fieldErrors: [{ field: 'kind', code: 'PRIVACY_REQUEST_OPEN' }] } }),
    })
    render(<App path={`/portal/p/${REF}/privacy`} fetchImpl={fetchImpl as unknown as Fetch} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ask for a correction' }))
    expect(await screen.findByText('Please say what should be corrected first.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('What should be corrected?'), {
      target: { value: 'Synthetic: my unit number is 2B.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ask for a correction' }))
    expect(
      await screen.findByText("You already have an open request of this kind. You'll see its answer below."),
    ).toBeTruthy()
  })

  it('[HH-PRIV-07] an open request shows its acknowledgment, the follow-up date, the target and an extension with its reason', async () => {
    const open = {
      ...decided,
      reference: 'PR-000003',
      kind: 'export',
      state: 'received',
      decidedAt: null,
      outcome: null,
      reviewStartedAt: null,
    }
    const extended = {
      ...open,
      reference: 'PR-000004',
      state: 'under_review',
      reviewStartedAt: NOW,
      targetOn: '2026-12-10',
      extensions: [{ targetOn: '2026-12-10', reason: 'Synthetic: an archived job.', decidedAt: NOW }],
    }
    render(<App path={`/portal/p/${REF}/privacy`} fetchImpl={api(true, [open, extended]) as unknown as Fetch} />)
    const mine = await screen.findByRole('list', { name: 'Your requests' })
    const first = within(mine).getByText('Copy of my data (PR-000003)').closest('li') as HTMLElement
    expect(within(first).getByText(/^We received this request on /)).toBeTruthy()
    expect(within(first).getByText("We'll follow up on it by October 26, 2026.")).toBeTruthy()
    expect(within(first).getByText('We aim to complete it by November 20, 2026.')).toBeTruthy()
    const second = within(mine).getByText('Copy of my data (PR-000004)').closest('li') as HTMLElement
    expect(within(second).getByText(/^HandyHub's owner started reviewing it on/)).toBeTruthy()
    expect(within(second).queryByText(/follow up on it by/)).toBeNull()
    expect(
      within(second).getByText(
        'We need more time: we now aim to complete it by December 10, 2026. Why: Synthetic: an archived job.',
      ),
    ).toBeTruthy()
  })

  it('[HH-PRIV-03] only well-formed answers are shown', () => {
    expect(parsePrivacyList({ reference: REF, freshVerification: true, requests: [decided] })).not.toBeNull()
    expect(
      parsePrivacyList({ reference: REF, freshVerification: true, requests: [{ ...decided, kind: 'x' }] }),
    ).toBeNull()
    expect(parsePrivacyList({ reference: REF, requests: [] })).toBeNull()
    // TSK-0136: a target that is not a calendar date, or an extension without its reason, is refused.
    expect(
      parsePrivacyList({ reference: REF, freshVerification: true, requests: [{ ...decided, targetOn: NOW }] }),
    ).toBeNull()
    expect(
      parsePrivacyList({
        reference: REF,
        freshVerification: true,
        requests: [{ ...decided, extensions: [{ targetOn: '2026-12-10', decidedAt: NOW }] }],
      }),
    ).toBeNull()
  })
})

describe('document downloads (TSK-0100, HH-PRIV-06)', () => {
  const LINK = 'https://storage.example.test/estimates/published/synthetic?sig=abc'
  it('[HH-PRIV-06][T68] each estimate offers its download; the link is asked for and shown only then', async () => {
    const list = {
      reference: REF,
      refreshedAt: NOW,
      refreshSeconds: 0,
      state: 'listed',
      estimates: [
        { number: `${REF}-E1`, version: 1, status: 'current', publishedAt: NOW, validUntil: NOW, totalCents: 12_345 },
      ],
    }
    const urls: string[] = []
    const fetchImpl: Fetch = async (input) => {
      urls.push(input)
      if (input.endsWith('/documents') && input.includes('/estimates/'))
        return json(200, {
          reference: REF,
          number: `${REF}-E1`,
          version: 1,
          documents: [
            { kind: 'estimate_pdf', contentType: 'application/pdf', byteSize: 20_480, url: LINK, expiresAt: NOW },
          ],
        })
      if (input.endsWith('/documents')) return json(200, list)
      if (input.endsWith('/overview'))
        return json(200, {
          reference: REF,
          services: ['Patching & Repair'],
          notSure: false,
          submittedAt: NOW,
          status: {
            situation: 'estimate_ready',
            step: 'review_estimate',
            waitingOn: 'customer',
            nextAction: 'review_estimate',
            since: NOW,
            text: null,
          },
          timeline: [{ kind: 'received', at: NOW, text: null }],
          appointment: null,
          payment: { state: 'none' },
          invoiceBalanceCents: 0,
          refreshedAt: NOW,
          refreshSeconds: 0,
        })
      return json(404, { error: { code: 'NOT_FOUND', fieldErrors: [] } })
    }
    render(<App path={`/portal/p/${REF}/documents`} fetchImpl={fetchImpl} />)
    const get = await screen.findByRole('button', { name: `Download estimate ${REF}-E1, version 1` })
    expect(urls.some((u) => u.includes('/versions/1/documents'))).toBe(false)
    fireEvent.click(get)
    const link = await screen.findByRole('link', { name: 'Estimate PDF (20 KB)' })
    expect(link.getAttribute('href')).toBe(LINK)
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(screen.getByText('These links work for a few minutes. Ask for them again any time.')).toBeTruthy()
    // The privacy page is linked from the project.
    expect(screen.getByRole('link', { name: 'Your data and privacy requests' }).getAttribute('href')).toBe(
      `/portal/p/${REF}/privacy`,
    )
  })

  it('[HH-PRIV-06] a link that is not https or an unknown kind is never shown', () => {
    const doc = {
      kind: 'estimate_pdf',
      contentType: 'application/pdf',
      byteSize: 1,
      url: 'https://x.test/a',
      expiresAt: NOW,
    }
    expect(parseDownloads({ documents: [doc] })).toHaveLength(1)
    expect(parseDownloads({ documents: [{ ...doc, url: 'http://x.test/a' }] })).toBeNull()
    expect(parseDownloads({ documents: [{ ...doc, kind: 'original' }] })).toBeNull()
  })
})
