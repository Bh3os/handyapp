---
id: OWN-DEC-52
type: decision
title: The quote forms are tested before launch
status: active
area: intake
links:
  related: ["[[HH-INT-09]]", "[[HH-INT-10]]", "[[HH-TEST-03]]"]
  part_of: ["[[C02]]"]
source: "vault-own-decisions.md OWN-DEC-52; project chat 2026-10-06"
---
Owner wording (project chat, 2026-10-06): "i want the requst forms to be tested before the launc".

Effect:
- An automated end-to-end test submits the real estimate request form, with a photo, through the real server and database on every change; a red test blocks the merge.
- After the form opens at the go decision, the owner sends one test request and checks it in the staff app.

Open:
- The go decision that opens the production form: [[OQ-GO-DECISION]].
