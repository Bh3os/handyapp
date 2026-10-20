---
id: HH-PRIV-05
type: requirement
title: "Owner Delete action with confirmation; Archive when blocked"
status: active
priority: P0
area: privacy
links:
  decided_by: ["[[OWN-DEC-70]]"]
  uses: ["[[ENT-RetentionReview]]", "[[ENT-AuditEvent]]", "[[ROLE-OWNER]]"]
  tested_by: ["[[T72]]"]
  part_of: ["[[S09]]"]
source: "OWN-DEC-70 (new behaviour; no guide id)"
---
- The Owner has a Delete action on individual entries. The confirmation reads "Are you sure you want to delete this entry?" and shows the record name or reference, the attachments and linked records affected, and whether deletion is permanent, with Cancel and Confirm Delete.
- Confirmation never bypasses an active hold, an unresolved dispute, required retention or an essential linked record. A blocked deletion says why and offers Archive instead.
- Eligible records may be deleted before the end of their period with a recorded reason.
- The log keeps actor, time, record reference and reason, never the deleted personal content.
- Issued invoices, payments, signed approvals and other protected evidence use Archive, Void or an audited correction, never ordinary deletion.
- No other role has a delete action.
