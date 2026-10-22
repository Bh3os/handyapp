# HandyApp handoff

Written 2026-10-22 when the long cloud build session ended, so work can continue locally. Read this first, then
`CLAUDE.md` and `docs/build-brief.md`. Everything decided lives in the knowledge graph (`kg/`); query it with
`node tools/kg.mjs`, never by reading files one by one.

## 1. Where things stand

- **Built and merged:** 99 tasks are `done` in the graph. Platform, public site, guided estimate request,
  CRM, estimates, scheduling, field work (My Day, loadouts, packets, Start Work gate), invoices, messaging and email
  delivery, staff MFA, the staging tools and the Owner Acceptance Testing switches are all built.
- **Staging** runs this repository: https://handyhub-staging.onrender.com (staff app `/staff`, portal `/portal`).
  TSK-0112 (point staging at this repo) is effectively done; staging deploys from `main`.
- **Launch phase:** phase 1 (Owner Acceptance Testing on staging). The owner has **not** authorized inviting real
  customers or a public launch. Do not move past phase 1 without the owner's explicit approval.
- **Not done and not claimed:** no attorney, CPA, insurer, safety or manual security/accessibility review has happened.
  Only automated axe scans have run. The Owner Acceptance Testing walkthrough on staging has not been walked yet
  (`docs/owner-acceptance-testing.md`, results table empty).

### Pull requests from this session (#72 to the end)

| PR  | Task               | What                                                                                                |
| --- | ------------------ | --------------------------------------------------------------------------------------------------- |
| #72 | TSK-0143           | Review packets for the attorney, CPA, insurance broker and safety reviewer (`docs/review-packets/`) |
| #73 | TSK-0070/0071/0072 | Worker My Day, loadouts, packet acknowledgments                                                     |
| #74 | kg                 | Owner's final decisions 2026-10-22 (OWN-DEC-202..212), Business Rules Registry                      |
| #75 | TSK-0130           | Owner approval before publishing over $2,500.00                                                     |
| #76 | TSK-0123           | Time-zone policy                                                                                    |
| #77 | TSK-0127           | Service-area ZIP dataset and SERVED / EDGE / OUTSIDE / UNKNOWN coverage                             |
| #78 | TSK-0141           | Staging-only Reset Test Data                                                                        |
| #79 | TSK-0119           | Messaging core: 28 owner templates, variables, branded layout, message states                       |
| #80 | fix                | Docker build context keeps source folders named coverage                                            |
| #81 | TSK-0112           | Staging-only `EMAIL_PROVIDER=log` (invite/reset links readable in the private log)                  |
| #82 | TSK-0154           | Mandatory MFA for every active staff account                                                        |
| #83 | TSK-0144           | Business mailing address setting; owner sign-off of estimate terms v1.0                             |
| #84 | TSK-0120           | Automatic email delivery for released customer and staff messages                                   |
| #85 | fix                | Revealed access code hides when the tab is hidden                                                   |
| #86 | TSK-0073/0074      | Server-side Start Work gate, hard holds, three owner-approved exceptions                            |
| #87 | fix                | kg index written atomically                                                                         |
| #88 | TSK-0121/0122      | Automatic routine reminders and delivery hours                                                      |
| #89 | TSK-0142           | Owner Acceptance Testing: test accounts, journey checklist, launch-phase switches                   |

| #90 | TSK-0085/0086 | Invoice draft from approved scope; payment ledger (migration 0077) |
| #91 | TSK-0132 | The 26 service pages and care notes after the quality review |
| #92 | TSK-0106/0111 | Outage drills, restore rehearsal, runbooks (`docs/runbooks/`) and the owner go checklist |
| #93 | TSK-0077 | Stop Work, Report Hazard, critical holds and issue reports (migration 0079) |
| #94 | docs | This handoff |
| #95 | TSK-0076 | Field photos, customer sharing, photo publication permissions, portal Photos tab (migration 0080) |
| #96 | TSK-0093 | Cases: complaints, incidents, damage, injury and disputes (migration 0081) |

