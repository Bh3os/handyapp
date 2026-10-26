---
id: OQ-WORKER-ACCESS-DETAILS
type: question
title: The worker visit-day access and extension details no decision gives
status: open
area: field
links:
  related: ["[[OWN-DEC-171]]", "[[OWN-DEC-159]]", "[[HH-PKT-08]]", "[[HH-CRM-03]]", "[[HH-OFF-02]]", "[[HH-DATA-08]]", "[[ENT-Reservation]]", "[[ENT-AccessInstructionSecret]]", "[[ROLE-MATRIX]]", "[[T28]]", "[[TSK-0128]]", "[[TSK-0079]]", "[[OQ-OFFLINE-DETAILS]]", "[[OQ-MY-DAY-DETAILS]]", "[[RULE-SERVER-AUTHZ]]", "[[RULE-NO-INVENTED-FACTS]]"]
source: "TSK-0128 (2026-10-26): OWN-DEC-171 and HH-PKT-08 state the rules; the details below are PROPOSED or not built yet"
---
**Question:** does the owner approve, or change, these PROPOSED details of the workers' visit-day data access and of the Owner's extensions?

- **Who answers:** the owner.
- **Decided, in use:** before the visit day an assigned worker sees the job type, date, arrival window, team, tools, materials, SOPs, hazards and safety guidance and the general service area, never the full address, phone numbers or codes; on the visit day the customer's first name, the verified address, the site contact and the audited code reveal; the access ends at the end of the property's local service day, at once on removal, offboarding or cancellation, and moves with a reschedule; the Owner may extend it with a reason and an automatic expiry; the server enforces it on every route; the app says revocation cannot erase screenshots or copies ([[OWN-DEC-171]], [[HH-PKT-08]]).
- **PROPOSED, in use on private staging:**
  - The visit day is the visit's own date in the visit's zone (the property's Eastern or Central zone, [[OWN-DEC-159]]), from local midnight to the next local midnight; no grace period before or after.
  - The general service area is the property's city and state (no street, unit or ZIP).
  - The customer's first name is the first word of the project customer's primary contact's full name; nothing else about the customer is shown to a worker.
  - "The site contact's phone when needed for coordination" is the recorded site-contact detail, shown with the other site-access details (access windows, access notes, parking) only during the visit-day access. Before it the packet holds none of them and no access-code entry (not even its kind and label).
  - Owner extensions: one assigned worker on one live visit (confirmed, on the way or arrived), from the moment it is granted until an end time the Owner sets, at most 24 hours ahead, with a written reason (up to 500 characters). It is tied to the worker's reservation: a reassignment, a reschedule (which books a new reservation), a cancellation, a completed visit or a disabled account ends it at once, and it never carries over. The Owner may end one early with a reason. Every grant and end is audited and kept as access history; Office and the Estimator see the access and the history but cannot extend. The matrix row "Extend a worker's visit-day access" is the Owner's with a reason ([[ROLE-MATRIX]]).
  - The packet print and PDF follow the same projection as the screen at the time of printing.
  - The property record itself stays the Office's: a worker reads the site facts in the packet only.
  - Offline copies keep when the visit-day access ends; from then the address, directions, site-access details, site contact and first name are removed from the phone while the rest of the copy stays until its own expiry ([[OQ-OFFLINE-DETAILS]]). An extension the Owner ends early, or a removal, leaves the phone the next time the app reaches the server.
  - The note on copies reads: "Use these details for this visit only. Removing access cannot erase screenshots, printouts or anything already copied."
- **Not built yet:** the authorized call or message action to the site contact through the project, privacy-preserving where available (OWN-DEC-171 point 5): no number-masking or in-app calling provider is configured (NOT CONFIGURED). Until then the worker sees the recorded site contact during the visit-day access only.
- **Until answered:** the PROPOSED details above are used; each is a small change to the code or the configuration.
