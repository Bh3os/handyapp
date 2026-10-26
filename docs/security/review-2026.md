# Security review before real customer data (2026)

Release evidence for [OWN-DEC-136](../../kg/decisions/OWN-DEC-136.md): a multi-angle security review of HandyApp,
its findings and their fixes, before any real customer data is entered. Task: TSK-0109. Requirements: HH-SEC-01,
HH-SEC-02, HH-SEC-03, HH-SEC-04, HH-SEC-07, RULE-AI-WAVE2, OWN-DEC-14, OWN-DEC-15, OWN-DEC-20, OWN-DEC-74.

## Who reviewed it

- **AI review only.** The review was carried out on 2026-10-26 by AI agents (Claude, in Claude Code), as OWN-DEC-136
  decides: "AI review only". That decision replaces the qualified-human-reviewer requirement of earlier decisions
  (OQ-SECURITY-REVIEW is superseded). No human security reviewer took part, and none is claimed.
- **No sign-off is implied.** The owner's production go decision (OQ-GO-DECISION) stays with the owner.

## What was reviewed

- **Base and scope.** The review read the code at commit `1fc8fe2`: the TSK-0116 AI guardrails
  (`apps/server/src/platform/ai/`) and the TSK-0117 assistance routes (`apps/server/src/modules/ai-assist/`). It then
  covered the whole server, the three front ends and CI.
- **Angles.** Each angle got its own reading pass, and then a check of each finding against the code:
  - AI guardrails and the disabled assistance;
  - paths by which customer data could leave: logs, error reports, audit summaries, exports, outbound integrations
    (Resend, Bird, R2), analytics, caches and bundles;
  - transport, sessions, CSRF and MFA;
  - injection, encoding, validation and uploads;
  - rate limits and availability;
  - webhooks;
  - the HH-SEC-01 threat model.
- **Evidence format.** "file:line" refers to commit `1fc8fe2` unless it says "now". Every fix is pinned by a test,
  tagged with the requirement it serves.

## Summary

There are 13 findings and all 13 are fixed. Another 18 items are not fixed in this task:

- **Proposed for later (P-1 to P-9, P-14, P-18).** The owner decides these in
  [OQ-SECURITY-REVIEW-DETAILS](../../kg/questions/OQ-SECURITY-REVIEW-DETAILS.md).
- **Accepted (P-10 to P-13, P-15 to P-17).** These are recorded below with the reason they are acceptable.

No High finding was found in the AI module. It is disabled in every environment, and nothing in the repository can
reach an AI provider.

| ID      | Severity | Area                          | Finding                                                                                                   | Status |
| ------- | -------- | ----------------------------- | --------------------------------------------------------------------------------------------------------- | ------ |
| AVAIL-1 | High     | Availability                  | 10 parallel unauthenticated sign-ins froze the whole API until it was restarted (pool deadlock)           | Fixed  |
| LINK-1  | Medium   | Secrets in logs and URLs      | A staff invite/reset token in the link path was written to the request log and kept in browser history    | Fixed  |
| AVAIL-2 | Medium   | Availability                  | Each unauthenticated `/readyz` call opened a new database connection                                      | Fixed  |
| CONF-2  | Medium   | Rate limits                   | Production could start without `TRUST_PROXY_HOPS`, so every per-network limit became one global bucket   | Fixed  |
| MON-1   | Medium   | Monitoring                    | No security-signal monitoring existed (HH-SEC-07)                                                         | Fixed  |
| CONF-1  | Low      | Separate hosts                | Production could start on one host, with the staff app on the public host (OWN-DEC-133)                   | Fixed  |
| AUTH-1  | Low      | Rate limits                   | Staff sign-in, MFA and re-auth limits read the count before verifying and added to it only afterwards     | Fixed  |
| LOG-2   | Low      | Secrets in logs               | Logged PostgreSQL errors kept `detail`/`where`/`hint`, which quote the values a statement held            | Fixed  |
| LOG-3   | Low      | Error responses               | The 404 answer echoed the full URL, query string included                                                 | Fixed  |
| AI-1    | Low      | AI (inert)                    | AI suggestion routes had no rate limit; every refusal writes an audit row kept for 7 years                | Fixed  |
| AI-2    | Low      | AI (inert)                    | AI redaction was English-only and missed a code several words after "code"                                | Fixed  |
| AI-3    | Low      | AI (inert)                    | AI redaction kept street addresses written in free text                                                   | Fixed  |
| SEC-1   | Low      | Secrets in bundles            | CI scanned the source for secrets, but not the built bundles that browsers download                       | Fixed  |

