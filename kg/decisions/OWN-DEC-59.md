---
id: OWN-DEC-59
type: decision
title: The two-websites functionality guide is the build specification
status: active
area: platform
links:
  related: ["[[HH-AUD-03]]", "[[HH-BASE-02]]", "[[HH-BASE-03]]", "[[HH-LANG-01]]", "[[HH-PORT-08]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]", "[[RULE-LANGUAGES]]"]
source: "vault-own-decisions.md OWN-DEC-59; project chat 2026-10-12; sources/two-websites-functionality-guide-v1.0.md"
---
Owner wording (project chat, 2026-10-12), after uploading the guide "HandyHub: Customer Website, Staff Website, and Shared Business System - detailed functionality requirements and AI implementation guide" (version 1.0, 2026-10-11): "okay now build all what in this file and while you working if nedded to ask me any questions you welcome".

Effect:
- The guide (HH- requirements, acceptance scenarios T01 to T75) is the build specification for both websites on one business system and one database.
- Its fixed rules hold: no minimum job charge ([[OWN-DEC-31]]); customer website, notifications and documents in English; staff website in English and Spanish; guest requests with optional customer accounts; individual staff accounts.
- Values the guide marks as proposed engineering defaults (session lengths, code lifetimes, polling interval, recovery targets) are configurable settings.
- Business facts the guide leaves open are never invented.
- Where the vault plans conflict with the guide, the guide and the owner's decisions govern; a later owner decision governs over the guide.

Partly replaced by [[OWN-DEC-130]]: the app is rebuilt in `Bh3os/handyapp` from this knowledge graph on a stack Claude chooses, not on the existing stack. [[OWN-DEC-122]]: decided values are active configuration; only genuinely missing facts stay missing. [[OWN-DEC-79]]: Spanish safety translations are "AI-reviewed".
