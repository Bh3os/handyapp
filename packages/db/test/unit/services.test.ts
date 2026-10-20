// Service registry seed (TSK-0019; HH-SVC-01, HH-SVC-02, RULE-NO-INVENTED-FACTS).
import { describe, expect, it } from 'vitest'
import { canAutoSchedule, contentHash, loadServiceSeed } from '../../src/index.js'

const services = loadServiceSeed()
const EXPECTED_IDS = [
  ...Array.from({ length: 7 }, (_, i) => `SVC-CL-0${i + 1}`),
  ...Array.from({ length: 4 }, (_, i) => `SVC-DW-0${i + 1}`),
  ...Array.from({ length: 11 }, (_, i) => `SVC-HI-${String(i + 1).padStart(2, '0')}`),
  ...Array.from({ length: 4 }, (_, i) => `SVC-PT-0${i + 1}`),
]

describe('service registry seed (TSK-0019, HH-SVC-01)', () => {
  it('[HH-SVC-01] has the 26 services with unique IDs, codes and slugs', () => {
    expect(services.map((s) => s.id)).toEqual(EXPECTED_IDS)
    expect(new Set(services.map((s) => s.code)).size).toBe(26)
    expect(new Set(services.map((s) => s.slug)).size).toBe(26)
    for (const s of services) expect(s.id).toBe(`SVC-${s.code}`)
  })

  it('[HH-SVC-01] groups the services into the four categories', () => {
    const count = (c: string) => services.filter((s) => s.category === c).length
    expect([count('cleaning'), count('drywall'), count('home_improvement'), count('painting')]).toEqual([7, 4, 11, 4])
  })

  it('[HH-SVC-01] links each service to its own SOP and carries bilingual staff labels and request topics', () => {
    for (const s of services) {
      expect(s.sopId).toBe(`SOP-${s.code}`)
      expect(s.staffLabel.en).toBe(s.name)
      expect(s.staffLabel.es.length).toBeGreaterThan(0)
      expect(s.intake.guideInputs.length).toBeGreaterThan(0)
      expect(s.intake.specIntake.length).toBeGreaterThan(0)
    }
  })

  it('[HH-SVC-02][RULE-NO-INVENTED-FACTS] no description is invented: every service starts as an unpublished draft', () => {
    for (const s of services) {
      expect(s.publicStatus).toBe('draft')
      expect(s.content.description).toBeNull()
      expect(s.schedulingMode).toBe('standard')
    }
    expect(JSON.stringify(services)).not.toMatch(/\$\s?\d|guarantee|warranty|licensed|insured/i)
  })

  it('[HH-SVC-01] the content hash changes with content only', () => {
    const [a] = services
    if (!a) throw new Error('empty seed')
    expect(contentHash({ ...a })).toBe(contentHash(a))
    expect(contentHash({ ...a, publicStatus: 'staging' })).toBe(contentHash(a))
    expect(contentHash({ ...a, name: `${a.name} (renamed)` })).not.toBe(contentHash(a))
  })

  it('[HH-SVC-02] an inquiry-only service never auto-schedules', () => {
    expect(canAutoSchedule({ scheduling_mode: 'inquiry_only', in_launch_set: true })).toBe(false)
    expect(canAutoSchedule({ scheduling_mode: 'standard', in_launch_set: false })).toBe(false)
    expect(canAutoSchedule({ scheduling_mode: 'standard', in_launch_set: true })).toBe(true)
  })
})
