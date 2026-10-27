---
id: HH-TEST-01
type: requirement
title: Every P0 requirement traced to code, responsibility, test evidence, reviewer and limitations
status: active
priority: P0
area: platform
links:
  decided_by: ["[[OWN-DEC-130]]"]
  depends_on: ["[[HH-AUD-03]]"]
source: "guide 27.1, 27.3, 30.1"
---
- The repository maps each P0 requirement (each `HH-` node) to its code or module, its API, UI and data responsibility, its test evidence (tests are tagged with the requirement and decision IDs), its owner or reviewer, and any active limitation.
- A deferred or limited item is stated explicitly with its reason (owner input, owner decision, process requirement, real gap) and is never called complete.
- The traceability report is generated, not hand-edited, and checked in CI.
- Test principles (guide 27.1): behavioural unit tests for deterministic pricing, transitions and gates; integration tests for permissions, transactions and providers; end-to-end tests for cross-website journeys. No large suites that only mirror component markup; test the high-consequence boundary and the observable outcome. Only sandbox providers and synthetic records; no real charges, refunds, customer messages or destructive production tests.
- Starting family-to-test map (guide 27.3), expanded per requirement as features land: BASE/AUD T02-T04, T31, T75; ARC T01, T12, T23-T24, T34, T42, T65, T68; DATA/STATE/API T11, T19, T32-T46, T51, T58-T64, T68; SEC/PRIV T18-T29, T49, T57, T64, T68, T72, T74; LANG/A11Y/NFR T04, T41, T45, T69-T72 plus measured budgets; COM/AUTO T12, T48, T65-T67; STAFF/OPS T26-T28, T42, T70, T74.
- Handoff documentation (guide 30.1), reusing existing equivalents rather than multiplying documents: current-state and gap record; architecture decision ([[ARCH-STACK]]); service and coverage registry; data dictionary and migration notes; API contract; state and permission matrix; staff packet policy; finance and communication policy; test and traceability report; security and privacy map; owner and worker runbooks; release notes and changelog.

**Built by [[TSK-0110]] (2026-10-26):** `tools/trace.mjs --strict` runs in the CI `kg` job: every P0 requirement and acceptance test has tagged test evidence (with its layer: unit, integration, ui, e2e) or a stated limitation with its reason and reviewer; done tasks are tagged with their `implements` ids; the generated `docs/traceability-report.md` lists the coverage per P0 requirement, the limitations and what the Owner must still decide or provide. Details in [[OQ-TRACEABILITY-DETAILS]].
