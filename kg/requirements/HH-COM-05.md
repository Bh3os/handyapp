---
id: HH-COM-05
type: requirement
title: State, suppression and permission rechecked at send time; marketing consent separate
status: active
priority: P0
area: messaging
links:
  decided_by: ["[[OWN-DEC-78]]", "[[OWN-DEC-107]]", "[[OWN-DEC-113]]", "[[OWN-DEC-120]]", "[[OWN-DEC-124]]", "[[OWN-DEC-147]]"]
  depends_on: ["[[HH-COM-04]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Message]]", "[[ENT-ConsentPreference]]", "[[ENT-Case]]"]
  tested_by: ["[[T65]]", "[[T67]]", "[[T76]]"]
  part_of: ["[[S06]]", "[[C11]]"]
source: "guide 21.2 HH-COM-05; OWN-DEC-78, OWN-DEC-107, OWN-DEC-113"
---
- The current record state, suppression and channel permission are checked again at send time, not only when a message is queued or a draft is released. An old reminder never goes out after an approval, a decline, an expiry, a cancellation, a reschedule, a customer reply or an opt-out.
- Transactional communication preferences and marketing choices are separate. Having a phone number is never permission to text or market: a transactional text needs the SMS opt-in ([[HH-INT-22]]), and a marketing text also needs the separate marketing permission.
- Inbound STOP, HELP and START keywords are honoured through Bird ([[INT-Bird]], [[OWN-DEC-147]]): STOP withdraws the SMS opt-in and START restores it, each recorded in the consent record immediately; HELP returns the help text ([[HH-COM-12]]).
- Review invitations and satisfaction checks pause while a complaint or case is active on the project.
