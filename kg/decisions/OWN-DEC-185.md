---
id: OWN-DEC-185
type: decision
title: "Production hosting: the cheapest paid setup that works"
status: active
area: platform
links:
  uses: ["[[INT-Render]]"]
  related: ["[[OWN-DEC-130]]", "[[OQ-PRODUCTION-HOSTING]]"]
source: "owner answers 2026-10-21 R9-Q4"
---
Owner answer (round 9, question 4, which paid production setup): "Cheapest that works". Claude picks the setup and reports the price.

Effect:
- Claude's pick (RECOMMENDATION; prices are ESTIMATES from Render's published list prices as known to Claude, not rechecked on 2026-10-21 because the session had no network access; confirm on Render's pricing page before buying):
  - one Render web service on the Starter instance, about $7 per month (always on; the free instance sleeps and is not usable for production), running the public site, the staff app and the Postgres job queue in one process, as today ([[INT-Render]]);
  - Render PostgreSQL on the smallest paid instance (Basic-256mb), about $6 per month plus storage at about $0.30 per GB per month; paid instances include point-in-time recovery for a few days (3 days on the Hobby workspace, per Render's documentation as known to Claude), and a nightly logical backup to Cloudflare R2 (within its free tier) gives longer recovery;
  - the Hobby workspace at $0.
- Fixed cost: about $13 to $15 per month, inside the owner's $50 per month limit (owner answer 2026-10-05T16:31). Usage costs come on top and are not fixed: Bird texts and A2P 10DLC fees, Resend beyond its free tier, R2 beyond its free tier, the domain renewal ([[OWN-DEC-184]]) and Square fees.
- ESTIMATE of recovery: data loss limited to minutes with point-in-time recovery inside its window, otherwise up to a day from the nightly backup; restore by hand within hours. Not a guarantee ([[HH-NFR-01]]).
- Production is created only when the owner approves phase 2 ([[OWN-DEC-191]]). Answers [[OQ-PRODUCTION-HOSTING]]. Built by [[TSK-0111]].
