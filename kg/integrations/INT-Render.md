---
id: INT-Render
type: integration
title: Render - hosting
status: active
area: platform
links:
  decided_by: ["[[OWN-DEC-130]]"]
  constrained_by: ["[[RULE-SYNTHETIC-DATA]]"]
source: "OWN-DEC-130; old repo deployment"
---
The app runs as one Render web service with Render PostgreSQL.
- **Staging:** the existing `handyhub-staging` service (workspace tea-db1ds9lg1s2s739nqr00, service srv-db1e9uegekts73de36rg) is pointed at Bh3os/handyapp once the rebuild has a working core. Staging stays behind the access gate (ACCESS_GATE_USERS, set by the owner) and is hidden from search engines.
- **Secrets:** the owner sets every secret as a Render environment variable.
- **Database:** the free staging database expires on 2026-11-03 ([[OQ-PRODUCTION-HOSTING]]).
- **Production:** happens only on the owner's go decision ([[OQ-GO-DECISION]]).

**Changed by [[OWN-DEC-185]] (2026-10-21):** production: one Starter web service and the smallest paid Render Postgres with point-in-time recovery plus a nightly logical backup to R2; ESTIMATE about $13–15 per month fixed, prices to confirm on Render before buying; created only when the owner approves phase 2 ([[OWN-DEC-191]]).

**2026-10-22 ([[TSK-0106]], [[TSK-0111]]):** the staging database was recreated (render.yaml: `handyhub_staging_db_vdqz`); the coordinator reports that this free database expires on 2026-11-21 (the 2026-11-03 date above was the earlier database's). Runbooks: `docs/runbooks/` (release, outages, restore, go checklist). The container migrates at start, so older code never starts against a newer schema: a release with a migration is corrected forward, never rolled back. Restores are rehearsed in CI against a pg_dump and once on a disposable local database, not yet on Render.
