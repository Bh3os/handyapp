// The API modules the server registers (TSK-0010; HH-ARC-02). Each feature adds its module under
// src/modules/<name>/index.ts exporting an ApiModule, and lists it here; its routes then appear in openapi.json.
import type { ApiModule } from '../api/route.js'
import type { Secret } from '../providers/types.js'
import { identityModule } from './identity/index.js'
import type { ObjectStorage } from '../providers/index.js'
import { COVERAGE_MODULE } from './coverage/index.js'
import { photosModule } from './photos/index.js'
import { QUEUE_MODULE } from './queue/index.js'
import { REQUESTS_MODULE } from './requests/index.js'
import { SITE_MODULE } from './site/index.js'

export type ModuleDeps = {
  /** Secure, `__Host-` session cookies (staging and production); plain cookies over http in local and ci. */
  secureCookies: boolean
  /** Seals staff TOTP secrets (optional MFA, TSK-0015); null while MFA_ENCRYPTION_KEY is unset. */
  mfaKey: Secret | null
  /** The private object storage for photos (R2, or the fake in local and ci); null while NOT CONFIGURED. */
  storage?: ObjectStorage | null
}

export function apiModules(deps: ModuleDeps): ApiModule[] {
  return [
    identityModule({ cookies: { secure: deps.secureCookies }, mfaKey: deps.mfaKey }),
    REQUESTS_MODULE,
    COVERAGE_MODULE,
    photosModule({ storage: deps.storage ?? null }),
    SITE_MODULE,
    QUEUE_MODULE,
  ]
}

/** The modules as the contract (openapi.json) describes them; cookie flags and keys do not change the contract. */
export const MODULES: readonly ApiModule[] = apiModules({ secureCookies: true, mfaKey: null })
