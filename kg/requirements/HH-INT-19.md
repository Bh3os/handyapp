---
id: HH-INT-19
type: requirement
title: Final review with Edit per section, privacy notice version saved, Send Estimate Request
status: active
priority: P0
area: intake
links:
  decided_by: ["[[OWN-DEC-93]]", "[[OWN-DEC-72]]", "[[OWN-DEC-92]]"]
  depends_on: ["[[HH-INT-10]]", "[[HH-PRIV-04]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]", "[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Request]]", "[[ENT-PolicyVersion]]"]
  tested_by: ["[[T10]]", "[[T11]]", "[[T01]]"]
  part_of: ["[[C02]]"]
source: "OWN-DEC-93, OWN-DEC-72; guide 7.1 review row"
---
- The final summary shows services, answers, photos, the full property address, timing and contact details. Each section has an **Edit** action that keeps everything else.
- The privacy notice is linked, and the exact version presented is saved with the request.
- The submit button reads **"Send Estimate Request."** The summary shows no price and no confirmed time.
- After success the receipt shows the reference and next steps, and explains that the request is received, not a confirmed appointment ([[HH-INT-12]]).

The server stores, and authorized staff see on the request ([[HH-LEAD-01]]): selected services and per-service answers and notes, the extra-work description beyond five services, the project description, photos and their upload status, the full address with unit, property type, coverage outcome, preferred date or flexible flag, need-help-today flag, preferred windows, preferred contact channel, estimate preference (including "Let HandyHub decide"), the marketing permission with its own consent record, and the privacy notice version.
