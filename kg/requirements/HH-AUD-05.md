---
id: HH-AUD-05
type: requirement
title: Synthetic data and test destinations in development and staging; external actions only with authorization
status: active
priority: P0
area: platform
links:
  decided_by: ["[[OWN-DEC-22]]", "[[OWN-DEC-73]]", "[[OWN-DEC-16]]"]
  constrained_by: ["[[RULE-SYNTHETIC-DATA]]", "[[RULE-AI-WAVE2]]"]
  uses: ["[[INT-Bird]]", "[[INT-Resend]]", "[[INT-Square]]", "[[INT-Render]]"]
source: "guide 2.1, 27.1, 29.2, 30.3; OWN-DEC-22, OWN-DEC-73"
---
- Development, CI and staging use synthetic customers and records only ([[RULE-SYNTHETIC-DATA]]).
- No test, agent or automation sends a real customer message, performs a real charge or refund, publishes content to production or migrates production because a test needs it. Staging sends only to approved test email and phone destinations, and staging documents are marked TEST ([[OWN-DEC-126]]).
- The whole staging environment stays behind the access gate for the owner and authorized testers, with only a minimal health check public and no search indexing ([[OWN-DEC-73]]).
- Production deployment and real-customer contact happen only on the owner's go decision ([[OWN-DEC-22]]). Agents prepare release-ready changes and act externally only within the authorization actually given.
- No requirement authorizes a model to approve restricted work, publish legal terms, send customer messages or move money outside that authorization ([[OWN-DEC-16]]).
