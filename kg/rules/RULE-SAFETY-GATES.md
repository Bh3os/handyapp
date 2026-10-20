---
id: RULE-SAFETY-GATES
type: rule
title: Safety gates are mandatory and never weakened
status: active
area: safety
source: "vault CLAUDE.md rule 4; 07 ARC-037"
---
No role, flag, setting or AI can bypass or weaken these:
- the Start Job gate;
- stop-work rights;
- critical holds.

A critical hold is written in the same database transaction as the hazard report, under the job lock. Starting work always needs an online readiness check, and offline use can never skip a hold.
