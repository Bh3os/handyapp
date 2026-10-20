---
id: OWN-DEC-40
type: decision
title: Field workers see the service address from visit confirmation through the service day, then it is hidden
status: active
area: privacy
links:
  related: ["[[HH-CRM-02]]", "[[HH-CRM-03]]", "[[HH-PKT-07]]", "[[HH-OFF-02]]", "[[ROLE-WORKER]]"]
  uses: ["[[ENT-Property]]", "[[ENT-Visit]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  part_of: ["[[S07]]"]
source: "vault-own-decisions.md OWN-DEC-40; project chat 2026-10-05"
---
Owner wording (in-chat question, 2026-10-05): "When should a field worker see the job's street address on their phone?" answered "Once visit is confirmed (Recommended)" (offered as: the address shows from the time the office confirms the visit through the service day, then is hidden).

Effect:
- The assigned field worker sees the service address from the moment the office confirms the visit through the service day.
- A tentative assignment or slot hold shows no address; after the service day the address is hidden.
- The address also disappears once the visit is completed or recorded as a no start, which can be earlier than the end of the day; past visits are not listed. That is stricter than the owner's rule; showing the address until the end of the day would be a reviewed change.

Partly replaced by [[OWN-DEC-121]]: property access codes are online-only, shown only to the assigned worker on the visit date, and never included in offline downloads.

Open:
- The post-service grace period, when the site contact phone appears, and whether workers see customers' full names: [[OQ-WORKER-DATA-ACCESS]].
