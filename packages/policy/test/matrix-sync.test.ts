// The policy data is the permission matrix (TSK-0006; ROLE-MATRIX, RULE-SERVER-AUTHZ). These tests read the matrix
// tables from the graph node and fail when a row, its order or any cell text differs from the policy data, and check
// each cell's machine rules against the matrix legend independently of how the data was written.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ACTIONS, MATRIX, MATRIX_ROLES, PACKAGE_NAME, ROLE_HEADINGS, type Rule } from '../src/index.js'

type MdRow = { section: string; label: string; cells: string[] }

function readMatrix(): { headings: string[]; rows: MdRow[] } {
  const text = readFileSync(new URL('../../../kg/roles/ROLE-MATRIX.md', import.meta.url), 'utf8')
  const rows: MdRow[] = []
  let headings: string[] = []
  let section = ''
  for (const line of text.split('\n')) {
    if (line.startsWith('### ')) section = line.slice(4).trim()
    if (!line.startsWith('| ')) continue
    const cells = line
      .slice(1, line.endsWith('|') ? -1 : undefined)
      .split('|')
      .map((c) => c.trim())
    if (cells[0] === 'Action') {
      headings = cells.slice(1)
      continue
    }
    if (cells[0]?.startsWith('---')) continue
    rows.push({ section, label: cells[0] ?? '', cells: cells.slice(1) })
  }
  return { headings, rows }
}

describe('policy data matches ROLE-MATRIX exactly (TSK-0006, RULE-SERVER-AUTHZ)', () => {
  const md = readMatrix()

  it('exposes its public index', () => {
    expect(PACKAGE_NAME).toBe('@handyhub/policy')
  })

  it('has the matrix columns in order', () => {
    expect(md.headings).toEqual(MATRIX_ROLES.map((r) => ROLE_HEADINGS[r]))
  })

  it('has every matrix row, in order, with its section and every cell text verbatim', () => {
    // TSK-0125: the two discount verification rows; TSK-0126: the Owner's coverage exception row; TSK-0128: the
    // Owner's extension of a worker's visit-day access; TSK-0095: the job-costs row; TSK-0135: the Owner's
    // audit-retention workflow; TSK-0140: Office's routine work-visit cancellation and the Owner's cancellation-fee
    // waiver; TSK-0131: the labor-rate and low-margin reason row; TSK-0145: the Owner's hazard-evaluation inspection
    // and the follow-up visit authorization.
    expect(md.rows.length).toBe(84)
    expect(
      MATRIX.map((r) => ({
        section: r.section,
        label: r.label,
        cells: MATRIX_ROLES.map((role) => r.cells[role].text),
      })),
    ).toEqual(md.rows)
  })

  it('names every action in exactly one row, and every row action is known', () => {
    const named = MATRIX.flatMap((r) => r.actions)
    expect(new Set(named).size).toBe(named.length)
    expect([...named].sort()).toEqual([...ACTIONS].sort())
  })

  it('gives rules only for actions of their own row', () => {
    for (const r of MATRIX) {
      for (const role of MATRIX_ROLES) {
        for (const a of Object.keys(r.cells[role].rules)) expect(r.actions, `${r.label} / ${role}`).toContain(a)
      }
    }
  })
})

describe('cell rules follow the matrix legend (TSK-0006, ROLE-MATRIX)', () => {
  const cells = MATRIX.flatMap((r) =>
    MATRIX_ROLES.map((role) => ({
      where: `${r.label} / ${role}`,
      text: r.cells[role].text,
      rules: Object.values(r.cells[role].rules) as Rule[],
    })),
  )

  it('a refused cell (—) or a row refused to everyone has no rule', () => {
    for (const c of cells) if (c.text === '—' || c.text.startsWith('— ')) expect(c.rules, c.where).toEqual([])
    for (const r of MATRIX.filter((x) => x.denyReason)) {
      for (const role of MATRIX_ROLES) expect(Object.keys(r.cells[role].rules)).toEqual([])
    }
  })

  it('Y cells allow without a record scope; F cells need a fresh sign-in and a reason', () => {
    for (const c of cells) {
      if (/^Y( |$)/.test(c.text) || c.text === 'All') {
        expect(c.rules.length, c.where).toBeGreaterThan(0)
        for (const rule of c.rules) expect(rule.scope, c.where).toBe('any')
      }
      if (c.text === 'F') {
        expect(c.rules.length, c.where).toBeGreaterThan(0)
        for (const rule of c.rules) expect(rule.fresh && rule.reason, c.where).toBe(true)
      }
      if (c.text.includes('(care: F)')) expect(c.rules.some((rule) => rule.fresh && rule.reason)).toBe(true)
      if (c.text.includes('(reason')) for (const rule of c.rules) expect(rule.reason, c.where).toBe(true)
    }
  })

  it('A cells are limited to assigned jobs and V cells to the customer’s verified project', () => {
    for (const c of cells) {
      if (/^A(,| |$)/.test(c.text)) for (const rule of c.rules) expect(rule.scope, c.where).toBe('assigned')
      if (/^V(,| |$)/.test(c.text)) for (const rule of c.rules) expect(rule.scope, c.where).toBe('customer_project')
      if (/^Own /.test(c.text)) {
        for (const rule of c.rules) expect(['own_staff', 'any'], c.where).toContain(rule.scope)
      }
    }
  })

  it('every PROPOSED cell is flagged, and only those', () => {
    for (const c of cells) {
      const proposed = /\(P\)|\(P mapping\)|, P\)/.test(c.text)
      for (const rule of c.rules) expect(rule.proposed === true, c.where).toBe(proposed)
    }
  })

  it('no cell lets any role override the Start Work gate, a critical hold or the audit log', () => {
    const protectedActions = ['work.override_gate', 'hold.override_critical', 'audit.edit', 'audit.delete']
    for (const r of MATRIX) {
      for (const role of MATRIX_ROLES) {
        for (const a of protectedActions) expect(r.cells[role].rules[a as never]).toBeUndefined()
      }
    }
  })
})
