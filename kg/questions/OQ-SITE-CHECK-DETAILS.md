---
id: OQ-SITE-CHECK-DETAILS
type: question
title: The first-visit site-check details no decision gives
status: open
area: scheduling
links:
  related: ["[[OWN-DEC-167]]", "[[OWN-DEC-179]]", "[[OWN-DEC-206]]", "[[HH-SCH-06]]", "[[HH-CRM-02]]", "[[ROLE-MATRIX]]", "[[ENT-Contact]]", "[[ENT-Property]]", "[[TSK-0126]]", "[[TSK-0127]]", "[[TSK-0145]]"]
source: "TSK-0126 (2026-10-25): OWN-DEC-167 states the three checks; the details below are PROPOSED"
---
**Question:** does the owner approve, or change, these PROPOSED details of the three site checks at visit confirmation?

- **Who answers:** the owner.
- **Decided, in use ([[OWN-DEC-167]], [[OWN-DEC-179]], [[OWN-DEC-206]]):** a visit is confirmed only when staff have recorded three checks, each a checkbox with the information it rests on shown beside it: the verified property address (with any unit) and its county for the current address version; an authorized site contact (the customer or a person they named, with name, role and contact details, authorized to give access or coordinate the visit, never to approve money or contract changes); and the service-area coverage of the verified county (SERVED accepted by the Owner or Office with no owner approval; outside the area only with the Owner's exception and a reason). Each check records who, when and the version it rests on, is audited and is never edited; a changed address or contact needs its check again. The approval, deposit, holds, qualification and capacity checks stay. No legal, licensing or safety restriction is overridden: an exception lifts the coverage check only. The server names every missing check; the database refuses a confirmation without them (migration 0106).
- **PROPOSED, in use on private staging:**
  - **Every confirmation, not only the first.** Each confirmation of the project's visits (a staff confirmation, a customer's selection of an offered window) needs the three checks current, and no windows are offered before them. Because they persist, staff record them once per project and again only after the address, the county check or the contact changed. A visit already confirmed is not touched when a check later goes stale; moving or reassigning it does not ask again.
  - **Per project or property.** The address and county check belongs to the property and its address version (as built by [[TSK-0127]]), so a later project at the same unchanged address reuses it. The site contact and the coverage acceptance belong to the project: the customer of each project names its site contact, and an Owner exception covers that project only.
  - **Address pre-validation.** Before staff can verify the address, the software refuses: a street that is a PO box; a ZIP the owner's dataset lists as PO Box or Unique (mail only, [[OWN-DEC-179]] rule 8); a ZIP the dataset lists only in another state than the address names. A ZIP missing from the dataset is never a problem (rule 13). No external address-validation provider is configured (`coverage.verification_source` stays NOT CONFIGURED); staff check the complete address against an official record of their choice.
  - **EDGE at confirmation.** A verified county is either inside or outside the eleven counties, so the confirmation-time outcome is SERVED or OUTSIDE; EDGE and UNKNOWN stay the ZIP-only screening results and are resolved by the county check ([[OWN-DEC-206]]). The Owner's exception applies to OUTSIDE.
  - **Site contact.** Two authorities, either or both: "may give access to the property" and "may coordinate the visit". A person the customer named needs a name, a role at the property (staff's words) and a US phone number or an email. The customer as their own site contact is taken from their contact record, never typed again; a change of that record's name, phone or email makes the check missing again. The source is how the customer named them (by phone, in writing, at a site visit, office record). Designation is recorded by staff; the customer portal does not offer it yet. The property's free-text "site contact" detail stays a note.
  - **Who.** The Owner and Office record the address check, the site contact and a SERVED acceptance (the "confirm visits" cell); the coverage exception is a new Owner-only row of [[ROLE-MATRIX]], "Approve a service-area coverage exception, with a reason", without a fresh sign-in.
  - **Staff text.** The checkbox wording and the hints in English and Spanish (staff catalogs, `siteChecks.*`), written for this build.
- **Until answered:** the PROPOSED details above are used; each is a small change to the nodes or the code.
