

## 2026-10-05T02:14:37.203Z (Agent)
You are updating the HandyHub vault's handoff notes. Work ONLY in the git worktree /home/user/Handy-Hub-app (repo Bh3os/Handy-Hub, private). Follow /home/user/Handy-Hub-app/CLAUDE.md (business files are never edited; only HANDOFF.md and 'AI Development Plans/25-change-log.md' change in this task).

Steps:
1. cd /home/user/Handy-Hub-app; `git fetch origin main claude/lucid-edison-mhu9uq`; `git checkout claude/lucid-edison-mhu9uq`; `git merge --no-edit origin/main`. If the merge conflicts, the conflicting content is already in origin/main (an earlier PR was squash-merged), so resolve every conflict by taking origin/main's version (`git checkout --theirs -- <file>`), then `git add` and `git commit --no-edit`. NEVER force-push, rebase or reset the remote branch.
2. Edit HANDOFF.md section 3 (heading starts with "## 3. Status at handoff"): insert a new blockquote line directly under the heading, ABOVE the existing "> **Staff sign-in WORKS on staging" line, exactly this text (one line):
> **Stage B slices merged 2026-10-05 (handyhub-app):** rate limits with shared hashed counters (#10; `TRUST_PROXY_HOPS` must be set from the logged `forwarded` count before the public form opens); staff accounts - list, add invited, end a role, SoD review, Staff page (#11); price-book structure with no prices, NOT CONFIGURED (#12; no minimum or service-floor rule types, OWN-DEC-31). In review: audit verification (UTC-pinned row hash, `audit:verify`) and backup-restore drill (#13). Next slices: see the plan in the session (policy activation UI with step-up, audit log viewer, customer and property records EP-06, estimates skeleton EP-09 blocked by NOT CONFIGURED pricing, uploads behind a NOT CONFIGURED storage port).
Do not delete or reword any existing line.
3. In 'AI Development Plans/25-change-log.md' find the row starting with "| CHG-20261005-005 |" and insert directly after it this row:
| CHG-20261005-006 | HANDOFF.md | modified | Stage B slices #10-#12 merged, #13 in review, next slices listed | OWN-DEC-27; OWN-DEC-31 | - | - | 20 | No | owner | git diff review |
4. `git diff origin/main --stat` must show only HANDOFF.md and the change log. Commit with message:
docs(handoff): Stage B slices #10-#12 merged, #13 in review

followed by a blank line and these two trailer lines exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EVqSLgnUH5GuXYR9SoT99h
5. `git push -u origin claude/lucid-edison-mhu9uq` (normal push; retry up to 4 times on network errors with 2s/4s/8s/16s waits).
6. Load the GitHub MCP tool with ToolSearch ("select:mcp__github__create_pull_request") and open a DRAFT pull request in owner Bh3os, repo Handy-Hub, head claude/lucid-edison-mhu9uq, base main, title "docs(handoff): Stage B slices #10-#12 merged, #13 in review", body: a 2-bullet summary of the two file changes, then a blank line and "🤖 Generated with [Claude Code](https://claude.com/claude-code)" and on the next paragraph "https://claude.ai/code/session_01EVqSLgnUH5GuXYR9SoT99h". Do NOT merge it.
Return: the PR URL, the final commit SHA, and `git diff origin/main --stat` output. If anything fails, return the exact error instead of guessing.


## 2026-10-12T05:57:51.337Z (Agent)
Read-only analysis task. Do not modify any repository or worktree; write only the one output file named below.

Context: HandyHub is building the owner's "Two-Websites Functionality Guide" (guide text: /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/twosites/guide.md; each requirement appears as "**HH-XXX-NN · P0:** text"). A gap audit recorded, per requirement, what is still missing on main. Each in-flight build slice was launched with a workflow script whose prompts state exactly what that slice must build. Owner decisions that change requirements are in /home/user/hh-fixmain/docs/two-websites/owner-resolutions.md (OWN-DEC-64..75; they govern over the guide). A one-paragraph summary of every slice is in /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/twosites/slice-scopes.md (slice 1.4 is PLANNED, not started, and has no script; judge 1.4 against its paragraph there).

Input: /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/twosites/check-A.json (requirements assigned to slices 1.0, 1.1, 1.2a, 1.2b, 1.3, Records, 1.4; each with id, title, gap-audit status, assigned slices, "missing" = the remaining gap, planned_test).
Slice scripts: /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/twosites/slice-scripts/ (slice-1-1-*, slice-1-2a-*, slice-1-2b-*, slice-1-3-*, slice-records-*, slice-1-0-* and email-* for 1.0 which is merged).

Task: for EVERY requirement in check-A.json, read the guide's full requirement text and the "missing" gap, then read the prompts in the assigned slice script(s) and decide whether the slice was actually told to build every launch-critical part of the remaining gap (as amended by owner decisions). Be strict: a slice "covers" a part only if its prompt asks for that behaviour (not merely a related screen or a doc noting a limitation). Parts that are explicitly not applicable by an owner decision count as deferred, not uncovered. Parts that need owner business data (prices, SOP content, qualifications lists, vendor accounts) count as owner_input, not uncovered, as long as the software side is assigned.

Write /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/twosites/results-A.json: a JSON array, one object per requirement:
{"id": "HH-...", "verdict": "covered" | "partial" | "not_covered", "covered_by": ["1.2a", ...], "uncovered": "precise list of the launch-critical parts no slice prompt asks for (empty if covered)", "owner_input": "business data or approvals the owner must supply (empty if none)", "deferred": "parts not applicable or deferred by an owner decision, with the OWN-DEC id (empty if none)", "acceptance": "the guide T-ids and/or the concrete test the slice prompt requires for this requirement", "evidence": "script file name + a short quote of the prompt line(s) relied on"}
Validate the file parses as JSON and has one entry per input requirement. Then reply with a short summary: counts per verdict and the list of partial/not_covered ids with their uncovered parts in one line each.


## 2026-10-12T06:40:54.674Z (Agent)
You are launch task T1 for HandyHub. First read the common brief at /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/common.md and follow it exactly.

Your worktree: /home/user/hh-t1, branch feat/launch-t1-customer (created from origin/main 8d4d252). New migrations: 0200-0299. Progress file: /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/T1-progress.md.

Scope: section "T1" of /home/user/hh-journey/docs/two-websites/launch-plan.md (74 requirements: BASE, ARC, CUS, SVC, INT, ID, PORT, LEAD, plus DATA-01/02/07, STAFF-05, SEC-02, SEC-05, PRIV-02, LANG-01, LANG-03, API-02..05) and the added tasks 1.4a, 1.4b and 1.5 described there.

Saved slice branches to fold in, in this order:
1. origin/feat/foundation-projects (slice 1.2a: project entity + backfill + integrity, GET /api/v1/projects/:id, error envelope with fieldErrors/retryable/requestId and IDEMPOTENCY_CONFLICT 409, required expected_version with 409 STALE_VERSION, cursor pagination, no quantity floor on new quotes, customer documents English; migrations 0033-0034).
2. origin/feat/intake-guided-request (slice 1.3: guided request with service questions, Not sure, estimate preference, coverage states, email and phone required (OWN-DEC-61), 10-photo draft uploads (OWN-DEC-62), contact_unverified, receipt email draft, qualification states, follow-ups, manual leads, candidate-match review; migrations 0055-0059).
Slice 1.1 (staging gate, legal drafts, Square label) is in pull request #66 on branch feat/staging-gate-legal and waits for the owner's staging setting; do not fold it in, but merge main when it lands there.

Steps (each verified, committed and pushed before the next):
1. Foundation: review and finish 1.2a (its requirements in the plan), all checks green. Push this first: the other three tasks build on it.
2. Intake: review and finish 1.3, then task 1.5.
3. Customer access: task 1.4a (grants, verification exchange, separate __Host- customer session, freshness windows, passwordless one-time-code accounts per OWN-DEC-63 with evidence-based linking, contact-change revocation, contact verification route, customer A/B and guest A/B denial tests).
4. Customer workspace: task 1.4b (screens and states, projections with a deny-list test, appointment view, reschedule/cancel and change requests, project messages with an internal staff thread, requested-evidence route, audited share-with-customer, complaint status, walkthrough summary via the secure link per OWN-DEC-75, guide 23.1 state mapping).
Customer emails are staff-released drafts except one-time codes and secure links (OWN-DEC-65); email goes through the merged Resend adapter (docs/email-resend.md).


## 2026-10-12T06:41:06.124Z (Agent)
You are launch task T2 for HandyHub. First read the common brief at /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/common.md and follow it exactly.

Your worktree: /home/user/hh-t2, branch feat/launch-t2-work (created from origin/main 8d4d252). New migrations: 0300-0399. Progress file: /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/T2-progress.md.

Scope: section "T2" of /home/user/hh-journey/docs/two-websites/launch-plan.md (65 requirements: EST, SCH, PKT, WORK, OFF, CHG, INC, QA, STATE, DATA-03/04/05/08) and the added tasks 2.5, 2.6 and 2.7 described there.

Saved slice branches to fold in, in this order (all unreviewed partial builds):
1. origin/feat/estimate-revisions-acceptance (2.1: revisions, options/exclusions/work packages, exact acceptance creating one job + one scheduling task in one transaction, customer questions, acceptance void, deposit stage NOT CONFIGURED; migrations 0060-0064).
2. origin/feat/visits-capacity (2.2: multi-worker visits, availability/leave, equipment, atomic reservations, hold expiry, reschedule/reassign history, site_estimate visits, zone/DST, reschedule requests, arrival/delay; 0070-0074).
3. origin/feat/field-exceptions-timestamps (Field: the three Start Work administrative exceptions of OWN-DEC-68 requested by the worker and approved only by the owner; per-worker Arrived/Finished timestamps of OWN-DEC-69 with owner corrections and CSV export, no payroll; 0045-0049).
4. origin/feat/worker-packet-offline (2.3: site facts, encrypted access secret with audited reveal, requirement data, versioned packet with what-changed and acknowledgment invalidation, loadout blockers, export without secrets, offline cache/drafts/sync queue; 0075-0079).
5. origin/feat/quality-review-closeout (2.4a: ready_for_qa, owner review with self_review flag per OWN-DEC-64, punch items minor/major per R7, walkthrough per OWN-DEC-75, closeout; 0065-0069).
6. origin/feat/changes-incidents-returns (2.4b: change orders with exact revision approval, restricted incidents, issue reports, complaints, return work, review-request suppression; 0085-0089).

Steps (each verified, committed and pushed before the next): 1) 2.1; 2) 2.2 + Field; 3) 2.3; 4) 2.4a + 2.4b; 5) task 2.5 (job work packages and tasks, progress notes, measurements, material usage, pause/resume, task holds with separation decision, emergency stabilization, Paused state and cancellation with obligation checks); 6) task 2.6 (worker qualification and permit records blocking scheduling and start for every role, readiness outcome vocabulary with exact missing items and an office readiness view, versions pinned at start, reviewed EN/ES SOP versions with a language gate, server-side visit hours 8 am-10 pm per OWN-DEC-66); 7) task 2.7 (approved change orders invalidate packet acknowledgments, frozen change revisions, hold release screens, closeout refused with open complaints, deposit pinned and enforced at the configured stage, device registration, offline Arrived/Finished queue).
Task T1 is landing the shared foundation (projects, error envelope, required expected_version) on its branch; when it merges to main, merge main and adopt it. The Start Job gate's no-override rules and critical holds must stay untouched.


## 2026-10-12T06:41:17.273Z (Agent)
You are launch task T3 for HandyHub. First read the common brief at /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/common.md and follow it exactly.

Your worktree: /home/user/hh-t3, branch feat/launch-t3-money-ops (created from origin/main 8d4d252). New migrations: 0400-0499. Progress file: /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/T3-progress.md.

Scope: section "T3" of /home/user/hh-journey/docs/two-websites/launch-plan.md (43 requirements: FIN, PRIV, CRM, OPS, STAFF, COM, AUTO, ARC-09, DATA-06/09/10) and the added tasks 3.5, 3.8 and 3.4 described there.

Saved slice branches to fold in, in this order (all unreviewed partial builds):
1. origin/feat/staff-ops-foundation (1.2b: staff locale on the server, offboarding releases visits and revokes sessions, dead-letter view with safe retry, polling with last refreshed, service registry fields with publication vs dispatch readiness; migrations 0040-0044).
2. origin/feat/finance-square-reconciliation (3.1: Square card payments recorded by hand with the Square payment ID per OWN-DEC-67, deposit verified only with a Square reference, collect permission for owner and field employees, refunds/credits/write-offs owner only with reason and step-up, discount policy PROPOSED from OWN-DEC-66, same-day charge typed per estimate, no surcharge, overpayment credit, deposit/progress/final invoices, reconciliation queue, CSV exports, cost actuals; 0080-0084).
3. origin/feat/records-lifecycle (Records: retention schedule of OWN-DEC-70 as a PROPOSED policy the owner activates, holds, deletion-review queue with no automatic deletion, owner Delete/Archive with the exact confirmation text, protected evidence never deleted, customer data deletion of OWN-DEC-71, backup replay doc; 0050-0054).
4. origin/feat/ops-home-queues (3.3a: action-queue home, queue items, scoped search, customer profile, reviewed merge with undo; 0090-0094).

