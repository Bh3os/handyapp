// The API modules the server registers (TSK-0010; HH-ARC-02). Each feature adds its module under
// src/modules/<name>/index.ts exporting an ApiModule, and lists it here; its routes then appear in openapi.json.
import type { ApiModule } from '../api/route.js'
import type { Secret } from '../providers/types.js'
import { identityModule } from './identity/index.js'
import type { ObjectStorage } from '../providers/index.js'
import { COVERAGE_MODULE } from './coverage/index.js'
import type { EnvironmentName, StagingCheck } from '../config.js'
import { estimatesModule } from './estimates/index.js'
import { APPROVALS_MODULE } from './approvals/index.js'
import { BUSINESS_MODULE } from './business/index.js'
import { CUSTOMERS_MODULE } from './customers/index.js'
import { inboxModule } from './inbox/index.js'
import { loadoutsModule } from './loadouts/index.js'
import { fieldModule } from './field/index.js'
import { fieldPhotosModule } from './field-photos/index.js'
import { financeModule } from './finance/index.js'
import { NOTIFICATIONS_MODULE } from './notifications/index.js'
import { packetsModule } from './packets/index.js'
import { photosModule } from './photos/index.js'
import { propertiesModule } from './properties/index.js'
import { QUEUE_MODULE } from './queue/index.js'
import { requestsModule } from './requests/index.js'
import { accessModule } from './access/index.js'
import { accountsModule } from './accounts/index.js'
import { auditModule } from './audit/index.js'
import { capacityModule } from './capacity/index.js'
import { portalModule } from './portal/index.js'
import { questionsModule } from './questions/index.js'
import { SITE_MODULE } from './site/index.js'
import { sopsModule } from './sops/index.js'
import { startModule } from './start/index.js'
import { hazardsModule } from './hazards/index.js'
import { staffModule } from './staff/index.js'
import { systemModule, type SystemDeps } from './system/index.js'
import { verificationModule } from './verification/index.js'
import { retentionModule } from './retention/index.js'
import { privacyModule } from './privacy/index.js'
import { visitsModule } from './visits/index.js'
import { stagingModule, type StagingEnvironment } from './staging/index.js'
import { launchModule, type LaunchGate } from './launch/index.js'
import type { CodeKeySettings } from './identity/index.js'

export type ModuleDeps = {
  /** Secure, `__Host-` session cookies (staging and production); plain cookies over http in local and ci. */
  secureCookies: boolean
  /**
   * Seals staff TOTP secrets (mandatory MFA, TSK-0015, TSK-0154); null while MFA_ENCRYPTION_KEY is unset, which refuses
   * every staff sign-in.
   */
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
  /**
   * TSK-0141: the process side of the staging identification (stagingToolsEnvironment). The Staging Tools module is
   * registered only when it identifies a staging, local or ci environment with STAGING_TOOLS=on; never in production.
   */
  staging?: { identified: boolean; checks: readonly StagingCheck[] }
  /**
   * TSK-0142: this process's cached launch phase (search indexing, app.ts), cleared when the Owner moves the phase.
   * Unset: nothing is cached (every check reads the database).
   */
  launchGate?: LaunchGate | null
  /** TSK-0142: the approved test destinations (TEST_EMAIL_DESTINATIONS), so the test accounts show who receives email. */
  testEmailDestinations?: readonly string[]
}

const NO_CODE_KEY: CodeKeySettings = { state: 'not_configured', missing: ['CODE_HASH_KEY'] }

