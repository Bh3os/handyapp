// Object storage in a folder on this machine (local only): for running the whole product on one computer with its own
// PostgreSQL (docs/local-mac.md), where the in-memory fake would forget every photo and PDF at each restart and R2 is
// not set up. Same rules as R2 (providers/r2): objects are written once under opaque keys and never overwritten;
// reads go through short-lived signed URLs, here served by this server at /local-files/<key> after the signature and
// expiry are checked (boot.ts registers the route only when this adapter is selected). STORAGE_PROVIDER=disk is
// refused outside HANDYHUB_ENV=local (providers/settings.ts), so staging and production never use it.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { checkKey, expirySeconds, StorageError, type ObjectStorage, type SignedUrlOptions } from '../r2/index.js'

/** The path the server serves signed reads from. */
export const LOCAL_FILES_PATH = '/local-files/'

export class DiskObjectStorage implements ObjectStorage {
  readonly provider = 'disk' as const
  readonly root: string
  readonly #key = randomBytes(32)
  constructor(
    dir: string,
    private readonly now: () => number = Date.now,
  ) {
    this.root = resolve(dir)
  }

  #path(key: string): string {
    checkKey(key)
    return join(this.root, ...key.split('/'))
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const file = this.#path(key)
    await mkdir(dirname(file), { recursive: true })
    try {
      // Create-only: an existing object is never overwritten (originals never change).
      await writeFile(file, bytes, { flag: 'wx' })
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST')
        throw new StorageError('object exists; objects are written once')
      throw err
    }
    await writeFile(`${file}.type`, contentType, { flag: 'w' })
  }

  async get(key: string): Promise<{ bytes: Uint8Array; contentType: string | null }> {
    const file = this.#path(key)
    try {
      const bytes = new Uint8Array(await readFile(file))
      const contentType = await readFile(`${file}.type`, 'utf8').catch(() => null)
      return { bytes, contentType }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT')
        throw new StorageError('object storage did not answer as expected (NoSuchKey, 404)')
      throw err
    }
  }

  async delete(key: string): Promise<void> {
    const file = this.#path(key)
    await rm(file, { force: true })
    await rm(`${file}.type`, { force: true })
  }

  #sign(method: string, key: string, expires: number): string {
    return createHmac('sha256', this.#key).update(`${method}\n${key}\n${expires}`).digest('hex')
  }

  async signedGetUrl(key: string, options?: SignedUrlOptions): Promise<string> {
    checkKey(key)
    const expires = Math.floor(this.now() / 1000) + expirySeconds(options)
    return `${LOCAL_FILES_PATH}${key}?expires=${expires}&sig=${this.#sign('GET', key, expires)}`
  }

  /** Uploads always go through the server here: a signed upload URL is never handed out. */
  async signedPutUrl(): Promise<string> {
    throw new StorageError('signed uploads are not served by the local disk storage')
  }

  /** What a signed read URL (its path and query) grants now, or why it does not. */
  resolveSignedUrl(url: string): { ok: true; key: string } | { ok: false; reason: 'expired' | 'bad_signature' } {
    const u = new URL(url, 'http://local.invalid')
    if (!u.pathname.startsWith(LOCAL_FILES_PATH)) return { ok: false, reason: 'bad_signature' }
    const key = u.pathname.slice(LOCAL_FILES_PATH.length)
    const expires = Number(u.searchParams.get('expires'))
    const sig = Buffer.from(u.searchParams.get('sig') ?? '', 'hex')
    const expected = Buffer.from(this.#sign('GET', key, expires), 'hex')
    if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return { ok: false, reason: 'bad_signature' }
    if (Math.floor(this.now() / 1000) > expires) return { ok: false, reason: 'expired' }
    return { ok: true, key }
  }
}
