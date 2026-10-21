// The API modules the server registers (TSK-0010; HH-ARC-02). Each feature adds its module under
// src/modules/<name>/index.ts exporting an ApiModule, and lists it here; its routes then appear in openapi.json.
import type { ApiModule } from '../api/route.js'
import type { Secret } from '../providers/types.js'
import { identityModule } from './identity/index.js'
import type { ObjectStorage } from '../providers/index.js'
import { COVERAGE_MODULE } from './coverage/index.js'
import type { EnvironmentName } from '../config.js'
import { estimatesModule } from './estimates/index.js'
import { CUSTOMERS_MODULE } from './customers/index.js'
import { inboxModule } from './inbox/index.js'
import { NOTIFICATIONS_MODULE } from './notifications/index.js'
import { photosModule } from './photos/index.js'
import { propertiesModule } from './properties/index.js'
import { QUEUE_MODULE } from './queue/index.js'
import { requestsModule } from './requests/index.js'
import { accessModule } from './access/index.js'
import { accountsModule } from './accounts/index.js'
import { portalModule } from './portal/index.js'
import { questionsModule } from './questions/index.js'
import { SITE_MODULE } from './site/index.js'
import { systemModule, type SystemDeps } from './system/index.js'
import { verificationModule } from './verification/index.js'
import type { CodeKeySettings } from './identity/index.js'

export type ModuleDeps = {
  /** Secure, `__Host-` session cookies (staging and production); plain cookies over http in local and ci. */
  secureCookies: boolean
  /** Seals staff TOTP secrets (optional MFA, TSK-0015); null while MFA_ENCRYPTION_KEY is unset. */
  mfaKey: Secret | null
  /** The private object storage for photos and documents (R2, or the fake in local and ci); null while NOT CONFIGURED. */
  storage?: ObjectStorage | null
  /** The environment: outside production customer documents carry the TEST mark (OWN-DEC-126). Unset: marked. */
  environment?: EnvironmentName
  /** What the system health and configuration views report about this process (TSK-0101); unset: unknown. */
  system?: SystemDeps
  /** The one-time-code key (TSK-0016, readCodeKey); unset: codes are NOT CONFIGURED for the receipt (TSK-0033). */
  codeKey?: CodeKeySettings
  /**
   * Proxies in front of the service that append to X-Forwarded-For (TRUST_PROXY_HOPS); unset: 0. Staff auth limits
   * and the receipt's code limits (TSK-0033) count the client network behind them.
   */
  trustProxyHops?: number
  /** Seals property access codes (TSK-0045); unset or null: the access-code store is NOT CONFIGURED. */
  accessCodeKey?: Secret | null
}

const NO_CODE_KEY: CodeKeySettings = { state: 'not_configured', missing: ['CODE_HASH_KEY'] }

export function apiModules(deps: ModuleDeps): ApiModule[] {
  return [
    identityModule({
      cookies: { secure: deps.secureCookies },
      mfaKey: deps.mfaKey,
      trustProxyHops: deps.trustProxyHops ?? 0,
    }),
    // TSK-0034: the submission issues the project's access grant with the code key.
    requestsModule(deps.codeKey ? { codeKey: deps.codeKey } : {}),
    COVERAGE_MODULE,
    photosModule({ storage: deps.storage ?? null }),
    SITE_MODULE,
    QUEUE_MODULE,
    // TSK-0053: Write an Estimate and the staff builder; TSK-0054: Upload an Estimate and the customer PDF.
    estimatesModule({ storage: deps.storage ?? null, testMark: deps.environment !== 'production' }),
    NOTIFICATIONS_MODULE,
    systemModule(deps.system ?? {}),
    // TSK-0033: the receipt's contact verification and its account-offer answer.
    verificationModule({ codeKey: deps.codeKey ?? NO_CODE_KEY, trustProxyHops: deps.trustProxyHops ?? 0 }),
    // TSK-0034: the project access link landing and the opened project.
    accessModule({ codeKey: deps.codeKey ?? NO_CODE_KEY, trustProxyHops: deps.trustProxyHops ?? 0 }),
    // TSK-0036: optional customer accounts with one-time-code sign-in, Sign Out and sign-in email changes.
    accountsModule({ codeKey: deps.codeKey ?? NO_CODE_KEY, trustProxyHops: deps.trustProxyHops ?? 0 }),
    // TSK-0038: the customer project workspace frame (projects list and Overview); TSK-0039: the other five tabs.
    // TSK-0057: the approval and the in-session fresh verification before it.
    portalModule({
      storage: deps.storage ?? null,
      testMark: deps.environment !== 'production',
      codeKey: deps.codeKey ?? NO_CODE_KEY,
      trustProxyHops: deps.trustProxyHops ?? 0,
    }),
    // TSK-0044: staff customer and contact records, notes with visibility classes and duplicate suggestions.
    CUSTOMERS_MODULE,
    // TSK-0049: the unified inbox, Needs Linking and the inbound channel states (from this process's settings).
    inboxModule({ providers: deps.system?.providers ?? null }),
    // TSK-0045: property records and the protected access-code store.
    propertiesModule({ accessCodeKey: deps.accessCodeKey ?? null }),
    // TSK-0051: staff questions, customer replies and portal messages, reminders and "Closed—no response".
    questionsModule(),
  ]
}

/** The modules as the contract (openapi.json) describes them; cookie flags and keys do not change the contract. */
export const MODULES: readonly ApiModule[] = apiModules({ secureCookies: true, mfaKey: null })
