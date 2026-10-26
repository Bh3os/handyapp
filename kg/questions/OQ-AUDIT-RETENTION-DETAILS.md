---
id: OQ-AUDIT-RETENTION-DETAILS
type: question
title: The details of the audit-retention workflow no decision gives
status: open
area: security
links:
  related: ["[[OWN-DEC-164]]", "[[OWN-DEC-142]]", "[[OWN-DEC-70]]", "[[HH-SEC-08]]", "[[HH-SEC-06]]", "[[ENT-AuditEvent]]", "[[ENT-RetentionReview]]", "[[FACT-RETENTION-SCHEDULE]]", "[[ROLE-MATRIX]]", "[[OQ-RETENTION-REVIEW]]", "[[INT-Render]]", "[[TSK-0135]]"]
source: "TSK-0135 (2026-10-26): OWN-DEC-164 states the policy; the details below are PROPOSED or NOT CONFIGURED"
---
**Question:** does the owner approve, or change, these PROPOSED details of the owner-authorized audit-retention workflow?

- **Who answers:** the owner; the 7-year period itself waits for the CPA and the attorney ([[OQ-RETENTION-REVIEW]], [[RULE-HUMAN-REVIEW]]).
- **Decided, in use:** audit entries are never edited by any role; 7 years (`retention.audit_log`, [[OWN-DEC-142]]) is a review threshold, never an automatic deletion date; after it the Owner alone, in the dedicated workflow on the retention screen, archives entries or deletes them with explicit authorization, a fresh sign-in and a reason; every archive and deletion is written to a separate, append-only retention-operation trail (authorizer, roles, fresh sign-in time, reason, range, counts, first and last times, hold checks, confirmed checks, chain hashes and seal); a hash chain keeps continuity across archives and deletions and seqs are never renumbered; the database refuses every other update or delete (migration 0114). Matrix row: "Archive or delete audit records past 7 years in the audit-retention workflow" (F) ([[ROLE-MATRIX]]); "Edit or delete audit events" stays refused for every role.
- **PROPOSED, in use on private staging:**
  - **Calendar.** The 7 years are calendar years in the business time zone (`business.timezone`), for the workflow, the review queue's audit entries and the audit screen's count, so a daylight-saving change never moves an end by an hour. A configured period below 7 years, or a missing time zone, leaves the workflow NOT CONFIGURED: nothing can be archived or deleted ([[OWN-DEC-164]] sets 7 years as the least period).
  - **Ranges.** The Owner works on a range of entry numbers (both ends existing entries), at most 10,000 entries per operation; the screen lists the oldest 120 calendar months of eligible entries to pick from. A deletion may not overlap an earlier deletion, an archive not an earlier archive; a later deletion inside an archived range is allowed (retention no longer justified).
  - **Checks.** Recorded and blocking a deletion: open holds and open cases (complaints, disputes, investigations) on the projects of the records the entries name. The Owner confirms each of the others before a deletion, since the software does not record them: complaints, warranties, disputes, claims, investigations, unfiled tax returns, legal holds, insurance holds, litigation, tax, accounting and contractual retention requirements, and security incidents. Holds never block an archive.
  - **Archive.** The entries stay in place, unchanged; the operation records the chain hashes of the range as its integrity evidence, and the range's deletion-review entries leave the open queue (an archive decision each). No separate archive store is used.
  - **The chain.** Each entry's digest is SHA-256 of its fields in a fixed order; its chain hash is SHA-256 of the previous chain hash and its digest, from a fixed starting value. The daily retention review seals the chain up to the entries recorded at least a day earlier (at most 50,000 per seal); every operation seals and verifies the whole chain first and is refused if it does not verify. The Owner can verify the chain from the screen at any time.
  - **Database role.** The application has a single database role, which owns the tables. It keeps no DELETE privilege on the audit log: the database function that deletes an authorized range grants it for that statement only and revokes it before returning, and the delete guard lets through only the rows of the operation its own transaction wrote, by an active Owner, for entries past the period with a verified seal. As the table owner the role could still grant itself the privilege or turn the guard off; a separate owner role that the application cannot use is not configured (hosting plan, [[INT-Render]]).
  - **Kept records.** The seals and the trail have no period of their own: they are kept with the audit log and never deleted by the software.
  - **Queue.** An audit entry deleted by the workflow reads as deleted in the review queue's list and in its Delete confirmation (with the deletion's time and reason); no further decision is taken on it.
- **NOT CONFIGURED:**
  - The expiry of database backups: copies of deleted entries remain in backups until those expire under a backup policy that is not documented yet ([[INT-Render]]); the screen says so.
  - Re-applying audit deletions after a database restore from a backup older than the deletion ([[T72]] covers the Owner Delete action's deletions only).
- **Until answered:** the PROPOSED details above are used. In production no audit entry can be eligible before 2033 (the first entries date from 2026).
