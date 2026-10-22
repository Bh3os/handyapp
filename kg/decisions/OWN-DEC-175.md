---
id: OWN-DEC-175
type: decision
title: "Privacy requests: acknowledged at once and substantively within 3 business days; internal target 30 days"
status: active
area: privacy
links:
  constrained_by: ["[[RULE-HUMAN-REVIEW]]"]
  uses: ["[[FACT-PRIVACY-REQUEST-TARGETS]]", "[[FACT-BUSINESS-CALENDAR]]"]
  related: ["[[OWN-DEC-113]]", "[[OWN-DEC-71]]", "[[HH-PRIV-03]]", "[[HH-PRIV-07]]", "[[OWN-DEC-205]]"]
source: "owner answers 2026-10-21 R7-Q2"
---
Owner answer (round 7, question 2), option chosen "Within 30 days (Recommended)":

> Implement the following HandyHub customer privacy-request policy:
>
> 1. Accept requests to access, export, correct, or delete personal data.
> 2. Automatically acknowledge each request upon submission, and ensure a substantive acknowledgment within 3 business days.
> 3. Set an internal target of completing verified privacy requests within 30 calendar days of receipt.
> 4. Track the applicable legal deadline separately from the internal target. Do not automatically reject or close requests after 30 days.
> 5. If additional time is legally permitted and necessary, escalate to the Owner and notify the customer within the applicable legal notice period, explaining the reason and revised deadline.
> 6. Verify customer identity before disclosing, correcting, exporting, or deleting protected information.
> 7. Allow both registered customers and guests to submit privacy requests without requiring account creation.
> 8. For deletion requests, distinguish customer-account deletion from legally required business-record retention.
> 9. Preserve required invoices, accepted estimates, payment records, incident reports, and records under legal holds for their applicable retention periods.
> 10. Record request submission, identity verification, actions taken, exceptions, deadlines, and completion in a protected audit trail.
> 11. Display pending privacy requests, deadlines, and overdue alerts in the Owner dashboard.
> 12. Never automatically deny requests solely because records must be retained; provide an appropriate partial response and explanation.
> 13. Require attorney review of the applicable Kentucky and Indiana privacy obligations before production activation.
> 14. Test access, export, correction, deletion, verification, deadline tracking, and retention exceptions in private staging.
>
> The 30-day period is HandyHub's internal customer-service commitment, not a representation that every applicable law requires completion within 30 days.

Effect:
- Access, export, correction and deletion requests are accepted from registered customers and from guests without an account.
- Each request is acknowledged automatically on submission and substantively within 3 business days; the internal target for completing a verified request is 30 calendar days from receipt ([[FACT-PRIVACY-REQUEST-TARGETS]]). PROPOSED: business days are Monday to Friday in the business time zone ([[OQ-READINGS-2026-10-21]]).
- The legal deadline is tracked separately from the internal target; nothing is rejected or closed automatically after 30 days; an extension, where legally permitted and necessary, goes to the Owner and the customer is told the reason and the new date within the legal notice period.
- Identity is verified before anything is disclosed, corrected, exported or deleted.
- Deletion separates the customer account from business records that must be kept (invoices, accepted estimates, payments, incident reports, records under legal hold); a request is never denied only because records must be retained: the customer gets a partial response and an explanation.
- Submission, verification, actions, exceptions, deadlines and completion are kept in a protected audit trail; the Owner Dashboard shows pending requests, deadlines and overdue alerts.
- The 30 days is an internal customer-service commitment, not a statement of what the law requires. Attorney review of the Kentucky and Indiana obligations comes before production ([[OQ-ATTORNEY-PRIVACY]]).
- The wording of the automatic acknowledgment is not given ([[OQ-MESSAGES-OUTSIDE-THE-21]]).
- Answers the response-deadline part of [[OQ-PRIVACY-REQUESTS]]. Built by [[TSK-0136]].

**Confirmed by [[OWN-DEC-205]] (2026-10-22), amended:** business days are Monday to Friday excluding the 11 US federal holidays and their observed dates ([[FACT-BUSINESS-CALENDAR]]), a configurable internal calendar that never overrides statutory deadlines or legal definitions. Replaces the PROPOSED "holidays not excluded".
