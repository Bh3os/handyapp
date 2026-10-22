---
id: OQ-PRIVACY-REQUESTS
type: question
title: Privacy request rules no decision gives (deadlines, identity check, export contents, outcome notice)
status: superseded
area: privacy
links:
  related: ["[[HH-PRIV-03]]", "[[ENT-PrivacyRequest]]", "[[OWN-DEC-113]]", "[[OWN-DEC-71]]", "[[OQ-ATTORNEY-PRIVACY]]", "[[RULE-HUMAN-REVIEW]]", "[[TSK-0100]]"]
  superseded_by: ["[[OWN-DEC-192]]", "[[OWN-DEC-201]]", "[[OWN-DEC-175]]"]
source: "TSK-0100 privacy requests (apps/server/src/modules/privacy/requests.ts, plan.ts, export.ts)"
---
**Answered by [[OWN-DEC-192]], [[OWN-DEC-201]], [[OWN-DEC-175]] (2026-10-21).** The outcome-notice wording is part of [[OQ-MESSAGES-OUTSIDE-THE-21]]; the legal exceptions stay with the attorney ([[OQ-ATTORNEY-PRIVACY]]).

**Question:** what do the access, export, correction and deletion requests of [[HH-PRIV-03]] need that no decision gives yet?

- **Response deadline:** how soon a request must be answered (and whether Kentucky or Indiana law sets one). Until answered: NOT CONFIGURED; the screens say so and nothing is promised to the customer.
- **Identity confirmation:** PROPOSED (built): a one-time code entered in the same session within the configured freshness window, the same check as an approval (HH-ID-07). Whether a deletion or export needs more (for example a second channel) is open.
- **Export contents and format:** PROPOSED (built): a JSON file of the requester's own data (customer name, their contact and sign-in values, properties, requests as submitted, estimate versions received, approvals, their consent records, their privacy requests, their Request to Reschedule / Request Cancellation of their appointments (TSK-0066: their words, preferred times, the appointment number and the request's state; the staff decline reason and the cancellation outcome are staff handling), photo counts). The scoped search counts the visits' committed change history (work.visit_changes, with any cancellation outcome in cents) with the job records and the requester's own change requests as the record of their requests, both retained; neither names an estimate version, so neither blocks nor goes with an estimate never accepted. The job packet versions, views and exports of the requester's jobs (TSK-0069) and the appointment reminders of their visits (TSK-0067) count with the job records, retained; neither names an estimate version, so deleting an estimate never accepted leaves them. Neither is in the export (staff work records and message records). Excluded and named: other contacts of the same customer (third parties), staff-only notes and handling, staff details and audit entries. Whether an export must hold more (internal notes about the person, photos themselves) is the attorney's review.
- **Access requests:** PROPOSED: answered by the export (no separate access request kind).
- **Third-party data:** PROPOSED: other contacts of the same customer are neither exported nor deleted by another person's request.
- **Outcome notice:** the customer sees the outcome in the portal while their access remains; the message that tells them (wording and channel, a staff-released draft per [[OWN-DEC-113]]) is NOT CONFIGURED. After a deletion that closes access the customer cannot see the portal, so the notice wording is needed before real use.
- **Correction:** PROPOSED: the correction is made in the records' own screens and the Owner records that it was handled; the request keeps the customer's words.
- **Who answers:** the owner; the legal questions with the attorney ([[OQ-ATTORNEY-PRIVACY]], [[RULE-HUMAN-REVIEW]]).
