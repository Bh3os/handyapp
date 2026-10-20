---
id: OWN-DEC-99
type: decision
title: Estimate online or site visit; estimate visits are free
status: active
area: scheduling
links:
  related: ["[[OWN-DEC-66]]", "[[OWN-DEC-119]]", "[[HH-SVC-04]]", "[[HH-INT-03]]", "[[HH-SCH-01]]", "[[HH-SCH-03]]", "[[HH-SCH-04]]", "[[HH-SCH-05]]"]
  uses: ["[[FACT-VISIT-FEE]]", "[[FACT-AUTOMATIC-MESSAGES]]", "[[ENT-Visit]]"]
source: "owner-answers-verbatim 2026-10-12T18:47:59.773Z [4.2 Visit]; decision-briefs 2026-10-12T18:48:55"
---
Owner, 2026-10-12, journey Step 4.2, site visit or online estimate.

Question asked:
> Step 4.2 - Site visit vs online estimate: after reviewing, staff choose 'Estimate online' (enough information) or 'Site visit needed'. For a site visit the customer gets 2–3 proposed time windows to pick from in the project, or can ask for other times. A site visit creates an appointment of type 'Estimate visit', not a job. No visit fee is shown unless you configure one. OK?

Owner wording:
> Yes, with these refinements:
>
> - Staff choose “Estimate online” when the information is sufficient, or “Site visit needed” with a short customer-facing explanation. Consider the customer’s preference, but staff confirm the appropriate approach.
> - For a site visit, offer 2–3 available windows that account for staff capacity and travel. Customers can select one or request another time without restarting their request.
> - Recheck availability when a window is selected. Confirm the appointment only after the slot is successfully reserved; otherwise offer alternatives.
> - Show the confirmed date, arrival window, property address, visit purpose, and preparation instructions in the project.
> - Create an appointment of type “Estimate visit” linked to the existing project. Do not create a work job or imply approval of a price.
> - Keep online and onsite estimates free under my current policy. Do not display or charge a visit fee unless I explicitly change and activate that policy; disclose any future fee before booking.
> - Publishing visit options or confirming the appointment sends a brief automatic notice. Prevent duplicate sends and show delivery failures to staff.
>
> Implement, test, and publish this flow on private staging using test notifications.

Effect:
- Staff choose "Estimate online" or "Site visit needed" (with a short customer-facing explanation); the customer's preference from the form is shown but staff confirm the approach.
- For a site visit staff offer 2–3 available windows that account for staff capacity and travel. The customer picks one or requests another time without restarting the request.
- Selecting a window rechecks availability; the appointment is confirmed only after the slot is reserved, otherwise alternatives are offered. The reservation is concurrency-safe (two customers racing for one slot) and shared with work visits ([[OWN-DEC-119]]).
- The confirmed visit creates an appointment of type "Estimate visit" linked to the project; no work job and no implied price approval. The project shows date, arrival window, property address, visit purpose and preparation instructions.
- Online and onsite estimates are free ([[FACT-VISIT-FEE]]); no visit fee is displayed or charged unless the owner explicitly changes that policy, and any future fee is disclosed before booking.
- Publishing visit options and confirming the appointment each send a brief automatic notice ([[FACT-AUTOMATIC-MESSAGES]]), without duplicates; staff see delivery failures.

Links: uses [[FACT-VISIT-FEE]], [[FACT-AUTOMATIC-MESSAGES]], [[ENT-Visit]].
