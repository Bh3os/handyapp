// The table-to-retention mapping review (TSK-0152; OWN-DEC-201 I5, HH-PRIV-01, HH-PRIV-05, OQ-RETENTION-REVIEW).
import { readFileSync } from 'node:fs'
import { LABEL_FAMILIES } from '@handyhub/i18n'
import { describe, expect, it } from 'vitest'
import { TABLES } from '../../src/modules/retention/inventory.js'
import {
  MAPPING_FINDINGS,
  categoryStatus,
  findingsOf,
  mappingDigest,
  mappingRows,
  renderMappingReview,
  reviewCovers,
  type MappingReview,
} from '../../src/modules/retention/mapping-review.js'
import { RETENTION_CATEGORIES } from '../../src/modules/retention/schedule.js'

const review = (over: Partial<MappingReview> = {}): MappingReview => ({
  id: 'r1',
  digest: mappingDigest(),
  tables: mappingRows().length,
  cpaConfirmed: true,
  attorneyConfirmed: true,
  note: 'synthetic',
  recordedBy: { id: 'o1', name: null },
  recordedAt: '2026-10-26T15:00:00.000Z',
  ...over,
})

describe('table-to-retention mapping review (TSK-0152, OWN-DEC-201 I5)', () => {
  it('[HH-PRIV-01] docs/retention-mapping-review.md is generated from the annotations and up to date', () => {
    const committed = readFileSync(new URL('../../../../docs/retention-mapping-review.md', import.meta.url), 'utf8')
    expect(committed).toBe(renderMappingReview())
    expect(committed).toContain(mappingDigest())
  })

  it('[HH-PRIV-01] the mapping covers every annotated table, and its digest is stable and a SHA-256', () => {
    expect(mappingRows().map((r) => r.table)).toEqual(Object.keys(TABLES).sort((a, b) => a.localeCompare(b)))
    expect(mappingDigest()).toMatch(/^[0-9a-f]{64}$/)
    expect(mappingDigest()).toBe(mappingDigest())
  })

  it('[HH-PRIV-01] the findings name unscheduled, provisional, unstarted, mixed and partly protected mappings', () => {
    expect(findingsOf({ holds: 'x', classes: ['technical'], categories: ['not_scheduled'] })).toEqual([
      'no_scheduled_period',
    ])
    expect(findingsOf({ holds: 'x', classes: ['staff_account'], categories: ['staff_accounts'] })).toEqual([
      'provisional_period',
    ])
    expect(
      findingsOf({
        holds: 'x',
        classes: ['request_details'],
        categories: ['requests_not_converted', 'job_records'],
        protectedEvidence: 'Some rows',
      }),
    ).toEqual(['start_not_recorded', 'several_categories', 'partly_protected'])
    expect(findingsOf({ holds: 'x', classes: ['logs_audit'], categories: ['audit_log'] })).toEqual([])
    expect(categoryStatus('requests_not_converted')).toBe('decided')
    expect(categoryStatus('consent_records')).toBe('provisional')
    expect(categoryStatus('not_scheduled')).toBe('unscheduled')
  })

  it('[HH-PRIV-05][OWN-DEC-201] only a review of this exact mapping with both confirmations enables deletion', () => {
    expect(reviewCovers(null, mappingDigest())).toBe(false)
    expect(reviewCovers(review(), mappingDigest())).toBe(true)
    expect(reviewCovers(review({ cpaConfirmed: false }), mappingDigest())).toBe(false)
    expect(reviewCovers(review({ attorneyConfirmed: false }), mappingDigest())).toBe(false)
    expect(reviewCovers(review({ digest: 'b'.repeat(64) }), mappingDigest())).toBe(false)
  })

  it('[HH-LANG-02] every finding and category status has its staff label', () => {
    expect(LABEL_FAMILIES.mappingFinding).toEqual([...MAPPING_FINDINGS])
    expect(new Set(RETENTION_CATEGORIES.map(categoryStatus))).toEqual(new Set(LABEL_FAMILIES.mappingCategoryStatus))
  })
})
