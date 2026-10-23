// The offline packet copy and drafts (TSK-0079; HH-OFF-01, HH-OFF-02, HH-OFF-03, T28, T49, OWN-DEC-171). Pure, with
// the memory store: every reference, address and name is synthetic (RULE-SYNTHETIC-DATA).
import { describe, expect, it } from 'vitest'
import {
  copyExpiresAt,
  endOfLocalDay,
  offlineView,
  purgeOfflineCopies,
  readOfflineCopy,
  storeOfflineCopy,
} from '../src/offline/packet'
import { memoryStore, type OfflineStore } from '../src/offline/store'

const ZONE = 'America/Kentucky/Louisville'
const NOW = new Date('2026-10-23T15:00:00.000Z') // 11:00 local
const view = (jobId = 'job-1', version = 3) => ({
  job: { id: jobId, projectReference: 'HH-SYNTH079' },
  packet: { version, contentSha256: 'a'.repeat(64) },
  site: {
    address: { street: '1 Synthetic Lane', unit: null, city: 'Testville', state: 'KY', zip: '40000' },
    accessCodes: [{ id: 'c-1', kind: 'lockbox', label: 'Back door', confirmedAt: NOW.toISOString() }],
  },
  evidence: { photos: [{ id: 'p-1', url: 'https://storage.example.test/signed?sig=synthetic' }] },
  dependencies: { deposit: { required: true, state: 'due' } },
})
const today = [{ localDate: '2026-10-23', timeZone: ZONE }]

describe('the offline packet copy (TSK-0079, HH-OFF-01, HH-OFF-02)', () => {
  it('[HH-OFF-02][T28][T49] keeps no access-code entry, photo link or deposit state', () => {
    const copy = offlineView(view())
    expect(copy.site.accessCodes).toEqual([])
    expect(copy.evidence.photos).toEqual([{ id: 'p-1', url: null }])
    expect(copy.dependencies.deposit).toBeNull()
    expect(JSON.stringify(copy)).not.toContain('sig=')
    expect(JSON.stringify(copy)).not.toContain('lockbox')
    // The original answer is left as it was.
    expect(view().site.accessCodes).toHaveLength(1)
  })

  it('[HH-OFF-01][OWN-DEC-171] expires at the end of the last assigned visit’s local service day', () => {
    expect(endOfLocalDay('2026-10-23', ZONE)?.toISOString()).toBe('2026-10-24T04:00:00.000Z')
    // Fall back (2026-11-01): local midnight that starts the next day is in standard time.
    expect(endOfLocalDay('2026-11-01', ZONE)?.toISOString()).toBe('2026-11-02T05:00:00.000Z')
    expect(copyExpiresAt([...today, { localDate: '2026-10-24', timeZone: ZONE }], NOW)?.toISOString()).toBe(
      '2026-10-25T04:00:00.000Z',
    )
    // Only visits whose day is over: nothing to keep.
    expect(copyExpiresAt([{ localDate: '2026-10-22', timeZone: ZONE }], NOW)).toBeNull()
  })

  it('[HH-OFF-01][T49] "Ready for offline use" only after the copy was read back unchanged', async () => {
    const store = memoryStore()
    const ready = await storeOfflineCopy(store, view(), today, { 'wp-1': { steps: ['1.1'] } }, NOW)
    expect(ready).toEqual({
      state: 'ready',
      version: 3,
      savedAt: NOW.toISOString(),
      expiresAt: '2026-10-24T04:00:00.000Z',
    })
    const back = await readOfflineCopy(store, 'job-1', NOW)
    expect(back).toMatchObject({ version: 3, sops: { 'wp-1': { steps: ['1.1'] } } })
    // A store that loses or alters what it was given is never called ready.
    const lossy: OfflineStore = { ...memoryStore(), getPacket: async () => undefined }
    expect(await storeOfflineCopy(lossy, view(), today, {}, NOW)).toEqual({ state: 'failed' })
    const altered: OfflineStore = {
      ...memoryStore(),
      getPacket: async () => ({
        jobId: 'job-1',
        projectReference: 'HH-SYNTH079',
        version: 2,
        contentSha256: 'a'.repeat(64),
        savedAt: NOW.toISOString(),
        expiresAt: NOW.toISOString(),
        view: {},
        sops: {},
      }),
    }
    expect(await storeOfflineCopy(altered, view(), today, {}, NOW)).toEqual({ state: 'failed' })
    // No visit today or later: nothing is kept.
    expect(
      await storeOfflineCopy(store, view('job-2'), [{ localDate: '2026-10-20', timeZone: ZONE }], {}, NOW),
    ).toEqual({
      state: 'not_stored',
    })
    expect(await store.getPacket('job-2')).toBeUndefined()
  })

  it('[HH-OFF-02][T49] copies of ended assignments and past service days are purged', async () => {
    const store = memoryStore()
    await storeOfflineCopy(store, view('job-1'), today, {}, NOW)
    await storeOfflineCopy(store, view('job-2'), today, {}, NOW)
    // job-2 is no longer assigned to this person.
    expect(await purgeOfflineCopies(store, ['job-1'], NOW)).toBe(1)
    expect((await store.listPackets()).map((p) => p.jobId)).toEqual(['job-1'])
    // After the end of the service day the copy is gone, even before the next purge.
    const tomorrow = new Date('2026-10-24T05:00:00.000Z')
    expect(await readOfflineCopy(store, 'job-1', tomorrow)).toBeNull()
    expect(await store.listPackets()).toEqual([])
  })
})
