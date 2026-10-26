---
id: HH-DATA-04
type: requirement
title: Transaction boundaries that prevent partial or duplicate outcomes
status: active
priority: P0
area: platform
links:
  decided_by: ["[[OWN-DEC-103]]", "[[OWN-DEC-105]]", "[[OWN-DEC-119]]", "[[OWN-DEC-111]]"]
  depends_on: ["[[HH-API-04]]", "[[HH-ARC-08]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]"]
  tested_by: ["[[T11]]", "[[T34]]", "[[T38]]", "[[T39]]", "[[T46]]", "[[T59]]"]
source: "guide 22.2, 24.5"
---
Each operation below commits all of its work atomically or none of it:

| Operation | Atomic work | Concurrency failure behaviour |
| --- | --- | --- |
| Request submission | Request, project and contact association, attachment binding, receipt and outbox | A duplicate key returns the existing receipt; changed content under the same key conflicts |
| Estimate acceptance | Verify revision and actor, acceptance, one job and scheduling task, outbox | Stale, duplicate or changed-total requests are rejected or answered idempotently; concurrent approvals create one acceptance, one job, one scheduling task |
| Visit confirmation | Check and reserve every needed worker and resource, commit visit and version, outbox | Overlap or eligibility conflict refuses the whole confirmation; no partial team reservation; simultaneous confirmations by different staff cannot both succeed ([[OWN-DEC-119]]) |
| Start work | Validate assignment, packet version and gates, record state, time and evidence, audit | A changed hazard, scope or assignment blocks or returns a stale-version error |
| Change approval | Exact revision acceptance, approved delta, packet invalidation, outbox | Old proposals are rejected; no duplicate scope or price delta |
| Payment allocation | Recorded payment state, allocation constraints, balance, outbox | Duplicate or over-allocation rejected; the deposit is credited to the invoice once ([[OWN-DEC-111]]); the original record is kept |
| Provider receipt (webhook) | Authenticated receipt with its unique key and a durable processing job | A duplicate is acknowledged safely; ordering is never assumed |

A critical hold is written in the same transaction as its hazard report, under the job lock ([[RULE-SAFETY-GATES]]).

**Built by [[TSK-0107]] (2026-10-26):** a provider status processed before its send committed is applied when the delivery records the provider message ID (it was ignored for good); a lost database connection fails its transaction whole and no longer ends the server. Tests: `robustness.test.ts` (half-way failures, connection loss, retries under one key, races), `delivery-states.test.ts`, `start-work.test.ts` (concurrent Start: one start per worker).
