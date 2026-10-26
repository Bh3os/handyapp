---
id: ROLE-MATRIX
type: role
title: "Permission matrix: every action by role"
status: active
area: security
links:
  decided_by: ["[[OWN-DEC-114]]", "[[OWN-DEC-118]]", "[[OWN-DEC-123]]", "[[OWN-DEC-67]]", "[[OWN-DEC-68]]", "[[OWN-DEC-69]]", "[[OWN-DEC-70]]", "[[OWN-DEC-71]]", "[[OWN-DEC-76]]", "[[OWN-DEC-77]]", "[[OWN-DEC-38]]", "[[OWN-DEC-64]]", "[[OWN-DEC-81]]", "[[OWN-DEC-100]]", "[[OWN-DEC-111]]", "[[OWN-DEC-115]]", "[[OWN-DEC-117]]", "[[OWN-DEC-119]]", "[[OWN-DEC-121]]", "[[OWN-DEC-124]]", "[[OWN-DEC-125]]", "[[OWN-DEC-134]]", "[[OWN-DEC-137]]", "[[OWN-DEC-138]]", "[[OWN-DEC-143]]", "[[OWN-DEC-171]]", "[[OWN-DEC-211]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]", "[[RULE-SAFETY-GATES]]", "[[RULE-AI-WAVE2]]"]
  uses: ["[[ROLE-OWNER]]", "[[ROLE-OFFICE]]", "[[ROLE-ESTIMATOR]]", "[[ROLE-WORKER]]", "[[ROLE-CUSTOMER]]", "[[ROLE-GUEST]]", "[[ENT-RoleGrant]]", "[[ENT-AuditEvent]]"]
  tested_by: ["[[T26]]", "[[T64]]", "[[T19]]", "[[T68]]", "[[T28]]"]
  part_of: ["[[S09]]"]
source: "guide 10.2 access matrix; vault 27 sections 4-6, 9; OWN-DEC-114 role list and the decisions linked"
---
These are server rules, enforced by one policy point on every read, write, search, download, export, background task and offline sync, never only in menus. One person may hold several roles; capabilities stay explicit. The AI module is disabled and holds no permissions.

**Role mapping (PROPOSED, from guide 10.2 to the OWN-DEC-114 roles):** Owner/admin → Owner. Dispatcher and Customer service → Office. Estimator → Estimator. Worker → Worker. Supervisor → no role; supervision and quality review belong to the Owner (OWN-DEC-64). Bookkeeper and the guide's "limited finance role" → Office issues invoices, enters Square payment links and records payments ([[OWN-DEC-138]]); only the Owner marks a check cleared; routine reconciliation matching maps to Office and Owner (P); finance decisions stay Owner-only; the Worker gets only on-site collection recording with the Owner's collect grant recording their training ([[OWN-DEC-200]] H4).

**Legend:** Y allowed · A assigned jobs only, inside the access window · V own verified project only · F fresh sign-in (password re-entry or TOTP) plus a written reason · P PROPOSED cell (not owner-decided) · — refused. Every allowed sensitive action is audited.

### Intake, customers and records
| Action | Owner | Office | Estimator | Worker | Customer | Guest |
| --- | --- | --- | --- | --- | --- | --- |
| Submit a request | Y | Y (manual lead) | Y (manual lead) | — | Y | Y |
| View intake queue and original requests | Y | Y | Y (P) | — | V (own) | — |
| Ask a question, choose online or site visit, Not a Fit, assign responsible person | Y | Y | Y (P) | — | — | — |
| Reply to a question | — | — | — | — | V | — |
| View customer and property records | Y | Y | Y estimating scope (P) | A site facts only | V own | — |
| Edit contact or property details | Y | Y (reason) | — | — (site observations only) | V own (re-verify) | — |
| Merge or relink customers, correct a request link | Y | Y (reason, preview) | — | — | — | — |
| Reverse a record-link change | Y | — | — | — | — | — |
| Enter or remove an access code | Y | Y | — | — | V own | — |
| Reveal an access code | Y (audited) | Y (audited, P) | — | A on the visit date, online, audited | — | — |
| View duplicate suggestions | Y | Y | Y (P) | — | — | — |

