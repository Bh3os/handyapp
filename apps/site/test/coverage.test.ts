// The browser ZIP check (TSK-0022; HH-CUS-03, HH-INT-16, OWN-DEC-88). Responses are synthetic.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkZip, rememberZip, takeRememberedZip } from '../src/coverage/coverage.js'

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))

afterEach(() => vi.unstubAllGlobals())

describe('ZIP check in the browser (TSK-0022, HH-CUS-03)', () => {
  it('[HH-CUS-03] an invalid format is a correction, with no call and no outcome', async () => {
    const fetchImpl = vi.fn()
    for (const zip of ['4000', 'abcde', '']) expect(await checkZip(zip, fetchImpl)).toEqual({ kind: 'invalid' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('[HH-CUS-03][OWN-DEC-73] the check is a same-origin call (gate credentials included) and shows the outcome', async () => {
    const fetchImpl = vi.fn(() => json(200, { zip: '99901', outcome: 'boundary', configured: true, message: 'm' }))
    expect(await checkZip(' 99901-1234 ', fetchImpl)).toEqual({
      kind: 'outcome',
      zip: '99901',
      outcome: 'boundary',
      message: 'm',
    })
    expect(fetchImpl).toHaveBeenCalledWith('/api/v1/public/coverage?zip=99901', {
      headers: { accept: 'application/json' },
      credentials: 'same-origin',
    })
  })

  it('[HH-CUS-03][T07] a failed lookup (error answer, bad body or network) is "failed", which still continues', async () => {
    expect(await checkZip('99901', () => json(503, { error: {} }))).toEqual({ kind: 'failed', zip: '99901' })
    expect(await checkZip('99901', () => json(200, { nothing: true }))).toEqual({ kind: 'failed', zip: '99901' })
    expect(await checkZip('99901', () => Promise.reject(new TypeError('offline')))).toEqual({
      kind: 'failed',
      zip: '99901',
    })
  })

  it('[HH-INT-16] the checked ZIP is carried to the form once, in session storage, never the URL', () => {
    const data = new Map<string, string>()
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, v),
        removeItem: (k: string) => void data.delete(k),
      },
    })
    rememberZip('99901')
    expect(takeRememberedZip()).toBe('99901')
    expect(takeRememberedZip()).toBeNull()
    rememberZip('not-a-zip')
    expect(takeRememberedZip()).toBeNull()
    vi.stubGlobal('window', {})
    expect(() => rememberZip('99901')).not.toThrow()
    expect(takeRememberedZip()).toBeNull()
  })
})