Steps (each verified, committed and pushed before the next): 1) 1.2b; 2) 3.1 then task 3.5 (invoice issuer/addresses/delivery state, change-order lines, cash receipts and bank deposit, returned/failed payment exceptions, refunds on invoice payments, reconciliation additions, Square fees and payouts recorded by hand, report definitions; the CPA's answers stay NOT CONFIGURED); 3) Records; 4) 3.3a then task 3.8 (audited contact/property edits, note guards, duplicate detection and link correction, access/correction requests, connect queue sources); 5) task 3.4 (audience and consent evidence per send, event templates as drafts held until the owner approves wording, estimate/appointment reminder producers with an owner cadence policy NOT CONFIGURED until approved, send-time recheck for email, transactional vs marketing preferences, staff-locale alerts, incident message release, Telnyx unknown outcomes, automation registry). Customer-facing parts of 3.4 that need the customer workspace wait until task T1 merges it; do the rest first.
Task T1 is landing the shared foundation (projects, error envelope, required expected_version) on its branch; when it merges to main, merge main and adopt it. Staff release each customer email (OWN-DEC-65).


## 2026-10-12T16:38:05.293Z (Agent)
You are working in the HandyHub app repository, worktree /home/user/hh-t4. Read the common brief /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/common.md and follow its rules (no invented business facts, synthetic data, gitleaks before commit, full gate before push, flock only around e2e, never skip or weaken a test, commit trailer lines). Do NOT open pull requests or push to main.

Setup: `cd /home/user/hh-t4 && git fetch origin && git checkout -b feat/launch-traceability origin/feat/launch-t4-final` (that branch is in open PR #72; if PR #72 has merged by the time you push, merge origin/main first).

Goal: resolve the 23 P0 requirements that `docs/two-websites/traceability.md` lists with no tagged test (the Tests column empty), and refresh stale limitation text. List them with:
python3 -c "import re;[print(l[:200]) for l in open('docs/two-websites/traceability.md') if l.startswith('| HH-') and not [x.strip() for x in l.strip().strip('|').split('|')][8]]"

Do this:
1. For the 13 marked "Built and tested on main, but its tests carry the vault story ids" (HH-ARC-03, ARC-08, AUD-01, AUD-05, AUTO-02, BASE-01, BASE-05, BASE-06, CUS-04, DATA-06, FIN-12, ID-08, STAFF-03): find the existing tests named in each limitation's evidence and add the HH id to the test name the same way other tests are tagged (e.g. `[HH-ARC-03]` alongside the existing ids). Do not change assertions. Where an evidence item is not really a test (AUD-01 is a process rule), add a small real test only if one honestly proves the behaviour; otherwise keep it as a process limitation with accurate wording.
2. HH-BASE-02 and HH-DATA-02: slice 1.2a removed the per-item quantity floor; tag the tests that prove it (pricing-engine T02/T03, per-job pricing). DATA-02 keeps an owner-input note: the rounding rule awaits the CPA.
3. HH-QA-05: check what main already does (T1's audited share-with-customer for photos and notes, T4's per-asset publication permission). Tag the tests that prove approved-only sharing and separate publication permission. Per-service care-instruction text is owner content: keep that part as an accurate limitation (owner input), do not invent text.
4. HH-ARC-02: the quality, identity and reporting modules now exist; check whether media code is still split (intake/photos.ts, field/photos.ts, platform/object-storage.ts). If consolidating is a reasonable, low-risk refactor with existing tests green, do it; otherwise record an accurate limitation. Add a route/contract test tag that proves modules register with policy metadata.
5. HH-AUD-02 / AUD-03 / AUD-04 (process): AUD-03 - run the full gate on origin/main once and record the baseline (pass/fail per step, the 7 pre-existing test.fixme stubs) in docs/two-websites/release-report.md; AUD-02 and AUD-04 stay process requirements with accurate, current wording (decisions are recorded as PROPOSED in the vault decision log by the coordinator; every slice shipped integration/unit/e2e tests).
6. HH-ARC-07, FIN-08, FIN-09 stay deferred by owner decision (OWN-DEC-67 / single origin) - just make the wording accurate.
7. Refresh every stale limitation text in docs/two-websites/limitations.json (many still say "Not built yet" for things built in T1-T3, e.g. ARC-05, ARC-06, ARC-10, API-02): for each entry whose requirement now has tagged tests and is built, remove the "not built" claim or delete the entry if nothing is left; keep entries only for real remaining gaps, owner inputs or deferrals. Regenerate traceability.md with the repo's generator script (find it; do not hand-edit the table) and make sure the CI traceability check passes.
8. Full gate, gitleaks, commit (message naming the HH ids), push feat/launch-traceability.

Reply with: the new count of P0 requirements with tagged tests, what remains as limitations (each with its reason: owner input / deferred / process / real gap), commands and results, and the commit id.


## 2026-10-12T16:42:11.563Z (Agent)
You are working in the HandyHub app repository. Read the common brief /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/common.md and follow its rules (no invented business facts, owner decisions as versioned policy data, safety gates never weakened, synthetic data, gitleaks before commit, full gate before push, flock only around e2e, never skip or weaken a test, commit trailer lines). Do NOT open pull requests or push to main.

Setup: `cd /home/user && git -C /home/user/hh-t3 fetch origin && git -C /home/user/hh-t3 worktree add -b feat/launch-owner-decisions /home/user/hh-dec origin/main` then work only in /home/user/hh-dec. Before pushing, merge origin/main again (another branch, feat/launch-t4-final, PR #72, may merge meanwhile). New migrations use the range 0600-0649.

The owner answered these on 2026-10-12 (quote them in code comments/docs as OWN-DEC-76..78; the coordinator records them in the vault decision log):

OWN-DEC-76 - Deposit waiver: "Only me, the owner." Today (task T2, step 7) an administrator can waive a required deposit, or only the reviewer the deposit policy names. Change it so only the owner can waive (fresh step-up and a written reason, audited, never a silent change). Find how the code identifies the owner (role ADM vs a designated owner account/capability - read packages/policy and the access module; if there is no owner designation separate from ADM, add one as data the owner already holds, without letting another ADM grant it to themselves). Tests: owner can waive with step-up+reason; another administrator and every other role are refused; deposit still blocks otherwise.

OWN-DEC-77 - Reopening a closed job: "Only me, the owner." T2 added role row job.reopen for the owner; verify it is truly owner-only by the same owner designation as above and add a test that another administrator is refused.

OWN-DEC-78 - Customer reminder cadence (all are DRAFTS staff release; never sent automatically, OWN-DEC-65). Owner's words: "Unanswered estimate: 3 days after sending, then one final follow-up after 7 days. Confirmed appointment: 24 hours before the visit, with preparation instructions. Completed job: 2 days after completion, ask whether everything is satisfactory. Repeat service: use a customer-agreed schedule for recurring cleaning or maintenance. Every message should offer a simple way to approve, ask questions, reschedule, or request another service. Stop estimate reminders after acceptance, decline, expiration, or a customer response. Cancel outdated appointment reminders. Hold promotional follow-ups during unresolved complaints, and respect communication preferences and marketing consent. Do not send automatically; staff release each draft."
Task T3 built reminder producers (estimate, appointment) behind a versioned reminder_cadence policy that stays NOT CONFIGURED until the owner activates it, with send-time recheck. Extend it:
 - Pre-fill a PROPOSED reminder_cadence policy version with exactly these values (estimate +3 days and final +7 days; appointment 24 h before; completed-job check 2 days after completion; repeat service per agreed schedule). The owner still activates it in the app (fresh step-up), as for every policy - do not activate it in a migration.
 - Add the second (final) estimate follow-up and the completed-job satisfaction check producer, and a repeat-service reminder driven by a staff-recorded, customer-agreed next-service date or interval on the customer/property (recurring job series are P1 and not built - do not build recurrence; just the agreed date/interval and its reminder draft).
 - Appointment reminder includes the service's preparation instructions from the registry when the owner has entered them; if none, it omits that part (never invent text).
 - Each draft carries the customer's secure project-workspace link where they can approve, ask a question, request a reschedule, or request another service (use the existing customer-access/workspace routes; if a link cannot be issued because email/links are NOT CONFIGURED, the draft says so to staff, not to the customer).
 - Stop rules at draft creation AND at release/send time: estimate reminders stop after acceptance, decline, expiration or any customer response (message, question, change request); appointment reminders are cancelled when the visit is rescheduled/cancelled; the satisfaction check and any promotional follow-up are held while a complaint is unresolved; channel preferences and marketing consent are respected (the satisfaction check is service communication, a review request is marketing).
 - Message wording is template drafts held until the owner approves wording (template_not_approved, per T3) - write neutral draft wording without promises, prices or warranties.
 - Tests (integration + unit + web where screens change) for each cadence, each stop rule, the complaint hold, consent, and that nothing sends without staff release.

Also add to docs (walkthrough or release report) one short section listing these three decisions and the owner action left: activate the proposed reminder policy, approve the template wording.

Run the full gate (build, lint, typecheck, unit, integration, e2e), gitleaks, commit with HH ids (HH-COM-05, HH-FIN-02, HH-QA-09, HH-SCH-02, HH-QA-06/07 as applicable) and OWN-DEC-76..78, push feat/launch-owner-decisions. Reply with what changed, tests, commands/results, commit id, and anything that needs the owner.


## 2026-10-12T16:42:27.337Z (Agent)
You are working on HandyHub. Read the common brief /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/common.md and follow its rules (no invented business facts or safety guidance, synthetic data, gitleaks before commit, full gate before push, flock only around e2e, never skip or weaken a test, commit trailer lines). Do NOT open pull requests or push to main.

Setup: `git -C /home/user/hh-t3 fetch origin && git -C /home/user/hh-t3 worktree add -b feat/launch-spanish-review /home/user/hh-es origin/main` and work only in /home/user/hh-es. Merge origin/main again before pushing. New migrations (if any) use 0650-0699.

Owner decision OWN-DEC-79 (2026-10-12), owner's words: "Have the AI translate and check all Spanish staff content now. For safety procedures, compare it against the approved English version and check terminology, warnings, prohibited actions, PPE, measurements, step order, and stop-work conditions. Correct errors and flag ambiguous source instructions without inventing guidance. AI checking alone must not mark a safety translation as approved. A competent bilingual reviewer must approve the safety-critical version, with reviewer, date, and version recorded. Until then, a worker relying on Spanish sees 'Spanish safety review pending' and the affected work remains blocked. Keep unrelated development moving and complete all translation/checking work now."

Do this:
1. Staff UI strings: compare every key in packages/i18n/catalogs/es.json against en.json (all staff screens, alerts, packet, offline messages, errors). Fix wrong, missing, inconsistent or English-left-behind Spanish; keep ICU placeholders and plurals exact; use consistent terminology (write a short glossary in docs, e.g. docs/i18n/spanish-glossary.md, for terms like hold, stop work, punch item, walkthrough, deposit, estimate, PPE). Customer-facing output stays English (OWN-DEC-59) - do not add Spanish to customer pages. Keep i18n parity tests green. Record in the existing translation-review mapping (task 3.3c/2.6 built per-key review status for critical staff strings) that these were AI-checked on 2026-10-12, status still "not human-reviewed" - AI checking never sets reviewed.
2. Safety content: find all safety procedure/hazard content that exists in the repository or the vault (the app's SOP/hazard seed or fixture data is synthetic - do not treat synthetic test SOPs as real; search /home/user/hh-vault-notes for real SOP drafts, e.g. Standard Of Operations/, Skills/, AI Development Plans/ and any "safety SOP" package). For each real English safety procedure that is approved or drafted: produce a Spanish translation as a DRAFT and a check report comparing against the English (terminology, warnings, prohibited actions, PPE, measurements and units, step order, stop-work conditions), listing corrections made and every ambiguous English source instruction flagged for the owner/reviewer (never resolve ambiguity by inventing guidance). Put these in the app repo under docs/safety-translations/ (one file per procedure + an index) - they are review packets, NOT loaded as approved content. Do NOT edit the vault's business files (Standard Of Operations etc. are additive-only and owner-owned). If no real English safety procedures exist yet, say so precisely and create the packet template and process doc instead.
3. Software behaviour: task T2 (step 6) built reviewed EN/ES SOP versions with a language gate (LANGUAGE_CONTENT_NOT_REVIEWED). Verify and, where needed, change so that: a Spanish safety version can be marked approved ONLY by a named competent bilingual reviewer (recorded reviewer, date, version), never by an AI or automated process (add a test that no code path or seed marks it approved without a reviewer record); a worker whose working language is Spanish sees exactly the text "Spanish safety review pending" (with the Spanish equivalent next to it in their UI) and the affected work stays blocked at the Start Work gate; workers reading English are unaffected. Do not weaken the gate in any way.
4. Full gate, gitleaks, commit (HH-LANG-02, HH-LANG-04, HH-PKT-04, OWN-DEC-79), push feat/launch-spanish-review. Reply with: number of strings checked/changed, the glossary, which safety procedures were translated and flagged (and their ambiguity list) or why none exist, gate behaviour and tests, commit id, and exactly what the bilingual reviewer must do.


## 2026-10-12T16:50:50.677Z (Agent)
You are working on HandyHub. Read the common brief /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/common.md and follow its rules (no invented business facts, owner decisions as versioned policy data, synthetic data, gitleaks before commit, full gate before push, flock only around e2e, never skip or weaken a test, commit trailer lines). Do NOT open pull requests or push to main.

Setup: `git -C /home/user/hh-t3 fetch origin && git -C /home/user/hh-t3 worktree add -b feat/launch-care-tax /home/user/hh-ct origin/main`; work only in /home/user/hh-ct. Merge origin/main again before pushing. New migrations use 0750-0799. Never edit an applied migration.

Owner decisions of 2026-10-12 (record as OWN-DEC-81 and OWN-DEC-83 in code comments and docs; the coordinator writes the vault log):

OWN-DEC-81 - After-job care instructions. Owner's words: "Have AI draft after-job care instructions for all 26 services now. Use the actual products' manufacturer guidance where relevant; do not invent drying, curing, cleaning, or waiting times. Keep each draft PROPOSED until I approve it. Customers see only the approved version appropriate to their completed work and products. If product details are missing, flag them for review rather than guessing. Record the approved version and include it in the customer's completion summary."
 - Find the 26 services (catalog registry / site data) and what each service's work involves (vault: Standard Of Operations/, Required inventory/, Main Plans/, the services spec - read only; never edit vault business files).
 - Draft care instructions per service as data: general, non-numeric care guidance that is safe without product specifics, plus explicit "product-dependent" placeholders wherever a time/condition depends on the product used (e.g. "Wait time before washing: per the manufacturer's instructions for <product used on your job> - to be filled from the product record"). NEVER write a number of hours/days, temperature or chemical claim unless it comes from a product record actually stored for that job. No warranties or promises. Each draft carries a "flags for review" list.
 - Software: a versioned care-instruction record per service with states PROPOSED -> approved (owner only, fresh step-up, reason; approved version, approver and time recorded), seeded with the drafts as PROPOSED by migration. If the job has product records (materials/products used, from T2's job materials), the summary fills product-dependent lines only from the product's stored manufacturer guidance field; if missing, that line is omitted from the customer view and flagged to staff ("product guidance missing"). The customer completion summary (T1 workspace / T2 walkthrough summary) includes only the approved version for the services on the job; unapproved -> nothing shown to the customer. Owner review screen (list, diff, approve). Staff share remains audited (T1 share-with-customer).
 - Also write docs/care-instructions/README.md explaining the review steps for the owner.
 - Tests: unapproved never reaches the customer; approved version recorded on the summary; product-dependent line omitted and flagged when product guidance is missing; only owner can approve.

OWN-DEC-83 - Tax and rounding. Owner's words: "For the current setup, do not add a separate tax line or automatically charge tax on estimates and invoices. Keep tax configuration disabled and show the approved final price clearly. Keep consistent half-up rounding to cents per line, with totals matching the displayed amounts. No hidden rounding charges. This is a software setting, not a determination that every service is tax-exempt. Any applicable tax treatment will be confirmed separately with the accountant."
 - Today, sending an estimate / issuing an invoice is refused while tax is NOT CONFIGURED (e.g. core-flow e2e "sending refused with the blockers named"). Add an explicit tax mode "no tax line - owner setting, pending accountant" as a versioned policy option the owner activates in the app (fresh step-up, reason) - do not activate it in a migration; pre-fill it as PROPOSED. With it active: estimates and invoices show no tax line and no tax charge, the total equals the sum of displayed line amounts (half-up to the cent per line, one rounding per line, no hidden adjustment), and sending/issuing is no longer blocked by tax. NOT CONFIGURED keeps blocking as today until the owner activates something. Customer documents must not state or imply tax-exempt status; staff screens label the mode "Tax not charged (owner setting; accountant to confirm)". Keep the existing lump-sum tax setting available but not active.
 - Tests: unit (rounding per line, total = sum of displayed lines, no tax line) and integration (send/issue allowed only when the mode is active; NOT CONFIGURED still blocks; no tax-exempt wording on customer output); update e2e/journey expectations if they assumed the old blocker.

Update the audit-coverage register, permission matrix exclusions if needed, response-schema debt list, launch readiness entries (tax and care instructions show owner actions), walkthrough doc. Full gate, gitleaks, commit (OWN-DEC-81, OWN-DEC-83, HH-QA-05, HH-FIN-04, HH-DATA-02), push feat/launch-care-tax. Reply with changes, the list of 26 services with their flags, tests, commands/results, commit id, owner actions.


## 2026-10-12T16:57:24.829Z (SendMessage)
Coordinator: the owner REPLACED the Spanish safety rule (supersedes the human-reviewer part of OWN-DEC-79; record as OWN-DEC-79 as amended). Owner's words: "Remove the mandatory bilingual human-review step. Have AI complete all Spanish translations and run a separate comparison against the approved English source. Check warnings, PPE, prohibited actions, measurements, step order, and stop-work conditions. Automatically release translations that pass, recording the source version, review date, and status 'AI-reviewed.' Do not label them human-reviewed or safety-certified. Flag failed checks or ambiguous instructions and keep only the affected procedure pending. Do not invent missing guidance or alter the approved procedure. Existing safety, legal, and job-start holds remain unchanged. Complete this workflow and its tests now."
Change your plan accordingly:
- Software: a Spanish safety version can be released with status "AI-reviewed" when its recorded automated comparison against the APPROVED English source version passed (store source version id, check date, check result per category: warnings, PPE, prohibited actions, measurements/units, step order, stop-work conditions). Never label it human-reviewed or safety-certified anywhere (UI, API, docs). A failed or ambiguous check keeps only that procedure pending ("Spanish safety review pending", work blocked for Spanish-reading workers on that procedure). A new English version invalidates the Spanish release until re-translated and re-checked. Keep the option for a human reviewer to add a human review record later (optional, separate status). The English competent-review/activation rules and every existing safety, legal and Start Job hold stay exactly as they are.
- The translation and the comparison must be separate steps (the comparison must not be the same pass that produced the translation): implement the comparison as a deterministic, testable check where possible (e.g. every warning/PPE/prohibited/stop-work item and every number+unit and step count in the English source must have a mapped counterpart in the Spanish, step order preserved), and record your own AI comparison results for each real procedure in docs/safety-translations/ with the per-category outcome. Since there is no runtime AI in the product (AI stays off, OWN-DEC-74), the AI translation/comparison is done by you now during development and stored as reviewed data; the product only stores and enforces the recorded result.
- Tests: release only on a recorded pass against the current approved English version; fail/ambiguous keeps that procedure pending and blocked; new English version invalidates; labels never say human-reviewed/safety-certified; holds unchanged.
Everything else in your brief (staff UI strings, glossary, customer English only) stays.


## 2026-10-12T16:57:53.196Z (Agent)
You are working on HandyHub. Read the common brief /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/common.md and follow its rules (synthetic data, gitleaks before commit, full gate before push, flock only around e2e, never skip or weaken a test, commit trailer lines). Do NOT open pull requests or push to main.

Setup: `git -C /home/user/hh-t3 fetch origin && git -C /home/user/hh-t3 worktree add -b feat/launch-a11y-pass /home/user/hh-ax origin/main`; work only in /home/user/hh-ax. Merge origin/main again before pushing. Chromium for Playwright: E2E_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium (never run playwright install).

Owner decision OWN-DEC-85 (2026-10-12), owner's words: "Have the AI complete accessibility testing and fixes before launch using automated scans and available browser tools. Test keyboard navigation, focus, forms/errors, dialogs, mobile layouts, large text, contrast, and accessible names across customer and staff workflows. Fix issues, rerun checks, and record actual results. Do not mark keyboard/browser testing as screen-reader testing unless a real screen reader was used. Complete every check the available tools support. Record unsupported screen-reader or physical-device checks as unverified, with the remaining limitation clearly stated. Do not claim full accessibility conformance from automated checks alone."

Do this:
1. Use the manual checklist in docs/two-websites/accessibility.md (and the WCAG 2.2 AA criteria it maps) as the plan. Cover every customer workflow (public site, request form with errors and uploads, receipt, project link + code, workspace screens, estimate approval, invoice) and every staff workflow (sign-in shell, Requests, Customers/profile, Estimates, Schedule, Jobs, Field review, worker My day / visit / packet / offline drafts / Stop Work, Quality, Incidents, Complaints, Readiness board, Finance, Records/deletion dialogs, Templates, Settings/policies, Ops home).
2. With Playwright on Chromium (real browser), automate and run: keyboard-only traversal of each workflow (Tab/Shift+Tab/Enter/Space/Escape/arrow keys where widgets need them) asserting every interactive element is reachable, operable, in a logical order, with a visible focus indicator not obscured (WCAG 2.4.7, 2.4.11); focus moves into dialogs, is trapped, Escape closes, focus returns to the trigger; form errors: error summary, field-level messages linked via aria-describedby, focus to summary, inputs retained; accessible names/roles/states via the accessibility tree (page.accessibility snapshot / getByRole) for all controls and images; contrast via axe in light and dark themes; reflow at 320 px and 200% and 400% text zoom with no horizontal scroll or clipped content; target size 24 px minimum (44 px where the design spec requires); reduced motion; status messages announced via live regions (assert role=status/alert presence - this is not screen-reader testing). Add these as committed e2e tests (extend apps/e2e/tests/wcag-accessibility.spec.ts or new specs) so they keep running in CI.
3. Fix every issue found in the app code (keep the premium design; no unrelated redesign, HH-BASE-01), rerun until green.
4. Record actual results in docs/two-websites/accessibility-results-2026-10-12.md: per workflow and per check, pass/fail/fixed with the test that proves it; a clearly separate "Not verified" section listing screen-reader testing (NVDA/JAWS/VoiceOver/TalkBack were not used) and physical-device testing (iOS/Android hardware, switch access, voice control) as unverified, with the remaining limitation stated; and an explicit statement that this is not a claim of full WCAG conformance. Update docs/two-websites/release-report.md and traceability for HH-A11Y-01/02/03, T69.
5. Full gate, gitleaks, commit (OWN-DEC-85, HH-A11Y-01/02/03, T69), push feat/launch-a11y-pass. Reply with issues found and fixed (counts per workflow), tests added, the not-verified list, commands/results, commit id.


## 2026-10-12T18:18:58.275Z (Agent)
You are working on HandyHub. Read the common brief /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/common.md and follow its rules (no invented business facts, synthetic test data, gitleaks before commit, full gate before push, flock only around e2e, never skip or weaken a test, commit trailer lines). Do NOT open pull requests or push to main.

Setup: `git -C /home/user/hh-t3 fetch origin && git -C /home/user/hh-t3 worktree add -b feat/site-step1-owner-edits /home/user/hh-s1 origin/main`; work only in /home/user/hh-s1; merge origin/main again before pushing. Another agent (branch feat/launch-service-text) is writing the 26 service pages' content and a review screen - do not edit service-page content data; you own the homepage, the request entry choice, the ZIP checker and the card wording.

The owner reviewed customer journey Step 1 on 2026-10-12 and decided (record as OWN-DEC-86 to OWN-DEC-89 in comments/docs; the coordinator writes the vault log). Owner's words are binding text:

OWN-DEC-86 - Homepage wording. Replace the trust facts and the Why HandyHub section with exactly:
 - "Free estimates—online or at your property."
 - "Every project individually priced to match its scope."
 - "Visits every day, 8 AM–10 PM, by appointment."
 Section "Why HandyHub", subtitle "Professional care, from estimate to completion.", items (bold label + text):
 - Clear pricing: Written scope and price for your approval.
 - Respect for your time: Confirmed date, arrival window, and updates.
 - Prepared team: Tools, materials, and instructions planned for your job.
 - Your approval matters: No added work or price changes without your agreement.
 - Careful completion: Quality review, walkthrough when available, and documented follow-up.
 - Easy project access: Estimates, updates, photos, and invoices through one secure link.
 Update the claims register and copy-lint allow-list to these owner-approved sentences (source: owner, 2026-10-12). Keep the premium design. Customer pages English only. Do not promise completion times or 24/7.

OWN-DEC-87 - Request entry choice. When someone clicks "Request an Estimate" / "Request a Free Estimate" (header, sticky bar, service pages with the service preselected), show: heading "How would you like to continue?"; primary option "Continue as Guest - Request an estimate without creating an account. Manage your project through a secure link."; option "Create an Account - Keep your projects in one place and make future requests easier."; link "Already have an account? Sign in". Guest is the primary option. The visitor can dismiss the choice and return to browsing. Selections (preselected service, ZIP, anything entered) are preserved when switching between guest, create account and sign in, and through the whole form. Accounts are the passwordless one-time-code accounts already on main (customer-access module, OWN-DEC-63): wire Create account / Sign in to them; a guest can create an account later, and linking existing projects requires verified ownership and keeps the original records without duplicates (existing safe-linking rules). Accessible dialog (focus, Escape, return focus), works at 320 px and 200% text.

OWN-DEC-88 - ZIP checker (the owner tested it on staging and it does not work - find the real root cause; suspects: the site's fetch to the coverage API is refused by the staging access gate because it sends credentials 'omit' (slice 1.1 changed only the portal pages to 'same-origin'), a coverage policy not configured on staging, a route/CSP problem - check them all and fix the actual cause). New messages, exactly:
 - Served: "We serve your area. Tell us about your project."
 - Near the boundary: "You may be within our service area. Send your request and we'll confirm the address."
 - Outside the usual area: "Outside our usual coverage? You can still request an estimate—we'll check whether we can help."
 - Unknown: "We couldn't confirm this ZIP. You can still submit your request for review."
 A "Continue with Request" button for every outcome (outside-area too). Keep the ZIP in the form and save the coverage result with the request for staff review (it may already be stored - verify). Invalid ZIP format: a correction message. Lookup failure: explain the issue and allow submission for manual review (unknown outcome stored). Use only the configured coverage rules; never invent coverage. Coverage never confirms an appointment, price or travel charge. Tests: all four outcomes, invalid input, lookup failure, ZIP preserved into the form, a successful request submission carrying the coverage result - integration + site + e2e, and an e2e that runs the ZIP check with the staging access gate ENABLED (to prove the gate no longer breaks it).

OWN-DEC-89 - Card wording: "Approved card wording names Square; no card surcharge applies." This amends the earlier rule that kept the provider unnamed (OWN-DEC-67 wording). On the site where payment methods are listed (only when the payment-methods policy is active), say cards are taken with Square, e.g. "credit or debit cards (Square)"; never mention a surcharge. Keep any approved same-day service charge separate from card wording. Update the copy lint (it currently blocks "Square" as a payment name), claims register and tests; customer invoices may also name Square for card.

Also, the owner wants completed site edits visible on private staging (no draft queue for these homepage edits); production stays unchanged until the go decision. Staging stays behind its password gate and hidden from search.

Run the full gate (build, lint, typecheck, unit, integration, e2e), gitleaks, commit (OWN-DEC-86..89, HH-CUS-01/03, HH-INT-01, HH-ID-10, HH-BASE-04), push feat/site-step1-owner-edits. Reply with: the ZIP checker root cause and fix, every changed page, tests and actual results, commit id.


## 2026-10-12T18:19:06.272Z (SendMessage)
Coordinator update from the owner (reviewing journey Step 1, 2026-10-12). Owner's words: "Finish and publish all the latest homepage and service-page edits to the private staging website. I will review them directly on the website; do not leave completed content unpublished or waiting for individual approval. Complete all 26 service pages with descriptions, inclusions/exclusions, estimate approach, safe preparation instructions, relevant considerations, 3–5 service-specific FAQs with answers, and related services. Preserve the premium design and approved homepage wording. 'Request a Free Estimate' must preselect the service and offer Continue as Guest, Create an Account, or Sign In, preserving selections throughout. Resolve implementation issues rather than hiding unfinished features. Flag uncertain business facts separately without inventing claims or blocking unrelated pages. Keep the staging password gate and test payments/messages active. ... This authorizes private staging publication only; production remains unchanged."
Changes to your task:
1. Content per service now also includes "relevant considerations" (e.g. home-age limits OWN-DEC-66, what may need a site visit) and 3-5 service-specific FAQs with answers, plus related services - all from the service files, no invented prices, times, credentials or guarantees; uncertain facts go to a separate flags list (docs) and do not block other pages.
2. Publishing: on staging (HANDYHUB_ENV=staging, and local/ci), the drafted content is shown on the site directly (treat it as published-to-staging); keep the versioned states and your owner review screen, but production must show only versions the owner approved and published (approval stays required for production - make the environment rule explicit and tested). Remember the site is statically built: make sure the staging deploy actually renders the content (the build reads it in the staging environment), so the owner sees it on staging after the merge.
3. Do NOT build the "Continue as Guest / Create an Account / Sign in" chooser or the homepage wording - another agent (branch feat/site-step1-owner-edits) owns those and the ZIP checker; just keep the service page CTA preselecting the service as today so the chooser can hook in.
Record this as OWN-DEC-84 as amended (staging publication without per-service approval; production still needs approval).


## 2026-10-12T18:31:38.283Z (SendMessage)
Coordinator: the owner reviewed journey Step 2 (the estimate request form) on 2026-10-12. Add all of this to your branch feat/site-step1-owner-edits (you own the request form now; record as OWN-DEC-90 to OWN-DEC-93). Same rules: no invented facts, synthetic data, full gate incl. e2e, gitleaks; staging shows the result after merge; production unchanged until go. Owner's words are binding:

OWN-DEC-90 Choosing services: "After Continue as Guest, account creation, or sign-in, open the request form with the service from the page already selected. Simplify the selector while preserving the premium design: Choose a category - four clear cards: Home Improvement: Repairs and installations; Drywall: Wall repairs and drywall projects; Painting: Painting and surface finishes; Cleaning: Home and property cleaning. Select services - show only the opened category's services, using consistent checkbox rows with clear selected states instead of differently sized buttons. Allow up to 5 services without duplicates. Show 'Selected services — 0 of 5' and a visible selection summary with Remove actions. Switching categories must preserve previous selections. When arriving from a service page, automatically open its category and preselect the service. Keep 'Not sure what service I need' clearly visible as an alternative. Let customers describe the project so staff can classify it during review. Ask only questions relevant to the selected services, and avoid repeating shared questions. Preserve selections and entered details when navigating back, creating an account, or signing in. Explain that multiple services form one project request, with scope, pricing, and scheduling confirmed after review. If more than 5 services are needed, allow additional work to be described without blocking submission. On phones, stack the category cards and use full-width checkbox rows."

OWN-DEC-91 About the job: "Ask short, service-specific questions for each selected service. Group them clearly and ask shared questions only once. Show units beside measurements and allow approximate values. 'I don't know' means unknown—not zero—and must not block submission. Include one project description, with optional notes for individual services. Allow up to 10 photos total per request: JPEG, PNG, or WebP, up to 15 MB each; no PDFs. Photos remain optional. Show previews with Remove/Retry controls and individual uploading, processing, complete, or failed states. Preserve all text, answers, and successful photos if an upload fails or the customer navigates back. Allow submission with failed photos excluded and a clear notice. Show: 'Please don't upload payment cards, IDs, passwords, or unrelated personal information.' Validate file types and limits on the server. Test phone-camera uploads and clearly explain unsupported formats."

OWN-DEC-92 Property and timing: "Require the full property address: street address, city, state, and ZIP. Apartment/unit is optional. Also collect property type. Prefill the ZIP from the coverage check. Let customers correct it and recheck coverage without clearing other answers. Save the full address with the request, show it to authorized staff, and include it in the customer's review summary before submission. Never display it publicly. Offer a preferred date or 'I'm flexible.' Standard dates start tomorrow, using the property's local time. Include 'Need help today?' as an optional request for staff review—not a guaranteed appointment. Show any applicable same-day charge only under the activated policy. Offer Mornings, Afternoons, Evenings, Weekends, or Any time. Display configured window hours within 8 AM–10 PM. Any time clears other selections; Weekends must align with the date or flexible-date preference. Show: 'These are your preferences. Your appointment is confirmed only after we send a date and arrival window.' Preserve all details when navigating back. Outside, boundary, or unknown coverage must not block submission; flag the request for staff review."

OWN-DEC-93 Contact and send: "Require name, email, and phone. Prefill verified account details when available and let customers correct them. Offer preferred contact by email, phone call, or text. Keep marketing permission separate. Offer Online Estimate, Site Visit, or 'Let HandyHub decide.' Explain that staff confirm the appropriate approach after review. Show a final summary of services, answers, photos, full property address, timing, and contact details. Each section has an Edit action that preserves everything else. Link the privacy notice and save the exact version presented with the request. Use 'Send Estimate Request.' Double taps and retries after a connection failure must create only one request. Show field-specific errors and retain all entered details and successful uploads. Temporarily save unfinished text drafts in the same browser. Offer Resume and Clear Draft, expire old drafts, and clear them after successful submission. Do not retain passwords, verification codes, or payment information. After successful submission, show the request reference and next steps. Explain that the request is received, not a confirmed appointment. Contact verification must not require creating an account."

Server side: store every new field (full address with unit, property type, flexible date, need-help-today flag, windows, preferred contact channel, estimate preference incl. 'let HandyHub decide', marketing permission separately with its own consent record, per-service notes, extra-work description beyond 5 services, coverage result) and show them to authorized staff on the request; the staff request screen must display them. Keep the existing coverage, idempotency, draft-capability upload and validation rules (server validation of everything). Tests: unit/integration/site/web and e2e for the whole flow incl. phone viewport, 200% text, keyboard and the gate enabled. Use test email/text destinations only.


## 2026-10-12T18:43:44.061Z (SendMessage)
Step 3 owner decisions (OWN-DEC-94..97): the receipt, automatic receipt email, contact verification and project access. Add these to your branch after the Step 1 and Step 2 work. Same rules apply: synthetic data, approved test destinations only, en/es parity, no invented facts, staging stays gated. If this is too large for your branch, finish Step 1+2 first, push, and tell me; I will open a separate branch for it.

OWN-DEC-94 Receipt page (show success only after the request is saved):
- Heading "Your request is in." then "Thank you for choosing HandyHub."
- "Request reference: HH-XXXX" showing the actual reference, with a Copy button.
- "Your project at a glance": selected services, description, property address, preferred timing, contact details.
- "Your photos": received, processing and failed shown separately. Failed uploads can be retried from the receipt without submitting a new request. A photo failure never loses the request.
- "What happens next?": "We'll review your project and contact you using your preferred method. We aim to respond within one hour during our daily hours, 8 AM–10 PM. Requests received outside those hours are reviewed when we reopen." and "Your request is received. Pricing and your appointment will be confirmed separately." (The 8 AM–10 PM hours are owner-stated in this decision. Keep them in configurable copy/policy, not scattered literals.)
- Actions: "View My Request" (verified, secure project access), "Create an Account" (optional, guests only), "Return Home".
- Never show existing customer history before verification.

OWN-DEC-95 Receipt email sends AUTOMATICALLY after a successful save. This amends the staff-release rule: only receipts, verification codes and access links send automatically; every other customer message stays a staff-released draft.
- Content: actual reference, selected services, brief summary, next steps, secure instructions for viewing the request, account creation optional, pricing and appointment confirmed separately, the same response-hours wording. English (Spanish follows the customer's language if the template exists; at minimum English).
- One receipt per request. Idempotent: double submits and retries create neither duplicate requests nor duplicate emails (idempotency key on submission plus a unique outbox key per request).
- If delivery fails, the request stays saved; staff see a delivery issue with a Retry action.
- Staging sends only to approved test destinations.

OWN-DEC-96 Contact verification:
- The request is saved immediately and marked "Contact unverified". Staff can review it while verification is pending.
- Guests verify with a one-time code sent to the submitted email or phone; no account needed.
- Email and phone verification are tracked separately; verifying one never marks both.
- The receipt shows the masked destination, code entry, Resend and Change Contact. A changed contact must be verified itself.
- Codes expire; attempts and resends are limited; the request is kept if delivery fails or the customer leaves.
- Verified contact ownership is required before private project access and before estimate or change-order approval. A reference number alone grants no access.
- A matching email or phone never reveals earlier projects.

OWN-DEC-97 Project access without waiting for staff:
- Create the project record automatically when the request is saved. Staff review it afterwards; this is NOT a confirmed job or appointment.
- "View My Request" is on the receipt, and secure project-access instructions are sent automatically. Verification is required before private information shows.
- Optional "Create an Account" with a passwordless code. Guests can manage their authorized project without registering.
- Registering later links the verified request to the account without duplicating records.
- A new submission with the same email doesn't reveal earlier projects. Account-wide history needs verified identity plus authorized record links. A single-project guest link grants access to that project only.
- Expired links offer a safe way to request new access.

Tests: integration tests for idempotent submission and the single receipt, separate email/phone verification, code expiry and attempt limits, no history leak on a matching email, guest link scope, link-on-register without duplicates, and delivery failure leaving the request saved with a staff retry. Add an e2e test from receipt to verification to "View My Request". Note the IDs in commits.


## 2026-10-12T18:48:55.802Z (Agent)
You are building the owner's Step 4 decisions (OWN-DEC-98..101) in the HandyHub app repository (github.com/Bh3os/handyhub-app). First read the common brief: /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/common.md. Follow it exactly, with these overrides:
- Heavy-command locking: wrap ONLY e2e runs in `flock /tmp/hh-heavy.lock`. Integration tests use their own random databases; run everything else unlocked.
- Your worktree is /home/user/hh-s4. Create it from latest main: `cd /home/user/handyhub-app && git fetch origin main && git worktree add -b feat/journey-step4-questions /home/user/hh-s4 origin/main`. Work only there. Never touch other worktrees or the /home/user/handyhub-app checkout's files.
- Migrations: only 0950–0999 in db/migrations.
- Progress file: /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/progress-step4.md
- Don't open or merge PRs. Push your branch; the coordinator opens the PR.
- In parallel, another agent (branch feat/site-step1-owner-edits) is building Step 3: automatic receipt email, contact verification, project auto-created at submission, guest project links. It adds an "automatic-message exceptions" policy list (receipt, verification code, access link). Add your two exceptions to that same single list. If it isn't on main yet, create the list in one obvious place (a policy constant/module in the notification outbox) so the merge is trivial. Merge origin/main before each step.

Explore the existing code first: the project workspace, customer portal, messaging, notification outbox, scheduling and visits, capacity, intake, reminders and cadence (OWN-DEC-77 reminder rules), customer-access and audit. Extend what exists rather than duplicating it.

OWNER DECISIONS (the owner's words, condensed; implement all of them):

OWN-DEC-98 Staff questions to the customer:
- Staff write and publish questions inside the correct project. Publishing is the staff release action; the notification then sends automatically with no second approval.
- A brief notice goes through the customer's permitted, preferred channel: "HandyHub has a question about your request. View and reply securely." No private details in the email or text.
- The notice links directly to the question through verified project access.
- The customer sees "Waiting on you" with a clear Reply action. Replies allow text, optional photos and "I'm not sure" for measurements. Never ask customers to inspect hazardous areas: add a guard or warning in the staff composer and in the guidance copy.
- Reply drafts and successfully uploaded photos are kept if an upload fails.
- After submission: "Reply received—HandyHub will review it", and the assigned staff member is notified. Other unanswered questions stay open.
- The question, replies, attachments, authors and timestamps are kept in project history (append-only).
- Retries never send duplicate notices. Delivery failures appear in the staff queue without losing the question.
- Published-question notices join the automatic-message exceptions. Other follow-ups stay staff-released drafts.

OWN-DEC-99 Online estimate or site visit:
- Staff choose "Estimate online" when the information is sufficient, or "Site visit needed" with a short customer-facing explanation. The customer's preference is considered (show it to staff), but staff confirm the approach.
- For a site visit, staff offer 2–3 available windows that account for staff capacity and travel (use the existing capacity/visit logic). The customer selects one, or requests another time without restarting the request.
- Availability is rechecked when a window is selected. The appointment is confirmed only after the slot is reserved; otherwise alternatives are offered. Make this concurrency-safe and test two customers racing for one slot.
- The project shows the confirmed date, arrival window, property address, visit purpose and preparation instructions.
- This creates an appointment of type "Estimate visit" linked to the existing project. No work job, and no implied price approval.
- Online and onsite estimates are free under current policy. Never display or charge a visit fee unless the owner explicitly changes and activates that policy (versioned policy, default free). Any future fee is disclosed before booking.
- Publishing visit options and confirming the appointment each send a brief automatic notice (these join the exceptions list). No duplicate sends; staff see delivery failures.

OWN-DEC-100 Not a fit:
- Staff decide whether an outside-area request can be accepted, not the ZIP checker.
- Assess the actual work before declining. Never auto-reject a whole service category.
- "Not a fit" carries a reason category: coverage, work outside our scope, specialist assessment needed, or another documented reason (free text required). Internal risk notes stay private (staff-only).
- Customer text: "Thank you for considering HandyHub. We're unable to take on this project because [plain-language reason]." No named-company recommendations.
- Closing keeps the summary, decision and shared history visible through authorized customer access. Apply the retention schedule; never delete automatically.
- If work was already accepted, an appointment exists, or money was received, route it to the owner for cancellation and financial review (owner-only action) instead of simply closing everything.
- Staff publish the decision; a brief automatic notice points the customer to the project (add it to the exceptions list).

OWN-DEC-101 No reply to a staff question (replaces the 3-day/7-day cadence for unanswered questions ONLY; the other OWN-DEC-77 cadences stay):
- First reminder draft after 24 hours, final reminder draft after 48 hours, both measured from the original notice's SUCCESSFUL send.
- Staff still release these drafts. Show them prominently in the action queue. They send only during contact hours, 8 AM–10 PM (owner-stated; store it as configurable policy in the business time zone; queue anything released outside hours until 8 AM).
- Staff may close an unbooked request as "Closed—no response" only 24 hours after the final reminder was actually sent.
- Reminders stop immediately when the customer replies. A failed notice delivery never counts as customer non-response (the clock starts only on a successful send).
- The reopen period is 30 days now: a configurable policy value, set to 30, not NOT CONFIGURED.
- A customer reply within the period reopens the same request for staff review, with its history kept. It doesn't restore an expired estimate or appointment.
- Never automatically cancel accepted, scheduled or paid work under this rule.

Requirements: server-side authorization through the PEP for every new route (staff roles per the existing role matrix; customers only through verified project access, scoped to their project); append-only audit for publish, reply, select window, decline and close; EN/ES parity for staff screens and customer portal strings; OpenAPI regenerated; no invented facts. Tests:
- integration tests for every bullet above: duplicate-notice prevention, delivery failure, the slot race, the fee-never-shown default, owner routing when money or an appointment exists, the 24h/48h/close timing with failed deliveries not counting, reply stopping reminders, contact-hours queueing, and reopen within and after 30 days without restoring an expired estimate
- unit tests where useful
- one e2e test: staff publish a question, the customer replies with a photo, then staff offer windows, the customer picks one, and the confirmed estimate visit shows

Tag tests with OWN-DEC ids. Commit per logical step, then push. When done, reply with the final report described in the brief, including the commit ids and any PROPOSED choices.


## 2026-10-12T18:53:59.005Z (Agent)
You are building the owner's Step 5 decisions (OWN-DEC-102..105) in the HandyHub app repository (github.com/Bh3os/handyhub-app). First read the common brief: /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/common.md. Follow it exactly, with these overrides:
- Heavy-command locking: wrap ONLY e2e runs in `flock /tmp/hh-heavy.lock`. Integration tests use random databases; run everything else unlocked.
- Worktree: `cd /home/user/handyhub-app && git fetch origin main && git worktree add -b feat/journey-step5-estimates /home/user/hh-s5b origin/main`. Work only in /home/user/hh-s5b. Never touch other worktrees or the /home/user/handyhub-app checkout's files.
- Migrations: only 1000–1049 in db/migrations.
- Progress file: /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/progress-step5.md
- Don't open or merge PRs. Push your branch.
- Two parallel agents are working:
  - feat/site-step1-owner-edits (Step 3): contact verification, automatic receipt, guest project links, and a single "automatic-message exceptions" policy list.
  - feat/journey-step4-questions (Step 4): staff questions, estimate-visit window offering with an availability recheck and slot reservation, a decline flow, and contact-hours sending.
  Build the estimate, approval and deposit parts first. Build the work-appointment window part (OWN-DEC-105) LAST: by then, merge origin/feat/journey-step4-questions if it has been pushed (`git fetch origin feat/journey-step4-questions`) and reuse its window offering/reservation for work visits instead of writing a second mechanism. If it still isn't available, build on the existing visits/capacity code in a way that's easy to unify, and note it in the progress file. Add the estimate-ready, approval-receipt and appointment-confirmation notices to the single automatic-message exceptions list (create it in the notification outbox if it isn't on main yet).

Explore the existing code first: estimating (drafts, lines, revisions, options/exclusions, send gate/readiness, per-job quoted pricing), customer approval (secure link, terms acceptance), deposit policy (20% over $1,000), payments (Square card link, manual methods), jobs, scheduling, visits/capacity, the PDF/document rendering, file uploads (R2/storage abstraction), notification outbox, the customer portal/project workspace, and the PEP/roles. Extend what exists.

OWNER DECISIONS (the owner's words, condensed; implement all of them):

OWN-DEC-102 Estimates without a price book:
- Remove the price-book requirement from estimate readiness and sending (an inactive or absent price book must not block). Authorized employees create each estimate manually, by one of two methods:
  a) "Write an Estimate": enter the scope, line items, prices, options, exclusions and any deposit directly in the staff website.
  b) "Upload an Estimate": upload a PDF or Word (.docx) document, preview it, and enter the total, currency, deposit if applicable, and validity as structured fields.
- The customer request-photo upload restriction is unchanged. Estimate documents are a separate staff-only upload feature with its own type/size validation, malware-safe handling, and private storage.
- Before publishing, the employee must confirm (checkbox) that the document and the structured amounts agree. Never guess prices or totals from the uploaded text (no parsing amounts out of the document).
- Word documents are converted to a customer-viewable PDF; the original is kept privately (staff only). Choose a conversion approach that works in the Render Node deployment with no external third-party service. If no faithful converter is feasible, record a PROPOSED choice and an explicit state (e.g. publish blocked until a PDF is supplied); never a fake success. Document what you chose.
- Customers review and approve the exact published document version or written estimate, including selected options and total. Prior revisions are kept; any edit creates a new version that needs a new approval.
- Kept rules: 14-day validity, exact integer-cent money, no tax line, NO MINIMUM CHARGE (owner decision now; make sure no minimum is applied anywhere in estimate totals), no card surcharge. Publishing sends the automatic "Your HandyHub estimate is ready" notice, with no amounts in email or text.

OWN-DEC-103 Approval:
- Requires verified project access. If verification has expired, offer a new code without losing the selected options (keep selections client- and server-side).
- Before approval, show the complete written or uploaded estimate, readable terms, selected options, final total and any deposit.
- "I have read and accept the estimate terms" is unchecked by default. Require the customer's full name and an explicit "Approve Estimate" action.
- Record the exact estimate/document revision, terms version, selected options, approved total, name, verified contact and server timestamp. Only the necessary security metadata (e.g. IP and user agent per existing audit practice); no invasive device fingerprinting.
- The server rechecks validity, revision, options and total. Expired or superseded estimates are rejected: show the current version when available, otherwise offer "Request an Updated Estimate".
- Double clicks and retries create exactly one approval and one job/scheduling task (idempotency key + unique constraints; test concurrency).
- Request Changes and Decline (optional reason) stay available; staff are notified; history is kept.
- After approval: "Estimate approved—scheduling is next." Approval never confirms an appointment or marks a deposit paid.
- On staging, the terms used in tests are clearly labeled test-only (the attorney-approved terms gate stays: real terms are owner/attorney data, never invented).

OWN-DEC-104 Deposit:
- For approved estimates over $1,000, a 20% deposit on the final approved total (including selected options), rounded to cents (half-up). Use the existing deposit policy data; don't hard-code it outside the policy.
- Customer text: "Deposit due: $X. Please pay your deposit so we can confirm your work appointment. Payment does not guarantee a particular date."
- Accepted methods are the approved ones (card via Square, cash, check, Zelle, Cash App, Chime), with no card surcharge. Staff verify and record the payment, method, amount, date and transaction reference where applicable. A received check stays PENDING until cleared, or until the owner approves a waiver.
- Confirmed work scheduling stays blocked until the required deposit is satisfied (cleared) or the owner records a job-specific waiver with a reason (owner-only, audited). A waiver never marks the deposit paid and never reduces the agreed price.
- The deposit is credited toward the final invoice.
- Never invent late fees, forfeiture or refund terms (none appear anywhere).

OWN-DEC-105 After approval:
- Create one job for the approved project, keeping the exact estimate/document revision, selected options, scope, exclusions, total and terms. Retries never duplicate jobs.
- The approval receipt sends automatically, with a PDF of the approved estimate and terms (for uploaded estimates: the published PDF plus a terms PDF or a combined PDF). Both are also available through verified project access.
- Next-step text: with a deposit required and not yet satisfied, "Estimate approved—pay your deposit to proceed with scheduling."; with no deposit, a satisfied deposit or an owner waiver, "Estimate approved—choose your work appointment."
- Staff propose 2–3 feasible windows based on assigned workers, job duration, travel and required resources. Customers can request other times.
- Capacity is rechecked on select. Confirm only after reserving all required workers/resources; otherwise offer alternatives (test the race).
- Show the confirmed date, arrival window, property address and preparation instructions, then send an automatic confirmation.
- One job can have multiple visits. Later scope or price changes require an approved change order; the original approval is never overwritten.

Requirements: server-side authorization through the PEP (estimate authoring/publishing per the role matrix; waivers owner-only; customers only through verified project access to their own project); append-only audit; EN/ES parity for staff screens; customer documents English; OpenAPI regenerated; no invented facts. Tests:
- integration tests for every bullet: both estimate methods; publish blocked without the agree-confirmation; Word original private; revisions; expired and superseded rejection; idempotent approval and job under concurrency; deposit math in cents at the boundary ($1,000.00 exactly → no deposit; $1,000.01 → 20%), including options; check pending; waiver owner-only and not marking paid; deposit credit on the invoice; scheduling blocked until satisfied; the window race; no minimum charge; no surcharge
- one e2e test: staff upload a PDF estimate, publish, the customer verifies, selects options, approves, sees the deposit, staff record a cleared deposit, staff offer windows, the customer picks one, and the confirmed appointment shows
- e2e for the written method if feasible

Tag tests with OWN-DEC ids. Commit per logical step, push, and give the final report described in the brief (commit ids, PROPOSED choices, owner inputs).


## 2026-10-12T19:01:51.718Z (Agent)
You are building the owner's Step 6 and Step 7 decisions (OWN-DEC-106, OWN-DEC-107) in the HandyHub app repository (github.com/Bh3os/handyhub-app). First read the common brief: /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/common.md. Follow it exactly, with these overrides:
- Heavy-command locking: wrap ONLY e2e runs in `flock /tmp/hh-heavy.lock`; run everything else unlocked (integration tests use random databases).
- Worktree: `cd /home/user/handyhub-app && git fetch origin main && git worktree add -b feat/journey-step6-workspace /home/user/hh-s6 origin/main`. Work only in /home/user/hh-s6.
- Migrations: only 1050–1099.
- Progress file: /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/progress-step6.md
- Don't open or merge PRs. Push your branch.
- Parallel agents (merge their pushed branches when you need their pieces: `git fetch origin <branch> && git merge origin/<branch>`; merge origin/main before each step):
  - feat/site-step1-owner-edits: contact verification, guest project links, project auto-created at submission, and the single automatic-message exceptions list.
  - feat/journey-step4-questions: staff questions and replies, estimate-visit windows, decline, and contact-hours sending.
  - feat/journey-step5-estimates: written and uploaded estimates, approval, deposit, approval receipt PDF, and work-appointment windows.
  - feat/journey-step8-field: the worker workflow (SOP checklist, change orders, hazards, completion, quality review).
  Your job is the customer workspace SHELL that shows all of that together, plus appointment reminders and requests. Don't rebuild their features. Read their data through existing or their new server APIs, and where a piece isn't merged yet, render the section from what main has, with a helpful empty state. Before you finish, merge whichever of those branches have been pushed and wire the sections up.

Explore first: apps/portal (or wherever the customer portal / project workspace lives), customer-access, projects, messaging, documents/PDFs, photos (shared vs internal), visits/appointments, payments/invoices, notification outbox, reminders/cadence (OWN-DEC-77), "On my way" (field: allowed 3h before).

OWN-DEC-106 Customer project workspace (the customer's central place to manage the work):
- Overview: plain-language status, one clear next action, latest update, confirmed appointment, payment summary.
- Messages: two-way project conversation, permitted attachments, send/upload status, retry without losing drafts.
- Documents: estimate revisions, approved estimate and terms, approval receipt, change orders, invoices, receipts, care notes. Current, approved, expired and superseded versions are clearly distinguished.
- Photos: customer uploads and staff-approved shared before/after photos. Internal photos are INACCESSIBLE, not merely hidden: enforce it on the server for URLs and IDs too, and test direct access to an internal photo.
- Appointments: estimate visits and work visits, date/window, preparation, and Request to Reschedule / Request Cancellation actions (see 107). Requests never erase existing confirmed bookings.
- Payments: approved total, deposit status, recorded payments, credits, remaining balance. Square payments are recorded manually by authorized staff; nothing is marked paid from a customer claim alone (if any customer "I paid" action exists, it only creates a staff task).
- Guests access only their verified project. Account customers switch between their authorized linked projects. Optional registration keeps existing records without duplicates (coordinate with the Step 3 branch).
- Phones: Overview first, simple tab navigation, helpful empty sections, drafts kept when switching tabs. Customer content in English.
- Accessibility: keyboard and screen-reader friendly tabs (ARIA tabs pattern), with an axe check in e2e.

OWN-DEC-107 Appointments:
- The appointment reminder is prepared 24 hours before, with the confirmed date/window, address and approved preparation steps; staff release it. If the appointment is confirmed less than 24 hours ahead, prepare it immediately.
- Before sending, recheck the current appointment: suppress outdated, canceled and duplicate reminders.
- Customer actions are labeled "Request to Reschedule" and "Request Cancellation". After a request: "Request received—awaiting staff confirmation." The existing appointment stays visible until staff confirm the change.
- These requests appear prominently in the staff queue (staff app), where staff can confirm or decline them. No cancellation fee is shown (none configured). Deposit and refund decisions follow owner-approved policy: route them to the owner, never automatic, and invent no refund terms.
- "On my way": the assigned worker can tap it normally from three hours before the visit, and only when actually departing for that customer (an explicit tap by the assigned worker for that visit; never triggered by time alone, and not for a visit assigned to someone else).
- The on-the-way notice sends AUTOMATICALLY (add it to the single automatic-message exceptions list), with the assigned workers' first names and the confirmed arrival window. No invented ETA, no live tracking.
- Notices are blocked for canceled or superseded visits; repeated taps create no duplicates; delivery failures are recorded for staff.

Requirements: PEP authorization; append-only audit for requests, confirmations and on-the-way; EN/ES parity for staff strings; OpenAPI regenerated; no invented facts. Tests:
- integration tests for every bullet: internal-photo inaccessibility, cross-project and cross-customer isolation, the guest single-project scope, the account project switcher, reminder timing including <24h, suppression of stale/canceled/duplicate reminders, reschedule/cancel requests keeping the booking, on-the-way rules (time window, assigned worker only, canceled visit blocked, idempotent taps), no "paid" from a customer claim
- e2e: the workspace tabs on a phone viewport plus a reschedule request

Tag tests with OWN-DEC ids. Commit per logical step, push, and give the final report described in the brief.


## 2026-10-12T19:02:18.616Z (Agent)
You are building the owner's Step 8 and Step 9 decisions (OWN-DEC-108, OWN-DEC-109) in the HandyHub app repository (github.com/Bh3os/handyhub-app): the worker job workflow. First read the common brief: /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/common.md. Follow it exactly, with these overrides:
- Heavy-command locking: wrap ONLY e2e runs in `flock /tmp/hh-heavy.lock`; run everything else unlocked.
- Worktree: `cd /home/user/handyhub-app && git fetch origin main && git worktree add -b feat/journey-step8-field /home/user/hh-s8 origin/main`. Work only in /home/user/hh-s8.
- Migrations: only 1100–1149.
- Progress file: /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/progress-step8.md
- Don't open or merge PRs. Push your branch. Merge origin/main before each step.
- An open PR branch, feat/launch-field-decisions (OWN-DEC-80/82: emergency rules, license module replaced by a job-level Hold/Ready with note), touches the field area. Merge `origin/feat/launch-field-decisions` first, or origin/main if it has already merged. The care-notes agent's branch feat/launch-care-tax (care instructions drafted, PROPOSED until approved) is relevant to the handoff: merge it when it's on origin. feat/journey-step5-estimates builds change-order-adjacent approval rules; reuse the existing change-order code on main.

Explore first: the worker app ("My day", visit lifecycle confirm/arrive/start/complete), the Start Job gate, hazard reports and critical holds (written in the same transaction under the job lock — NEVER weaken, bypass or reorder this), SOP and hazard-template versions (nothing active until competent review; reviewer sign-offs), field photos (R2, before/after, the owner-approved upload-failure exception for locally captured pending photos), offline packet, change orders (in-person approval), quality review / closeout / punch items, walkthrough, timestamps, care notes, the satisfaction-check cadence (+2 days, staff released).

SOP CONTENT RULE (critical): the checklist steps come ONLY from the established SOP documents in the owner's vault: /home/user/Handy-Hub/Standard Of Operations/ (26 files, one per service). Read-only: don't edit the vault. Import them as SOP versions (verbatim steps, mapped onto the six stages below, with the source file and line recorded) in the existing SOP-version store, in review state "pending competent review". Never write new technical procedures and never fill gaps with invented steps. Where an SOP lacks a stage, show "No SOP step recorded for this stage — ask the office". Uncertain or hazardous work (licensed electrical, plumbing, HVAC, gas, structural, asbestos, lead, mold) gets no procedure; it routes to the existing hold/escalation. On private staging, the checklist may run on pending-review SOP versions with a visible "Pending competent review" banner on every step screen. Production use requires the existing reviewer sign-off and activation path; keep that gate intact and test it. Staff content EN/ES uses the current translation policy (OWN-DEC-79 amended: AI translation that passes a separate comparison check is labeled "AI-reviewed", never "human-reviewed"). If the Spanish pipeline exists on main, use it; otherwise leave the Spanish SOP text marked "translation pending" rather than inventing it.

OWN-DEC-108 During work:
- Before starting: show the approved scope, site information, hazards, safety checklist, tools and materials. Start Work stays blocked until the required checks pass and no critical hold remains.
- After the safety checks, the ordered checklist for the job's selected services opens: 1 site preparation and property protection; 2 setup and required measurements/checks; 3 service-specific work steps; 4 quality checks at the appropriate stages; 5 cleanup and waste handling; 6 final checks, completion photos and customer walkthrough.
- Each step shows what to do, the expected result, and any required photo, measurement or note. Workers check off steps; progress is saved (server plus the offline packet) and resumes where they stopped. Required steps can't be silently skipped: skipping requires a reason, is visible to the reviewer, and blocks completion if the step is marked mandatory.
- Changes: workers may DRAFT a change order (scope, price in cents, reason, evidence photos). Authorized staff publish it. The customer approves the exact version through verified project access or a customer-specific in-person approval flow, where the customer is identified (e.g. a one-time code to their verified contact, or staff-verified identity recorded). A signature alone never substitutes for identifying the authorized customer.
- Changed work waits for approval; unaffected, safe, approved work may continue (the checklist marks change-dependent steps blocked).
- A critical hazard stops the affected work, creates a hold (same transaction, existing mechanism), and triggers the existing escalation. The customer sees only "Work is paused for safety review." Resuming requires a documented resolution, updated instructions and renewed safety checks (the gate must pass again).

OWN-DEC-109 Worker sequence:
1 Arrived: arrival timestamp.
2 Safety checks: site conditions, hazards, PPE, tools, materials; unresolved critical holds block work.
3 Before photos: work areas and existing damage, labeled by area/task. Only the previously owner-approved upload-failure exception lets locally captured photos stay pending.
4 Start Work: after the required checks and before-photo requirements pass, the job-specific checklist unlocks.
5 Perform the work: ordered SOP steps; each completed step is saved with its required evidence.
6 After photos: the same areas, paired with the before photos where possible.
7 Walkthrough: "Everything looks good", "Accepted with follow-up items", "I have a concern", or "Customer unavailable"; capture comments and the identity of the customer or authorized representative. Absence or silence is never acceptance.
8 Finished: finish timestamp; the job goes to "Awaiting quality review", never automatically complete.
9 Owner quality review: scope, checklist, before/after evidence, walkthrough. Problems become assigned punch items with due dates; unresolved items keep the job open until corrected and rechecked.
10 Customer handoff: share selected before/after photos and approved, job-specific care notes in the project workspace. Prepare the satisfaction-check draft two days after the reviewed completion (staff release it); suppress it while a concern is unresolved.
- Original photos and checklist history are kept (append-only). Sharing with the customer does NOT grant marketing permission (marketing use needs the separate permission).

Requirements: PEP authorization (worker only on assigned jobs; owner-only quality approval where the role matrix says so); append-only audit; EN/ES staff strings; OpenAPI regenerated; no invented facts. Tests:
- integration tests for: the gate still blocking (regression: no role, flag or AI bypass); the hold written in the hazard transaction; checklist order and resume; mandatory-step skip blocking completion; change-dependent steps blocked until approval while others continue; a signature alone rejected for in-person approval; the resume path requiring renewed checks; walkthrough outcomes, with silence never accepting; Awaiting quality review; punch items keeping the job open; satisfaction draft timing and suppression; shared photos not granting marketing; SOP import being verbatim, with source references and no invented steps (a test that every imported step's text appears in its vault source file — copy the needed SOP files as test fixtures only if the vault path isn't available in CI; prefer importing at build into a versioned seed file inside the app repo with source line references)
- e2e: a worker on a phone viewport goes arrive → safety → before photo → start → check steps → after photo → walkthrough → finished → owner review

Tag tests with OWN-DEC ids. Commit per logical step, push, and give the final report described in the brief.


## 2026-10-12T19:10:04.325Z (SendMessage)
Addition to OWN-DEC-102/103 (from the owner's invoice decision, OWN-DEC-110): new projects use the payment term "Payment due on receipt" (balance due when the invoice is issued after the owner quality review). This must be DISCLOSED to the customer on the estimate before approval (written and uploaded estimates both), and the payment-terms text and version shown are recorded with the approval. Existing customers keep payment terms already agreed with them: store the payment term per customer/project as data, defaulting to "due on receipt" for new projects, and don't overwrite an existing agreed term. A separate agent builds invoices and payments (feat/journey-step10-invoices) and reads this term from your data, so keep it in a clear field/table and note its location in your progress file.


## 2026-10-12T19:10:30.333Z (Agent)
You are building the owner's Step 10 and Step 11 decisions (OWN-DEC-110..113) in the HandyHub app repository (github.com/Bh3os/handyhub-app): invoices, payments, unpaid follow-up, and after-completion. First read the common brief: /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/common.md. Follow it exactly, with these overrides:
- Heavy-command locking: wrap ONLY e2e runs in `flock /tmp/hh-heavy.lock`; run everything else unlocked.
- Worktree: `cd /home/user/handyhub-app && git fetch origin main && git worktree add -b feat/journey-step10-invoices /home/user/hh-s10 origin/main`. Work only in /home/user/hh-s10.
- Migrations: only 1150–1199.
- Progress file: /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/progress-step10.md
- Don't open or merge PRs. Push your branch. Merge origin/main before each step.
- Parallel agents. Merge their pushed branches when you need their pieces (`git fetch origin <b> && git merge origin/<b>`):
  - feat/journey-step5-estimates: written and uploaded estimates, approval, the deposit (20% over $1,000, credited to the invoice), and the payment term "due on receipt" stored per project, disclosed before approval.
  - feat/journey-step8-field: completion and the owner quality review ("Awaiting quality review" → reviewed).
  - feat/journey-step6-workspace: the customer workspace Payments/Documents tabs.
  - feat/site-step1-owner-edits: the single automatic-message exceptions list, contact verification, guest links.
  - feat/launch-care-tax (no tax line, half-up rounding per line).
  Build on main's existing invoices/payments (PR #50 era), deposit policy, notification outbox, reminders/cadence, retention/records lifecycle, the data export/deletion code, complaints/disputes, consent and marketing permission, and the satisfaction check.

OWN-DEC-110 Invoice:
- The invoice draft is prepared automatically from the approved estimate lines, approved change orders and recorded deposit credits. After the required owner quality review, staff can issue it immediately, even while the team is still onsite (issuing is blocked before the review passes).
- Issuing sends the "Your HandyHub invoice is ready" notice AUTOMATICALLY (add it to the single automatic-message exceptions list; no amounts in email or text) and makes the invoice available in Documents and Payments. The balance shows clearly in the verified project workspace.
- New projects: "Payment due on receipt" (disclosed before approval by the step 5 branch). Existing customers' agreed payment terms are kept: read the per-project term. Invent no late fees.
- "Pay by Card" opens the invoice-specific Square payment link that staff enter on the invoice (a URL field, validated as https and a Square domain). No Square API integration. Clear instructions for each other activated payment method (methods activated via policy data; invent no account handles: show NOT CONFIGURED instructions until the owner enters them).
- Staff controls record verified onsite payments and send the receipt immediately. Pending checks never appear cleared.
- Payment reminders stop when the balance is paid.
- A simple Business details form (owner/admin) for the invoice issuer's actual name and address, entered once and versioned. Real invoices require them (issuing is blocked while NOT CONFIGURED). Private staging uses clearly labeled TEST details and sandbox payments only.
- No duplicate invoices per job (unless a deliberate, audited credit/rebill path exists), no duplicate notices, and no double-crediting of the deposit (unique constraints plus idempotency; concurrency test).

OWN-DEC-111 Payments:
- Balance due on receipt of the invoice after the quality review; existing agreed terms honored.
- Methods: card through the invoice-specific Square link; in-person card or digital wallet via Square Tap to Pay on the worker's phone (recorded as a method; no integration); cash, check, Zelle, Cash App or Chime where activated. No card surcharge.
- Authorized staff verify and record each payment manually: invoice, method, amount (cents), date, collector, transaction reference where applicable. A customer claim or a payment-link redirect alone never marks anything paid.
- Checks stay pending until cleared. Partial payments show the confirmed amount paid, any pending payment, and the remaining balance. No duplicate entries (same reference/method idempotency) and no double-crediting.
- When confirmed payments plus approved credits reduce the balance to $0.00, mark the invoice Paid and send the receipt AUTOMATICALLY (add it to the exceptions list). Don't wait for Square's bank payout.
- Workers recording onsite payments: the PEP decides; if the role matrix lacks it, record a PROPOSED choice and keep owner/admin/office recording.

OWN-DEC-112 Unpaid balance (replaces the 3/7-day proposal):
- First reminder draft 24 hours after the invoice is issued, final reminder after 3 days. Staff release them during contact hours 8 AM–10 PM (configurable, business time zone; queue anything released outside hours; reuse the step 4 contact-hours mechanism if it's on main or origin/feat/journey-step4-questions).
- Before release, refresh the balance and recorded payments. Stop reminders when paid. If a payment is pending verification or a billing dispute is open, flag it for staff review instead of sending a routine demand.
- Partial-payment reminders show only the current remaining balance, through secure project access (no amounts in the email/text body).
- After the final reminder is ACTUALLY sent, the invoice moves to "Overdue—owner decision". A failed delivery is a separate staff issue, never customer non-response.
- No late fees or interest. Never send to collections, charge a saved card, or write off a balance automatically.

OWN-DEC-113 Afterwards:
- Repeat-service reminders only on a customer-agreed schedule; staff release them; customers can change or stop them from the workspace.
- "Request This Service Again" reuses authorized property details while asking the customer to confirm they're still current; it creates a new request linked to the customer/property. New pricing and appointments need review.
- Review requests stay staff-released. Same eligibility rules regardless of the satisfaction score: no incentives, no pressure, no positive-review filtering (remove any existing logic that gates review requests on a positive score, and test that it's gone). Paused during an active complaint; reconsidered after resolution regardless of outcome.
- Respect channel permissions, separate marketing consent and opt-outs before any send.
- Customers can download their retained, customer-visible documents through verified access and can request a data export or deletion.
- Deletion is shown as a request for OWNER review, with identity confirmation and checks for required retention, relevant holds and linked evidence. Explain what will be deleted or retained and why (use the retention schedule data; invent no periods: NOT CONFIGURED where unset). Account closure (login access) is separate from keeping necessary financial or dispute records. An unpaid balance never automatically prevents closing login access.
- Record actions and notify the customer of the outcome (outcome notices are staff-released drafts unless the exceptions list says otherwise).

Requirements: PEP authorization; append-only audit; integer cents; EN/ES staff strings, English customer documents; OpenAPI regenerated; no invented facts. Tests:
- integration tests for every bullet: issue blocked before the quality review and without business details; automatic invoice and receipt notices with no duplicates; the deposit credited exactly once under concurrency; Square link validation; a redirect or claim never marking paid; check pending until cleared; partial balances; Paid at $0.00 and the automatic receipt; reminder timing (24h/3d) with refresh, stop-on-paid, flagged pending/dispute, contact-hours queue, Overdue only after an actual send, failed delivery separate; no fees, collections or auto charge; repeat schedule change/stop; review eligibility not gated on score and paused during a complaint; deletion request checks; login closure despite an unpaid balance
- e2e: staff issue an invoice, the customer sees the balance and Pay by Card link, staff record the payment, Paid and the receipt show

Tag tests with OWN-DEC ids. Commit per logical step, push, and give the final report described in the brief.


## 2026-10-12T19:16:35.812Z (Agent)
You are implementing the owner's decision OWN-DEC-114 in the HandyHub app repository (github.com/Bh3os/handyhub-app): replace ZITADEL staff sign-in with a direct email-and-password login on the staff website. First read the common brief: /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/common.md. Follow it exactly, with these overrides:
- Heavy-command locking: wrap ONLY e2e runs in `flock /tmp/hh-heavy.lock`; run everything else unlocked.
- Worktree: `cd /home/user/handyhub-app && git fetch origin main && git worktree add -b feat/staff-direct-login /home/user/hh-auth origin/main`. Work only in /home/user/hh-auth.
- Migrations: only 1200–1249.
- Progress file: /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/progress-auth.md
- Don't open or merge PRs. Push your branch. Merge origin/main before each step.
- Apply the security skills: read /home/user/Handy-Hub/Skills/Website, software, and cybersecurity/ (the swe-* skills on auth/security) and the vault's AI Development Plans/12 (security) and 27 (roles) for context. Don't edit the vault.

Owner decision (implement all):
- The owner creates or invites staff accounts and assigns roles: Owner, Office/Dispatcher, Estimator, Worker (map onto the existing role model; keep the existing PEP and role matrix). No public staff registration.
- Employees set their own passwords via the invite link and sign in directly on the staff website, without a ZITADEL redirect.
- "Forgot password?" sends a short-lived, single-use reset link to the registered email (the reset/invite emails send automatically: add them to the automatic-message exceptions list if it exists on main or origin/feat/site-step1-owner-edits; otherwise use the outbox path that codes/links use). The response never reveals whether an email exists. After a reset, revoke all existing sessions and require sign-in again.
- Use a maintained authentication library or primitives. Passwords hashed with argon2id (e.g. @node-rs/argon2) or an equivalent maintained library. Choose a password policy per NIST 800-63B (length-based, breached-password check optional and offline only; no external calls). Login and reset are rate limited (reuse the existing rate limiter), with safe generic error messages, constant-time comparison, and session fixation protection (new session ID on login). Cookies: HttpOnly, Secure, SameSite=Lax/Strict, CSRF protection consistent with the existing app. The owner can never view passwords.
- MFA is NOT required by default. Support OPTIONAL MFA (TOTP authenticator; passkeys if a maintained library makes it simple), recommended for privileged accounts. Show a recommendation banner to Owner/Office accounts without MFA. Keep any existing step-up checks for sensitive actions only if they don't depend on ZITADEL; otherwise re-implement them as password re-entry, or as TOTP when enrolled.
- Sessions end after a configured inactivity period (policy/config value; use the existing configured value if there is one). Sign Out is available.
- The owner can disable an account immediately, revoke all its sessions, and start password recovery, while the work history is kept.
- Migration: keep existing staff IDs, roles, assignments and audit records. Existing staff rows keep their IDs; they get "password not set" and must use an owner-sent invite/reset link. Remove the ZITADEL login code paths, config and env requirements (ZITADEL_* vars become unused: remove them from config validation, render.yaml and docs, and list them in the progress file so the owner can delete them in Render). Keep the factor-reset route semantics (T4's plural route revokes sessions) adapted to the new MFA.
- Bootstrap: the very first Owner account on a fresh deployment must be creatable without secrets in chat or files. Design a safe bootstrap, for example a one-time CLI/ops command run from the Render shell that creates the owner account and prints a single-use, short-lived set-password link; or an OWNER_BOOTSTRAP_EMAIL env var the owner sets in Render, which sends a one-time invite only while no Owner exists. Document the exact owner steps in the progress file. Never log secrets or tokens (the secret-hygiene test must still pass).
- The staging access gate (ACCESS_GATE_USERS) stays separate from staff login and unchanged.
- Customer sign-in (passwordless codes) is unaffected.

Tests:
- unit and integration: invite → set password → login; wrong password with a generic error; rate limiting; reset single-use and expiry; reset revoking sessions; disabled account blocked immediately, sessions revoked; inactivity expiry; Sign Out; optional TOTP enrol/verify/disable plus owner reset; role permissions still enforced server-side for each role (sample critical routes); no public registration route; password hashes never returned by any API; audit entries for login, failed login, reset, disable, role change; the migration keeping IDs
- e2e: replace any ZITADEL-based e2e login helper with the direct login, and add a forgot-password flow e2e using the test email sink

Update docs (README/ops docs) for the new login. Tag tests with OWN-DEC-114. Commit per logical step, push, and give the final report described in the brief, including the owner's Render steps (variables to remove and bootstrap steps).


## 2026-10-12T19:16:59.401Z (Agent)
You are building the owner's staff-journey decisions OWN-DEC-115..117 in the HandyHub app repository (github.com/Bh3os/handyhub-app): the staff action queue, new-request handling, and customer/property records. You also close the related real gaps ID-01 (association at submission), ID-11 (old-address notice) and CRM-04 (wrong-customer link correction); see the guide /home/user/hh-journey/docs/two-websites/functionality-guide-v1.0.md and docs/two-websites/limitations.json in the repo. First read the common brief: /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/common.md. Follow it exactly, with these overrides:
- Heavy-command locking: wrap ONLY e2e runs in `flock /tmp/hh-heavy.lock`; run everything else unlocked.
- Worktree: `cd /home/user/handyhub-app && git fetch origin main && git worktree add -b feat/staff-queue-requests-records /home/user/hh-s1q origin/main`. Work only in /home/user/hh-s1q.
- Migrations: only 1250–1299.
- Progress file: /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/progress-staffq.md
- Don't open or merge PRs. Push your branch. Merge origin/main before each step.
- Parallel branches whose items feed your queue (merge them when pushed, `git fetch origin <b> && git merge origin/<b>`, and add their item types to the queue):
  - feat/site-step1-owner-edits: receipt, contact verification, project auto-created, delivery issues.
  - feat/journey-step4-questions: questions/replies, visit windows, Not a fit, reminder drafts, contact hours.
  - feat/journey-step5-estimates: approvals, deposits/checks, waivers.
  - feat/journey-step6-workspace: reschedule/cancel requests.
  - feat/journey-step8-field: holds, quality reviews, punch items.
  - feat/journey-step10-invoices: overdue invoices, payment verification, deletion requests.
  - feat/staff-direct-login: the auth change.
  Make the queue an extensible registry (each module contributes item providers) so those branches plug in with little conflict. Build on main's existing ops home/queues (3.3a), exceptions/background jobs (a single merged screen), CRM, intake and customer-access code; don't duplicate.

OWN-DEC-115 Staff home action queue (role-based):
- Ordering: safety issues first, then today's appointment changes, then overdue customer responses and other time-sensitive actions, then the remaining tasks by due time.
- Item types: new requests, unverified contacts, customer replies, message drafts awaiting release, reschedule/cancel requests, deposits and checks to verify, delivery failures, safety holds, quality reviews, overdue invoices (plus anything the parallel branches add).
- Each item shows the project/customer reference, reason, assigned staff member, age or due time, and one clear action button. Filters by task type and assignee.
- The 1-hour response target counts only during 8 AM–10 PM in the configured business time zone (configurable policy). Show remaining time or overdue status; pause outside those hours. It's an internal target, labeled so, never a customer promise.
- Workers see My Day: assigned visits, address/access details, preparation, job readiness, the next workflow action (reuse the existing My Day).
- Owners also see Owner Decisions: deposit waivers, administrative exceptions, refunds, deletion requests, unresolved overdue balances.
- No duplicate entries (idempotent providers keyed by subject). Items update or disappear when resolved. Auto-refresh without interrupting open forms (no remount, preserve focus and input; e.g. a polling/SSE badge "N new items — refresh" or in-place list diffing outside the edited item).
- Server-side role enforcement; sensitive incident and financial details stay restricted to permitted roles.

OWN-DEC-116 New request handling:
- Show the original request: selected services, answers, description, full address, timing preferences, photos and upload status, coverage result, and separate email/phone verification badges.
- Possible duplicate customers/properties show to authorized staff only, labeled as suggestions, never proof of identity.
- Staff link verified matching records or create new ones. The original request/project and its history are kept. Never auto-merge, and never grant access to earlier projects through linking alone.
- Exactly one responsible staff member; reassignments recorded.
- Actions: Ask a Question, Prepare Online Estimate, Arrange Estimate Visit, Not a Fit (wire to the step 4/5 features when merged; otherwise route to the existing equivalents). Internal notes are separate from customer-visible messages.
- The 1-hour response clock stops ONLY when a meaningful staff response is successfully sent, or a completed customer conversation is recorded (e.g. a logged phone call with an outcome). Opening, assigning, drafting or the automatic receipt never stop it. A failed response delivery stays an action item.
- Show the next step, responsible person and follow-up due time. Decisions, messages, links and timestamps are kept in project history.

OWN-DEC-117 Customer and property records:
- Customer: contact details, separate email/phone verification, channel permissions, marketing permission, authorized properties, projects, documents, payments, activity history. Customer-facing content in English; staff UI EN/ES.
- Property: full address, access instructions, pets, parking, and when changeable details were last confirmed. Access codes are stored separately protected (restricted field/table, role-limited, audited reads) and are never included in ordinary messages or exports to non-permitted roles.
- Office staff may propose or perform permitted duplicate merges and correct mistaken request links, with a required reason and an audit record.
- Before a merge, show both records and the affected projects, documents and payments. Never auto-merge by matching email, phone, name or address.
- Original IDs, history, approvals and financial evidence are kept (merge = link with a survivor, never destructive). The owner can reverse a record-link change without erasing later legitimate activity.
- Customer access is rechecked on merge or relink. A mistaken link never exposes another customer's history; correcting it revokes the affected access (sessions, guest links, account links). This is CRM-04.
- Role-authorized records and timeline events only; internal notes and restricted incidents stay private.
- ID-01: associate a submission with an existing customer only through verified identity and explicit staff linking, per the guide. ID-11: when a property address changes, keep the old address on historic records and show the old-address notice per the guide.

Tests:
- integration tests for every bullet: queue ordering, dedupe and resolution; 1-hour clock business-hours math, including the pause and the stop rules (receipt/assign/draft not stopping it; a successful send stopping it; a failed send not stopping it); role restrictions; duplicate suggestions staff-only and never auto-merged; linking not granting access; merge preview; merge keeping IDs and financial evidence; owner reversal; access revocation on correction (cross-customer leak tests); access-code protection; old-address notice
- e2e: a new request goes from the queue → link customer → assign → Ask a Question, and the queue item updates; plus a merge preview

Tag tests with OWN-DEC and HH ids. Commit per logical step, push, and give the final report described in the brief.


## 2026-10-12T19:32:02.052Z (SendMessage)
Addition: OWN-DEC-118, who publishes estimates. Estimators and the Owner may write or upload estimates and publish them directly; no Owner approval per estimate. Before publishing, validate the scope, prices, total, options, exclusions, terms, 14-day validity and the applicable deposit, and require uploaded documents to match the structured amounts (already in your scope). The Owner can view all estimates, change publishing permissions (a policy setting: which roles may publish; default Estimator + Owner), and revise estimates through a new version. Never silently edit a published or accepted estimate. Deposit waivers, refunds and other owner-only decisions stay Owner-only. Log who created, revised and published each version (audit plus fields shown in the version history). Tests: an Estimator publishes; a role without permission is refused; the Owner removes the Estimator's publish permission and the refusal follows; editing a published version creates a new version; the version history shows the creator/reviser/publisher.


## 2026-10-12T19:32:10.208Z (SendMessage)
Phase 2 for you, after OWN-DEC-98..101 are done and pushed: OWN-DEC-119, the staff scheduling board. You own the window/reservation engine, so keep ONE reservation mechanism for estimate visits and work visits. The step 5 branch (feat/journey-step5-estimates) will reuse yours for work visits; merge it if pushed and unify.
- Day and week views by worker, plus a simple mobile list. Estimate visits are visually distinct from work visits.
- Show arrival windows, expected work duration, travel/setup buffers, assigned workers and capacity. Travel estimates are staff-entered; never invent precise travel times (no external maps API).
- Reserve every worker a visit needs: a two-person job occupies both.
- Prevent overlapping bookings on the server, including simultaneous confirmations by different staff (DB-level exclusion constraint or row locks; concurrency test). Recheck capacity when customers select proposed windows.
- The required-deposit gate applies to WORK visits only, never to free estimate visits. A verified (cleared) deposit or a recorded Owner waiver satisfies it.
- Block confirmation for unresolved critical safety holds and explicit BLOCKING readiness holds only (the job-level Hold/Ready from OWN-DEC-82). Ordinary notes and non-blocking warnings never prevent scheduling.
- Reschedule/reassign only after validating the new resources. Keep the previous booking history and record the actor and reason.
- Notify customers AUTOMATICALLY after a change is committed, not merely requested (add the "appointment changed" notice to the single automatic exceptions list). Notify affected workers and refresh their job packets and access (revoke the old worker's access to that visit's packet and access codes).
- If a proposed change fails, the current appointment stays intact. Delivery failures are exposed, with no duplicate reservations or notices.
- Forms/buttons as alternatives to dragging (accessible).
Use migrations within your range 0950–0999. Tests: two-person reservation; the concurrent double-booking race; deposit gate on work visits only; holds blocking vs non-blocking notes; reschedule history; notify-after-commit only; failed change keeping the booking; worker packet access revoked on reassignment. Add an e2e for the board on desktop plus the mobile list. Commit with OWN-DEC-119 and push.


## 2026-10-12T19:32:17.703Z (SendMessage)
Phase 2 for you, after OWN-DEC-108/109 are done and pushed: OWN-DEC-121, the worker's My Day and offline use (extend the existing worker packet/offline code; stay within your migration range 1100–1149):
- My Day: today's assigned visits in order, with arrival window, address, directions (a plain link out to a maps app using the address; no maps API), access notes, preparation, readiness and a clear next action.
- Each assigned job packet downloads while online. Show its last update, and "Ready for offline use" only after the required content is actually saved on the device (verify the stored content, not just the request).
- Offline support: checklists, notes, before/after photos, Arrived/Finished timestamps. Unfinished work survives closing the app (IndexedDB).
- Per item, show clearly "Saved on this phone" / "Pending upload" / "Synced". Sync retries automatically with no duplicate records or photos (client-generated idempotency keys). Conflicting changes are flagged for review, never silently overwritten.
- The sequence is enforced offline too: safety checks → before photos → operation checklist → after photos → walkthrough → submit for quality review. Pending uploads stay visibly incomplete; quality review can't be submitted as complete while required evidence is pending.
- Starting requires an ONLINE readiness check (gate) before Start Work. Offline use can never bypass safety holds or approve additional work (no offline change-order approval).
- Access codes show only to the assigned worker, on the visit date, after an online permission check. They're never in offline downloads, and the displayed copy is removed after the visit (and on reassignment).
- Warn before signing out or clearing data while unsynced work remains. Schedule changes and reassignments show when connectivity returns, and a reassigned visit's packet is removed from the old worker's phone.
Tests (unit/integration, plus e2e with Playwright offline emulation): offline checklist/photo capture and reopening the app; upload failure and retry without duplicates; sync conflict flagged; start blocked offline; no offline approval; access codes absent from the packet, visible online on the visit date to the assigned worker only; reassignment removing the packet; sign-out warning. Commit with OWN-DEC-121 and push.


## 2026-10-12T19:32:35.086Z (Agent)
You are building the owner's decision OWN-DEC-120 in the HandyHub app repository (github.com/Bh3os/handyhub-app): a unified staff messages inbox with REAL inbound email and text. This also closes the real gap COM-01 (inbound texts and emails into the project); see the guide /home/user/hh-journey/docs/two-websites/functionality-guide-v1.0.md and docs/two-websites/limitations.json. First read the common brief: /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/common.md. Follow it exactly, with these overrides:
- Heavy-command locking: wrap ONLY e2e runs in `flock /tmp/hh-heavy.lock`; run everything else unlocked.
- Worktree: `cd /home/user/handyhub-app && git fetch origin main && git worktree add -b feat/staff-unified-inbox /home/user/hh-inbox origin/main`. Work only in /home/user/hh-inbox.
- Migrations: only 1300–1349.
- Progress file: /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/progress-inbox.md
- Don't open or merge PRs. Push your branch. Merge origin/main before each step. Merge origin/feat/staff-queue-requests-records when it's pushed, and contribute an inbox item provider ("Needs Linking", "customer replied", "delivery failed") to its queue registry.

Explore first: messaging (v2), the notification outbox, Telnyx texts (outbound, PR #51), Resend email (outbound), the customer workspace messages, customer-access, attachments/uploads, and the PEP.

Owner decision OWN-DEC-120:
- One inbox for project messages and supported inbound/outbound email and texts, each linked to the correct customer and project.
- Matching uses reliable conversation references and contact records, never names alone:
  - email: a per-project reply-to address token (plus-addressing or a unique reply token), or In-Reply-To/References headers matching sent message IDs, then a verified contact email
  - text: the verified phone number plus the latest open conversation
  If several projects could match, the message goes to "Needs Linking" for staff review.
- Unmatched messages are private to authorized office staff. Linking corrections are recorded; the original message is kept immutable.
- Staff reply from the project. Pressing Send is the release action; no second approval.
- Use the customer's preferred permitted channel. If it's unavailable (no permission, unverified, or opted out), show another permitted option; never switch channels silently.
- Show queued, sent, delivered (where the provider supports it, via status webhooks) and failed states. Reply drafts are kept; retries never send duplicates (idempotency key).
- Internal notes are separate from customer messages. Attachments are validated (type/size), and project-access permissions apply to them.
- REAL inbound integrations are required:
  - Telnyx inbound SMS webhook with signature verification (Telnyx public-key ed25519)
  - Resend inbound email webhook (or Resend's inbound route, with svix signature verification), if Resend supports inbound in the version used; otherwise implement a generic inbound-email webhook adapter with HMAC verification, documented for the owner
  Webhook secrets/public keys come from env vars the OWNER sets in Render (never in chat or files): add them to config as optional. While they're unset, the inbox shows each channel as "Inbound not configured" and NEVER pretends messages were received. Webhook endpoints: rate limited, replay-protected (timestamp tolerance + dedupe on provider message ID), size limited.
- STOP/opt-out keywords on inbound SMS update channel permissions (respect consent rules already on main).
- Unsupported channels are flagged clearly.

Tests: email matching by reply token and by headers; SMS matching; ambiguous → Needs Linking; unmatched private to office (other roles refused); linking correction audited with the original kept; reply via the preferred channel; unavailable channel → alternative shown, never silently switched; delivery status states; duplicate-send prevention; drafts kept; attachments validated and permission-checked; webhook signature verification failure rejected; replay rejected; "Inbound not configured" when secrets are unset; STOP handling. Use synthetic payloads only, and build secret-looking test values with ['a','b'].join('-'). Add an e2e: a simulated signed inbound text lands in the project and staff reply.

In the final report, list the exact env var names and the provider-side webhook URLs the owner must configure in Render and in the Telnyx/Resend dashboards. Tag tests with OWN-DEC-120 and HH-COM-01. Commit per logical step and push.


## 2026-10-12T19:44:58.912Z (SendMessage)
New owner directive (OWN-DEC-122), which applies to your work now: decided values go in as ACTIVE configuration, with no NOT CONFIGURED state and no Activate step blocking workflows. Read /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/directive-no-activation.md and apply it to everything you build. Where your code currently waits on an activation or NOT CONFIGURED for a decided value, change it to the decided value (cite the OWN-DEC id). Genuinely missing facts stay out (never invented): use a labeled TEST value on staging and a narrow "missing" state only on the output that needs it. Safety, access and approval protections stay unchanged.


## 2026-10-12T19:45:23.220Z (SendMessage)
Addition to your scope: OWN-DEC-123, staff management and audit. Also read the owner directive /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/directive-no-activation.md (decided values active, no activation steps).
- The Owner creates or invites staff accounts, assigns roles, sets working days/hours, and disables accounts. Email + password with reset; no ZITADEL (already your task).
- Worker availability (working days/hours, time off) feeds scheduling capacity and prevents double-booking (expose it through the existing capacity code; another agent builds the board). Availability changes FLAG affected appointments for review; they never silently cancel them.
- Disabling an account immediately blocks access and revokes sessions, keeps the employee's job history, and flags their upcoming assignments for reassignment (a queue item if the queue registry exists on origin/feat/staff-queue-requests-records; otherwise a list on the staff page).
- Important actions are recorded automatically: sign-ins, approvals, payment entries and corrections, customer merges, role changes, safety events. Each records who, when, the affected record and the relevant changes (diff). Verify existing modules emit these; add missing emits for sign-in and role changes.
- Audit entries can't be edited through the app; corrections create new entries. Passwords, tokens, access codes and sensitive message contents never appear in logs or audit diffs (redaction + test).
- The Owner sees the full audit log. Office staff see their own audit actions, while keeping the operational history their role needs (the timeline on records they can access).
- Apply the agreed retention rules (OWN-DEC-70 schedule) to audit records, not keep-forever. Use the existing retention engine/review queue; deletion stays reviewed per OWN-DEC-70.
Use your migration range 1200–1249. Tests: invite/roles/hours; availability flagging without cancelling; disable revoking and flagging assignments; audit immutability via the API; redaction; owner vs office audit visibility; retention applied. Commit with OWN-DEC-123.


## 2026-10-12T19:46:08.874Z (Agent)
You are building the owner's decisions OWN-DEC-124 (complaints, damage and injury cases) and OWN-DEC-125 (the Owner Dashboard) in the HandyHub app repository (github.com/Bh3os/handyhub-app). You also close the real gap PRIV-03 (an automatic complaint check before deletion); see the guide /home/user/hh-journey/docs/two-websites/functionality-guide-v1.0.md and docs/two-websites/limitations.json. First read the common brief: /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/common.md and the owner directive /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/directive-no-activation.md (decided values are active; no extra setup or activation step). Overrides to the brief:
- Heavy-command locking: wrap ONLY e2e runs in `flock /tmp/hh-heavy.lock`; run everything else unlocked.
- Worktree: `cd /home/user/handyhub-app && git fetch origin main && git worktree add -b feat/cases-owner-dashboard /home/user/hh-cases origin/main`. Work only in /home/user/hh-cases.
- Migrations: only 1350–1399.
- Progress file: /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/progress-cases.md
- Don't open or merge PRs. Push your branch. Merge origin/main before each step.
- Parallel branches (merge them when pushed: `git fetch origin <b> && git merge origin/<b>`):
  - feat/journey-step8-field: walkthrough concerns, punch items, quality review, incidents/hazards.
  - feat/journey-step10-invoices: invoices, payments, deletion requests, review pauses.
  - feat/journey-step5-estimates: estimates, revisions, approvals.
  - feat/staff-queue-requests-records: the queue registry (add a "cases" provider) and the 1-hour response clock (first meaningful staff response).
  - feat/journey-step4-questions.
  Build on main's existing complaints/disputes/incidents/changes-incidents-returns, records lifecycle/retention, satisfaction checks and reporting code. For metrics, prefer reading from recorded tables; when a parallel branch's table isn't merged yet, implement that metric behind a clearly "unavailable" state, then wire it up once you merge the branch.

OWN-DEC-124 Cases:
- Complaints from walkthroughs, messages or calls are recorded as a case linked to the project, with severity, assigned person, due date, notes and supporting photos. Avoid duplicate cases for the same issue (offer "add to existing case" when an open case exists for the project and the same category).
- The Owner is notified promptly about damage, injury or disputes (a queue item plus a staff notification). The Owner handles any insurer, attorney or other professional referral (record the referral as an owner action). The system never decides fault, admits liability or promises compensation: no such text in any template, and customer-facing acknowledgements use neutral wording (no invented legal phrasing; use plain acknowledgement, progress and next-step text).
- Workers can report an incident quickly from the job. Safety issues trigger the agreed stop-work process (the existing hazard/critical-hold path, same transaction). Ordinary complaints don't automatically stop unrelated work.
- Sensitive incident details are restricted to authorized staff (PEP). Customers see an appropriate acknowledgement, progress updates and the next step.
- Review invitations and satisfaction checks pause for the affected project until the case is resolved.
- Records relevant to the case are kept (a legal-hold-like flag on linked records). Not every deletion request is blocked: unrelated eligible data is deleted and the customer is told which records must remain and why (this is PRIV-03: an automatic complaint/case check before deletion).
- Corrective work is tracked through assigned follow-up items. Closing a case requires a recorded resolution and any necessary re-check; its history is kept.

OWN-DEC-125 Owner Dashboard (professional, clear, in the existing staff design system):
- Overview: new requests, estimates awaiting approval, scheduled jobs, jobs awaiting quality review, overdue invoices, open cases, each linking to its action.
- Customer response: requests received, time to first meaningful staff response, and the percentage answered within the 1-hour target, measured only during business hours (8 AM–10 PM, America/Kentucky/Louisville).
- Estimates: sent, approved, declined, expired, awaiting response. Revisions count under the same estimate (no inflated totals).
- Job quality: completed jobs, review pass rates, outstanding punch items, return visits.
- Payments: invoices issued; confirmed payments by method (including Square link and Tap to Pay); pending checks; refunds; credits; outstanding balances; overdue balances shown separately.
- Cases: open complaints, damage/injury reports, assigned staff, overdue follow-ups; sensitive details restricted.
- Date filters, comparison with the previous period, and a last-updated time. Every figure opens its supporting records (a drill-down list).
- Recorded data only. Invoiced amounts are clearly distinct from money received; deposits are never counted twice. Missing data shows as "unavailable", not zero.
- CSV export of the filtered reports with clear column names and totals that match the dashboard (test that CSV totals equal the dashboard figures). CSV injection-safe (prefix cells starting with = + - @).
- Owner-only (or as the role matrix says), ready to use with no configuration step. Integer cents throughout.

Tests:
- integration: case creation from all three sources; duplicate prevention; owner notification; no fault/compensation language (a template scan test); the worker incident triggering the hold path; restricted details; review/satisfaction pause; deletion partial with explanation (PRIV-03); closure requiring a resolution and re-check
- dashboard calculations against a synthetic dataset with known answers: business-hours response math, revisions not double-counted, deposits not double-counted, invoiced vs received, unavailable vs zero, previous-period comparison, drill-down consistency, CSV totals equal to the dashboard
- e2e: the owner opens the dashboard, filters, drills into a figure and exports CSV

Tag tests with OWN-DEC ids and HH-PRIV-03. Commit per logical step, push, and give the final report described in the brief.


## 2026-10-12T19:53:38.697Z (SendMessage)
Owner facts (OWN-DEC-126), which apply now:
- The business name on estimates and invoices is "Handyhub LLC" (exactly this spelling). The mailing address is NOT provided: leave it blank (omit the line). Never invent one and never use a customer's address. Real-document issue may need an address: report that as one specific requirement in your progress file, and don't block other features over it.
- Staging documents (invoices, receipts, estimates) carry a clear mark "TEST — not a real invoice or estimate" (watermark/header on the PDFs and in the portal view). The full workflow stays usable on staging.
- Payment instructions are editable placeholders, clearly labeled as placeholders and never presented as usable payment destinations (e.g. a "Placeholder — not a payment destination" badge, no copy button):
  Zelle: [Payment email or phone]
  Cash App: [$Cashtag]
  Chime: [Payment handle or details]
  Checks payable to: [Payee name]
  The Owner edits them later in the business-details form.
- The public phone/email stay placeholders.
Tests: the issuer name shows on documents; the address line is absent when blank; the TEST mark on staging; placeholders labeled and not copyable.


## 2026-10-12T19:53:41.807Z (SendMessage)
Owner facts (OWN-DEC-126/127), which apply now:
- Estimates show the business name "Handyhub LLC" (exact spelling). The mailing address is not provided: omit the line, never invent it.
- Staging estimates and approval receipts are marked "TEST — not a real invoice or estimate", and staging approvals are clearly marked TEST.
- Estimate terms: a separate agent is drafting the complete terms wording from the owner's agreed policies (branch feat/estimate-terms-v1). It seeds the text as a terms version in the existing legal-documents store. Your approval flow must show that terms version in full (readable) on the estimate and approval screens and save the exact terms version ID and hash with every approval. Merge origin/feat/estimate-terms-v1 when it's pushed. Until then, use the existing TEST terms.


## 2026-10-12T19:54:06.142Z (Agent)
You are drafting and implementing the HandyHub estimate terms (owner decision OWN-DEC-127) in the HandyHub app repository (github.com/Bh3os/handyhub-app). The owner's words: "Finalize the estimate terms using my latest instructions and agreed policies. Write the complete wording, implement it in the estimate and approval screens, and save the exact terms version with every approval. Do not add policies I haven't requested or leave the drafting unfinished. Publish the completed flow on private staging so I can review the actual wording and test approval. Keep staging approvals clearly marked TEST. My approval of the final wording for real customer use is the only remaining owner decision for this task."

First read the common brief /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/common.md and the directive /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/directive-no-activation.md. Overrides to the brief:
- Heavy-command locking: wrap ONLY e2e runs in `flock /tmp/hh-heavy.lock`.
- Worktree: `cd /home/user/handyhub-app && git fetch origin main && git worktree add -b feat/estimate-terms-v1 /home/user/hh-terms origin/main`. Work only in /home/user/hh-terms.
- Migrations: only 1450–1469.
- Progress file: /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/progress-terms.md
- Don't open or merge PRs. Push your branch.

SOURCES (the only allowed sources for terms content):
1. Existing drafts. Find the estimate terms drafts (EN+ES v0.2/v0.3) in the owner's vault at /home/user/Handy-Hub (search for "estimate terms", "Service Agreements/", the legal package under AI Development Plans or .orchestrator/work) and in the app repo (legal documents seeds/migrations). Read-only for the vault.
2. The owner's agreed policies, in /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/pending-vault-decisions.md (OWN-DEC-94..126), the vault decision log /home/user/Handy-Hub/AI Development Plans/20-decision-log.md (OWN-DEC entries with status RECORDED/DECISION), and docs/two-websites/owner-resolutions.md in the repo.
3. The existing Service Agreements in the vault, where they state owner policy.

Agreed policies that belong in the terms (verify each against the sources and cite it):
- the estimate is valid 14 days
- each job is priced individually
- no tax line on estimates/invoices
- no minimum charge, no card surcharge
- a 20% deposit on approved totals over $1,000.00, credited toward the final invoice; work scheduling waits for the required deposit or an owner waiver; payment doesn't guarantee a particular date
- payment due on receipt of the invoice after the quality review (new projects)
- accepted payment methods (Square payment link, Square Tap to Pay, cash, check, Zelle, Cash App, Chime)
- scope = the approved estimate version and selected options; exclusions as listed
- changes in scope or price need an approved change order; the original approval is never overwritten
- appointments are confirmed separately
- reschedule/cancellation requests are confirmed by staff, with no cancellation fee configured
- work may pause for safety review; HandyHub doesn't perform licensed gas, electrical, plumbing, HVAC or structural work, or hazardous-material (asbestos, lead, mold) work per the owner's emergency/scope rules
- the customer walkthrough; quality review before completion
- the 30-day reopen of a request
- communications (automatic messages: receipts, codes, access links, notices; other messages staff-released; marketing only with separate consent)
- photos: shared with the customer; no marketing use without separate permission
- privacy/retention by reference to the privacy notice
- the electronic approval record (name, verified contact, timestamp, terms version)
- the business name "Handyhub LLC" (no address; it's not provided)

STRICT RULES:
- Add NO policy the owner hasn't requested or decided: no warranty or guarantee, no limitation of liability, no indemnity, no arbitration or venue, no late fees/interest, no refund or forfeiture terms, no cancellation fees, no damage-claim procedures, no licensing or insurance claims.
- Where an existing draft contains such clauses, leave them OUT of v1.0 and list each removed clause in the progress file and in a short "Owner/attorney review notes" document (docs/legal/estimate-terms-v1-review-notes.md in the repo), naming the reviewer (attorney) per the human-review boundary. Don't present them as decided.
- The wording is plain-language, complete, and numbered by section, with no placeholders except where a fact is genuinely missing (none should be needed).
- English is the customer text. A Spanish staff-reference translation is optional, labeled per the translation policy (AI-reviewed, never human-reviewed); skip it if the pipeline isn't available.

IMPLEMENTATION:
- Add the text as a versioned terms document in the existing legal-documents store (e.g. version "1.0", status "owner review pending"). On staging, set it as the current terms version for estimates and approvals, with a visible "TEST — wording pending owner approval for real customer use" banner on staging approvals. For production, real approvals require the owner's approval of this version. Use the existing legal document sign-off/activation mechanism, recording the owner as approver; don't build a new settings process.
- The estimate screen (staff preview + customer view) and the approval screen show the full terms readably (expandable section plus a link to the full page), and the customer's approval saves the exact terms version ID and a content hash. Coordinate with branch feat/journey-step5-estimates (another agent builds the approval flow there and will merge your branch). Keep your change to the terms content, its seed/migration, the terms display component and a small API to fetch the current terms version, so the merge is easy. If main already records the terms version on approval, ensure the hash is included.
- Also render a terms PDF using the existing PDF/document rendering (used in approval receipts by the step 5 branch).

Tests:
- a test that the terms text contains no forbidden clause terms (warranty, guarantee, liability, indemn, arbitration, venue, late fee, interest, forfeit, refund, cancellation fee); a negative list check
- a test that each stated numeric policy (14 days, 20%, $1,000.00) matches the active policy data
- the approval records the version ID and hash
- the staging banner shows
- an e2e showing the terms on the approval screen

Write the final wording also to docs/legal/estimate-terms-v1.md in the repo, so the owner can read it in GitHub. Commit (OWN-DEC-127), push, and give the final report: sections written, sources per section, clauses removed for attorney review.


## 2026-10-12T20:40:48.272Z (SendMessage)
Owner directive: finish fast, test once at the end. Keep working; don't stop. Build ALL remaining requirements of your task first (including phase 2, OWN-DEC-121), with no full test runs between steps: no build/lint/unit/integration/e2e suites per step, only a quick typecheck of the changed package if you need it. Keep committing and pushing after each logical step (gitleaks staged check). When everything is built, run the complete verification ONCE (build, lint, typecheck, test, integration, e2e), fix the failures, re-run only what failed until green (never skip or weaken a test), push, and report. Details: /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/directive-test-once.md


## 2026-10-12T20:40:53.928Z (SendMessage)
Owner directive: finish fast, test once at the end. Keep working; don't stop. Build ALL remaining requirements of your task first (including OWN-DEC-123), with no full test runs between steps: no build/lint/unit/integration/e2e suites per step, only a quick typecheck of the changed package if you need it. Keep committing and pushing after each logical step (gitleaks staged check). When everything is built, run the complete verification ONCE (build, lint, typecheck, test, integration, e2e), fix the failures, re-run only what failed until green (never skip or weaken a test), push, and report. Details: /tmp/claude-0/-home-user/4a1eacaa-1d5e-55c4-8805-3f4b261b8884/scratchpad/launch/directive-test-once.md
