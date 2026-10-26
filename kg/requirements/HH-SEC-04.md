---
id: HH-SEC-04
type: requirement
title: Secrets kept out of bundles, source, URLs, logs, analytics, exports and error reports
status: active
priority: P0
area: security
links:
  constrained_by: ["[[RULE-SYNTHETIC-DATA]]", "[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[INT-Render]]", "[[INT-Bird]]", "[[INT-Resend]]", "[[INT-R2]]"]
  tested_by: ["[[T74]]", "[[T28]]"]
source: "guide 25.1"
---
- Secrets (provider keys, webhook signing secrets, database and storage credentials, session and code peppers) live only in the host's environment settings, set by the owner in Render ([[RULE-SYNTHETIC-DATA]]). They never appear in frontend bundles, source control, URLs after a link exchange, logs, analytics, exports, error reports or chat.
- Optional provider settings that are unset show the affected channel as not configured; the app never pretends a provider works.
- Development, staging and production are separate environments with separate credentials; sandbox and live credentials are never mixed. Staff and customer sessions cannot cross environments.
- A compromised credential is rotated through the provider's own controls.
- There is no publicly shared database or object-storage admin key.
- A secret scanner runs on every commit; secret-looking test values are built at runtime.

**Built by [[TSK-0109]] (2026-10-26):** the request log masks staff invite and reset tokens in paths, logged database errors lose the fields that quote statement values, the 404 answer echoes no query, and CI scans the built site, portal and staff bundles for secrets (`docs/security/review-2026.md` LINK-1, LOG-2, LOG-3, SEC-1).
