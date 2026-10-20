---
id: HH-STATE-01
type: requirement
title: Server-side transition policies per entity; no generic set-status endpoint
status: active
priority: P0
area: platform
links:
  decided_by: ["[[OWN-DEC-64]]", "[[OWN-DEC-77]]", "[[OWN-DEC-82]]", "[[OWN-DEC-96]]", "[[OWN-DEC-98]]", "[[OWN-DEC-100]]", "[[OWN-DEC-101]]", "[[OWN-DEC-103]]", "[[OWN-DEC-107]]", "[[OWN-DEC-108]]", "[[OWN-DEC-109]]", "[[OWN-DEC-111]]", "[[OWN-DEC-112]]", "[[OWN-DEC-118]]", "[[OWN-DEC-124]]", "[[OWN-DEC-137]]"]
  depends_on: ["[[HH-ARC-03]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]", "[[RULE-SAFETY-GATES]]"]
  uses: ["[[ENT-Request]]", "[[ENT-Estimate]]", "[[ENT-EstimateVersion]]", "[[ENT-Visit]]", "[[ENT-Job]]", "[[ENT-Hold]]", "[[ENT-ChangeOrder]]", "[[ENT-Case]]", "[[ENT-Invoice]]", "[[ENT-Payment]]", "[[ENT-Message]]", "[[ENT-AuditEvent]]"]
  tested_by: ["[[T32]]", "[[T46]]"]
source: "guide 23, 23.1; OWN-DEC ids as linked"
---
Every state change goes through a named transition defined on the server with: allowed actor (role and record scope), prerequisites and gates, expected version, side effects (outbox events, tasks, holds), the resulting customer projection, and an audit entry. There is no endpoint that sets a status to an arbitrary value. Staff translations are labels on canonical enum values, not separate workflows. Existing values from an older system are mapped through a migration table without changing their meaning.

Canonical transitions (guide 23, with later decisions applied):

