---
id: OWN-DEC-201
type: decision
title: "Rules Review I: risk-based identity checks, fuller exports, kept correction history, accounting checks before deletion, a reviewed inventory mapping"
status: active
area: privacy
links:
  constrained_by: ["[[RULE-HUMAN-REVIEW]]"]
  related: ["[[OWN-DEC-192]]", "[[OWN-DEC-175]]", "[[HH-PRIV-03]]", "[[HH-PRIV-05]]", "[[OQ-PRIVACY-REQUESTS]]", "[[TSK-0099]]", "[[TSK-0100]]"]
source: "owner answers 2026-10-21 R12 (Rules Review)"
---
Owner answer (round 12, Rules Review), section verbatim:

> I — Privacy and Records
> I1: Require fresh verification appropriate to the risk of the privacy request. Support secure identity-verification alternatives where needed.
> I2: Export personal data belonging to the requester while excluding or redacting protected third-party information and legitimately restricted internal records.
> Do not categorically exclude information solely because it originates in an audit log; evaluate disclosure rights and exceptions.
> I3: Preserve correction history where legally and operationally required. Never silently rewrite immutable approval, accounting, or audit records.
> I4: Before deleting a record, check relevant accounting systems for linked payments, deposits, invoices, refunds, and reconciliation obligations.
> Do not assume an unrecorded external payment exists.
> Escalate unresolved financial discrepancies for authorized review.
> Preserve legally required records without unnecessarily blocking unrelated eligible deletion requests.
> I5: Audit the actual staging data inventory and table-to-retention mappings against the approved retention schedule.
> Do not approve destructive production deletion based solely on an unreviewed table mapping.
> Retain the previously established privacy response target and legal-hold controls.

Rules as built, as the owner reviewed them on the Rules Review page (2026-10-21):

- **I1** For a privacy request, the customer confirms who they are with a fresh one-time code in the same session.
- **I2** A data export is a file of the requester's own data. It leaves out other people's contacts, staff-only notes and audit entries, and it answers an access request too.
- **I3** Corrections are made in each record's own screen, and the request records that it was handled.
- **I4** Before you delete anything, a payment taken outside the app is always a check you confirm by hand, even when the app has none on file.
- **I5** How each database table maps to your retention periods, as listed in the data inventory on staging.

Effect:
- I1: identity verification proportionate to the request's risk (at least the fresh one-time code in the same session), with secure alternatives where needed.
- I2: an export contains the requester's personal data; protected third-party information and legitimately restricted internal records are excluded or redacted; information is not excluded merely because it sits in an audit log: disclosure rights and exceptions are evaluated (attorney review, [[OQ-ATTORNEY-PRIVACY]]).
- I3: correction history is kept where legally or operationally required; immutable approval, accounting and audit records are never silently rewritten.
- I4: before deleting a record, linked payments, deposits, invoices, refunds and reconciliation obligations are checked in the accounting records; an unrecorded external payment is not assumed to exist; unresolved financial discrepancies are escalated for authorized review; legally required records are kept without blocking unrelated eligible deletion. Replaces I4 as built (always a manual check confirmation).
- I5: the actual staging data inventory and its table-to-retention mappings are audited against the approved schedule; no destructive production deletion rests on an unreviewed mapping. The 30-day response target ([[OWN-DEC-175]]) and legal-hold controls stay.
- Built by [[TSK-0152]].
