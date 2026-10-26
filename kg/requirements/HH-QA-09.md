---
id: HH-QA-09
type: requirement
title: "Operational completion and financial closeout are separate; only the Owner reopens"
status: active
priority: P0
area: quality
links:
  decided_by: ["[[OWN-DEC-77]]", "[[OWN-DEC-64]]"]
  depends_on: ["[[HH-DATA-05]]", "[[HH-STATE-02]]"]
  uses: ["[[ENT-Job]]", "[[ENT-Invoice]]", "[[ENT-AuditEvent]]", "[[ROLE-OWNER]]"]
  tested_by: ["[[T56]]", "[[T64]]"]
  part_of: ["[[C09]]", "[[C10]]"]
source: "guide 19.1 HH-QA-09; OWN-DEC-77"
---
- Job states: `pending_preparation → ready → in_progress → ready_for_qa → operationally_complete → closed`, with `in_progress ↔ paused` and a permitted cancellation path. Financial state is separate.
- The job becomes `operationally_complete` when the Owner's quality review passes. It becomes `closed` only when every task and QA item has a disposition, every punch item passed re-check, the financial records are approved (invoice issued and paid, or remaining obligations explicitly tracked) and no open complaint case remains.
- Closeout or cancellation never bypasses unresolved approval, payment, quality or safety obligations; a refusal names them.
- Only the Owner may reopen a closed job, with a fresh sign-in and a reason. The original record is kept and the change is audited; any other role, including another administrator, is refused.

**Built by [[TSK-0092]] (2026-10-25, migration 0101):** the Owner closes an operationally complete (or reopened) job once nothing is left open; a refusal names each open obligation, and the database refuses a close without the Owner's recorded close or with a case open on the project. "Remaining obligations explicitly tracked" reads as a payment plan, a collection hold or the Owner's overdue decision on the final invoice; the close records which. Only the Owner reopens (`closed -> reopened`), with a fresh sign-in and a reason, and closes it again on the same conditions. PROPOSED details: [[OQ-CLOSEOUT-DETAILS]].
