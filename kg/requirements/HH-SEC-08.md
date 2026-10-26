---
id: HH-SEC-08
type: requirement
title: "Owner-authorized audit retention workflow with its own protected trail"
status: active
priority: P1
area: security
links:
  decided_by: ["[[OWN-DEC-164]]"]
  depends_on: ["[[HH-SEC-06]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]", "[[RULE-HUMAN-REVIEW]]"]
  uses: ["[[ENT-AuditEvent]]", "[[ENT-RetentionReview]]", "[[FACT-RETENTION-SCHEDULE]]"]
  tested_by: ["[[T74]]", "[[T26]]"]
  part_of: ["[[S09]]"]
source: "OWN-DEC-164 (new behaviour; no guide id)"
---
- Audit entries can never be edited by any role. Entries past the 7-year review threshold become eligible for review, never deleted automatically.
- Only the Owner, in a dedicated retention workflow, may authorize secure deletion of eligible audit records, after the system confirms no legal hold, litigation, investigation, unresolved dispute, tax, accounting or contractual requirement or security incident covers them; Archive is offered instead when retention is justified. No other screen or API deletes audit entries, and the application's database role has no unrestricted delete privilege on them.
- Each authorized deletion is recorded in a separate, protected retention-operation trail (authorizer, reason, affected record range, timestamps, integrity evidence). A hash chain or equivalent keeps sequence continuity across archive and deletion boundaries; historical entries are never renumbered.
- Deletion reaches the relevant storage; backups expire under the documented policy.
- Tests cover unauthorized attempts, eligibility, owner authorization, legal holds, archive integrity and the deletion trail.

**Built by [[TSK-0135]] (2026-10-26, migration 0114):** the Owner's audit-retention workflow on the retention screen (`/staff/audit-retention`): a range of entries past their 7 calendar years in the business time zone is archived, or deleted after every not-recorded check is confirmed, with a fresh sign-in and a reason; open holds and cases block deletion and Archive stays offered. The trail is `platform.audit_retention_operations`; the hash chain is sealed daily (`platform.audit_chain_seals`) and verified before every operation and on request, across archive and deletion boundaries. The database deletes audit entries only inside the transaction that wrote an Owner's deletion, granting itself the privilege for that statement alone. Backup expiry stays NOT CONFIGURED. PROPOSED details: [[OQ-AUDIT-RETENTION-DETAILS]].
