---
id: OWN-DEC-194
type: decision
title: "Rules Review B: the offer clock starts at publication; one active offer per visit, replaced only through a recorded, notified workflow; reviewed default preparation instructions"
status: active
area: scheduling
links:
  related: ["[[OWN-DEC-192]]", "[[OWN-DEC-144]]", "[[OWN-DEC-156]]", "[[HH-SCH-11]]", "[[OQ-WINDOW-OFFER-RULES]]"]
source: "owner answers 2026-10-21 R12 (Rules Review)"
---
Owner answer (round 12, Rules Review), section verbatim:

> B — Appointment Windows
> B1: The 24-hour offer period begins when the appointment options are successfully published to the customer, not when staff save a draft.
> Record the publication timestamp and exact expiration time.
> B3: Preserve crew-capacity protection across all offered windows. Release unused reservations when the customer selects a valid option. Ensure atomic booking and no double-booking.
> B4: Allow only one active customer-facing offer per visit. Do not allow overlapping options within the same offer.
> Staff must be able to withdraw or replace an offer through an authorized workflow with a recorded reason and appropriate customer notification.
> Do not permit silent changes to an active published offer.
> B7: Use reviewed service-specific preparation instructions as the default. Permit staff customization where appropriate, but prevent unsafe customer instructions.
> Approve B2, B5, B6, and B8 as built.

Rules as built, as the owner reviewed them on the Rules Review page (2026-10-21):

- **B1** The 24-hour hold starts when the offer is saved, timed by the server clock. Every window in one offer shares the same expiry.
- **B3** One offer holds the visit's whole team for every window offered.
- **B4** The windows in one offer may not overlap. A visit has one open offer at a time, and while it is open staff can't move or confirm that visit.
- **B7** Preparation instructions are free text staff write with the offer (up to 1,000 characters), shown with the confirmed visit and used in the appointment reminder.

Effect:
- B1: the 24-hour offer period starts when the options are successfully published to the customer, not when staff save a draft; the publication timestamp and the exact expiry are recorded ([[OWN-DEC-144]]).
- B3: crew capacity stays protected across all offered windows; a valid selection releases the unused reservations; booking is atomic, never double-booked.
- B4: one active customer-facing offer per visit, with no overlapping windows inside an offer. Staff withdraw or replace an offer only through an authorized workflow with a recorded reason and a notice to the customer; an active published offer is never changed silently.
- B7: reviewed service-specific preparation instructions are the default; staff may customize them where appropriate, but unsafe customer instructions are prevented (no hazardous preparation, [[HH-CUS-02]]).
- Built by [[TSK-0145]] (B1, B3, B4) and [[TSK-0146]] (B7).
