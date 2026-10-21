---
id: OQ-RETENTION-UNSCHEDULED
type: question
title: Retention of data the schedule does not name
status: open
area: privacy
links:
  related: ["[[FACT-RETENTION-SCHEDULE]]", "[[OWN-DEC-70]]", "[[OQ-RETENTION-REVIEW]]", "[[HH-PRIV-01]]", "[[RULE-HUMAN-REVIEW]]", "[[TSK-0099]]"]
source: "TSK-0099 data inventory (docs/data-inventory.md)"
---
**Question:** how long are the kinds of data that [[FACT-RETENTION-SCHEDULE]] has no row for kept, and what happens to them after that?

- **Data without a row:** staff accounts and their history (role grants, status changes, working hours, time off, second factors and recovery codes); consent records; customer accounts and their identity links (account deletion is separate, [[OWN-DEC-71]]); configuration and content versions (policy values, service content, message templates, coverage rules, equipment); action-queue items; technical records (background jobs, outbox events, idempotency keys, webhook receipts not linked to a request or job); expired sessions, access links, codes and rate-limit buckets (they expire by their security settings, but how long an expired row is kept is not set); the deletion-review entries themselves; and the copies the vendors keep (Bird, Resend, Cloudflare R2, Render backups).
- **Who answers:** the owner; staff and employment records with the attorney and the CPA ([[OQ-RETENTION-REVIEW]], [[RULE-HUMAN-REVIEW]]).
- **Until answered:** NOT CONFIGURED. Nothing is deleted automatically and no period is assumed; the data inventory lists each table under `not_scheduled` or `sessions_and_links`.
- **PROPOSED (not decided):** configuration and content versions are kept while any record that cites them is kept; technical records are removed after a short engineering period once nothing references them.
