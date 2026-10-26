---
id: HH-PRIV-03
type: requirement
title: "Access, correction, export and deletion requests reviewed by the Owner"
status: active
priority: P0
area: privacy
links:
  decided_by: ["[[OWN-DEC-71]]", "[[OWN-DEC-113]]", "[[OWN-DEC-124]]", "[[OWN-DEC-70]]", "[[OWN-DEC-175]]", "[[OWN-DEC-201]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]"]
  uses: ["[[ENT-PrivacyRequest]]", "[[ENT-RetentionReview]]", "[[ENT-Customer]]", "[[ENT-Case]]", "[[FACT-RETENTION-SCHEDULE]]", "[[ROLE-OWNER]]"]
  tested_by: ["[[T72]]", "[[T22]]"]
  part_of: ["[[C11]]", "[[S09]]"]
source: "guide 25.2 HH-PRIV-03; OWN-DEC-71, OWN-DEC-113, OWN-DEC-124"
---
- Customers request a data export, correction or deletion from the workspace through verified access; the request ([[ENT-PrivacyRequest]]) needs proportionate identity confirmation and is reviewed by the Owner.
- The system runs a scoped search, a third-party privacy check, and retention and hold checks (including an automatic check for open complaints or cases), then explains to the customer what will be deleted, what is retained, why and until when ([[FACT-RETENTION-SCHEDULE]]).
- Not every request is blocked: unrelated eligible data is deleted and the customer is told which records must remain and why.
- Login-account deletion is separate from business records. The Owner sees what will be deleted, what is retained, why and the review date. On confirmation: sign-in, sessions and project-access links are revoked; eligible unnecessary personal data and account preferences are deleted.
- Invoices and payments, accepted estimates and authorizations, and incident records stay for their periods, subject to longer requirements or holds; supporting photos, messages and property details stay when their own schedule or a protected record needs them. Signed approvals and issued financial documents are never rewritten. Retained records are restricted to authorized staff with only necessary identifying data. Relationships are preserved; deletion never cascades into protected records.
- A hold blocks deletion of affected records, but account access can still be disabled. An unpaid balance never automatically prevents closing login access.
- The Owner, time, reason, deleted categories and retained categories are recorded; the customer is notified of the outcome. Retained records enter the review queue when their periods end.
- Deletions and suppressions are re-applied after any backup restore.

**Changed by [[OWN-DEC-175]], [[OWN-DEC-201]] (2026-10-21):** targets and deadlines of [[HH-PRIV-07]]; risk-based identity checks; exports may include audit-log data where disclosure applies; accounting checks before deletion.

**Built by [[TSK-0152]] (2026-10-26):** identity checks by risk: the fresh code for every request, and the Owner's confirmation of the identity evidence before completing an export or a deletion; the secure alternative is a request the Owner records for a person verified another way, named by the email or phone on file. The export holds the requester's own data found in audit entries without summaries, reasons or staff names. A correction keeps the changes made in the records' own screens and the correction entries recorded beside protected records. Deletion checks the accounting records (found or none found) and never assumes an external payment. PROPOSED details: [[OQ-PRIVACY-REFINEMENT-DETAILS]].
