---
id: OWN-DEC-73
type: decision
title: Whole staging behind an access gate for the owner and authorized testers
status: active
area: security
links:
  supersedes: ["[[OWN-DEC-58]]"]
  related: ["[[HH-AUD-05]]", "[[HH-SEC-01]]", "[[HH-NFR-02]]"]
  uses: ["[[INT-Render]]"]
  constrained_by: ["[[RULE-SYNTHETIC-DATA]]"]
source: "vault-own-decisions.md OWN-DEC-73; two-websites-owner-resolutions.md R10; project chat 2026-10-12"
---
Owner wording (project chat, 2026-10-12): "Restrict the entire staging environment to me and explicitly authorized testers using an access gate. Keep the forms enabled behind that gate. Protect submission APIs and file access too; hiding pages or removing public links is insufficient. Keep normal customer/staff authentication and permissions active inside staging. Let me test each role using separate test accounts. Use an isolated staging database, test records, sandbox payments, and test email/SMS destinations. No real charges or messages to customers. Keep staging separate from production. Allow only a minimal health-check endpoint to remain publicly reachable, with no private data. Exclude staging from search indexing as an additional measure. This replaces any earlier instruction to close the staging form."

Effect:
- An access gate sits in front of every staging route: both websites, the APIs, and file access. It is configured only outside production.
- Only a minimal health check stays public, with no private data.
- The forms stay enabled behind the gate; every implemented function stays available for the owner's manual tests.
- Normal customer and staff sign-in and permissions stay active inside staging, with separate test accounts per role. The gate is separate from staff login.
- Staging has its own database, test records, sandbox payments and test-only email and text destinations; no real charge or customer message.
- Staging stays out of search indexing as an extra measure.
