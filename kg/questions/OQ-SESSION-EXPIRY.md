---
id: OQ-SESSION-EXPIRY
type: question
title: Session, link, code and draft expiry values
status: superseded
area: security
links:
  related: ["[[OWN-DEC-96]]", "[[OWN-DEC-97]]", "[[OWN-DEC-114]]", "[[HH-ID-06]]", "[[HH-ID-11]]"]
  superseded_by: ["[[OWN-DEC-141]]"]
source: "guide HH-ID-06; OWN-DEC-93, 96, 114; owner-answers-verbatim 2026-10-05T18:24 [Tech settings]"
---
**Answered by [[OWN-DEC-141]] (2026-10-20).**

**Question:** does the owner confirm the engineering defaults: access invitation 24 hours, verification code 10 minutes, customer session 30 minutes idle / 8 hours absolute, 15-minute freshness for approvals, the staff inactivity timeout, and the browser draft expiry?

- **Who answers:** the owner. On 2026-10-05 the owner accepted "Claude's standard technical settings (sign-in session lengths, ...)" ("Accept all", owner answer 2026-10-05T18:24), but the specific values were never shown.
- **Known:** the values above are the guide's proposed launch defaults ([[HH-ID-06]]); [[OWN-DEC-96]] requires codes to expire, [[OWN-DEC-114]] a configured staff inactivity period, [[OWN-DEC-93]] expiring drafts.
- **Until answered:** the guide defaults are configured as PROPOSED values, never hard-coded.
