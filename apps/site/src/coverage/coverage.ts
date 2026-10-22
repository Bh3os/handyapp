// The ZIP check in the browser (TSK-0022; HH-CUS-03, HH-INT-16, OWN-DEC-88). Pure helpers shared by the checker island
// and the request wizard:
// - checkZip asks the server (same origin, so the staging access gate's credentials go with it, OWN-DEC-73); an
//   invalid format is answered here without a call, and any failure is a "failed" result that still lets the visitor
//   continue (the request then stores unknown); a PO Box or Unique ZIP comes with a note asking for the ZIP of the
//   property (TSK-0127, OWN-DEC-179 rule 8);
// - the checked ZIP is carried to the request form in this tab's session storage, never in the URL (HH-INT-16).
import { zip5, type CoverageOutcome } from '@handyhub/domain/coverage'

export type CoverageCheck =
  | { kind: 'outcome'; zip: string; outcome: CoverageOutcome; message: string; note: string | null }
  | { kind: 'invalid' }
  | { kind: 'failed'; zip: string }

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

export async function checkZip(input: string, fetchImpl: Fetch = (...a) => fetch(...a)): Promise<CoverageCheck> {
  const zip = zip5(input)
  if (!zip) return { kind: 'invalid' }
  try {
    const res = await fetchImpl(`/api/v1/public/coverage?zip=${zip}`, {
      headers: { accept: 'application/json' },
      credentials: 'same-origin',
    })
    if (!res.ok) return { kind: 'failed', zip }
    const body = (await res.json()) as { outcome?: CoverageOutcome; message?: string; note?: string | null }
    if (!body.outcome || typeof body.message !== 'string') return { kind: 'failed', zip }
    const note = typeof body.note === 'string' && body.note ? body.note : null
    return { kind: 'outcome', zip, outcome: body.outcome, message: body.message, note }
  } catch {
    return { kind: 'failed', zip }
  }
}

const KEY = 'hh.coverage.zip'

function session(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/** Keeps the checked ZIP for the request form in this tab. */
export function rememberZip(zip: string): void {
  try {
    session()?.setItem(KEY, zip)
  } catch {
    // Storage refused (private mode): the visitor types the ZIP again.
  }
}

/** The ZIP checked in this tab, once: it is removed as it is read. */
export function takeRememberedZip(): string | null {
  try {
    const s = session()
    const zip = s?.getItem(KEY) ?? null
    s?.removeItem(KEY)
    return zip && zip5(zip) ? zip : null
  } catch {
    return null
  }
}
