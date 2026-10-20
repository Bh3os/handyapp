---
id: OWN-DEC-68
type: decision
title: Three Start Work administrative exceptions, requested by the worker and approved by the owner
status: active
area: field
links:
  related: ["[[HH-WORK-02]]", "[[HH-WORK-03]]", "[[HH-WORK-04]]", "[[ROLE-OWNER]]", "[[ROLE-WORKER]]"]
  uses: ["[[ENT-Job]]", "[[ENT-Visit]]", "[[INT-Square]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]"]
  part_of: ["[[S07]]"]
source: "vault-own-decisions.md OWN-DEC-68; two-websites-owner-resolutions.md R2; project chat 2026-10-12"
---
Owner wording (project chat, 2026-10-12, as recorded): (1) customer not present, when the scope is approved and unattended access is explicitly authorized, access instructions confirmed and a contact available; only the walkthrough may be deferred; (2) before-photos captured but the upload failed, photos kept on the device and marked pending synchronization; missing capture cannot be waived; (3) deposit paid but bookkeeping pending, independently verified through Square or another approved provider with the transaction reference; a statement or screenshot is not enough. "An assigned worker may submit an exception request with the reason and supporting evidence. Only the owner may approve it." Approval covers one requirement, job and visit, expires when the visit ends, and is invalidated by a relevant change. "Safety, legal, qualification, scope approval, work authorization, and access permission cannot be waived. Every approved administrative exception appears in the owner's review queue."

Effect:
- Only three administrative exceptions to a Start Work requirement exist:
  1. Customer not present: allowed when the customer already approved the scope and explicitly authorized unattended access, the access instructions are confirmed and a contact is available. The worker still completes the site inspection and safety checks; only the customer walkthrough may be deferred.
  2. Before-photos captured but upload failed: every required photo was captured and is still on the device; the failure is recorded, the photos are marked pending synchronization and upload when connectivity returns. Missing capture can never be waived.
  3. Deposit paid but bookkeeping pending: the deposit is independently verified in Square (or another approved provider) and the transaction reference is recorded with reconciliation pending. A customer's statement or screenshot is not enough; an unpaid required deposit stays blocking.
- An assigned worker submits the request with reason and evidence; only the owner approves.
- An approval covers one requirement, one job and one visit, expires when the visit ends, never carries over, and is invalidated by a relevant change in scope, site conditions, access, assignment or evidence.
- Each exception record holds the job, the requirement, reason, evidence, requester, owner approval, timestamp, follow-up owner and deadline. Pending upload or reconciliation tasks stay open after the approval expires.
- Every approved exception appears in the owner's review queue.
- Safety, legal, qualification, approved scope, work authorization and access permission can never be waived; the hard holds of the Start Job gate stay unwaivable at the database level.

Open:
- A qualified safety professional's confirmation of this boundary before production: [[OQ-SAFETY-REVIEW]].
