---
id: HH-COM-12
type: requirement
title: "A2P 10DLC compliance on the website"
status: active
priority: P0
area: messaging
links:
  decided_by: ["[[OWN-DEC-147]]", "[[OWN-DEC-129]]"]
  depends_on: ["[[HH-INT-22]]", "[[HH-PRIV-04]]", "[[HH-COM-05]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]", "[[RULE-HUMAN-REVIEW]]"]
  uses: ["[[FACT-LEGAL-ENTITY]]", "[[FACT-BUSINESS-NAME]]", "[[FACT-PUBLIC-CONTACT]]", "[[FACT-AUTOMATIC-MESSAGES]]", "[[FACT-REMINDER-CADENCES]]", "[[INT-Bird]]", "[[ENT-ConsentPreference]]", "[[ENT-PolicyVersion]]"]
  tested_by: ["[[T76]]"]
  part_of: ["[[C01]]", "[[C02]]"]
source: "OWN-DEC-147 (new behaviour; no guide id)"
---
The public site meets every A2P 10DLC campaign-vetting requirement before production texting through [[INT-Bird]] ([[OWN-DEC-147]]):
- **Privacy policy SMS section** ([[HH-PRIV-04]]): mobile numbers and SMS opt-in data are never shared with or sold to third parties for marketing.
- **SMS terms page:** names the program, the message types (the texts of [[FACT-AUTOMATIC-MESSAGES]] and the staff-released reminders of [[FACT-REMINDER-CADENCES]]), the message frequency, "Message and data rates may apply", "Reply STOP to opt out", "Reply HELP for help", and the support contact ([[FACT-PUBLIC-CONTACT]]).
- **Opt-in on the request form:** the SMS checkbox and its disclosure ([[HH-INT-22]]).
- **One name everywhere:** the same business and brand name on the site, the privacy policy, the SMS terms and the registration ([[FACT-LEGAL-ENTITY]]).
- **Links:** working links to the privacy policy and the SMS terms from the request form and the footer ([[HH-CUS-05]]).
- **Keywords:** STOP, HELP and START are honoured through Bird and update the consent record immediately ([[HH-COM-05]]).
- Transactional texts and marketing texts are separate consents; a marketing text also needs the separate marketing permission ([[HH-INT-18]]).

Rules:
- Registration uses the legal entity ODD JOBS & MORE LLC with the brand HandyHub ([[FACT-LEGAL-ENTITY]]). Filing it in Bird is an owner action ([[OQ-BIRD-10DLC]]); the EIN and registered address are entered by the owner in Bird and never stored in the repository.
- The privacy policy and SMS terms wording gets attorney review ([[OQ-ATTORNEY-PRIVACY]]); on staging the drafts carry the not-reviewed label of [[HH-PRIV-04]]. The frequency statement describes only the cadences that exist; nothing is invented.
- RISK: the support contact is still a placeholder ([[FACT-PUBLIC-CONTACT]]) and documents show "Handyhub LLC" while the registration uses ODD JOBS & MORE LLC ([[OQ-LEGAL-ENTITY-NAME]]). Both need the owner's answer before the campaign is submitted, or vetting may fail.
- Production texting stays off until the registration is approved; staging texts go only to approved test numbers.