export function apiModules(deps: ModuleDeps): ApiModule[] {
  const modules: ApiModule[] = [
    identityModule({
      cookies: { secure: deps.secureCookies },
      mfaKey: deps.mfaKey,
      trustProxyHops: deps.trustProxyHops ?? 0,
    }),
    // TSK-0034: the submission issues the project's access grant with the code key.
    // TSK-0142: in production the submission follows the launch phase (public submissions only in phase 3).
    requestsModule({
      ...(deps.codeKey ? { codeKey: deps.codeKey } : {}),
      ...(deps.environment ? { environment: deps.environment } : {}),
    }),
    COVERAGE_MODULE,
    photosModule({ storage: deps.storage ?? null }),
    // TSK-0076: field photos, sharing with the customer, publication permissions and the customer's photo links.
    fieldPhotosModule({ storage: deps.storage ?? null }),
    SITE_MODULE,
    QUEUE_MODULE,
    // TSK-0053: Write an Estimate and the staff builder; TSK-0054: Upload an Estimate and the customer PDF.
    estimatesModule({ storage: deps.storage ?? null, testMark: deps.environment !== 'production' }),
    // TSK-0130: the Owner's approval before publishing over the threshold, its queue and the threshold setting.
    APPROVALS_MODULE,
    // TSK-0144: Business settings (the mailing address the Owner enters) and the legal documents with their sign-off.
    BUSINESS_MODULE,
    // TSK-0059: the deposit requirement, recorded deposit payments, the Owner's waiver (the gate is called by visits).
    // TSK-0085, TSK-0086: invoices drafted from the approved scope, issued after the quality review; the ledger.
    financeModule({ storage: deps.storage ?? null }),
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
    // TSK-0061: the visit model (tentative estimate and work visits, local windows in an IANA zone, window history).
    visitsModule(),
    // TSK-0062: working hours, time off, equipment and the capacity of a day (reservations: the visits module).
    capacityModule(),
    // TSK-0068: the SOP version pinned on each work package of a job, and the Owner's competent-review sign-off.
    sopsModule(deps.environment ? { environment: deps.environment } : {}),
    // TSK-0069: the versioned job packet, what changed since each person viewed it, and its audited print and PDF.
    packetsModule({ storage: deps.storage ?? null, accessCodes: (deps.accessCodeKey ?? null) !== null }),
    // TSK-0071: loadout confirmation, critical shortages and their task blocks.
    loadoutsModule(),
    // TSK-0070: My Day, On my way, Arrived and Finished per worker, the Owner's corrections and the accountant's CSV.
    fieldModule(),
    // TSK-0073, TSK-0074: the Start Work gate, site checks, before photos, holds and the three exceptions.
    startModule({ storage: deps.storage ?? null, ...(deps.environment ? { environment: deps.environment } : {}) }),
    // TSK-0077: Stop Work / Report Hazard with its critical hold in the same transaction, issue reports, photos,
    // stabilization records and the Owner-released work-paused notice.
    hazardsModule({ storage: deps.storage ?? null }),
    // TSK-0097: staff management (the staff list, role and capability grants, offboarding and re-enabling).
    staffModule(),
    // TSK-0098: the audit-log screen (Owner every entry, Office their own actions; retention shown, never deleted).
    auditModule(),
    // TSK-0099: the retention schedule and the Owner's deletion-review queue (read-only; nothing deleted automatically).
    retentionModule(),
    // TSK-0100: privacy requests, the Owner's Delete or Archive decisions, the deletion log and customer downloads.
    privacyModule({ storage: deps.storage ?? null }),
    // TSK-0142: the launch phase and its switches (the Owner moves it, with a recorded approval; phase 1 by default).
    launchModule({ environment: deps.environment ?? 'local', gate: deps.launchGate ?? null }),
  ]
  // TSK-0141 (OWN-DEC-191): Staging Tools exist only in a positively identified staging or isolated test environment.
  const env = deps.environment
  if (deps.staging?.identified === true && (env === 'staging' || env === 'local' || env === 'ci'))
    modules.push(
      stagingModule({
        environment: env satisfies StagingEnvironment,
        checks: deps.staging.checks,
        codeKey: deps.codeKey ?? NO_CODE_KEY,
        routes: modules.flatMap((m) => m.routes),
        testEmailDestinations: deps.testEmailDestinations ?? null,
      }),
    )
  return modules
}

/** The modules as the contract (openapi.json) describes them; cookie flags and keys do not change the contract. */
export const MODULES: readonly ApiModule[] = [
  ...apiModules({ secureCookies: true, mfaKey: null }),
  // TSK-0141: the contract lists the staging-only routes too (their descriptions say so); a server registers them
  // only in an identified staging or test environment, never in production.
  stagingModule({ environment: 'staging', checks: [], codeKey: NO_CODE_KEY, routes: [], testEmailDestinations: null }),
]
