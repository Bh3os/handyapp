---
id: FACT-RETENTION-SCHEDULE
type: fact
title: Record retention schedule with owner deletion review
status: active
area: privacy
links:
  decided_by: ["[[OWN-DEC-70]]", "[[OWN-DEC-71]]", "[[OWN-DEC-113]]", "[[OWN-DEC-123]]", "[[OWN-DEC-142]]"]
  related: ["[[OQ-RETENTION-REVIEW]]", "[[HH-PRIV-01]]", "[[HH-DATA-09]]"]
source: "OWN-DEC-70, 71, 113, 123, 142"
---
**Value (configurable schedule, [[OWN-DEC-70]]):**
- Requests that never become jobs: 2 years after closure, then the owner's deletion-review queue (no separate 1-year contact-removal rule).
- Unaccepted estimates: 2 years after expiration or closure.
- Customer/property profiles: while active, then 7 years after the last completed service; identity details needed by longer-kept records are preserved.
- Accepted estimates, work authorizations, contracts and change orders: 10 years after final job closeout.
- Invoices, payments, receipts, refunds and reconciliation records: 7 years after the relevant tax return is filed or the tax is paid, whichever is later.
- Job photos, operational messages, checklists and arrival/finish timestamps: 7 years after job closeout; evidence supporting an approval or contract follows that record's longer period.
- Ordinary safety acknowledgments and incident records: 10 years after closure. Regulated employee medical/exposure records are excluded from routine deletion and need a separately reviewed schedule.
- Property access codes: removed when no longer needed for authorized access.
- Login sessions and access links: expire per their security settings.
- Audit-log records: 7 years, then the owner's deletion-review queue; records under a case or legal hold are kept until the hold ends ([[OWN-DEC-142]]).

Rules:
- Expired records enter the owner's review queue; nothing is deleted automatically. Before deletion the system checks for unresolved complaints, warranties, disputes, claims, investigations, unfiled tax returns, and legal or insurance holds; a hold blocks deletion of the record and its evidence.
- The owner may extend periods and may approve earlier deletion of eligible records with a recorded reason; longer legal, tax, insurance or contractual requirements override these defaults.
- The Delete action asks "Are you sure you want to delete this entry?" with the record reference, affected attachments or linked records and whether deletion is permanent, with Cancel and Confirm Delete; blocked deletion explains why and offers Archive. Issued invoices, payments, signed approvals and other protected evidence use Archive, Void or an audited correction.
- Account deletion is separate from business records ([[OWN-DEC-71]]).
- The periods await CPA and attorney confirmation ([[OQ-RETENTION-REVIEW]]).
