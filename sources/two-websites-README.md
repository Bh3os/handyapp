# Two websites, one business system: plan and progress

The owner's guide "HandyHub: Customer Website, Staff Website, and Shared Business System" (version 1.0, 2026-10-11) is
the build specification since 2026-10-12 (OWN-DEC-59). This folder holds the guide, the Slice 0 current-state and gap
matrix, and the plan for the remaining slices. Progress is recorded here as each slice merges.

| File                                                       | What it is                                                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [functionality-guide-v1.0.md](functionality-guide-v1.0.md) | The guide as the owner supplied it (210 HH- requirements, T01-T75, slices 0-9)                                     |
| [gap-matrix.md](gap-matrix.md)                             | Slice 0: every requirement with evidence, missing behaviour, modules, test, effort                                 |
| [owner-resolutions.md](owner-resolutions.md)               | The owner's resolutions of the blocked and conflicting requirements (OWN-DEC-64 to 75)                             |
| [gap-audit.json](gap-audit.json)                           | The same data, machine-readable                                                                                    |
| [launch-coverage.md](launch-coverage.md)                   | Launch coverage check: every P0 requirement and OWN-DEC-59..75 with its status, slice or task, and acceptance test |
| [launch-coverage.json](launch-coverage.json)               | The same data, machine-readable                                                                                    |

## Owner decisions that apply

