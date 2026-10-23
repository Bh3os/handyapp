// The staff app's offline store (TSK-0079; HH-OFF-01, HH-OFF-02, HH-OFF-03, T49, T50, OWN-DEC-121, OWN-DEC-171).
// - IndexedDB on the signed-in device: the minimal copies of the caller's assigned job packets and the drafts saved
//   while offline. Treated as unprotected storage (HH-OFF-01): nothing is called secure because it is stored, and only
//   what the offline copy needs is ever written (packet.ts strips the rest).
// - A copy is "ready for offline use" only after it was written and read back unchanged; it expires at the end of the
//   last visit's local service day and is purged then, when the assignment ends, and at sign-out.
// - Without IndexedDB (an old browser, a private window that refuses it, the tests) the memory store keeps the same
//   contract for the life of the page, so nothing claims to survive a restart that would not.

export type StoredPacket = {
  jobId: string
  projectReference: string
  version: number
  contentSha256: string
  /** When the copy was taken from the server (the "last sync"). */
  savedAt: string
  /** The end of the last visit's local service day: after it the copy is purged (OWN-DEC-171). */
  expiresAt: string
  /** The packet view as the server answered it, minus what an offline copy must never hold (packet.ts). */
  view: unknown
  /** Each pinned work package's SOP checklist, by work package (HH-OFF-01: the packet with its SOP checklist). */
  sops: Record<string, unknown>
}

export type DraftKind = 'tap' | 'stop' | 'note'
export type StoredDraft = {
  id: string
  kind: DraftKind
  jobId: string | null
  visitId: string | null
  /** The device's own clock when the worker acted (kept beside the server's time once synchronized). */
  deviceRecordedAt: string
  payload: Record<string, unknown>
  /** TSK-0079: drafts stay on the phone; TSK-0080 sends them and marks them pending upload, then synced. */
  state: 'saved_on_phone'
}

export interface OfflineStore {
  readonly durable: boolean
  getPacket(jobId: string): Promise<StoredPacket | undefined>
  putPacket(p: StoredPacket): Promise<void>
  deletePacket(jobId: string): Promise<void>
  listPackets(): Promise<StoredPacket[]>
  putDraft(d: StoredDraft): Promise<void>
  listDrafts(): Promise<StoredDraft[]>
  deleteDraft(id: string): Promise<void>
  /** Everything this device holds for the app (sign-out). */
  clear(): Promise<void>
}

const DB_NAME = 'handyhub-staff-offline'
const DB_VERSION = 1
const PACKETS = 'packets'
const DRAFTS = 'drafts'

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = factory.open(DB_NAME, DB_VERSION)
    r.onupgradeneeded = () => {
      const db = r.result
      if (!db.objectStoreNames.contains(PACKETS)) db.createObjectStore(PACKETS, { keyPath: 'jobId' })
      if (!db.objectStoreNames.contains(DRAFTS)) db.createObjectStore(DRAFTS, { keyPath: 'id' })
    }
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

/** The IndexedDB store of this browser. */
export function indexedDbStore(factory: IDBFactory): OfflineStore {
  let db: Promise<IDBDatabase> | null = null
  const store = async (name: string, mode: IDBTransactionMode) =>
    (await (db ??= openDb(factory))).transaction(name, mode).objectStore(name)
  return {
    durable: true,
    getPacket: async (jobId) =>
      (await request((await store(PACKETS, 'readonly')).get(jobId))) as StoredPacket | undefined,
    putPacket: async (p) => void (await request((await store(PACKETS, 'readwrite')).put(p))),
    deletePacket: async (jobId) => void (await request((await store(PACKETS, 'readwrite')).delete(jobId))),
    listPackets: async () => (await request((await store(PACKETS, 'readonly')).getAll())) as StoredPacket[],
    putDraft: async (d) => void (await request((await store(DRAFTS, 'readwrite')).put(d))),
    listDrafts: async () => (await request((await store(DRAFTS, 'readonly')).getAll())) as StoredDraft[],
    deleteDraft: async (id) => void (await request((await store(DRAFTS, 'readwrite')).delete(id))),
    clear: async () => {
      await request((await store(PACKETS, 'readwrite')).clear())
      await request((await store(DRAFTS, 'readwrite')).clear())
    },
  }
}

/** The memory store: the same contract for the life of the page, never durable. */
export function memoryStore(): OfflineStore {
  const packets = new Map<string, StoredPacket>()
  const drafts = new Map<string, StoredDraft>()
  const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
  return {
    durable: false,
    getPacket: async (jobId) => {
      const p = packets.get(jobId)
      return p ? copy(p) : undefined
    },
    putPacket: async (p) => void packets.set(p.jobId, copy(p)),
    deletePacket: async (jobId) => void packets.delete(jobId),
    listPackets: async () => [...packets.values()].map(copy),
    putDraft: async (d) => void drafts.set(d.id, copy(d)),
    listDrafts: async () => [...drafts.values()].map(copy),
    deleteDraft: async (id) => void drafts.delete(id),
    clear: async () => {
      packets.clear()
      drafts.clear()
    },
  }
}

let shared: OfflineStore | null = null
/** The store of this page: IndexedDB when the browser offers it, else memory. */
export function offlineStore(): OfflineStore {
  if (shared) return shared
  const factory = typeof indexedDB === 'undefined' ? null : indexedDB
  shared = factory ? indexedDbStore(factory) : memoryStore()
  return shared
}
/** Tests set their own store. */
export function setOfflineStore(store: OfflineStore | null): void {
  shared = store
}
