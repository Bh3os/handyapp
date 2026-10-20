---
id: HH-INT-12
type: requirement
title: Receipt page in the owner's wording, shown only after the request is saved
status: active
priority: P0
area: intake
links:
  decided_by: ["[[OWN-DEC-94]]", "[[OWN-DEC-35]]", "[[OWN-DEC-97]]"]
  depends_on: ["[[HH-INT-10]]", "[[HH-INT-13]]", "[[HH-INT-21]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]", "[[RULE-LANGUAGES]]", "[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Request]]", "[[ENT-Project]]", "[[FACT-HOURS]]", "[[FACT-RESPONSE-TARGET]]"]
  tested_by: ["[[T01]]", "[[T12]]", "[[T13]]", "[[T16]]"]
  part_of: ["[[C03]]"]
source: "guide 7.3 HH-INT-12; OWN-DEC-94"
---
The receipt appears only after the request is committed. It shows:
- **"Your request is in."** then "Thank you for choosing HandyHub."
- **"Request reference: HH-XXXX"** with the actual reference and a **Copy** button. The reference is not a secret and grants nothing.
- **"Your project at a glance":** selected services, description, property address, preferred timing and contact details as submitted.
- **"Your photos":** received, processing and failed photos shown separately; failed ones can be retried here without a new request ([[HH-INT-07]]).
- **"What happens next?":** "We'll review your project and contact you using your preferred method. We aim to respond within one hour during our daily hours, 8 AM–10 PM. Requests received outside those hours are reviewed when we reopen." and "Your request is received. Pricing and your appointment will be confirmed separately."
- The contact-verification panel ([[HH-INT-13]]).
- Actions: **View My Request** (verified, secure project access), **Create an Account** (optional, shown to guests only; [[HH-INT-14]]), **Return Home**.

Rules:
- The hours and response target in the wording come from [[FACT-HOURS]] and [[FACT-RESPONSE-TARGET]] in configurable copy, not scattered literals.
- The receipt never shows existing customer history, account status or earlier projects before verification.
- Timing preferences are clearly not an appointment. Staff see the new request even if the receipt email fails ([[HH-INT-20]]).
