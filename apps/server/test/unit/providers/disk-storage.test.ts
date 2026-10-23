// Local disk object storage (docs/local-mac.md): written once, signed short-lived reads, local only.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DiskObjectStorage } from '../../../src/providers/disk/index.js'
import { readProviderSettings } from '../../../src/providers/settings.js'

const dirs: string[] = []
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true })
})
async function storage(now: () => number = Date.now) {
  const dir = await mkdtemp(join(tmpdir(), 'hh-disk-'))
  dirs.push(dir)
  return new DiskObjectStorage(dir, now)
}

describe('local disk storage (STORAGE_PROVIDER=disk)', () => {
  it('writes an object once, reads it back with its type, and deletes it', async () => {
    const s = await storage()
    await s.put('photos/one', new Uint8Array([1, 2, 3]), 'image/jpeg')
    await expect(s.put('photos/one', new Uint8Array([9]), 'image/jpeg')).rejects.toThrow(/written once/)
    expect(await s.get('photos/one')).toEqual({ bytes: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' })
    await s.delete('photos/one')
    await s.delete('photos/one')
    await expect(s.get('photos/one')).rejects.toThrow(/NoSuchKey/)
    await expect(s.put('../escape', new Uint8Array([1]), 'image/jpeg')).rejects.toThrow(/invalid object key/)
  })

  it('signs short-lived same-origin read URLs and refuses tampered or expired ones', async () => {
    let now = Date.UTC(2026, 9, 23, 12)
    const s = await storage(() => now)
    const url = await s.signedGetUrl('photos/one', { expiresInSeconds: 60 })
    expect(url).toMatch(/^\/local-files\/photos\/one\?expires=\d+&sig=[0-9a-f]{64}$/)
    expect(s.resolveSignedUrl(url)).toEqual({ ok: true, key: 'photos/one' })
    expect(s.resolveSignedUrl(url.replace('photos/one', 'photos/two'))).toEqual({ ok: false, reason: 'bad_signature' })
    now += 61_000
    expect(s.resolveSignedUrl(url)).toEqual({ ok: false, reason: 'expired' })
    await expect(s.signedPutUrl()).rejects.toThrow(/not served/)
  })

  it('is selected only in local, and needs its folder', () => {
    expect(
      readProviderSettings({ HANDYHUB_ENV: 'local', STORAGE_PROVIDER: 'disk', LOCAL_STORAGE_DIR: '/tmp/hh' }).storage,
    ).toEqual({ adapter: 'disk', dir: '/tmp/hh' })
    expect(readProviderSettings({ HANDYHUB_ENV: 'local', STORAGE_PROVIDER: 'disk' }).storage).toEqual({
      adapter: 'not_configured',
      missing: ['LOCAL_STORAGE_DIR'],
    })
    for (const env of ['ci', 'staging', 'production'])
      expect(() =>
        readProviderSettings({ HANDYHUB_ENV: env, STORAGE_PROVIDER: 'disk', LOCAL_STORAGE_DIR: '/tmp/hh' }),
      ).toThrow(/only in local/)
  })
})
