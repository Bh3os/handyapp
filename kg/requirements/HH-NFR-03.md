---
id: HH-NFR-03
type: requirement
title: Defined fallback for every provider or dependency outage; rollback and runbooks
status: active
priority: P0
area: platform
links:
  decided_by: ["[[OWN-DEC-111]]", "[[OWN-DEC-119]]", "[[OWN-DEC-121]]", "[[OWN-DEC-133]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]"]
  uses: ["[[INT-Bird]]", "[[INT-Resend]]", "[[INT-R2]]", "[[INT-Render]]"]
  tested_by: ["[[T71]]", "[[T61]]", "[[T13]]", "[[T12]]"]
source: "guide 26.3, 29.3, 29.4"
---
Fallbacks:
- Email or text provider down: the request or business event is stored and its message queued; the failure is visible with a retry.
- Payment: a payment pending verification stays pending, never shown as paid.
- Maps: the address shows with a plain link to a maps app; no maps API is needed ([[OWN-DEC-119]], [[OWN-DEC-121]]).
- Storage or upload unavailable: the draft, text and completed files are kept, failures shown, safe retry offered; no file marked ready before processing.
- Stale packet: a visible stale-packet warning with its last update.
- When current authorization or gates cannot be checked (offline, server error), unsafe progression stops: no start, resume, financial or final-close action ([[RULE-SAFETY-GATES]]).

Runbook responses (guide 29.4):

| Failure | Response |
| --- | --- |
| Request stored, confirmation fails | Staff queue shows the record and the delivery issue; retry or use another verified contact under policy |
| Verification delivery unavailable | Safe reissue or staff-assisted verified recovery; never temporary public access |
| Database unavailable | Show a failed or uncertain outcome, keep the draft, retry with the same key; no false receipt, start or payment |
| Storage or upload unavailable | Keep text and completed files, show failures, safe retry |
| Payment verification uncertain | Keep the payment pending or as an exception until verified in Square; deduplicate before allocation |
| Unknown refund outcome | No blind retry; reconcile with the provider's evidence and record the resolution |
| Scheduling conflict | The existing commitment stays; the dispatcher reviews alternatives; no silent last-write-wins |
| Lost or offline worker device | Revoke server sessions, follow device controls, keep evidence; offline copies have limits that are acknowledged |
| Critical hazard or scope change | Refresh the packet, invalidate readiness, communicate and escalate; no blind resume |
| Compromised privileged identity | Keep evidence, revoke access, secure recovery, review changes and exports, coordinate the privacy response |
| Restore needed | Isolated restore, integrity checks, deletion and suppression replay, provider reconciliation, controlled resume |

Release and rollback (guide 29.2, 29.3):
- Before a feature is exposed: implementation evidence, test results, business policy readiness, provider and environment configuration, accessible failure states and a recovery owner.
- Each release records the deployed commit, schema version, feature flags, migration and backfill progress, affected providers and templates, smoke checks and rollback constraints.
- A rollback keeps newly accepted and paid records: never drop new finance tables or restore an older backup over live transactions as a routine rollback. Prefer disabling a broken action while keeping read access; pause dangerous automation and reconcile external transactions before retries; where a schema rollback is unsafe, correct forward.
- Production exposes no debug tools, sample credentials, fake reviews, test staff or private seed records; domain, certificate and cookie settings are verified for the real origins, `handyhub247.com` and `staff.handyhub247.com` ([[FACT-DOMAIN]]).
