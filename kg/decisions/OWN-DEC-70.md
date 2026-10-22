---
id: OWN-DEC-70
type: decision
title: Retention schedule per category with an owner deletion-review queue; no automatic deletion
status: active
area: records
links:
  related: ["[[HH-PRIV-01]]", "[[HH-DATA-09]]", "[[HH-DATA-03]]", "[[OWN-DEC-176]]", "[[OWN-DEC-177]]", "[[OWN-DEC-201]]"]
  uses: ["[[FACT-RETENTION-SCHEDULE]]", "[[ENT-AuditEvent]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]"]
  part_of: ["[[S09]]", "[[C11]]"]
source: "vault-own-decisions.md OWN-DEC-70; two-websites-owner-resolutions.md R4; project chat 2026-10-12"
---
Partly replaced by [[OWN-DEC-176]], [[OWN-DEC-177]], [[OWN-DEC-201]] (2026-10-21): a deleted request keeps only its reference, dates and status; provisional periods for data the schedule did not name; deletion checks linked accounting records.

Owner wording (project chat, 2026-10-12, as recorded): a configurable schedule: requests that never become jobs 2 years after closure; unaccepted estimates 2 years after expiration or closure; customer and property profiles while active, then 7 years after the last completed service; accepted estimates, work authorizations, contracts and change orders 10 years after final job closeout; invoices, payments, receipts, refunds and reconciliation 7 years after the relevant tax return is filed or tax is paid, whichever is later; job photos, operational messages, checklists and arrival/finish timestamps 7 years after job closeout (evidence for an approval or contract follows the longer period); ordinary safety acknowledgments and incident records 10 years after closure; regulated employee medical or exposure records excluded from routine deletion with a separate reviewed schedule; access codes removed when no longer needed; sessions and links by their security settings. "Expired records enter an owner review queue; they are not deleted automatically." The owner then withdrew a separate one-year contact-removal rule and asked for a Delete action with the confirmation "Are you sure you want to delete this entry?", Archive when deletion is blocked, early deletion with a reason, and Archive, Void or audited correction for protected evidence.

Effect:
- The retention schedule above is versioned configuration ([[FACT-RETENTION-SCHEDULE]]); the owner may extend it, and longer legal, tax, insurance or contractual requirements override it. Customer and property profiles preserve the identity that longer-kept records need.
- Expired records enter the owner's deletion-review queue; nothing is deleted automatically.
- Before any deletion the system checks for unresolved complaints, warranties, disputes, claims, investigations, unfiled tax returns, and legal or insurance holds; a hold blocks deletion of the record and its related evidence.
- There is no one-year contact-removal rule for lost requests.
- The owner has a Delete action on individual entries. The confirmation reads "Are you sure you want to delete this entry?" with the record name or reference, the attachments and linked records affected, and whether the deletion is permanent, with Cancel and Confirm Delete. Confirmation never bypasses a hold, a dispute, required retention or an essential linked record; a blocked deletion says why and offers Archive.
- Eligible records may be deleted early with a recorded reason. The deletion log keeps actor, time, record reference and reason, never the deleted personal content.
- Issued invoices, payments, signed approvals and other protected evidence use Archive, Void or an audited correction, never ordinary deletion.

Partly replaced by [[OWN-DEC-122]]: the schedule is active configuration from the start, with no activation step. [[OWN-DEC-123]] applies it to audit records.

Open:
- CPA and attorney confirmation of the periods: [[OQ-RETENTION-REVIEW]].
