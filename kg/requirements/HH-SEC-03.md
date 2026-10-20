---
id: HH-SEC-03
type: requirement
title: Injection-safe data access, output encoding, validated input, controlled uploads, rate limits, SSRF controls
status: active
priority: P0
area: security
links:
  decided_by: ["[[OWN-DEC-15]]", "[[OWN-DEC-62]]", "[[OWN-DEC-102]]"]
  constrained_by: ["[[RULE-AI-WAVE2]]"]
  uses: ["[[INT-R2]]"]
  tested_by: ["[[T10]]", "[[T14]]"]
source: "guide 25.1; OWN-DEC-15"
---
- All database access is parameterized; no string-built queries.
- Output is encoded for its context (HTML, attribute, URL, CSV, email); rich content is sanitized before display.
- Identifiers are validated (type and format) before use.
- Uploads go through controlled processing: type checked by content as well as extension, size limits, safe decoding, private storage, and quarantine or rejection of anything that fails ([[OWN-DEC-62]] for request photos, [[OWN-DEC-102]] for staff estimate documents). A file is never marked ready before processing finishes.
- Public and authentication endpoints are rate limited, including webhooks.
- Each service identity (database user, storage key, provider key) has the narrowest scope it needs.
- The server fetches no arbitrary URL without SSRF controls (allow-listed hosts, no internal addresses). Staff-entered links, such as the invoice's Square payment link, are validated (https and an allowed domain) but never fetched by the server.
- Customer attachments, messages and instructions are data: they are never executed as code or treated as commands to any automated or AI component ([[OWN-DEC-15]]).