| Decision   | Content                                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| OWN-DEC-31 | No minimum job value anywhere (the guide's HH-BASE-02)                                                      |
| OWN-DEC-59 | The guide is the build specification; built on the existing stack                                           |
| OWN-DEC-60 | Email through Resend; NOT CONFIGURED until the owner's account, domain and key exist                        |
| OWN-DEC-61 | The public request form requires both email and phone                                                       |
| OWN-DEC-62 | Up to 10 photos per request, 15 MiB each, no PDFs                                                           |
| OWN-DEC-63 | Optional customer accounts sign in with a one-time code, no password                                        |
| OWN-DEC-64 | The owner reviews every job (self-review marked); punch-item rules for minor and major problems             |
| OWN-DEC-65 | Staff release each customer email; one-time codes and secure links send immediately                         |
| OWN-DEC-66 | The website facts of 2026-10-05 (deposit timing, discounts, same-day service, hours, free estimates)        |
| OWN-DEC-67 | Square on staff phones instead of Stripe, recorded by hand; no card surcharge; provider unnamed on the site |
| OWN-DEC-68 | Three Start Work administrative exceptions, requested by the worker and approved by the owner               |
| OWN-DEC-69 | Arrival and finish timestamps per worker; owner corrections keep originals; no payroll                      |
| OWN-DEC-70 | Retention schedule per category with an owner deletion-review queue; no automatic deletion                  |
| OWN-DEC-71 | Customer account deletion separate from protected business records                                          |
| OWN-DEC-72 | Complete privacy notice and terms drafted now, marked "Draft - not reviewed by an attorney" on staging      |
| OWN-DEC-73 | Whole staging behind an access gate for the owner and testers (replaces the public part of OWN-DEC-58)      |
| OWN-DEC-74 | AI stays off (Wave 2)                                                                                       |
| OWN-DEC-75 | End-of-job walkthrough record; "customer unavailable" is never acceptance                                   |

Details and the owner's wording: [owner-resolutions.md](owner-resolutions.md).

## Slice 0 result (2026-10-12)

Method: eight auditors read the code against the guide, one family group each, and eight verifiers tried to refute
their claims (78 corrections applied). Nothing in either repository was changed during the audit.

| Status         | Requirements |
| -------------- | ------------ |
| implemented    | 20           |
| partial        | 144          |
| missing        | 35           |
| blocked_owner  | 9            |
| conflict       | 1            |
| not_applicable | 1            |
| **Total**      | **210**      |

Baseline before slice 1: main at `6ea95ce` (merge of PR #62) passed CI run 178 (secrets, lint, typecheck, unit,
integration, e2e). No pre-existing test failure is known (HH-AUD-03).

Acceptance scenarios T01-T75 against existing tests: 15 covered, 44 partial, 16 missing (gap-matrix.md).

Main findings:

- The core staff chain exists (intake, CRM, estimates with customer approval by link, jobs, visits, safety content, the
  Start Job gate, field photos, invoices and payments, customer texts), but the guide's customer side does not: there
  is no project entity, no project-scoped guest access, no customer workspace, and customer access works per document
  link only.
- Missing whole: dynamic service questions, remote-or-site estimate routing, candidate-match review of contacts,
  passwordless customer accounts, the staff action-queue home, multi-worker capacity, change orders, QA and punch
  items, complaints and return work, financial reconciliation and exports, offline drafts and sync.
- Customer output can still be Spanish (estimate and invoice pages, texts); the guide and OWN-DEC-59 make it English.
- Website facts the owner gave on 2026-10-05 (deposit before materials, 10% discounts, same-day service with an extra
  charge, visit hours, free estimates) were never entered in the decision log; recorded as OWN-DEC-66.
- The nine blocked requirements and the one conflict are resolved by the owner (owner-resolutions.md).

## Plan: three phases

One pull request per slice, merged on main in order; each slice carries server rules, persistence, the staff and
customer screens it needs, tests tagged with HH- ids, and the acceptance scenarios it closes. Inputs that need the
owner, a provider or a professional are built as NOT CONFIGURED states and listed in the pull request.

### Phase 1: from a customer request to a connected project

| Slice | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Requirements and decisions                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 1.0   | Resend email adapter and the owner's test send                                                                                                                                                                                                                                                                                                                                                                                                         | OWN-DEC-60, OWN-DEC-65; COM-02, COM-04                                                                           |
| 1.1   | Staging access gate (whole site, APIs and files; health check public); privacy notice and terms drafts with the draft banner and an attorney checklist; policy version recorded with requests; card provider unnamed on the site                                                                                                                                                                                                                       | OWN-DEC-72, OWN-DEC-73, OWN-DEC-67 (wording); PRIV-04                                                            |
| 1.2   | Shared foundation: project entity; project access grant model; error envelope with field errors; required expected versions; cursor pagination; staff locale on the server; offboarding releases future visits; dead-letter view; polling with last-refreshed time; registry fields (aliases, staff Spanish label, estimating method, publication versus dispatch readiness); no quantity floor on quotes; customer documents in English               | DATA-01, ARC-04, ARC-09, ARC-10, API-03..05, STAFF-02, OPS-04, SVC-01, SVC-02, EST-02, LANG-03, PORT-08, BASE-03 |
| 1.3   | Request to staff intake: service CTA and "Not sure", dynamic service questions with units and "unknown", estimate preference, coverage served/needs_review/not_served, both contacts, draft uploads of 10 photos with per-file states, error summary, idempotency conflict, contact_unverified, automatic customer, contact and project association with a candidate-match review queue, qualification and follow-up questions, manual and phone leads | CUS-01, CUS-03, SVC-03, SVC-04, INT-01..14, ID-01, ID-02, LEAD-01..04; OWN-DEC-61, 62                            |
| 1.4   | Secure project access and the customer workspace: grants, verification challenge and exchange by email or text code, project session, neutral recovery, workspace (overview, next action, timeline, details, estimate, appointment, messages, documents, invoice), project messages, shared media, passwordless accounts with safe linking, English-only customer output                                                                               | ID-03..11, PORT-01..08, COM-01, COM-02, INT-14, LANG-01, SEC-05, DATA-07, ARC-06; OWN-DEC-63                     |

### Phase 2: from an estimate to finished, reviewed work

| Slice | Scope                                                                                                                                                                                                                                                                                                                       | Requirements and decisions                                       |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 2.1   | Estimates and exact acceptance: revisions, revise, withdraw, decline, options, exclusions, work packages, exact-version acceptance, job and scheduling task in the acceptance transaction, customer questions and change requests, deposit stage                                                                            | EST-01, EST-04..10, DATA-04, AUTO-01 (part), FIN-02              |
| 2.2   | Visits and capacity: scheduling task, site-estimate visits, several workers per visit, availability and leave, atomic reservation, hold expiry, reschedule and reassign with history, customer reschedule requests, zone shown, arrival updates; arrival and finish timestamps per worker with owner corrections and export | SCH-01..09, PORT-04, PORT-07; OWN-DEC-69                         |
| 2.3   | Worker packet, gates and execution: full packet (scope, site facts, tools, materials, loadout, evidence), readiness states, the three administrative exceptions with owner approval, protected access secret, tasks, pause and resume, issue reports, reassignment handover, offline drafts and sync                        | PKT-01..07, WORK-01..10, OFF-01..07, CRM-03, DATA-08; OWN-DEC-68 |
| 2.4   | Changes, incidents and quality: change orders, restricted incidents, ready_for_qa with owner review and self-review flag, punch items (minor versus major rules), walkthrough record, complaints, linked return jobs, closeout                                                                                              | CHG-01..04, INC-01..03, QA-01..09, STAFF-05; OWN-DEC-64, 75      |

### Phase 3: money, records and operations

| Slice | Scope                                                                                                                                                                                                                                                                                                        | Requirements and decisions                                                                                                         |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 3.1   | Finance integrity: Square payments recorded by hand with the Square payment ID and collector permission, deposit verification, discounts and same-day charge under policy, credits and write-offs, overpayment credit, progress and deposit invoices, reconciliation queue, accountant exports, cost actuals | FIN-01..17, DATA-10; OWN-DEC-66, 67                                                                                                |
| 3.2   | Records lifecycle: retention schedule as configuration, deletion-review queue with hold checks, owner Delete and Archive with confirmation, customer account deletion, data inventory                                                                                                                        | PRIV-01..03, DATA-09; OWN-DEC-70, 71                                                                                               |
| 3.3   | Operations home and hardening: action-queue home, queue fields and search, customer and property profiles, merge review, threat map, accessibility checks, observability, traceability report                                                                                                                | OPS-01..03, CRM-01, CRM-02, CRM-04, SEC-01..07, A11Y-01..03, NFR-01..03, TEST-01..03, API-01, STATE-01, STATE-02, LANG-02, LANG-04 |

Not built (owner decisions): AI features (OWN-DEC-74); electronic payment inside the software (OWN-DEC-67); categorized
time tracking and payroll (OWN-DEC-69).

### Tasks added by the launch coverage check (2026-10-12)

The check in [launch-coverage.md](launch-coverage.md) compared every P0 requirement's remaining gap with the
instructions each running slice was given. Some scope listed in the tables above was not in those instructions
(automatic contact association in 1.3; tasks, pause and resume in 2.3; parts of 3.3), and slice 1.4 was too thin. The
parts no running slice builds moved to these tasks:

| Task | Phase | Scope                                                                                                                     |
| ---- | ----- | ------------------------------------------------------------------------------------------------------------------------- |
| 1.4a | 1     | Customer access, sessions and accounts (replaces the access half of 1.4)                                                  |
| 1.4b | 1     | Customer project workspace (replaces the workspace half of 1.4)                                                           |
| 1.5  | 1     | Site and intake follow-through: site from the registry and approved policies, request details, intake ownership           |
| 2.5  | 2     | Job work packages, tasks and active execution; Paused state; cancellation with obligation checks                          |
| 2.6  | 2     | Qualifications, permits and readiness; bilingual SOP gate                                                                 |
| 2.7  | 2     | Change orders wired into the packet; field and closeout follow-through                                                    |
| 3.4  | 3     | Customer communication: reminders, consents, templates, automation registry                                               |
| 3.5  | 3     | Finance follow-through: invoice details, receipts, payment exceptions, refunds, reconciliation, fees and payouts          |
| 3.6  | 3     | API contract and platform hardening                                                                                       |
| 3.7  | 3     | Final verification and release (guide slice 9): full journey, permission matrix, manual accessibility, restore, migration |
| 3.8  | 3     | Staff customer records and privacy requests                                                                               |

### Order of the remaining work

Each step starts when the steps it depends on have merged; steps in the same wave can run side by side.

| Order | Work                                                                                                   | Starts after                               |
| ----- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| 1     | Merge the running slices: 1.1, 1.2a, 1.2b, 1.3, Records, Field, 2.1, 2.2, 2.3, 2.4a, 2.4b, 3.1, 3.3a-c | each finishing its build and checks        |
| 2     | 1.4a Customer access, sessions and accounts; 1.5 Site and intake follow-through                        | 1.2a and 1.3                               |
| 3     | 1.4b Customer project workspace                                                                        | 1.4a                                       |
| 4     | 2.5 Job work packages, tasks and active execution                                                      | 2.1 and 2.3                                |
| 5     | 2.6 Qualifications, permits and readiness                                                              | 2.2, 2.3 and Field                         |
| 6     | 2.7 Change-order wiring and field/closeout follow-through                                              | 2.3, 2.4a and 2.4b                         |
| 7     | 3.5 Finance follow-through; 3.8 Staff customer records and privacy requests                            | 3.1; 3.3a                                  |
| 8     | 3.4 Customer communication                                                                             | 1.4b                                       |
| 9     | 3.6 API contract and platform hardening                                                                | every slice above (it touches every route) |
| 10    | 3.7 Final verification and release                                                                     | everything above                           |
| 11    | Owner go decision for production (OWNER H)                                                             | 3.7 and the owner and professional inputs  |

## What needs the owner or a professional before live use

Resend account and domain (OWN-DEC-60); the attorney's review of the drafted privacy notice and terms, estimate terms and
consent wording (OWNER G); the CPA's sales-tax treatment (OWNER D) and confirmation of the retention schedule
(OWN-DEC-70); the staging access password (OWN-DEC-73); competent review of SOP content and Spanish safety text; worker
qualifications and permit rules; approved email templates; the go decision (OWNER H).
