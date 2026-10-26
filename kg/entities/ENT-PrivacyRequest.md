---
id: ENT-PrivacyRequest
type: entity
title: "Privacy request"
status: active
area: privacy
links:
  decided_by: ["[[OWN-DEC-71]]", "[[OWN-DEC-113]]"]
source: "guide 25.2 HH-PRIV-03; OWN-DEC-113"
---
A customer's request for export, correction or deletion.

**Fields:** customer; type; identity confirmation; scoped search results; holds and retention findings; deleted and retained categories with reasons; decision; Owner; time; outcome notice; receipt date in the business time zone, automatic acknowledgment, substantive acknowledgment due date, internal target date, the calendar and target versions they were counted with, extensions (new date, reason, Owner, time) and the legal deadline with its note ([[TSK-0136]], [[HH-PRIV-07]]); how the identity was verified (a fresh code in a session, or the Owner's check and note for a request recorded outside the portal), the Owner's confirmation of the identity evidence of an elevated request, and the correction entries of a correction request ([[TSK-0152]]).

**States:** `received → under_review → completed / partially_completed / declined`.

**Who may change:** the customer submits; the Owner decides.
