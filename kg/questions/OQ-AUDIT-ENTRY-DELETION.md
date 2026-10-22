---
id: OQ-AUDIT-ENTRY-DELETION
type: question
title: Whether audit entries past their 7 years are ever deleted, when no role may delete audit events
status: superseded
area: privacy
links:
  related: ["[[OWN-DEC-142]]", "[[OWN-DEC-123]]", "[[ROLE-MATRIX]]", "[[ENT-AuditEvent]]", "[[HH-PRIV-05]]", "[[RULE-HUMAN-REVIEW]]", "[[TSK-0100]]"]
  superseded_by: ["[[OWN-DEC-164]]"]
source: "TSK-0100 (apps/server/src/modules/privacy/targets.ts auditEntryTarget)"
---
**Answered by [[OWN-DEC-164]] (2026-10-21).**

**Question:** [[OWN-DEC-142]] sends audit records to the owner's deletion review after 7 years, but [[ROLE-MATRIX]] says no role edits or deletes audit events ("Edit or delete audit events: —", AUDIT_APPEND_ONLY) and [[OWN-DEC-123]] calls the audit log immutable. May the Owner delete a reviewed audit entry, and if so how is that itself recorded?

- **Who answers:** the owner; with the attorney and the CPA for records that may be evidence ([[RULE-HUMAN-REVIEW]]).
- **Until answered (built):** the Delete action on an audit entry is refused with "Audit entries are append-only for every role" and offers Archive or Keep longer; the entry and the audit event stay unchanged.
- **PROPOSED (not decided):** if deletion is allowed, the audit event is removed only by the Owner's recorded decision, the deletion log keeps its sequence number, action and time (never its summary), and the matrix row changes in the same decision.
