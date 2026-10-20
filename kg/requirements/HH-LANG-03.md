---
id: HH-LANG-03
type: requirement
title: Canonical data independent of staff locale; customer documents explicitly English with staff preview
status: active
priority: P0
area: i18n
links:
  constrained_by: ["[[RULE-LANGUAGES]]"]
  tested_by: ["[[T04]]", "[[T66]]"]
source: "guide 26.1, 21.1"
---
- Service IDs, quantities, units, currency, option IDs, scope revisions and legal or financial evidence are canonical values; a staff locale only changes their labels.
- Customer documents and messages are generated with English selected explicitly, never from the sender's interface locale or browser locale. The audience policy picks the language and destination.
- Staff previews show exactly what the customer will receive (English).
