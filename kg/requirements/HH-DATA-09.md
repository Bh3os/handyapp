---
id: HH-DATA-09
type: requirement
title: Closed and archived records governed by the retention schedule; void, supersede or archive evidence
status: active
priority: P0
area: records
links:
  decided_by: ["[[OWN-DEC-70]]", "[[OWN-DEC-71]]", "[[OWN-DEC-123]]", "[[OWN-DEC-124]]", "[[OWN-DEC-142]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]", "[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[FACT-RETENTION-SCHEDULE]]"]
  tested_by: ["[[T72]]"]
source: "guide 22.2; OWN-DEC-70"
---
- Archived and closed records keep their retention category and permissions; closing a record never widens access.
- Retention follows the owner's schedule ([[FACT-RETENTION-SCHEDULE]], [[OWN-DEC-70]]); longer legal, tax, insurance or contractual requirements override it. Expired records go to the owner's deletion-review queue; nothing is deleted automatically, and holds (complaints, cases, disputes, claims, unfiled tax returns, legal or insurance holds) block deletion of the record and its linked evidence.
- Evidence uses void, supersede or archive, never ordinary deletion: issued invoices, payments, signed approvals and other protected records.
- Tables are not soft-deleted indiscriminately and data is not kept forever: each record type follows its category. Audit records are kept 7 years under the schedule ([[OWN-DEC-142]]).
- The deletion screens, confirmation wording and customer account deletion are in the privacy requirements ([[HH-PRIV-01]], [[HH-PRIV-03]]).
