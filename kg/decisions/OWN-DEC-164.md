---
id: OWN-DEC-164
type: decision
title: "Audit log: append-only during retention; owner-authorized deletion after 7 years only through a dedicated retention workflow"
status: active
area: records
links:
  uses: ["[[FACT-RETENTION-SCHEDULE]]"]
  related: ["[[OWN-DEC-123]]", "[[OWN-DEC-142]]", "[[ROLE-MATRIX]]", "[[HH-SEC-08]]"]
source: "owner answers 2026-10-21 R4-Q3"
---
Owner answer (round 4, question 3), option chosen "Owner may delete after 7 years", with strict retention, audit-integrity and legal-hold controls:

> Choose **Owner may delete after 7 years**, with strict retention, audit-integrity, and legal-hold controls.
>
> Implement the following policy:
>
> 1. All audit logs must remain append-only and tamper-evident during their required retention period. No user, including the owner, may edit individual existing log entries.
>
> 2. Set seven years as the default retention-review threshold, not an automatic deletion date.
>
> 3. After seven years, eligible audit records may be securely deleted only following explicit owner authorization and confirmation that no longer retention obligation applies.
>
> 4. Before deletion, verify that the records are not subject to:
>    - Legal holds or litigation
>    - Active investigations
>    - Unresolved customer disputes
>    - Tax, accounting, or contractual retention requirements
>    - Security incidents requiring extended preservation
>
> 5. Allow records to be archived rather than deleted when continued retention is justified.
>
> 6. Restrict deletion operations to a dedicated, owner-authorized retention workflow. Do not provide unrestricted database deletion privileges through the normal administration interface.
>
> 7. Record every authorized deletion in a separate, protected retention-operation audit trail, including the authorizing person, reason, affected record range, timestamps, and cryptographic integrity evidence where appropriate.
>
> 8. Preserve sequence continuity and tamper-evidence across archival and deletion boundaries using cryptographic hashes or equivalent mechanisms. Never silently renumber historical audit events.
>
> 9. Support secure deletion from relevant storage systems and manage backup expiration according to the documented retention policy.
>
> 10. Prevent automated deletion of records subject to legal holds.
>
> 11. Ensure the retention process follows the approved privacy policy and any applicable legal requirements.
>
> 12. Test unauthorized deletion attempts, retention eligibility, owner authorization, legal holds, archival integrity, and deletion auditing in private staging.
>
> This policy supersedes the previous rule requiring every audit entry to be retained forever. Audit immutability remains mandatory during the applicable retention period.

Effect:
- Audit entries stay append-only and tamper-evident throughout their retention period; nobody, the Owner included, edits an existing entry.
- Seven years is a retention-review threshold, not an automatic deletion date ([[OWN-DEC-142]]).
- After 7 years an eligible audit record may be securely deleted only on the Owner's explicit authorization, after confirming that no longer retention applies and that no legal hold, litigation, investigation, unresolved dispute, tax, accounting or contractual requirement, or security incident covers it; archiving is used instead when keeping it is justified.
- Deletion happens only in a dedicated, owner-authorized retention workflow; the normal administration screens never offer it and no unrestricted database delete privilege exists.
- Every deletion is written to a separate, protected retention-operation trail (authorizing person, reason, affected record range, timestamps, integrity evidence); hash chaining or an equivalent keeps sequence continuity and tamper evidence across archival and deletion; historical events are never renumbered.
- Secure deletion covers the storage systems; backups expire under the documented policy; legal holds block automated deletion.
- This replaces "every audit entry is kept forever" and the deletion part of the matrix row "Edit or delete audit events: —" ([[ROLE-MATRIX]]): editing stays refused for every role, and deletion becomes the retention workflow's own owner-only action, added to the matrix and the policy data together by [[TSK-0135]].
- Answers [[OQ-AUDIT-ENTRY-DELETION]]. Partly replaces [[OWN-DEC-123]].
