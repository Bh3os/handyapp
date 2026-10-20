---
id: HH-ID-05
type: requirement
title: Access link landing shows nothing private before an explicit verified exchange
status: active
priority: P0
area: identity
links:
  decided_by: ["[[OWN-DEC-96]]"]
  depends_on: ["[[HH-ID-04]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-ProjectAccessGrant]]"]
  tested_by: ["[[T17]]"]
  part_of: ["[[C03]]", "[[C06]]"]
source: "guide 8.2 HH-ID-05"
---
- The `/access/...` landing page shows no scope, address, financial details or photos before verification and the exchange are complete.
- A GET request (for example from a link-preview crawler) never consumes a credential, never establishes a session and never approves anything.
- Completion is an explicit verified exchange (a POST with the one-time code) that creates a server-side, project-scoped session.
