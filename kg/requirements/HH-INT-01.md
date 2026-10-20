---
id: HH-INT-01
type: requirement
title: Guest-first request with the How would you like to continue choice
status: active
priority: P0
area: intake
links:
  decided_by: ["[[OWN-DEC-87]]", "[[OWN-DEC-90]]", "[[OWN-DEC-63]]", "[[OWN-DEC-93]]"]
  depends_on: ["[[HH-ID-10]]", "[[HH-INT-08]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]", "[[RULE-LANGUAGES]]"]
  uses: ["[[ENT-Request]]", "[[ENT-CustomerAccount]]"]
  tested_by: ["[[T01]]", "[[T69]]"]
  part_of: ["[[C01]]", "[[C02]]"]
source: "guide 7.1 HH-INT-01; OWN-DEC-87, OWN-DEC-90, OWN-DEC-63"
---
A request never needs a permanent account. Clicking "Request an Estimate" or "Request a Free Estimate" (header, sticky bar, or a service page with that service preselected) shows a dialog:

- Heading: "How would you like to continue?"
- Primary option: **Continue as Guest** — "Request an estimate without creating an account. Manage your project through a secure link."
- Option: **Create an Account** — "Keep your projects in one place and make future requests easier."
- Link: "Already have an account? Sign in"

Behaviour:
- Guest is the primary option. The visitor can dismiss the dialog and return to browsing.
- Create an Account and Sign in use the passwordless one-time-code customer accounts ([[HH-ID-10]]).
- The preselected service, the ZIP and everything entered are preserved when switching between guest, create account and sign in, and through the whole form, including going back.
- After the choice the form opens with the service from the page already selected ([[HH-INT-15]]).
- A guest can create an account later; linking existing projects needs verified ownership and keeps the original records without duplicates ([[HH-ID-10]]).
- The dialog is accessible: focus moves into it and is kept there, Escape closes it, focus returns to the trigger, and it works at 320 px width and 200% text.

The form steps, in order: services ([[HH-INT-15]]), about the job ([[HH-SVC-03]], [[HH-INT-04]]), property and timing ([[HH-INT-16]], [[HH-INT-17]], [[HH-INT-02]]), contact ([[HH-INT-18]]), review and send ([[HH-INT-19]]).