## 2. What is left

### Branches not merged when the session ended

None. Every task branch from this session is merged (#90 to #96, last commit `d4ae7a7`). The highest migration on
`main` is `0081_cases.sql`; the next free number is **0082** (0078 was never used; gaps are fine). Staging was
redeployed from `d4ae7a7` on 2026-10-22.

TSK-0112 (point staging at this repository) is still `todo` in the graph but is effectively done: staging deploys
this repository. Mark it `done` in the next PR that touches the graph.

Follow-up worth a small task: `quality.cases.hazard_report_id` (0081) is a nullable column without a foreign key;
it can now be linked to `work.issue_reports` (0079).

### Suggested next tasks (RECOMMENDATION, not an owner decision)

1. TSK-0084 Owner quality review and punch items: final invoices are refused until it exists
   (`QUALITY_REVIEW_NOT_RECORDED`).
2. TSK-0083 Completion (quality checks, walkthrough) and TSK-0075 the job SOP checklist.
3. TSK-0103 Spanish safety release: until it ships, Spanish-reading workers cannot pass Start Work.
4. TSK-0129 Escalation (Call Owner / Call 911): needs the Owner's phone number, which is NOT CONFIGURED.
5. TSK-0081/0082 Change orders, then TSK-0087..0092 for the rest of the money flow.
6. TSK-0133 A2P 10DLC package: prepare only; registration fees and binding representations need the owner's explicit
   confirmation.

### Open tasks by area (`node tools/kg.mjs list task --status todo`)

- **a11y** (1):
  - TSK-0104 Accessibility pass on both websites
- **approval** (1):
  - TSK-0082 Change-order publishing, customer approval and packet update
- **estimates** (1):
  - TSK-0125 Discount requests with staff verification
- **field** (7):
  - TSK-0075 Job SOP checklist in six stages and active execution
  - TSK-0079 Offline packet and offline drafts
  - TSK-0080 Sync queue, reconnect revalidation and visible sync states
  - TSK-0081 Change orders: worker proposals and staff drafts
  - TSK-0115 Fuller offline workflows after controls are proven
  - TSK-0128 Worker data-access window on the visit day
  - TSK-0147 Packet re-review triggers and print metadata (D1, D2, D3)
- **i18n** (2):
  - TSK-0102 Spanish staff catalogs and language-switch behaviour
  - TSK-0103 Spanish safety texts released as AI-reviewed after a separate comparison check
- **identity** (5):
  - TSK-0113 Customer accounts: saved properties, preferences and Request This Service Again
  - TSK-0118 Organization accounts with explicit memberships and scopes
  - TSK-0124 Permanent customer dashboard, Project History and verified project claiming
  - TSK-0134 Phone verification opt-in on the receipt
  - TSK-0149 Customer account security amendments (F2, F4, F5, F6)
- **intake** (2):
  - TSK-0139 Preferred window hours and the new preference notice
  - TSK-0148 Questions: 'I'm not sure' beyond measurements; closing for no response and reopening (E2, E4, E5)
- **invoicing** (1):
  - TSK-0091 Unpaid-balance reminders and Overdue—owner decision
- **messaging** (2):
  - TSK-0133 A2P 10DLC registration package and the consent flows
  - TSK-0155 Spanish worker notes and proposed replies: the Owner/Office review queue and English customer replies
- **ops** (3):
  - TSK-0095 Estimated versus actual costs and report source states
  - TSK-0096 Owner Dashboard and accountant-ready exports
  - TSK-0112 Point the Render staging service at this repository
- **payments** (5):
  - TSK-0087 Square payment links, recorded payments and the Payments tab
  - TSK-0088 Cash collection and checks pending until cleared
  - TSK-0089 Returned checks, disputes, refunds, credits, voids and write-offs
  - TSK-0090 Reconciliation queue for unmatched and uncertain money
  - TSK-0131 Job gross margin and the advisory 30% flag
- **platform** (5):
  - TSK-0105 Performance budgets measured on representative data
  - TSK-0107 Cross-cutting robustness suite: races, duplicates, interruptions and automations
  - TSK-0110 Traceability report and Definition of Done check
  - TSK-0117 AI assistance for classification and drafting (wave 2, off by default)
  - TSK-0153 Mark the approved-as-built rules decided in configuration, catalogs and screens
- **portal** (1):
  - TSK-0150 Portal wording checked against actual behaviour (G)
- **privacy** (4):
  - TSK-0136 Privacy request acknowledgment, 30-day target and deadline tracking
  - TSK-0137 Request erasure with a reference-and-dates remainder
  - TSK-0138 Retention defaults for staff accounts, consent, history, logs and expired links
  - TSK-0152 Privacy request refinements (I1 to I5)
- **quality** (4):
  - TSK-0083 Completion: quality checks, walkthrough and the worker sequence
  - TSK-0084 Owner quality review and punch items
  - TSK-0092 Financial closeout, Owner reopen, satisfaction check and review requests
  - TSK-0094 Return work and resuming after an incident
- **safety** (1):
  - TSK-0129 Escalation procedure in every job packet: Call Owner and Call 911
- **scheduling** (6):
  - TSK-0078 Visit outcomes: delays, no access and customer absence
  - TSK-0114 Recurring service series and repeat-service reminders
  - TSK-0126 First-visit site checks at confirmation
  - TSK-0140 Cancellation and reschedule rules: small deposits, free estimate visits, Office routine cancellations, initiator and work-start markers
  - TSK-0145 Visit confirmation and window-offer amendments (A1, A2, A4, B1, B3, B4)
  - TSK-0146 Reviewed service-specific default preparation instructions for offers (B7)
- **security** (4):
  - TSK-0108 Authorization matrix suite for every actor pair
  - TSK-0109 AI security review before real customer data
  - TSK-0116 AI guardrails framework (wave 2, stays disabled)
  - TSK-0135 Audit retention workflow: owner-authorized deletion after 7 years
- **staff** (1):
  - TSK-0151 Staff management amendments (H1, H3, H4, H7)

## 3. Local setup

Requirements: Node 24, pnpm (the version in `package.json` `packageManager`), PostgreSQL 16, and Chromium for e2e
(`npx playwright install chromium` locally; the cloud sandbox used `/opt/pw-browsers/chromium`).

```sh
pnpm install --frozen-lockfile
export TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres
```

Before every push, run the same checks CI runs:

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm test:int && node tools/kg.mjs lint && pnpm build
```

End-to-end tests (after `pnpm build`). They need an empty database per run, plus four free ports:

```sh
PGPASSWORD=postgres createdb -h 127.0.0.1 -U postgres e2e1
cd apps/e2e
E2E_PORT=4310 E2E_GALLERY_PORT=4311 E2E_SPLIT_PORT=4312 E2E_GATED_PORT=4313 \
E2E_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/e2e1 \
E2E_CHROMIUM_EXECUTABLE=<path to chromium, optional> npx playwright test --workers=1
```

Run one spec with `npx playwright test tests/<name>.spec.ts --workers=1`. Use a fresh database (`e2e2`, …) for each
full run.

### Generated files: regenerate them, never edit by hand

| File                        | Command                                                                        |
| --------------------------- | ------------------------------------------------------------------------------ |
| `apps/server/openapi.json`  | `pnpm openapi`                                                                 |
| `packages/db/src/schema.ts` | `pnpm db:types` (after adding a migration)                                     |
| data inventory              | `pnpm data-inventory`                                                          |
| `kg/_index.json`, maps      | `node tools/kg.mjs index && node tools/kg.mjs lint` (lint must say 0 problems) |

## 4. Rules that cost time when ignored

- **Migration numbering:** migrations in `packages/db/migrations/NNNN_name.sql` apply in number order, and the runner
  refuses a migration numbered lower than one already applied. So merge PRs in migration-number order. If `main`
  already holds a higher number than your branch, renumber your migration (and its comments) to the next free number
  before merging. Never edit an applied migration; add a new one.
- **Merging `main` into a task branch** (`git merge --no-edit origin/main`):
  - i18n catalogs (`packages/i18n/src/catalogs/staff.en.json` and `staff.es.json`, and the other catalogs): keep both
    sides' keys, fix the commas, then check that the file parses and has no duplicate keys.
  - `openapi.json`: take either side (`git checkout --theirs apps/server/openapi.json`), then run `pnpm openapi`.
  - `schema.ts`: run `pnpm db:types` again.
  - Lists such as `staging/reset.ts` table classifications, `platform/config/keys.ts`, `App.tsx` routes and
    `labels.ts`: usually keep both sides.
- **Tests that sign staff in** must pass the second factor, since mandatory MFA (#82): integration tests use
  `signInWithMfa(app, {...})` from `apps/server/test/fixtures/staff-mfa.ts`, and e2e uses `passSecondFactor(page)` from
  `apps/e2e/mfa.ts`.
- **Launch phase in tests:** production is noindex and the sitemap is a 404 before phase 3 (#89). A test that needs
  production indexing moves its throwaway database to phase 3 with a synthetic Owner and `recordPolicyVersion` for
  `launch.phase` (`invited_customers`, then `public`), and builds the app with `noindex: false`. See
  `apps/server/test/integration/service-pages.test.ts`.
- **Live texts are off** (`sms.live_delivery` = `{enabled:false}`, OWN-DEC-190, until A2P 10DLC). A test that needs a
  real carrier adapter turns it on in its own database with `recordPolicyVersion` (see `outages.test.ts`,
  `delivery-hours.test.ts`).
- **Clock-dependent tests:** never assume today's date or a fixed weekday. Build dates relative to `Date.now()`, and
  check outcomes that do not depend on which of two concurrent requests wins (see the concurrent-payment test in
  `invoices.test.ts`).
- **e2e duration:** the serial e2e suite takes about 22 minutes locally because of MFA TOTP waits; on CI it ranged
  from 22 to **35 minutes** on the last PRs. The CI job limit is 40 minutes (`.github/workflows/ci.yml`). Raise it
  (for example to 60) in the next PR that adds e2e specs, rather than parallelizing specs that share a database.
- **Flaky checks seen and fixed:** a random six-digit code matching digits inside a log timestamp (use
  `standaloneCode()` from `apps/server/test/fixtures/code-message.ts`); a concurrent-payment test that assumed which
  request wins; the kg index read while being rewritten (now written atomically). A spec that times out once in a full
  e2e run (`staff-replies`, `staff-auth` were seen) should be rerun alone on a fresh database before it is treated as
  real, and fixed if it fails again.
- **Stacked branches and squash merges:** when branch B contains branch A's commits and A is squash-merged, GitHub may
  report conflicts on B. If `main`'s tree equals A's head (`git diff --quiet <A-head> origin/main`), record the merge
  with `git merge -s ours origin/main` (no content change) and push.
- **If PostgreSQL stops**, for example after a restart: `service postgresql start` on Linux, or your local service
  manager.

## 5. Knowledge-graph workflow

1. Pick a task: `node tools/kg.mjs list task --status todo`, then `node tools/kg.mjs ctx TSK-xxxx`.
2. Build only what the linked nodes say. Unknown business facts stay `NOT CONFIGURED` (RULE-NO-INVENTED-FACTS).
3. In the same PR: set the task `status: done`. Record any new owner decision as an `OWN-DEC-<n>` node, and mark a
   replaced decision `status: superseded` with a `superseded_by` link. Put PROPOSED details in the task's `OQ-…`
   question node.
4. Run `node tools/kg.mjs index && node tools/kg.mjs lint` and get 0 problems.
5. Open a PR. Required checks: `secrets`, `test`, `e2e`, `kg`. Claude merges (squash) when all four are green.
   Production releases stay with the owner.

## 6. Staging on Render (no secret values here)

- Workspace `tea-db1ds9lg1s2s739nqr00`, web service `srv-dbcodnbncjis73d4dv10` (free plan, Ohio), with a free
  PostgreSQL database (`handyhub_staging_db_vdqz`). **The free database expires on 2026-11-21.** Upgrade it or create a new one before then, or
  staging loses its data.
- Staging-only environment settings: `EMAIL_PROVIDER=log`, `STAGING_TOOLS=on`, `TEST_EMAIL_DESTINATIONS` (the owner's
  address; add the six `oat-<role>@example.test` test addresses for Owner Acceptance Testing), plus
  `MFA_ENCRYPTION_KEY` and the other keys already set in Render.
- Auto-deploy appears to be off. Changing an environment variable, or a manual deploy in the Render dashboard, deploys
  the current `main`. After a deploy, check the logs to confirm the migrations applied and the server started.
- **Reading an invite or password-reset link:** trigger the invite/reset in the staff app, then open Render → service →
  Logs and filter for `STAGING_EMAIL_LOGGED`. The line shows the address, subject and plain-text body, with the link.
  Links expire, so use them quickly.
- **Secrets** (staging passwords, keys) were kept in a private file outside the repository during the cloud session.
  They are not in git, and must never be committed.

## 7. Waiting on the owner or a professional

### Owner settings and decisions

- `business.public_contact`: NOT CONFIGURED. Email footers and support contact show labelled placeholders (#79, #84).
- `business.mailing_address`: enter it under Settings → Business details. Until then the address line is left out of
  estimates and receipts (#83).
- `media.publication_notice`: NOT CONFIGURED. Until the owner supplies the notice, no marketing or website photo
  permission can be recorded (TSK-0076).
- `coverage.verification_source` (#77) and `geo.county_time_zones` (the time zone for each of the 11 counties,
  OQ-COUNTY-TIME-ZONES) (#76, #88): NOT CONFIGURED.
- Payment instructions on invoices are placeholders. Real Zelle, Cash App and Chime handles and the check payee are
  still needed (OQ-PAYMENT-HANDLES) (#90).
- Legal entity name on invoices: "Handyhub LLC" versus the registered entity (OQ-LEGAL-ENTITY-NAME).
- Fresh authentication: currently a password _or_ a current TOTP code. Whether to require both is the owner's call
  (#82).
- Splitting rule for owner approval: do other projects of the same customer or property count?
  (OQ-OWNER-APPROVAL-DETAILS) (#75).
- SMS terms say "Up to two reminders", but one reminder is sent. Any rewording is for the owner and the legal reviewer
  (#88).
- Service-content flags (OQ-SERVICE-CONTENT-FLAGS, #91):
  - HI-04: is hanging the TV included?
  - HI-10: the name says "Structural Repairs".
  - PT-02: fences have no SOP step.
  - DW-04: the SOP assumes a builder as the customer.
  - CL-07: dryer vents have no SOP step.
  - DW-01: general repairs have no SOP steps.
  - HI-06: which gutter guards are referred out?
- Launch phases: only the Owner moves `launch.phase` (`PUT /staff/launch/phase` with the exact words
  `APPROVE PHASE 2` / `APPROVE PHASE 3`). It is seeded at phase 1 with every switch off. Customer invitations do not
  exist yet, so phase 2 would admit nobody (#89).
- Texts stay off until A2P 10DLC registration (TSK-0133, OQ-BIRD-10DLC). Registration fees and binding business
  representations need the owner's explicit confirmation.
- Domain and production: DNS and custom domains, `PUBLIC_ORIGIN`, `STAFF_ORIGIN` and production keys
  (OQ-DOMAIN-OWNERSHIP, OQ-GO-DECISION). Portal and staff links in emails need `PUBLIC_ORIGIN` / `STAFF_ORIGIN`.

### Professional reviews (none has happened)

Packets with blank sign-off tables are in `docs/review-packets/`: attorney A-01..A-18, CPA C-01..C-10, insurance
I-01..I-10, safety S-01..S-14.

- **Attorney:**
  - estimate terms v1.0 are owner-approved but `attorneyReviewed: false`;
  - privacy notice and website terms (OQ-ATTORNEY-TERMS, OQ-ATTORNEY-PRIVACY);
  - warranty wording on invoices;
  - six wording questions on service pages;
  - the SMS reminder wording;
  - the 26 per-service agreement clause drafts (FACT-AGREEMENT-*).
- **CPA:** sales tax (OQ-TAX-CPA); the accounting treatment of refunds, credits, write-offs, fees and payouts (TSK-0085
  ledger); retention periods (OQ-RETENTION-REVIEW).
- **Safety reviewer:** SOPs, hazard templates, hold rules and the Start Work gate (OQ-SAFETY-REVIEW). The Spanish
  emergency text, and the 23 withheld service items on the service pages (#91). Until the Spanish safety release
  (TSK-0103), Spanish-reading workers cannot start work.
- **Electrician:** HI-04, HI-07, PT-04. **Structural engineer or building official:** HI-10, HI-11 (#91).
- **Insurance:** packet I-01..I-10 (OQ-INSURANCE-EVIDENCE).

### PROPOSED details awaiting owner approval

Each is recorded in the graph; read it with `node tools/kg.mjs show <id>`.

- OQ-OWNER-APPROVAL-DETAILS (#75):
  - every discretionary credit needs approval, from 1 cent;
  - the base-plus-all-options maximum is compared too;
  - the splitting rules;
  - a comment is required on each decision.
- TSK-0123 time-zone details (#76).
- The customer SERVED wording on the ZIP check (#77).
- TSK-0141 reset scope: what a reset clears or keeps, and its permissions (#78).
- TSK-0154 MFA details (#82):
  - a lost Owner authenticator is handled by a recovery code or the host CLI `staff-access.js reset-mfa`;
  - the second factor must be completed within 10 minutes.
- TSK-0144 address limits: 1–4 lines of 120 characters each (#83).
- TSK-0120 reference formats (`<project ref>-V<n>`) and time-zone abbreviations in messages (#84).
- TSK-0121/0122 reminder routing rules (#88).
- TSK-0142 phase model, confirmation words and test addresses (#89).
- OQ-INVOICE-LEDGER-DETAILS (#90):
  - invoice number format `<project ref>-I<n>`;
  - deposit invoice wording;
  - issuing waits while a deposit check is pending;
  - overpayments go to Owner Decisions;
  - refunds only from unapplied money;
  - a payment is refused while confirmed plus pending payments already cover the invoice.
- OQ-START-GATE-DETAILS (#86) and OQ-FIELD-PHOTO-DETAILS (TSK-0076).

### Engineering follow-ups and known risks

- Website Terms v1 cancellation text predates OWN-DEC-161/163. Privacy v1 lacks the provisional OWN-DEC-177 rows. The
  `sms-disclosure-1` wording differs from OWN-DEC-190 (TSK-0133) (#72).
- `cancellationFacts` treats an arrived visit as work started. It only opens an Owner item and no money moves; the fix is
  in TSK-0140 (#73).
- Messages still `template_values_not_wired`: estimate_follow_up, deposit_invoice, proposed_change (TSK-0082),
  invoice_ready and job_complete (TSK-0084), payment_receipt (TSK-0087).
- ZIPs that may reach outside the 11 counties (40601, 40071, 40019, 47043, 47281) should be checked against a Census
  file (`coverage import`) (#77).
- RISK: an account with no authenticator can be enrolled at its next sign-in by whoever holds its password. Enrollment
  is audited (#82).
- Final invoices can't be issued until the Owner quality review (TSK-0084) exists. The gate refuses with
  `QUALITY_REVIEW_NOT_RECORDED` (#90).
- `changeOrderPublicationGate` waits for TSK-0082 (#75). Wiring `jobCareView` into the completion summary is TSK-0083
  (#91). The portal Photos tab is English only (TSK-0076).
- `window-offers.test.ts` timed out once under heavy local load. Watch for it.
