---
id: OQ-OFFLINE-ACTIONS-DETAILS
type: question
title: The additional offline actions, and when they are turned on
status: open
area: field
links:
  related: ["[[HH-OFF-08]]", "[[HH-OFF-03]]", "[[HH-OFF-04]]", "[[HH-OFF-05]]", "[[HH-OFF-06]]", "[[HH-OFF-07]]", "[[HH-SEC-01]]", "[[OWN-DEC-121]]", "[[ENT-FieldEvent]]", "[[TSK-0115]]", "[[TSK-0080]]", "[[OQ-OFFLINE-DETAILS]]", "[[OQ-CHECKLIST-DETAILS]]", "[[RULE-SAFETY-GATES]]", "[[RULE-SERVER-AUTHZ]]"]
source: "TSK-0115 (2026-10-26): HH-OFF-08 and OWN-DEC-121 state the rules; the list and the details below are PROPOSED"
---
**Question:** which actions beyond the minimal offline set should a phone be able to save without a connection, and does the owner approve, or change, these PROPOSED details of how they are turned on?

- **Who answers:** the owner.
- **Decided, in use:** fuller offline workflows only after the threat, conflict, freshness and device controls are proven; Start Work and the safety gates are never bypassed offline ([[HH-OFF-08]], [[RULE-SAFETY-GATES]]). Offline checklists, notes, photos and Arrived/Finished timestamps, synced without duplicates, conflicts flagged for review ([[OWN-DEC-121]]).
- **Not proven yet:** the Owner Acceptance Testing walk on staging has not happened, so no control is proven. Section K of `docs/owner-acceptance-testing.md` lists the offline controls to walk (lost phone and sign-out, reassignment, a disabled worker, a hold raised while offline, an out-of-date or expired copy, a phone without storage).
- **PROPOSED, built and off by default (`field.offline_actions` version 1 turns nothing on, migration 0128):**
  - The list the Owner can turn on: **checklist steps** (start, pause, resume and complete, with the evidence the step asks for). Skipping, reopening, handoff notes and Finished keep needing a connection; so do Start Work, resuming after a hold, approvals and every payment ([[HH-OFF-04]]).
  - Not in the list yet (each needs its own task): photos taken offline (a step that asks for a photo can be completed offline only with photos already uploaded), notes outside a checklist step, issue reports other than Stop Work.
  - The switch: Settings → **Offline actions**, the Owner only, with a fresh sign-in and a written reason; turning an action on records that the controls of section K were walked. The database accepts a change only from a live Owner with a reason, naming listed actions only. Turning it off again stops new uploads at once.
  - While an action is off, the server refuses its uploads (`OFFLINE_ACTION_NOT_ENABLED`); the draft stays on the phone as "Upload failed", never erased, and the worker records it again online.
  - The checklist copy: taken each time the worker opens the checklist online after their own Start Work, kept with the job's packet copy and removed with it (end of the service day, assignment ended, sign-out). The handoff notes and the list of other workers are not copied. It is labelled with the time it was taken.
  - Offline, the phone applies the same table as the server (stage order, evidence) to the copy and its drafts, and shows each such step as "Saved on this phone" until the server has it. Nothing is possible offline when the copy shows a blocker (no Start Work, a hold, the job not in progress) or while a Stop Work saved on the phone is not sent yet.
  - On upload each step is decided again: assigned to the visit when saved and now, then the checklist route's own checks (the worker's own Start Work, the job and package in progress, no open hold, the step's version). Whatever is refused now (a hold raised since, the step changed by someone else, an earlier stage reopened) is kept for the Owner's review ("Phone update to review") and never applied; the worker records it again online if it still applies.
  - The Owner reads the setting with the permission that reviews phone uploads (`visit.correct_timestamps`) and changes it with `policy_values.change`.
  - A page opened without a connection reads the session again for its CSRF token once the server answers, before it uploads.
- **Until answered:** checklist steps stay off; each detail above is a small change to the nodes or the code.
