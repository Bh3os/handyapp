// Cloudflare R2 object storage and fake (TSK-0013; INT-R2). Adapted from Bh3os/handyhub-app
// (apps/server/src/platform/object-storage.ts), plus short-lived signed URLs.
// - The bucket is private: nothing here makes an object public or hands out a lasting link. Every read the server
//   authorizes is served through a signed URL that expires within SIGNED_URL_MAX_SECONDS.
// - Objects are written once under opaque keys (never a name, address or file name); an existing key is never
//   overwritten (create-only, If-None-Match), so originals never change.
// - FakeObjectStorage: local and ci only, in memory, with signed URLs it can check (signature and expiry).
// - TSK-0100 (HH-PRIV-05): an object is removed only by the Owner's recorded deletion of the record it belongs to,
//   after that deletion committed (privacy.object_erasure); removing an object that is already gone succeeds.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { StorageSettings } from '../settings.js'

/** PROPOSED engineering defaults (no owner value): signed URLs live 5 minutes by default and 15 minutes at most. */
export const SIGNED_URL_DEFAULT_SECONDS = 300
export const SIGNED_URL_MAX_SECONDS = 900

export const OBJECT_KEY_PATTERN = /^[a-z0-9]+(?:[/-][a-z0-9]+)*$/

export class StorageError extends Error {
  override name = 'StorageError'
}

export type SignedUrlOptions = { expiresInSeconds?: number }

export interface ObjectStorage {
  readonly provider: 'r2' | 'fake'
  /** Writes a new object; refuses to overwrite one that exists. */
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>
  get(key: string): Promise<{ bytes: Uint8Array; contentType: string | null }>
  /** Removes an object (TSK-0100: only after the Owner's recorded deletion committed); an absent key succeeds. */
  delete(key: string): Promise<void>
  /** A short-lived URL to read one object. Call only after the server authorized the read. */
  signedGetUrl(key: string, options?: SignedUrlOptions): Promise<string>
  /** A short-lived URL to upload one new object of the given content type. */
  signedPutUrl(key: string, contentType: string, options?: SignedUrlOptions): Promise<string>
}

export function checkKey(key: string): void {
  if (key.length > 200 || !OBJECT_KEY_PATTERN.test(key)) throw new StorageError('invalid object key')
}

export function expirySeconds(options: SignedUrlOptions = {}): number {
  const s = options.expiresInSeconds ?? SIGNED_URL_DEFAULT_SECONDS
  if (!Number.isInteger(s) || s < 1 || s > SIGNED_URL_MAX_SECONDS)
    throw new StorageError(`signed URLs expire within 1 to ${SIGNED_URL_MAX_SECONDS} seconds`)
  return s
}

type R2Settings = Extract<StorageSettings, { adapter: 'r2' }>