| Entity | Valid transitions | Actor, gate, side effect |
| --- | --- | --- |
| Request | `received → reviewing → needs_information / needs_site_visit / ready_for_estimate → estimated`; terminal `declined` ("Not a fit" with a reason category, [[OWN-DEC-100]]), `outside_scope`, `not_served`, `withdrawn`, `closed_no_response` (only 24 h after the final unanswered-question reminder was actually sent, [[OWN-DEC-101]]) | Office or estimator, with evidence and reason; the original request is preserved. A customer reply within the reopen period ([[FACT-REOPEN-PERIOD]]) reopens the same request for review; it never restores an expired estimate or appointment |
| Contact verification (email and phone tracked separately, [[OWN-DEC-96]]) | `unverified → pending → verified`; `pending → expired / failed`; a changed contact value starts a new verification | Verified code exchange or authorized recovery; never discloses earlier projects |
| Estimate revision | `draft → in_review → published → accepted / declined / expired / withdrawn / superseded` | `in_review` is the pre-publish validation; estimators and the owner publish directly, without a separate owner approval ([[OWN-DEC-118]]); a verified customer accepts only the current published revision ([[OWN-DEC-103]]); `expired` after the validity period ([[FACT-ESTIMATE-VALIDITY]]) |
| Scheduling task | `open → planning → fulfilled / canceled` | Dispatcher; `fulfilled` only after a committed visit |
| Visit | `tentative → confirmed → en_route → arrived → completed`; `tentative → expired`; `confirmed → canceled / no_access` | Capacity and eligibility checked; a reschedule adds history and a new committed version, never erases the old one; `en_route` only by the assigned worker's explicit tap ([[OWN-DEC-107]]) |
| Job | `pending_preparation → ready → in_progress → ready_for_qa → operationally_complete → closed`; `in_progress ↔ paused`; permitted cancellation path; `closed → reopened` by the owner only ([[OWN-DEC-77]]) | Preparation and readiness; start, resume, QA and close gates; a Requirements Hold blocks confirmation and start until cleared with a note ([[OWN-DEC-82]]); finance status is separate |
| Hold | `open → under_review → resolved / canceled_as_error` | Appropriate authority and evidence; a hard (critical) hold has no generic override; nobody releases a critical safety hold they raised ([[OWN-DEC-38]]); the Owner may set Ready on any job-level Hold / Ready note ([[OWN-DEC-137]]) |
| Task | `not_started → ready → in_progress → completed`; `in_progress ↔ paused`; `completed → reopened` | Task prerequisites and evidence; reopening needs a reason and is audited; required SOP steps cannot be silently skipped ([[OWN-DEC-108]]) |
| Change revision | `draft → reviewed → issued → approved / rejected / expired / superseded / withdrawn` | Workers draft, authorized staff publish, the verified customer approves the exact version; affected packet refreshed |
| Incident | `reported → triaged → action_pending → resolution_review → closed` | Restricted reviewer; hold resolution evaluated separately |
| QA | `pending → in_review → passed / punch_required`; `punch_required → pending_recheck → passed` | The owner reviews every job, self-review flagged ([[OWN-DEC-64]]); customer acknowledgment tracked separately |
| Case (complaint, damage, injury, dispute, [[OWN-DEC-124]]) | `open → acknowledged → investigating → action_pending → resolved → closed`; permitted reopening | Owner or reviewer; closing needs a recorded resolution and any re-check; linked return work and communication |
| Invoice | `draft → issued → partially_paid / paid`; controlled `voided` and credit/correction flow | Issued by staff only after the owner quality review; `paid` when confirmed payments plus approved credits reach $0.00 balance ([[OWN-DEC-111]]); overdue is a due-date and balance condition; "Overdue—owner decision" only after the final reminder was actually sent ([[OWN-DEC-112]]) |
| Electronic payment | Not used: there is no in-software payment session. Card payments are taken in Square (payment link or Tap to Pay) and recorded by hand by authorized staff after they verify them in Square ([[OWN-DEC-67]], [[OWN-DEC-111]]); a recorded payment changes only through the audited correction flow | Collector named; a redirect or customer claim never records a payment |
| Check tender | `received → deposited → cleared`; `received / deposited → returned / voided` | Pending until cleared; allocation policy explicit |
| Refund | `requested → approved → processing → succeeded / failed / needs_review` | Owner only ([[OWN-DEC-67]]), with reason and current balance; provider evidence |
| Notification | `draft → queued → sending → sent → delivered` where observable; failures → retry or `permanent_failure` | Staff release for drafts except the automatic messages ([[FACT-AUTOMATIC-MESSAGES]]); state and permission rechecked before send; deduplicated; failures owned by staff |

Customer-visible projection (guide 23.1, English):

| Situation | Customer label and next step |
| --- | --- |
| Received, not yet qualified | Request received · HandyHub will review the details |
| Awaiting customer facts | Waiting on you · Reply to the listed questions ([[OWN-DEC-98]]) |
| Site review required | Site visit needed · Confirm details with HandyHub |
| Published current estimate | Estimate ready · Review this estimate |
| Accepted, no confirmed visit | Estimate approved—scheduling is next; with an unsatisfied deposit: pay your deposit to proceed with scheduling ([[OWN-DEC-105]]) |
| Reschedule or cancellation requested | Request received—awaiting staff confirmation; the existing appointment stays shown ([[OWN-DEC-107]]) |
| Confirmed appointment | Scheduled · View date, window and preparation |
| En route | On the way · Recorded arrival update with the window, no ETA |
| Active work | Work in progress · View shared updates |
| Hold or incident | Work is paused for safety review / Update pending · customer-appropriate explanation and contact ([[OWN-DEC-108]]) |
| QA or punch | Completion review / Follow-up work ([[OWN-DEC-64]]) |
| Operationally complete | Work complete · Review care notes and invoice |
| Canceled or not served | Canceled / Not a fit or outside service area · reason and contact route |

A separate payment summary is always shown beside operational progress; no single combined status hides an unpaid balance or unfinished work.
