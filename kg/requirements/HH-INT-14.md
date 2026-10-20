---
id: HH-INT-14
type: requirement
title: Optional account offer after the receipt; declining changes nothing
status: active
priority: P0
area: identity
links:
  decided_by: ["[[OWN-DEC-94]]", "[[OWN-DEC-97]]", "[[OWN-DEC-63]]"]
  depends_on: ["[[HH-ID-10]]"]
  uses: ["[[ENT-CustomerAccount]]", "[[ENT-Project]]"]
  tested_by: ["[[T20]]"]
  part_of: ["[[C03]]"]
source: "guide 7.3 HH-INT-14; OWN-DEC-94, OWN-DEC-97"
---
- After the receipt and verification, guests are offered **Create an Account** with a passwordless code ([[HH-ID-10]]) to keep their project history.
- Declining never prevents authorized estimate approval, appointment viewing, messaging, document download or invoice access for that project through the guest link.
- Registering later links the verified request and project to the account without duplicating requests, properties, estimates, jobs or invoices.