/** S3 client settings for R2: the account endpoint and region "auto"; checksums only where the API requires them. */
export function r2ClientConfig(s: R2Settings): S3ClientConfig {
  return {
    region: 'auto',
    endpoint: `https://${s.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: s.accessKeyId.reveal(), secretAccessKey: s.secretAccessKey.reveal() },
    maxAttempts: 3,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  }
}

/** The error's name and HTTP status only, never the request, its signature or a credential. */
function unavailable(err: unknown): StorageError {
  const e = err as { name?: unknown; $metadata?: { httpStatusCode?: unknown } }
  const name = typeof e?.name === 'string' ? e.name : 'Error'
  const status = typeof e?.$metadata?.httpStatusCode === 'number' ? e.$metadata.httpStatusCode : null
  return new StorageError(`object storage did not answer as expected (${name}${status ? `, ${status}` : ''})`)
}

export class R2ObjectStorage implements ObjectStorage {
  readonly provider = 'r2' as const
  readonly #client: S3Client
  readonly #bucket: string

  /** `client` is for tests; production builds it from the settings. */
  constructor(settings: R2Settings, client?: S3Client) {
    this.#bucket = settings.bucket
    this.#client = client ?? new S3Client(r2ClientConfig(settings))
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    checkKey(key)
    try {
      await this.#client.send(
        new PutObjectCommand({
          Bucket: this.#bucket,
          Key: key,
          Body: bytes,
          ContentLength: bytes.byteLength,
          ContentType: contentType,
          IfNoneMatch: '*',
        }),
      )
    } catch (err) {
      throw unavailable(err)
    }
  }

  async get(key: string): Promise<{ bytes: Uint8Array; contentType: string | null }> {
    checkKey(key)
    try {
      const out = await this.#client.send(new GetObjectCommand({ Bucket: this.#bucket, Key: key }))
      if (!out.Body) throw new Error('empty body')
      return { bytes: await out.Body.transformToByteArray(), contentType: out.ContentType ?? null }
    } catch (err) {
      throw unavailable(err)
    }
  }

  async delete(key: string): Promise<void> {
    checkKey(key)
    try {
      await this.#client.send(new DeleteObjectCommand({ Bucket: this.#bucket, Key: key }))
    } catch (err) {
      throw unavailable(err)
    }
  }

  async signedGetUrl(key: string, options?: SignedUrlOptions): Promise<string> {
    checkKey(key)
    return getSignedUrl(this.#client, new GetObjectCommand({ Bucket: this.#bucket, Key: key }), {
      expiresIn: expirySeconds(options),
    })
  }

  async signedPutUrl(key: string, contentType: string, options?: SignedUrlOptions): Promise<string> {
    checkKey(key)
    return getSignedUrl(
      this.#client,
      new PutObjectCommand({ Bucket: this.#bucket, Key: key, ContentType: contentType, IfNoneMatch: '*' }),
      { expiresIn: expirySeconds(options), signableHeaders: new Set(['content-type', 'if-none-match']) },
    )
  }
}

/** Local and ci only: in memory; signed URLs carry an HMAC and an expiry that resolveSignedUrl() checks. */
export class FakeObjectStorage implements ObjectStorage {
  readonly provider = 'fake' as const
  readonly objects = new Map<string, { bytes: Uint8Array; contentType: string }>()
  readonly #key = randomBytes(32)
  constructor(private readonly now: () => number = Date.now) {}

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    checkKey(key)
    if (this.objects.has(key)) throw new StorageError('object exists; objects are written once')
    this.objects.set(key, { bytes: new Uint8Array(bytes), contentType })
  }

  async get(key: string): Promise<{ bytes: Uint8Array; contentType: string | null }> {
    checkKey(key)
    const o = this.objects.get(key)
    if (!o) throw new StorageError('object storage did not answer as expected (NoSuchKey, 404)')
    return { bytes: o.bytes, contentType: o.contentType }
  }

  async delete(key: string): Promise<void> {
    checkKey(key)
    this.objects.delete(key)
  }

  #sign(method: string, key: string, expires: number): string {
    return createHmac('sha256', this.#key).update(`${method}\n${key}\n${expires}`).digest('hex')
  }

  #url(method: string, key: string, options?: SignedUrlOptions): string {
    checkKey(key)
    const expires = Math.floor(this.now() / 1000) + expirySeconds(options)
    return `https://fake-r2.invalid/${key}?method=${method}&expires=${expires}&sig=${this.#sign(method, key, expires)}`
  }

  async signedGetUrl(key: string, options?: SignedUrlOptions): Promise<string> {
    return this.#url('GET', key, options)
  }

  async signedPutUrl(key: string, _contentType: string, options?: SignedUrlOptions): Promise<string> {
    return this.#url('PUT', key, options)
  }

  /** Test hook: what a signed URL grants now, or why it does not. */
  resolveSignedUrl(
    url: string,
  ): { ok: true; method: string; key: string } | { ok: false; reason: 'expired' | 'bad_signature' } {
    const u = new URL(url)
    const key = u.pathname.slice(1)
    const method = u.searchParams.get('method') ?? ''
    const expires = Number(u.searchParams.get('expires'))
    const sig = Buffer.from(u.searchParams.get('sig') ?? '', 'hex')
    const expected = Buffer.from(this.#sign(method, key, expires), 'hex')
    if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return { ok: false, reason: 'bad_signature' }
    if (Math.floor(this.now() / 1000) > expires) return { ok: false, reason: 'expired' }
    return { ok: true, method, key }
  }
}
