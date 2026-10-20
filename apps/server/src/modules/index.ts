// The API modules the server registers (TSK-0010; HH-ARC-02). Each feature adds its module under
// src/modules/<name>/index.ts exporting an ApiModule, and lists it here; its routes then appear in openapi.json.
import type { ApiModule } from '../api/route.js'
import type { Secret } from '../providers/types.js'
import { identityModule } from './identity/index.js'
import { REQUESTS_MODULE } from './requests/index.js'

export type ModuleDeps = {
  /** Secure, `__Host-` session cookies (staging and production); plain cookies over http in local and ci. */
  secureCookies: boolean
  /** Seals staff TOTP secrets (optional MFA, TSK-0015); null while MFA_ENCRYPTION_KEY is unset. */
  mfaKey: Secret | null
}

export function apiModules(deps: ModuleDeps): ApiModule[] {
  return [identityModule({ cookies: { secure: deps.secureCookies }, mfaKey: deps.mfaKey }), REQUESTS_MODULE]
}

/** The modules as the contract (openapi.json) describes them; cookie flags and keys do not change the contract. */
export const MODULES: readonly ApiModule[] = apiModules({ secureCookies: true, mfaKey: null })
