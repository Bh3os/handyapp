---
id: HH-INT-18
type: requirement
title: Contact step with required name, email and phone, preferred channel and separate marketing permission
status: active
priority: P0
area: intake
links:
  decided_by: ["[[OWN-DEC-93]]", "[[OWN-DEC-61]]"]
  depends_on: ["[[HH-INT-13]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Contact]]", "[[ENT-ConsentPreference]]", "[[ENT-Request]]"]
  tested_by: ["[[T10]]", "[[T16]]", "[[T67]]"]
  part_of: ["[[C02]]"]
source: "OWN-DEC-93, OWN-DEC-61 (replaces the guide 7.1 'optional phone' row)"
---
- Name, email and phone are all required and validated on the client and the server.
- For a signed-in account customer the form prefills verified account details; the customer may correct them (a changed value must be verified, [[HH-INT-13]]).
- Preferred contact method: **email**, **phone call** or **text**, stored with the request.
- Marketing permission is a separate choice with its own consent record (purpose, channel, notice version, time). It is never implied by submitting a request or by having a phone number.
- The step explains how contact details are used operationally and never reveals whether an email or phone already has an account or projects.
- Contact verification never requires creating an account.
