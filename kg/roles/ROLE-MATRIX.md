---
id: ROLE-MATRIX
type: role
title: "Permission matrix: every action by role"
status: active
area: security
links:
  decided_by: ["[[OWN-DEC-114]]", "[[OWN-DEC-118]]", "[[OWN-DEC-123]]", "[[OWN-DEC-67]]", "[[OWN-DEC-68]]", "[[OWN-DEC-69]]", "[[OWN-DEC-70]]", "[[OWN-DEC-71]]", "[[OWN-DEC-76]]", "[[OWN-DEC-77]]", "[[OWN-DEC-38]]", "[[OWN-DEC-64]]", "[[OWN-DEC-81]]", "[[OWN-DEC-100]]", "[[OWN-DEC-111]]", "[[OWN-DEC-115]]", "[[OWN-DEC-117]]", "[[OWN-DEC-119]]", "[[OWN-DEC-121]]", "[[OWN-DEC-124]]", "[[OWN-DEC-125]]", "[[OWN-DEC-134]]", "[[OWN-DEC-137]]", "[[OWN-DEC-138]]", "[[OWN-DEC-143]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]", "[[RULE-SAFETY-GATES]]", "[[RULE-AI-WAVE2]]"]
  uses: ["[[ROLE-OWNER]]", "[[ROLE-OFFICE]]", "[[ROLE-ESTIMATOR]]", "[[ROLE-WORKER]]", "[[ROLE-CUSTOMER]]", "[[ROLE-GUEST]]", "[[ENT-RoleGrant]]", "[[ENT-AuditEvent]]"]
  tested_by: ["[[T26]]", "[[T64]]", "[[T19]]", "[[T68]]", "[[T28]]"]
  part_of: ["[[S09]]"]
source: "guide 10.2 access matrix; vault 27 sections 4-6, 9; OWN-DEC-114 role list and the decisions linked"
---
These are server rules, enforced by one policy point on every read, write, search, download, export, background task and offline sync, never only in menus. One person may hold several roles; capabilities stay explicit. The AI module is disabled and holds no permissions.

**Role mapping (PROPOSED, from guide 10.2 to the OWN-DEC-114 roles):** Owner/admin → Owner. Dispatcher and Customer service → Office. Estimator → Estimator. Worker → Worker. Supervisor → no role; supervision and quality review belong to the Owner (OWN-DEC-64). Bookkeeper and the guide's "limited finance role" → Office issues invoices, enters Square payment links and records payments ([[OWN-DEC-138]]); only the Owner marks a check cleared; routine reconciliation matching maps to Office and Owner (P); finance decisions stay Owner-only; the Worker gets only on-site collection recording with the collect capability.

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
| Revise (new version), withdraw, expire, record a decline | Y | Record decline only (P) | Y | — | — | — |
| View internal cost, markup and margin | Y | — | Own estimates (P) | — | — | — |
| Approve, decline or request changes | — | — | — | — | V (fresh verification) | — |
| Draft a change order | Y | — | Y | A | — | — |
| Review and publish a change order | Y | — | Y | — | — | — |
| Approve a change order | — | — | — | Captures in-person approval with customer identification, never approves | V | — |

### Scheduling
| Action | Owner | Office | Estimator | Worker | Customer | Guest |
| --- | --- | --- | --- | --- | --- | --- |
| View scheduling board | Y | Y | View (P) | Own My Day only | — | — |
| Offer windows; confirm, reschedule, reassign, cancel visits | Y | Y | Offer estimate-visit windows (P) | — | — | — |
| Select an offered window | — | — | — | — | V | — |
| Request reschedule or cancellation | — | — | — | — | V | — |
| Cancel accepted, scheduled or paid work (financial review) | Y | — | — | — | — | — |
| Set working days, hours and time off | Y | — | — | — | — | — |
| Tap On my way, Arrived, Finished | A | — | — | A | — | — |

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
| Record a verified payment | Y | Y | — | A, own on-site collection, with the collect capability (P mapping) | — | — |
| Mark a check cleared | Y | — | — | — | — | — |
| Mark a check returned; reconcile | Y | Y (P) | — | — | — | — |
| (any of the above for a payment they collected themselves) | — (P) | — (P) | — | — | — | — |
| Waive a required deposit | F | — | — | — | — | — |
| Refund, credit, write-off, void, payment correction | F | Request only (P) | — | — | — | — |
| Apply a cancellation outcome: deposit refund or the $50.00 late-cancellation amount ([[FACT-CANCELLATION-RULES]]) | F | Request only (P) | — | — | — | — |
| Release payment reminders | Y | Y | — | — | — | — |
| Decide "Overdue—owner decision" | Y | — | — | — | — | — |
| Business details and payment instructions | Y | — | — | — | — | — |
| View balances and payments | Y | Y | — | A, balance on jobs with collect (P) | V | — |
| Accounting exports | F | — | — | — | — | — |
| Owner Dashboard and its CSV | Y | — | — | — | — | — |

### Messages, content and configuration
| Action | Owner | Office | Estimator | Worker | Customer | Guest |
| --- | --- | --- | --- | --- | --- | --- |
| Reply from a project, release drafts | Y | Y | Own estimating threads (P) | Assigned operational thread (P) | V project thread | — |
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

**Changed by [[OWN-DEC-164]], [[OWN-DEC-195]], [[OWN-DEC-200]] (2026-10-21):** audit editing stays refused for every role, and an owner-only audit-retention action is added by [[TSK-0135]]; routine customer-authorized work-visit cancellations within policy move to Office by [[TSK-0140]]; cash collection needs an explicit Owner grant to a trained Worker by [[TSK-0151]]. Each change updates this table and the policy data in the same pull request.