## Findings and fixes

### AVAIL-1 (High): a few parallel sign-ins froze the API

- **Evidence.**
  - Every write route runs its handler inside a transaction that holds one pool connection
    (`apps/server/src/api/register.ts:333`, `withTx(db, …)`).
  - The sign-in handler also takes a second connection while that one is held: the rate counts
    (`apps/server/src/modules/identity/index.ts:93-99`), the account lookup (`:95`) and `auditAlways`, which runs in
    its own transaction (`register.ts:310-315`).
  - The pool had no wait limit (`packages/db/src/client.ts:32-39`; pg's default is to wait forever) and holds ten
    connections.
- **Effect.** With ten or more parallel sign-ins, each held one connection and waited for a second one that never came
  free. The API then answered nothing until it was restarted.
  - Sign-in needs no session.
  - The per-network limit did not help, because counting it needs a connection too.
  - Reproduced: 16 parallel `POST /staff/auth/sign-in` calls with a wrong password; without the fix the test ran into
    its 40-second timeout.
- **Fix.**
  - The server's pools now wait at most `SERVER_POOL_CONNECT_TIMEOUT_MS` (10 s, PROPOSED) for a connection
    (`packages/db/src/client.ts`, used by `apps/server/src/boot.ts` and `apps/server/src/app.ts`).
  - A request that cannot get a connection now fails, its transaction rolls back and the pool recovers.
- **Test.** `apps/server/test/integration/security-review.test.ts`, "more parallel sign-ins than the server pool has
  connections all end, and the API keeps answering". It uses the server's own pool and passes in about 12 s.
- **Residual.**
  - Sustained parallel pressure can still delay requests by up to 10 s per wave.
  - Restructuring routes so they never need a second connection inside a transaction is P-7.

### LINK-1 (Medium): staff link tokens in request logs and browser history

- **Evidence.**
  - The staff invite and reset links carry their single-use token in the path:
    `apps/server/src/modules/identity/link-email.ts:52` (`/invite/<token>`, `/reset/<token>`), and the operations
    command builds the same shape at `apps/server/src/cli/staff-access.ts:86`.
  - The request logger dropped only the query string (`apps/server/src/platform/logger.ts:28`), so each visit wrote a
    working token to the server log.
  - Email link scanners usually open a link before the person does, so the token reached the log while it was still
    unused.
  - The staff app kept the token URL in the address bar and history (`apps/staff/src/App.tsx:118`, `:193`).
- **Fix.**
  - `loggablePath()` (now `apps/server/src/platform/logger.ts`) masks `/invite/<token>` and `/reset/<token>` in every
    request log line, below `/staff` too.
  - The staff app replaces the address with `/invite` or `/reset` as soon as it has read the token, and keeps the token
    in memory only (`apps/staff/src/App.tsx`, the `linkToken` effect).
- **Tests.**
  - `apps/server/test/unit/logger.test.ts`, "masks a staff invite or reset token in request paths…".
  - `apps/staff/test/App.test.tsx`, "the link token leaves the address bar and history once read…".
- **Residual (P-6).** The token still travels in the path, so Render's own request logs and a link scanner's request
  can see it. Moving it to the fragment, as the customer access link already does, is proposed.

### AVAIL-2 (Medium): `/readyz` opened a database connection per call

- **Evidence.**
  - `apps/server/src/health.ts:36` called `pendingMigrations(databaseUrl)` on every request. That opens a new
    `pg.Client` (`packages/db/src/migrate.ts:131-132`) and reads the migration files.
  - `/readyz` needs no sign-in in production.
- **Fix.**
  - Once every migration is applied, the answer is kept for the life of the process; a deploy starts a new process.
  - Until then, parallel calls share one check in flight. A "pending" result is never kept.
- **Test.** `security-review.test.ts`, "parallel calls share one migration check, and an applied schema is not read
  again".

### CONF-2 (Medium) and CONF-1 (Low): unsafe production shapes were accepted

- **TRUST_PROXY_HOPS evidence (CONF-2).**
  - `apps/server/src/config.ts:329` defaulted `TRUST_PROXY_HOPS` to 0 in every environment, and `render.yaml:69-70`
    leaves it unset.
  - Behind Render's proxy, 0 counts every client as the proxy.
  - Every per-network limit then becomes one shared bucket: staff sign-in, customer codes, public submissions and
    uploads, and webhooks. One caller could lock everyone out.
- **Single-host evidence (CONF-1).** `config.ts:288-303` accepted production with neither `PUBLIC_ORIGIN` nor
  `STAFF_ORIGIN`. That is single-host mode, which serves the staff app and staff API on the public host, against
  OWN-DEC-133.
- **Fix.** Production now refuses to start in either case.
  - Two origins are required.
  - `TRUST_PROXY_HOPS` must be set explicitly, even to 0, once measured; this review does not guess the value.
  - Staging, local and CI are unchanged.
- **Test.** `apps/server/test/unit/config.test.ts`, "production needs two hosts and a measured TRUST_PROXY_HOPS".
  `test/fixtures/env.ts` `PRODUCTION_SHAPE` is used by the production boot tests.

### MON-1 (Medium): security signals (HH-SEC-07)

- **Evidence.**
  - The Owner's system health report (`apps/server/src/modules/system/health.ts`) had no security check, and no code
    referred to HH-SEC-07.
  - Customer scope denials were audited as `security.scope_denied` (`register.ts:202-216`), and failed codes and
    passwords as denied events, but nothing counted them.
- **Fix.** A new `security_signals` check on the same screen counts the last 24 hours of the append-only audit log. It
  shows counts only, so the Owner and two employees see one line rather than a stream of alerts:
  - `denied_access`: requests outside a customer's scope (T19);
  - `failed_verifications`: wrong passwords, authenticator codes and one-time codes;
  - `privileged_changes`: role, account and authenticator changes, deposit waivers, reopen, refunds, exports and the
    launch phase.
- **Thresholds.** The check needs attention at 20 denials or 30 failures (PROPOSED). Its note says what it cannot see:
  webhook signature failures and staff permission refusals are only in the server log, and rejected uploads are
  counted by the uploads check. Labels are in both staff catalogs. No claim of staffed monitoring is made.
- **Residual (P-18).** An exception item in the Owner's queue when a threshold is crossed is not built yet.
- **Test.** `security-review.test.ts`, "probing for other customers' records and privileged changes are counted; the
  threshold needs attention".

### AUTH-1 (Low): the order of rate counting on staff sign-in

- **Evidence.**
  - `check()` read the count and `hit()` added to it only after a failure
    (`apps/server/src/modules/identity/rate-limit.ts:31-53`).
  - Callers: sign-in at `index.ts:93-99`; MFA confirm and verify at `security.ts:150-152` and `:207-214`; re-auth at
    `index.ts:236-244`.
  - In one process the attempts were serialized in practice, by hashing and row locks. The guarantee rested on that
    accident and would not hold across several server instances.
  - The module's own header already promised that parallel guesses cannot pass together.
- **Fix.** Each attempt is now counted before the password or code is checked (`hit`), and a successful attempt is given
  back (`release`), so only failures stay counted.
- **Tests.** `security-review.test.ts`:
  - parallel wrong passwords and parallel wrong authenticator codes get no more than the limit checked;
  - a successful sign-in is given back.

### LOG-2 (Low) and LOG-3 (Low): error text in logs and responses

- **Evidence.**
  - LOG-2: the error serializer (`logger.ts:34`) kept every field of an error. A PostgreSQL error's `detail` reads
    `Key (email)=(…) already exists`, and `where`, `hint` and the parameters can quote values too. Such errors are
    logged at `register.ts:406`, `app.ts:211`, `platform/jobs.ts:332/367/395` and `boot.ts:113`.
  - LOG-3: the not-found handler echoed `req.url` with its query (`app.ts:205`).
- **Fix.**
  - The serializer drops `detail`, `where`, `hint`, `internalQuery`, `query` and `parameters` before redaction.
  - The 404 answer carries the loggable path only.
- **Tests.** `logger.test.ts`:
  - "logs a database error without the values its detail quotes";
  - "masks a staff invite or reset token in request paths, and never echoes a query back".

### AI-1, AI-2, AI-3 (Low): the AI guardrails, while AI stays disabled

All three are latent while the module is disabled: no request is ever sent to a model. They are fixed now so the
guardrails are right before plan 33 is approved.

- **AI-1.**
  - Evidence: `apps/server/src/modules/ai-assist/index.ts:68` set `rateLimit: 'none'`. Each request writes an
    `ai.assist` denied entry to the append-only audit log, kept 7 years, so one session could fill it.
  - Fix: `AI_ASSIST_RATE_LIMIT`, 60 per staff member per hour (PROPOSED).
  - Test: `apps/server/test/integration/ai-assistance.test.ts`, "one staff member cannot fill the audit log…".
- **AI-2.**
  - Evidence: the redaction patterns (`apps/server/src/platform/ai/input.ts:36-45`) knew only English code words, and
    only the word right after them.
  - Why it matters: `staff_note.translate` receives Spanish worker notes (OWN-DEC-211), so "el código de la puerta es
    4821" passed unredacted, and so did "the code to the gate is 4821".
  - Fix:
    - Spanish code words (código, clave, contraseña, combinación, candado) are added.
    - A value containing a digit within the same clause after a code word is redacted.
    - Code words must be whole words: "pine" and "codes" are not matched.
- **AI-3.**
  - Evidence: address fields were dropped by name, but an address written into a description or message survived.
  - Fix: street addresses (a house number, capitalised words and a street type) are redacted.
- **Tests (AI-2 and AI-3).** `apps/server/test/unit/ai-guardrails.test.ts`, "redacts a code a few words after its word,
  Spanish codes and street addresses".

### SEC-1 (Low): no secret scan of the built bundles

- **Evidence.**
  - `.github/workflows/ci.yml:23-28` ran gitleaks on the source tree only, before any build.
  - The bundles browsers download (`apps/site/dist`, `apps/portal/dist`, `apps/staff/dist`) were never scanned.
  - No secret was found in them. The front ends read only `import.meta.env.PROD` and `BASE_URL`, and no `VITE_*` or
    `PUBLIC_*` variable exists.
- **Fix.** The e2e job now runs the same pinned, checksum-verified gitleaks 8.30.1 on each built bundle after
  `pnpm build`.
- **Check.** This step runs in CI. Locally, a pattern search of the three bundles for provider-key shapes, connection
  strings and the secret variable names found only the name `MFA_ENCRYPTION_KEY` in a staff-app error message. That is
  a variable name, not a value.

## Not fixed here: proposed (owner decides) or accepted

| ID   | Severity | Item                                                                                                                                                                                                                                                                                                                                            | Decision                                               |
| ---- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| P-1  | Low      | 27 routes use `permission: AUTHENTICATION`, which skips `decide()` (`register.ts:257`). They include customer account, organization and saved-property routes, which are authorized in their handlers. `routeProblems` only checks that a permission is present (`route.ts:210`). No bypass was found in the sampled handlers.                     | PROPOSED: matrix actions for them                      |
| P-2  | Low      | `csrfGuard` lets through an unsafe request that has neither `Sec-Fetch-Site` nor `Origin` (`register.ts:167-176`). Customer sessions have no CSRF token. SameSite (Strict for staff, Lax for customers) and modern browsers' headers cover this today.                                                                                            | PROPOSED: refuse cookie and no headers                 |
| P-3  | Low      | The route contract does not require a params schema for `:param` paths (`route.ts:242-243`). Some ID params use `maxLength` instead of a UUID pattern, so a bad ID reaches PostgreSQL and comes back as INTERNAL.                                                                                                                             | PROPOSED                                               |
| P-4  | Low      | Staging's log email sender writes whole messages, one-time codes and staff links included, to the staging log (`providers/log-email.ts:38`). It is staging-only by design (TSK-0112), sends only to the allowlist, and production refuses it (`providers/settings.ts:149-153`).                                                                | Accepted until Resend is set up                        |
| P-5  | Low      | Photo originals keep their EXIF/GPS data. The upload check is structural (`photos/content.ts:1-6`). Field photos are of the customer's own property and stay private, but a copy shared or downloaded for publication would carry the home's location.                                                                                         | PROPOSED: strip metadata on shared and published copies |
| P-6  | Low      | The staff link token is still in the path (see LINK-1).                                                                                                                                                                                                                                                                                         | PROPOSED: fragment                                     |
| P-7  | Low      | Sustained parallel pressure on write routes (see AVAIL-1).                                                                                                                                                                                                                                                                                      | PROPOSED                                               |
| P-8  | Info     | There is no `Permissions-Policy` header. HSTS has no `includeSubDomains`; this is PROPOSED in `hosts.ts:104-106` pending the owner's DNS.                                                                                                                                                                                                      | PROPOSED                                               |
| P-9  | Info     | No explicit request body limit is set, so Fastify's 1 MiB default applies. Uploads have their own limits.                                                                                                                                                                                                                                       | PROPOSED                                               |
| P-10 | Info     | `redact()` works on key names. It does not cover `url`/`link`, `privateKey` or `databaseUrl` keys, and its exact `code` key also hides SQLSTATE codes (`platform/redact.ts`). None of the 21 log call sites passes such a key today.                                                                                                             | Accepted; watch new log calls                          |
| P-11 | Info     | Audit `reason` fields hold staff-typed text without redaction (`privacy/index.ts:521,591`, `staging/index.ts:578,591`). This is normal for an audit log.                                                                                                                                                                                       | Accepted                                               |
| P-12 | Info     | Accounting CSVs include staff free text: refund reason, cost note and void reason (`dashboard/accounting.ts:256,425,428`). Separately, `csvCell` prefixes `'` to negative numbers (`packages/domain/src/owner-dashboard.ts:226`), which is a formula-injection guard but turns amounts into text.                                             | Accepted; the Owner exports with fresh sign-in         |
| P-13 | Info     | The packet's "Directions" link sends the address to Google Maps, only when the worker taps it (`packets/view.ts:54-55`).                                                                                                                                                                                                                        | Accepted                                               |
| P-14 | Info     | The staff and portal builds ship source maps. They contain no secrets (SEC-1), but they expose the source.                                                                                                                                                                                                                                      | PROPOSED: drop in production                           |
| P-15 | Info     | AI redaction is a heuristic. Unlabelled codes ("gate 4821#"), lower-case addresses and non-US phone numbers pass. AI output length is not bounded. Dropping inputs by name and approving the destination are the primary controls.                                                                                                              | Accepted while AI is off; OQ-AI-GUARDRAILS-DETAILS     |
| P-16 | Info     | An account without an authenticator (new, or reset by the Owner) enrols one with its password alone (`identity/index.ts:117-119`). This is first-use trust by design (OWN-DEC-202).                                                                                                                                                              | Accepted                                               |
| P-17 | Info     | Staff permission refusals are logged (`AUTHZ_DENIED`, `register.ts:270`) but not audited, so MON-1 cannot count them.                                                                                                                                                                                                                           | Accepted; noted on the screen                          |
| P-18 | Low      | HH-SEC-07 asks for important signals to appear as exceptions in the Owner's queue. MON-1 shows them on the system health screen only.                                                                                                                                                                                  | PROPOSED: a queue item at the threshold                |

## Threat model (HH-SEC-01)

Each material threat is mapped to its server control, a negative test, its monitoring signal and its residual risk.
Paths are relative to `apps/server` unless shown otherwise.

| Threat                                                   | Server control                                                                                                                                                                                                      | Negative test(s)                                                                                                                                                                                                  | Monitoring                                                                  | Residual risk                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Guest project access (link and code; expired, forwarded) | `src/modules/access/grants.ts:107` `resolveGrant` (hash, not revoked, not expired); exchange re-reads it under a lock (`src/modules/access/index.ts:232`); token in the fragment, `no-store`, no referrer            | `test/integration/project-access.test.ts` "a missing, guessed, altered, expired or revoked link … opens nothing"; `access-recovery.test.ts` "[T19] a reissued grant is limited to that project"                   | Failed codes counted (MON-1 `failed_verifications`)                         | A forwarded link works until it expires (24 h) or is revoked      |
| Customer account linking and merges                      | `src/modules/customers/links.ts:574` `mergeCustomers` (staff confirm; stale preview refused); `src/modules/accounts/claims.ts:173`                                                                                  | `record-links.test.ts` "[T21] a shared email and phone only suggest"; "[T29] correcting the mistaken link revokes the access"; `customer-dashboard.test.ts` "an unverified or wrong match links nothing"         | Merges and link corrections audited                                         | A staff member confirms a wrong merge (correction path exists)    |
| Cross-customer access (altered IDs, search, downloads, caches) | `packages/policy/src/decide.ts:136` scope gives NOT_FOUND; `src/api/register.ts:202` `recordScopeDenial`; `private, no-store` by default (`register.ts:47`)                                                   | `scoped-access.test.ts` "[T19] every read of B … is the same NOT_FOUND …, logged as a security event"; `queue.test.ts` "[T68] a tampered cursor or filter is refused"; `privacy-downloads.test.ts` "[T68]"           | `security.scope_denied` (MON-1 `denied_access`)                             | None known                                                        |
| Worker assignment (unassigned, reassigned, disabled)     | `packages/policy/src/scope.ts:88` `isAssigned`; `decide.ts:130` NOT_ASSIGNED, `:200` ACCOUNT_NOT_ACTIVE; disabling revokes sessions (`src/modules/staff/members.ts:646`); writes re-checked (`register.ts:333-336`) | `worker-access.test.ts` "[T27] offboarding and expired sessions: the next call is refused"; `staff-management.test.ts` "[T27] a write already on its way … cannot commit"; `reply-proposals.test.ts` "[T26]"      | `AUTHZ_DENIED` log; `staff.disable` counted (MON-1)                         | Staff denials are logged only (P-17)                              |
| Privileged finance and configuration actions             | `decide.ts:146-147` fresh sign-in and reason; matrix rows for refund, write-off, waiver and reopen (`packages/policy/src/matrix.ts`); `register.ts:290` `requireFreshAuth`                                            | `invoices.test.ts` "[T64] a non-Owner refund is refused"; `closeout.test.ts` "[T64] only the Owner reopens, with a fresh sign-in and a reason"; `deposits.test.ts` "the database refuses a waiver by anyone but the Owner" | Audited; counted as `privileged_changes` (MON-1)                            | None known                                                        |
| Private media and uploads                                | Type from the bytes (`src/modules/photos/content.ts`); limits from config under a lock; quarantined until processed; signed URLs only for ready photos, 300 s (`photos.ts:343`)                                     | `photos.test.ts` "[T14] accepts a 15 MiB JPEG and refuses one byte more"; "[T14] refuses a PDF, a non-image, a mismatched type, appended data and markup"; "[T14] refuses an 11th photo"                       | Rejected uploads on the uploads health check                                | Structural check, not a malware scanner; EXIF kept (P-5)          |
| Inbound webhooks (Bird, Resend)                          | `src/providers/webhooks.ts:60` HMAC over the raw bytes, constant time; 300 s window (`:75`); receipt dedup (`:114`); 64 KiB (`:160`); rate limit before verification                                                 | `test/unit/providers/webhooks.test.ts` "rejects unsigned, tampered, wrongly keyed, stale and future deliveries"; `inbox.test.ts` "bad signatures, stale timestamps and oversized payloads are rejected"; "a replayed webhook is ignored" | `webhook rejected` log line with reason (noted on MON-1)                    | Per-network limit needs CONF-2's measured hops                    |
| Offline worker devices (lost phone, cached packet)       | `apps/staff/src/offline/packet.ts:53` offline copy without codes, photo links or deposit, and it expires; sync re-decides (`src/modules/field/sync.ts:163`); disabling revokes sessions                             | `apps/staff/test/Offline.test.tsx` "[T28] keeps no access-code entry, photo link or deposit state"; `field-sync.test.ts` "[T51] a worker reassigned away while offline"; "[T27] a disabled worker cannot sync"  | Conflicting events go to the Owner's review queue                           | A lost unlocked phone shows that day's cached packet until expiry |
| Exports                                                  | `export.accounting` (Owner, fresh sign-in, reason); packet PDF without codes (`src/modules/packets/pdf.ts:130-138`); privacy export needs fresh verification; CSV formula cells neutralised                         | `owner-dashboard.test.ts` "non-owners are refused; the Owner needs a fresh sign-in and a reason"; `job-packets.test.ts` "[T28] the PDF and print never hold it"; `privacy.test.ts` "[T68] only the requester downloads" | Audited; counted as `privileged_changes`                                    | Staff free text in accounting CSVs (P-12)                         |
| Staff sign-in with mandatory MFA                         | Counted before verification (AUTH-1); generic errors; argon2id; pre-MFA sessions refused everywhere (`register.ts:239`); a reset revokes every session                                                               | `staff-auth.test.ts` "repeated failed sign-ins … are rate limited"; "a wrong password and an unknown email get the same answer"; `staff-mfa.test.ts` "the password starts a verify session that reaches nothing but the challenge"; `security-review.test.ts` (AUTH-1) | Wrong passwords and codes (MON-1 `failed_verifications`)                    | First enrolment by password (P-16)                                |
| Access code reveal                                       | `src/modules/properties/index.ts:956` `revealAccessCode` (assigned, visit date, online, audited); `decide.ts:177` NOT_VISIT_DATE                                                                                    | `properties.test.ts` "[T28] … each reveal audited; unassigned and estimator reveals are refused"; "only the reveal carries the code: no other response, table, audit event or log line does"                     | `access_code.reveal` audited (who and when, never the value)                | None known                                                        |
| Secrets in audit, logs, analytics and bundles            | Key-based redaction (`src/platform/redact.ts`); path and query masking and driver-field removal (LINK-1, LOG-2); no analytics or error-tracking SDK; bundle scan (SEC-1)                                              | `logger.test.ts`; `access-recovery.test.ts` "[T74] after a full access journey no log line and no row … holds a token, a code or a session"; `staff-auth.test.ts` "[T74] audit events and the outbox hold no password, hash or token" | Audit hash chain (`audit-retention.test.ts`)                                | P-4 (staging only), P-10                                          |
| AI module (wave 2, disabled)                             | `packages/policy/src/decide.ts:198` AI_DISABLED for any AI actor; `ai.module` can only be `{enabled:false}` (`src/platform/config/keys.ts:429`, `config.ts:179-182`, the database CHECK in migration 0005); gateway always refuses (`src/platform/ai/gateway.ts:59`) | `ai-guardrails.test.ts` (integration) "refuses every use, sends nothing"; "the kill switch stays off"; `test/unit/ai-guardrails.test.ts` "no workspace depends on an AI provider SDK"; `ai-assistance.test.ts`             | `ai.assist` denied entries (use and field names, never values)              | P-15                                                              |

## Controls checked and found correct

This is the positive evidence of the review. Line numbers refer to `1fc8fe2`.

**Transport and headers.**

- HSTS is sent in staging and production.
- The CSP uses hashes only and sets `frame-ancestors 'none'`. `nosniff`, `X-Frame-Options: DENY`, COOP and
  `Referrer-Policy` (no-referrer on private paths) are all set (`src/hosts.ts:58-130`).
- There are no third-party scripts, fonts or CDNs.

**Sessions.**

- Staff cookie: `__Host-`, HttpOnly, SameSite=Strict, Secure outside local and CI.
- Only token hashes are stored.
- Sessions rotate at sign-in, at every MFA step and at re-auth.
- The 30-minute idle timeout is enforced on the server, and a disabled account is refused on its next call
  (`src/modules/identity/sessions.ts`).
- Customer cookie: `__Host-`, SameSite=Lax. Customer sessions have a 30-minute idle limit and an 8-hour maximum,
  enforced in SQL (`src/modules/identity/customer-sessions.ts:133-135`).
- Customer and staff sessions never cross hosts (`register.ts:375-381`).

**CSRF.**

- `Sec-Fetch-Site` and `Origin` checks apply to every unsafe request.
- Full staff sessions also carry a constant-time CSRF token check (`register.ts:391-396`). See also P-2.

**MFA.**

- MFA is mandatory with no exceptions (OWN-DEC-202).
- TOTP secrets are sealed with AES-GCM; replayed codes are refused; recovery codes are hashed and single-use.
- Sign-in fails closed without `MFA_ENCRYPTION_KEY`.

**Injection.**

- All queries go through Kysely with bound values.
- The only `sql.raw` uses are a truncated number (`src/platform/jobs.ts:350`), a sequence name read from the catalog
  (`src/platform/restore.ts:184`) and quoted constant identifiers (`src/modules/staging/reset.ts:413`).

**Validation.**

- Every input object has `additionalProperties: false` (`src/api/route.ts:186-187`).
- AJV refuses unknown fields rather than stripping them (`src/app.ts:51`).
- Error answers use a fixed envelope with no stack, SQL or provider body (`register.ts:142-157`, `:404-411`).

**Uploads.** See the threat model above. The server enforces the limits from FACT-UPLOAD-LIMITS.

**Rate limits.**

- Counters are shared in PostgreSQL and keyed by HMAC (`src/api/rate-limit.ts:26-55`).
- Every public write and authentication route declares a limit.
- The public routes without one are read-only lookups.

**Outbound data.**

- There are only three `fetch` calls (Resend, Bird, and Resend's inbound fetch). Each uses a fixed base URL and
  `redirect: 'error'`, so there is no SSRF path.
- Resend receives only the message fields and one `kind` tag. Bird receives only to, from, text and category.
- Provider error bodies are reduced to codes.
- Outside production, every email and text goes through the test-destination guard.
- R2 objects carry no metadata and have opaque keys. Signed URLs last at most 900 s.

**Exports and caches.**

- API responses default to `private, no-store`.
- The staff service worker caches only the app shell and assets, never `/api/`.
- Offline packet copies drop access codes, photo links and the deposit.

**Analytics.** There are no analytics, telemetry or error-reporting SDKs in any workspace.

**AI.**

- No AI SDK, host or key exists anywhere. A test enforces this over every `package.json`, the lockfile and the server
  source.
- Model output is parsed under the OWN-DEC-14 contract: unknown fields, self-verification, invented IDs and disallowed
  actions all refuse the whole answer.
- A suggestion is never applied, and only a staff member holding the use's review action reviews it (OWN-DEC-15).

## Re-running the checks

- `pnpm test` and `pnpm test:int`. The findings are pinned in
  `apps/server/test/integration/security-review.test.ts` and the tests named above.
- CI's `secrets` job scans the source, and the e2e job scans the built bundles (SEC-1).
- The Owner's system health screen shows the security signals (MON-1).
