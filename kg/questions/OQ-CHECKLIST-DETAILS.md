---
id: OQ-CHECKLIST-DETAILS
type: question
title: The job checklist details no decision gives
status: open
area: field
links:
  related: ["[[HH-WORK-11]]", "[[HH-WORK-05]]", "[[HH-WORK-12]]", "[[ENT-Task]]", "[[ENT-SOPVersion]]", "[[OWN-DEC-108]]", "[[OWN-DEC-109]]", "[[RULE-SAFETY-GATES]]", "[[TSK-0075]]", "[[TSK-0083]]", "[[TSK-0081]]", "[[TSK-0094]]", "[[TSK-0079]]"]
source: "TSK-0075 (2026-10-23): OWN-DEC-108 and HH-WORK-11 state the rules; the details below are PROPOSED or wait for later tasks"
---
**Question:** does the owner approve, or change, these PROPOSED details of the job checklist?

- **Who answers:** the owner.
- **Decided, in use:** after the safety checks and Start Work, the job's checklist opens from the SOP versions of its services in six ordered stages; each step shows what to do and any required photo, measurement or note; progress saves on the server and resumes where the worker stopped; a required step is never skipped silently: skipping needs a reason, is visible to the reviewer and blocks completion; checklist history is append-only ([[OWN-DEC-108]], [[HH-WORK-11]]).
- **PROPOSED, in use on private staging:**
  - Stage order: a step of a stage starts or completes only once every step of the earlier stages is completed or skipped; within a stage the steps may be done in any order.
  - Step states: not started, in progress, paused, completed, skipped. "Ready" is shown (an open stage), not stored. Reopening (with a reason) puts a completed or skipped step back in progress and keeps its earlier evidence; every change keeps its worker, evidence and reason.
  - Every SOP step is treated as required: the SOPs mark none optional (unknown is not safe).
  - Evidence: a photo is a field photo of the same job and work package (before or after photos taken with the existing photo screen); a measurement and a note are text.
  - Who: a worker (or the Owner) assigned to the job inside the access window, after their own Start Work on the job. Nothing is recorded while the job is not in progress, the work package is blocked or not in progress, or a review, job-level or critical safety hold is open on the project.
  - Pause and resume are per step. Pausing and resuming the whole job (outside a hazard pause) wait for [[TSK-0094]], since a resume must pass the Start Work gate again.
  - Handoff: a note for whoever continues, optionally naming a worker and a work package; the steps keep their state.
  - The Owner's quality review shows each work package's checklist summary: steps done, required steps skipped and still open.
- **Waiting for later tasks:** steps blocked by a pending change order ([[TSK-0081]]); the offline checklist and its sync ([[TSK-0079]], [[TSK-0080]]); the walkthrough step and Finished ([[TSK-0083]]); Spanish SOP text ([[TSK-0103]]).
- **Until answered:** the PROPOSED details above are used; each is a small change to the nodes or the code.
