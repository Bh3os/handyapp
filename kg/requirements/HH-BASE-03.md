---
id: HH-BASE-03
type: requirement
title: English customer journeys and English/Spanish staff journeys; locale never changes records
status: active
priority: P0
area: i18n
links:
  decided_by: ["[[OWN-DEC-45]]", "[[OWN-DEC-59]]", "[[OWN-DEC-79]]"]
  constrained_by: ["[[RULE-LANGUAGES]]"]
  tested_by: ["[[T04]]", "[[T70]]"]
source: "guide Read this first, 1.4; OWN-DEC-45, OWN-DEC-79 amended"
---
- Languages follow [[RULE-LANGUAGES]]; the details are in [[HH-LANG-01]] (customer English), [[HH-LANG-02]] (staff coverage), [[HH-LANG-03]] (canonical data) and [[HH-LANG-04]] (Spanish safety translations, released as "AI-reviewed" after a separate comparison check, [[OWN-DEC-79]] as amended).
- A staff member switching between English and Spanish never changes a record's service ID, price, status, quantity, option, scope revision or the customer's language.
