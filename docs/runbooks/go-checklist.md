# Owner go checklist: the three launch phases

Source of truth: OQ-GO-DECISION, OWN-DEC-22, OWN-DEC-191 (three phases, each started only by the owner's explicit approval), OWN-DEC-212 (no claimed professional reviews; passing CI alone is not production readiness), OWN-DEC-185, OWN-DEC-184, OWN-DEC-182, OQ-BIRD-10DLC, OQ-ATTORNEY-PRIVACY, OQ-PRODUCTION-HOSTING (answered by OWN-DEC-185). Built by TSK-0111.

**This checklist is the owner's to tick.** Every box below is unticked on purpose: nothing here has been approved, bought, filed or reviewed unless the owner ticks it. Claude never ticks an owner item. Owner constraint, verbatim: "Do not invite real customers or launch publicly until I explicitly authorize the appropriate release stage."

Who: **Owner** (only the owner can do it), **Owner + Claude** (Claude prepares, the owner acts), **Claude** (engineering; the owner reviews the pull request). Gate labels follow the review packets: an item marked PRODUCTION blocks phase 2 and later.

## Phase 1: Owner Acceptance Testing on protected staging
No real customers, no public submissions, no real payments, no real customer data, no uncontrolled email or text (OWN-DEC-191).

- [ ] **Owner + Claude:** staging runs this repository (TSK-0112): the owner points `handyhub-staging` at `Bh3os/handyapp` and sets the variables named in render.yaml (`ACCESS_GATE_USERS`, `CODE_HASH_KEY`, `MFA_ENCRYPTION_KEY`, `ACCESS_CODE_ENCRYPTION_KEY`, `BOOTSTRAP_OWNER_EMAIL`, and for readable test email `EMAIL_PROVIDER=log` with `TEST_EMAIL_DESTINATIONS`). Values are typed into Render by the owner, never sent to Claude.
- [ ] **Owner:** replace the free staging database before it expires on **2026-11-21** (`release.md`, "Staging database expiry").
- [ ] **Claude:** Reset Test Data deployed and verified on staging before the journey is handed over (OWN-DEC-191).
- [ ] **Owner:** the Owner Acceptance Testing checklist completed on staging: [docs/owner-acceptance-testing.md](../owner-acceptance-testing.md) (TSK-0142, merged separately), with bugs reported and the fixes retested.
- [ ] **Owner:** explicit approval that phase 1 is complete, written down (date, scope). This is the phase 2 go decision of OQ-GO-DECISION.

## Phase 2: invited customers on production (blockers)
Starts only after the owner's phase 1 approval. Invitation-only; public submissions and search indexing stay off; Reset Test Data never exists in production.

Owner actions:
- [ ] **Owner:** buy the domain `handyhub247.com` (OWN-DEC-184; RISK: someone else may register it first) and gain DNS control (OQ-DOMAIN-OWNERSHIP).
- [ ] **Owner:** buy production hosting as decided in OWN-DEC-185 (one Starter web service, the smallest paid Render PostgreSQL with point-in-time recovery, Hobby workspace). Confirm on Render's pricing page before buying: the prices (ESTIMATE about $13-15 per month fixed) and the point-in-time recovery window are not rechecked.
- [ ] **Owner:** set production variables in Render (no staging-only variables: production refuses `ACCESS_GATE_USERS`, `STAGING_TOOLS`, `EMAIL_PROVIDER=log` and fakes).
- [ ] **Owner + Claude:** the production log retention is no longer than `retention.technical_logs` (90 days, OWN-DEC-177): Render's own log retention on the bought plan, or a log stream that applies it. NOT CONFIGURED today (OQ-RETENTION-DEFAULTS-DETAILS).
- [ ] **Owner + Claude:** email sending domain verified in Resend (SPF, DKIM, DMARC on the bought domain) and `RESEND_API_KEY`, `EMAIL_FROM` set.
- [ ] **Owner:** the real public phone number and email (FACT-PUBLIC-CONTACT; they are placeholders today).
- [ ] **Owner:** payment handles: the Zelle, Cash App and Chime details and the check payee (OWN-DEC-182, OQ-PAYMENT-HANDLES). Until then only the methods actually configured can be offered.
- [ ] **Owner:** registered legal entity name versus "Handyhub LLC" on documents (OQ-LEGAL-ENTITY-NAME).

Professional reviews (each happens only when the professional actually does it; nothing here is reported as reviewed until then):
- [ ] **Owner (attorney):** privacy notice and website terms reviewed by an attorney licensed in KY and/or IN, then the owner's documented approval (OQ-ATTORNEY-PRIVACY; `docs/review-packets/attorney.md`, questions marked PRODUCTION).
- [ ] **Owner (insurance broker):** insurance coverage and its evidence (OQ-INSURANCE-EVIDENCE; `docs/review-packets/insurance.md`, PRODUCTION per service).
- [ ] **Owner (safety reviewer):** SOP and hazard template sign-off per service before that service's first real job (OQ-SAFETY-REVIEW; `docs/review-packets/safety.md`, PRODUCTION per service).
- [ ] **Owner (CPA):** the questions of `docs/review-packets/cpa.md` (gates as marked there).

Engineering (Claude builds, the owner reviews):
- [ ] **Claude:** AI security review with every finding fixed, recorded as release evidence (TSK-0109, OWN-DEC-136). Not done yet.
- [ ] **Claude:** launch-phase switches: invitation-only access and indexing off in production (TSK-0142). Today `HANDYHUB_ENV=production` serves an indexable site and has no access gate, so phase 2 needs these switches first.
- [ ] **Claude:** nightly logical backup to R2 (OWN-DEC-185), then one restore rehearsed on Render (`restore.md`). Not built; not rehearsed on Render.
- [ ] **Claude:** traceability report with every launch acceptance check passing ("All 60 must pass", owner answer 2026-10-05T18:23; TSK-0110).
- [ ] **Claude:** payment ledger, Square links and the reconciliation queue for real money (TSK-0086, TSK-0087, TSK-0090), or the owner decides which payment flows phase 2 uses without them.
- [ ] **Owner:** first production release deployed by the owner following `release.md`, smoke checks recorded.
- [ ] **Owner:** explicit approval to invite the first customers (the phase 2 start), and later explicit approval that the invited launch passed.

## Phase 3: public launch
Starts only after the owner approves the invited-customer launch.

- [ ] **Owner:** A2P 10DLC brand and campaign approved in Bird under ODD JOBS & MORE LLC with the brand HandyHub (OQ-BIRD-10DLC, OWN-DEC-147, OWN-DEC-190). Submission needs the domain and the real support contact; nothing is submitted and no fee is incurred without the owner's explicit confirmation. Production texting stays off until approved.
- [ ] **Claude + Owner:** the 26 service pages and care notes published after the quality review (TSK-0132, OWN-DEC-180).
- [ ] **Claude:** public request form opened and search indexing on, through the launch-phase switch (TSK-0142).
- [ ] **Owner:** live domain, TLS, sign-in, forms and notifications verified on production (release smoke checks).
- [ ] **Owner:** explicit approval of the public launch.

## Readiness report (TSK-0106 and TSK-0111, 2026-10-22)
Passing CI alone is not production readiness (OWN-DEC-212). This report covers this branch only; the PR's CI run is the authority for the merged state.

**Successful tests run for this change** (local, PostgreSQL 16.14, Node 24, branch `task/TSK-0106`; the pull request's CI run is separate and authoritative):
- `pnpm lint` (eslint and prettier): passed. `pnpm typecheck`: passed. `pnpm build`: passed. Secret scan (gitleaks 8.30.1, the CI command): no leaks found.
- `pnpm test`: every unit suite passed (server 277, staff 254, site 144, portal 71, policy 870, domain 531, money 59, db 27, ui 27, i18n 17; tools 26; content lint 1125 texts, 0 problems).
- `pnpm test:int` against PostgreSQL 16: db 34 passed; server 913 passed in 77 files, including the new outage suite (6) and restore rehearsal (9).
- `node tools/kg.mjs index && node tools/kg.mjs lint`: 0 problems; `node tools/trace.mjs`: 0 problems.
- Not run for this change: the Playwright end-to-end suite (no app behaviour changed; CI runs it on the pull request).
- The local release and restore rehearsal: `rehearsals.md`.

**Reviews that have NOT happened** (never claimed): attorney, CPA, insurance broker, safety reviewer, any manual or human security review, the AI security review of TSK-0109, manual screen-reader and physical-device accessibility tests (UNVERIFIED, OWN-DEC-181), any test on Render (staging is not yet pointed at this repository), any restore on Render.

**Genuine production blockers** (from the graph): the phase 1 approval; domain; production hosting; production email domain; real public contact; payment handles; attorney review (OQ-ATTORNEY-PRIVACY); insurance evidence; safety sign-off per service; AI security review (TSK-0109); launch-phase switches (TSK-0142); the nightly backup and a Render restore rehearsal; the traceability report (TSK-0110); for texting, A2P 10DLC approval.

**Remaining deficiencies** (not blockers by themselves, listed so nothing is hidden): T61 not satisfiable until the reconciliation queue exists (TSK-0090); field Stop Work, critical holds from the field and offline packets not built (TSK-0077, TSK-0079, TSK-0080); a database outage answers `500 INTERNAL` (retryable) rather than `503 UNAVAILABLE`; no alerting outside the app; System health shows backups and the restore drill as `unknown` (truthful: the app cannot observe them); the restore replay does not cover staff disables or resets made after a backup (manual step in `restore.md`).
