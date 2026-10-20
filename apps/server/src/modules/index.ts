// The API modules the server registers (TSK-0010; HH-ARC-02). Each feature adds its module under
// src/modules/<name>/index.ts exporting an ApiModule, and lists it here; its routes then appear in openapi.json.
import type { ApiModule } from '../api/route.js'
import { identityModule } from './identity/index.js'
import type { ObjectStorage } from '../providers/index.js'
import { photosModule } from './photos/index.js'
import { REQUESTS_MODULE } from './requests/index.js'

export type ModuleDeps = {
  /** Secure, `__Host-` session cookies (staging and production); plain cookies over http in local and ci. */
  secureCookies: boolean
  /** The private object storage for photos (R2, or the fake in local and ci); null while NOT CONFIGURED. */
  storage?: ObjectStorage | null
}

export function apiModules(deps: ModuleDeps): ApiModule[] {
  return [
    identityModule({ cookies: { secure: deps.secureCookies } }),
    REQUESTS_MODULE,
    photosModule({ storage: deps.storage ?? null }),
  ]
}

/** The modules as the contract (openapi.json) describes them; cookie flags do not change the contract. */
export const MODULES: readonly ApiModule[] = apiModules({ secureCookies: true })
