---
id: FACT-RETENTION-SCHEDULE
type: fact
title: Record retention schedule with owner deletion review
status: active
area: privacy
links:
  decided_by: ["[[OWN-DEC-70]]", "[[OWN-DEC-71]]", "[[OWN-DEC-113]]", "[[OWN-DEC-123]]", "[[OWN-DEC-142]]", "[[OWN-DEC-164]]", "[[OWN-DEC-176]]", "[[OWN-DEC-177]]"]
  related: ["[[OQ-RETENTION-REVIEW]]", "[[HH-PRIV-01]]", "[[HH-DATA-09]]"]
source: "OWN-DEC-70, 71, 113, 123, 142"
---
**Changed by [[OWN-DEC-164]], [[OWN-DEC-176]], [[OWN-DEC-177]] (2026-10-21):** added rows (provisional, configurable):
- Staff accounts: 7 years after departure (review threshold); access disabled at once.
- Consent records: 5 years after the last relevant use (review threshold); never while the permission is active or a claim remains.
- Settings and content history: while retained records depend on them.
- Technical logs: 90 days.
- Expired sessions and access links: minimal non-reusable metadata up to 30 days.
- Requests that never became jobs: after the 2 years and the Owner's review, only reference, dates and final status remain ([[OWN-DEC-176]]).
- Audit records: 7 years is a review threshold; deletion only through the owner-authorized retention workflow ([[OWN-DEC-164]]).
No irreversible automatic deletion until the CPA and the attorney confirm ([[OQ-RETENTION-REVIEW]]).

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