### Estimates and approvals
| Action | Owner | Office | Estimator | Worker | Customer | Guest |
| --- | --- | --- | --- | --- | --- | --- |
| Write or upload an estimate draft | Y | — | Y | — | — | — |
| Publish an estimate version | Y | — | Y while the publishing policy grants it | — | — | — |
| Change who may publish | Y | — | — | — | — | — |
| Approve or reject publishing over the Owner approval threshold | Y | — | — | — | — | — |
| Revise (new version), withdraw, expire, record a decline | Y | Record decline only (P) | Y | — | — | — |
| View internal cost, markup and margin | Y | — | Own estimates (P) | — | — | — |
| Record a discount verification or send it to owner review | Y | Y (P) | Y (P) | — | — | — |
| Decide a discount owner review or override a verification | Y | — | — | — | — | — |
| Approve, decline or request changes | — | — | — | — | V (fresh verification) | — |
| Draft a change order | Y | — | Y | A | — | — |
| Review and publish a change order | Y | — | Y | — | — | — |
| Approve a change order | — | — | — | Captures in-person approval with customer identification, never approves | V | — |

### Scheduling
| Action | Owner | Office | Estimator | Worker | Customer | Guest |
| --- | --- | --- | --- | --- | --- | --- |
| View scheduling board | Y | Y | View (P) | Own My Day only | — | — |
| Offer windows; confirm, reschedule, reassign, cancel visits | Y | Y | Offer estimate-visit windows (P) | — | — | — |
| Approve a service-area coverage exception, with a reason | Y | — | — | — | — | — |
| Authorize a hazard-evaluation inspection visit while an intake hold is open, with a reason | Y (reason) | — | — | — | — | — |
| Record a follow-up visit's authorization on a completed job | Y | Y (P) | — | — | — | — |
| Select an offered window | — | — | — | — | V | — |
| Request reschedule or cancellation | — | — | — | — | V | — |
| Cancel accepted, scheduled or paid work (financial review) | Y | — | — | — | — | — |
| Cancel a work visit for a routine customer-authorized cancellation within policy | Y | Y | — | — | — | — |
| Set working days, hours and time off | Y | — | — | — | — | — |
| Tap On my way, Arrived, Finished | A | — | — | A | — | — |
| Extend a worker's visit-day access | Y (reason) | — | — | — | — | — |

### Field work and safety
| Action | Owner | Office | Estimator | Worker | Customer | Guest |
| --- | --- | --- | --- | --- | --- | --- |
| View job packet | Y | Y | Estimating scope (P) | A | — | — |
| Start, pause, resume work | A, through the gate, never bypassed | — | — | A, through the gate | — | — |
| Stop Work, Report Hazard | Y | Y | Y | A, always, no permission needed | — | — |
| Request an administrative Start Work exception | — | — | — | A | — | — |
| Approve an administrative exception | Y | — | — | — | — | — |
| Override the gate or a critical hold | — | — | — | — | — | — |
| Release a critical safety hold (with evidence; never one they raised) | Y | — | — | — | — | — |
| Set the job-level Hold with a note | Y | Y (P) | Y (P) | — | — | — |
| Set Ready on any job-level Hold / Ready note, with a note (including one they set) | Y | — | — | — | — | — |
| Checklist steps, photos, notes, walkthrough record, issue reports | A | — | — | A | — | — |
| Correct Arrived/Finished timestamps | Y | — | — | — | — | — |
| Quality review, punch items, self-review | Y | — | — | Correct assigned punch items | — | — |
| Reopen a closed job | F | — | — | — | — | — |

