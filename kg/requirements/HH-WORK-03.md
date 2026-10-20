---
id: HH-WORK-03
type: requirement
title: "Only three administrative Start Work exceptions, owner-approved"
status: active
priority: P0
area: safety
links:
  decided_by: ["[[OWN-DEC-68]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]"]
  uses: ["[[ENT-GateException]]", "[[ENT-Visit]]", "[[ENT-Photo]]", "[[ENT-Payment]]", "[[ROLE-OWNER]]"]
  tested_by: ["[[T45]]", "[[T46]]"]
  part_of: ["[[S07]]", "[[S01]]"]
source: "guide 16.1 HH-WORK-03; OWN-DEC-68"
---
Only these three exceptions exist ([[ENT-GateException]]):
1. **Customer not present:** the customer already approved the scope and explicitly authorized unattended access; the access instructions are confirmed and a contact is available. The worker still completes the site inspection and safety checks; only the customer walkthrough may be deferred.
2. **Before-photos captured but upload failed:** every required photo was captured and is still on the device. The upload failure is recorded, the photos are marked pending synchronization and upload when connectivity returns. Missing photo capture can never be excepted.
3. **Deposit paid but bookkeeping pending:** the required deposit is independently verified in Square (or another approved provider) and its transaction reference recorded with reconciliation pending. A customer's statement or screenshot is not enough; an unpaid required deposit stays blocking.

Process:
- An assigned worker submits the request with reason and evidence. Only the Owner approves.
- Approval covers one requirement, one job and one visit. It expires when that visit ends, never carries over, and is invalidated by any relevant change in scope, site conditions, access, assignment or evidence.
- Each record holds the job, affected requirement, reason, evidence, requester, owner approval, timestamp, follow-up owner and deadline.
- Pending upload or reconciliation tasks stay open after the approval expires, until resolved.
- Every approved exception appears in the Owner's review queue.
- Safety, legal, qualification, approved scope, work authorization and access permission can never be excepted. An exception is evidence handling, never approval of unsafe work.
