// The API modules the server registers (TSK-0010; HH-ARC-02). Each feature adds its module under
// src/modules/<name>/index.ts exporting an ApiModule, and lists it here; its routes then appear in openapi.json.
import type { ApiModule } from '../api/route.js'
import { identityModule } from './identity/index.js'

export type ModuleDeps = {
  /** Secure, `__Host-` session cookies (staging and production); plain cookies over http in local and ci. */
  secureCookies: boolean
}

export function apiModules(deps: ModuleDeps): ApiModule[] {
  return [identityModule({ cookies: { secure: deps.secureCookies } })]
}

/** The modules as the contract (openapi.json) describes them; cookie flags do not change the contract. */
export const MODULES: readonly ApiModule[] = apiModules({ secureCookies: true })
