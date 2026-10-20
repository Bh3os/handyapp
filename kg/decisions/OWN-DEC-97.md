---
id: OWN-DEC-97
type: decision
title: Project record created at submission; guest project link
status: active
area: portal
links:
  related: ["[[OWN-DEC-63]]", "[[OWN-DEC-96]]", "[[HH-ID-01]]", "[[HH-ID-03]]", "[[HH-ID-04]]", "[[HH-ID-05]]", "[[HH-ID-09]]", "[[HH-ID-10]]", "[[HH-INT-14]]"]
  uses: ["[[FACT-AUTOMATIC-MESSAGES]]"]
source: "owner-answers-verbatim 2026-10-12T18:42:00.779Z [3.4 After]; decision-briefs 2026-10-12T18:43:44"
---
Owner, 2026-10-12, journey Step 3.4, after the receipt.

Question asked:
> Step 3.4 - After the receipt: the receipt offers 'Create an account' (optional, passwordless code) and a secure project link arrives once staff open a project. If the customer submits again with the same email, nothing about earlier projects is shown until they verify. OK?

Owner wording:
> Yes, but make project access available without waiting for staff to open it:
>
> - Create the project record automatically when the request is saved. Staff review it afterward; this does not create a confirmed job or appointment.
> - Include “View My Request” on the receipt and send secure project-access instructions automatically. Require contact verification before showing private information.
> - Offer optional “Create an Account” using a passwordless code. Guests can manage the authorized project without registering.
> - If the customer registers later, link their verified request to the account without duplicating records.
> - A new submission using the same email must not reveal earlier projects. Account-wide history requires verified identity and authorized record links; a single-project guest link grants access only to that project.
> - Expired links offer a safe way to request new access.
>
> Implement, test, and publish this on private staging using approved test destinations.

Effect:
- Saving a request creates the project record automatically. It is not a job and not an appointment; staff review it afterwards.
- The receipt offers "View My Request" and project-access instructions are sent automatically ([[FACT-AUTOMATIC-MESSAGES]]); private information shows only after contact verification ([[OWN-DEC-96]]).
- Optional "Create an Account" uses a passwordless code ([[OWN-DEC-63]]); guests can manage their authorized project without registering.
- Registering later links the verified request to the account without duplicate records.
- A single-project guest link grants that project only. Account-wide history needs verified identity plus authorized record links; a new submission with the same email reveals nothing.
- An expired link offers a safe way to request new access (neutral page, [[HH-ID-09]]).

Links: uses [[FACT-AUTOMATIC-MESSAGES]].