### Finance
| Action | Owner | Office | Estimator | Worker | Customer | Guest |
| --- | --- | --- | --- | --- | --- | --- |
| Issue an invoice (after the Owner's quality review) | Y | Y | — | — | — | — |
| Enter the Square payment link | Y | Y | — | — | — | — |
| Record a verified payment | Y | Y | — | A, own on-site collection, with the Owner's collect grant recording their training (P mapping) | — | — |
| Mark a check cleared | Y | — | — | — | — | — |
| Mark a check returned; reconcile | Y | Y (P) | — | — | — | — |
| (any of the above for a payment they collected themselves) | — (P) | — (P) | — | — | — | — |
| Waive a required deposit | F | — | — | — | — | — |
| Refund, credit, write-off, void, payment correction | F | Request only (P) | — | — | — | — |
| Apply a cancellation outcome: deposit refund or the $50.00 late-cancellation amount ([[FACT-CANCELLATION-RULES]]) | F | Request only (P) | — | — | — | — |
| Waive or reduce a cancellation fee, with a documented reason | F | — | — | — | — | — |
| Release payment reminders | Y | Y | — | — | — | — |
| Decide "Overdue—owner decision" | Y | — | — | — | — | — |
| Business details and payment instructions | Y | — | — | — | — | — |
| View balances and payments | Y | Y | — | A, balance on jobs with collect (P) | V | — |
| Accounting exports | F | — | — | — | — | — |
| Owner Dashboard and its CSV | Y | — | — | — | — | — |
| View and record job costs, estimated versus actual | Y (P) | — | — | — | — | — |
| Enter labor cost rates per worker; record why a job is below the target margin | Y | — | — | — | — | — |

### Messages, content and configuration
| Action | Owner | Office | Estimator | Worker | Customer | Guest |
| --- | --- | --- | --- | --- | --- | --- |
| Reply from a project, release drafts | Y | Y | Own estimating threads (P) | — (proposes a reply for review) | V project thread | — |
| Write a proposed customer reply (Spanish or English) for review; follow its status | — | — | — | Assigned jobs; own proposals | — | — |
| Review a proposed reply: ask for clarification, reject, or write and send the English reply | Y | Y | — | — | — | — |
| Link a Needs Linking message; view unmatched messages | Y | Y | — | — | — | — |
| Share photos or care notes with the customer | Y | Y (P) | — | — | — | — |
| Mark media marketing-eligible (with recorded consent) | Y | — | — | — | — | — |
| Approve care instructions, service content, estimate terms, SOP review sign-off | Y (care: F) | — | — | — | — | — |
| Change policy values | F | — | — | — | — | — |

### Staff, audit, cases and privacy
| Action | Owner | Office | Estimator | Worker | Customer | Guest |
| --- | --- | --- | --- | --- | --- | --- |
| Invite staff, grant roles or capabilities | F | — | — | — | — | — |
| Disable account, revoke sessions, start password recovery | Y (never delayed) | — | — | — | — | — |
| View audit log | All | Own actions | — | — | — | — |
| Report an incident | Y | Y | Y | A | — | — |
| Record a complaint case | Y | Y | — | — | Raise via message | — |
| View restricted incident details (injury, damage, disputes) | Y | — (sees only that a case exists and its status) | — | Own report only | — (acknowledgement, progress, next step) | — |
| Professional referral, case closure | Y | — | — | — | — | — |
| Request export, correction or deletion | — | — | — | — | V | — |
| Decide privacy requests; Delete action; delete a login account | Y | — | — | — | — | — |
| Bulk export | F | — | — | — | — | — |
| Edit or delete audit events | — | — | — | — | — | — |
| Archive or delete audit records past 7 years in the audit-retention workflow | F | — | — | — | — | — |

**Changed by [[OWN-DEC-164]], [[OWN-DEC-195]], [[OWN-DEC-200]] (2026-10-21):** audit editing stays refused for every role, and an owner-only audit-retention action is added by [[TSK-0135]]; routine customer-authorized work-visit cancellations within policy move to Office by [[TSK-0140]]; cash collection needs an explicit Owner grant to a trained Worker by [[TSK-0151]]. Each change updates this table and the policy data in the same pull request.

**Built by [[TSK-0140]] (2026-10-26, migration 0115):** the row "Cancel a work visit for a routine customer-authorized cancellation within policy" (`work.cancel_routine`) lets Office cancel a work visit the customer asked to cancel when the outcome is one the rules decide (full refund, the capped late fee, a late cancellation with nothing to charge); any other work-visit cancellation (HandyHub's own, after contracted work started, an exception the Owner reviews) stays "Cancel accepted, scheduled or paid work (financial review)". The Owner's row "Waive or reduce a cancellation fee, with a documented reason" (`cancellation_fee.waive`, [[OWN-DEC-161]]) is recorded on the cancellation; applying a refund or the fee stays "Apply a cancellation outcome". PROPOSED details: [[OQ-CANCELLATION-RULES-DETAILS]].

**Built by [[TSK-0135]] (2026-10-26, migration 0114):** the row "Archive or delete audit records past 7 years in the audit-retention workflow" is the Owner's with a fresh sign-in and a reason (`audit.retention_archive`, `audit.retention_delete`); reading the workflow, its trail and the chain's verification sits in the Owner's retention review (`retention.view`). "Edit or delete audit events" still refuses every role. PROPOSED details: [[OQ-AUDIT-RETENTION-DETAILS]].

**Built by [[TSK-0151]] (2026-10-24, migration 0098):** the Worker's cell of "Record a verified payment" reads "with the Owner's collect grant recording their training": the `collect` grant records the date the training was completed and what it covered, and the database refuses a live collect grant without it (collect grants from before 0098 without a training record were ended). The Owner's dismissal of a working-hours or equipment flag (`visit.dismiss_flag`, with a reason) sits in "Set working days, hours and time off" (P); a mandatory restriction is never dismissed ([[OWN-DEC-200]] H7). Restoring an earlier grant in a reactivated account's permission review is "grant roles or capabilities" (F); declining one is protective, in the disable row. PROPOSED details: [[OQ-STAFF-AMENDMENT-DETAILS]].

**Built by [[TSK-0126]] (2026-10-25):** the row "Approve a service-area coverage exception, with a reason" is the Owner's explicit approval of [[OWN-DEC-167]] for a verified county outside the service area (`visit.approve_coverage_exception`); recording the address check, the site contact and a SERVED acceptance sits in "Offer windows; confirm, reschedule, reassign, cancel visits" (`visit.confirm`). PROPOSED details: [[OQ-SITE-CHECK-DETAILS]].

**Changed by [[OWN-DEC-173]] (2026-10-21):** publishing an estimate or change order above [[FACT-OWNER-APPROVAL-THRESHOLD]] needs the Owner's approval first; the row "Approve or reject publishing over the Owner approval threshold" is the Owner's alone, and changing the threshold is "Change policy values" (F) ([[TSK-0130]]).

**Built by [[TSK-0092]] (2026-10-25):** closing a job (`job.close`) sits in the Owner's cell of "Quality review, punch items, self-review" (P: ENT-Job "the Owner reviews quality, closes and reopens"); reopening is "Reopen a closed job" (F). Releasing the satisfaction check and review requests, preparing a review request and recording the customer's answer are "Reply from a project, release drafts" on the project's records (the Owner, Office). PROPOSED details: [[OQ-CLOSEOUT-DETAILS]].

**Built by [[TSK-0095]] (2026-10-26):** reading a job's estimated-versus-actual costs and recording cost entries, voids and category confirmations (`job_cost.view`, `job_cost.record`) are the new Finance row "View and record job costs, estimated versus actual" (P: the Owner only). PROPOSED details: [[OQ-JOB-COST-DETAILS]].

**Changed by [[OWN-DEC-211]], built by [[TSK-0155]] (2026-10-26):** a worker never sends a customer message: the Worker cell of "Reply from a project, release drafts" (formerly "Assigned operational thread (P)") is refused. Workers write internal notes from an assigned job ("Checklist steps, photos, notes…", `job.add_note`) and propose customer replies in Spanish or English (`message.propose_reply` on an assigned job; `message.follow_own_proposal` on their own proposals: edit a draft, submit it, answer a clarification, see the status). The Owner and Office review them (`message.review_proposal`): ask for clarification, reject, or write the English message and send it. PROPOSED details: [[OQ-SPANISH-NOTES-DETAILS]].

**Built by [[TSK-0096]] (2026-10-26):** "Owner Dashboard and its CSV" is `dashboard.view` (the dashboard and its drill-down lists) and `dashboard.export_csv` (its CSV, which also needs a sign-in within the last 5 minutes, as every bulk export does under [[T64]]); "Accounting exports" is `export.accounting` (F) for the accountant's files. PROPOSED details: [[OQ-DASHBOARD-DETAILS]].

**Built by [[TSK-0131]] (2026-10-26):** a job's gross margin and its advisory target flag are read with the job's costs (`job_cost.view`, the Owner); entering the labor cost rate per worker (`labor_rate.manage`) and recording why a job is below the target margin (`job_margin.review`) are the new Finance row "Enter labor cost rates per worker; record why a job is below the target margin" (the Owner, [[OWN-DEC-189]]); changing the target is "Change policy values" (F). PROPOSED details: [[OQ-JOB-MARGIN-DETAILS]].

**Built by [[TSK-0118]] (2026-10-26, migration 0125):** a Customer "V" cell also covers a project in the scope of the signed-in account's organization membership ([[HH-ID-13]]), but only for the actions the membership's privileges name (the policy's organization table): reading the project (`request.view`) for every membership; the estimate decisions, `change_order.approve` and the appointment choices and requests with `approve`; `payment.view` with `pay`. Every other customer action stays the project customer's own. The Payments tab is now authorized by "View balances and payments" (`payment.view`, Customer V), as its invoices are. No row is added. PROPOSED details: [[OQ-ORGANIZATION-ACCOUNTS-DETAILS]].
