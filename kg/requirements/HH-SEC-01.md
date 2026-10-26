---
id: HH-SEC-01
type: requirement
title: Threat model mapped to server controls, negative tests, monitoring and residual risk
status: active
priority: P0
area: security
links:
  decided_by: ["[[OWN-DEC-114]]", "[[OWN-DEC-120]]", "[[OWN-DEC-121]]", "[[OWN-DEC-136]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  tested_by: ["[[T19]]", "[[T26]]", "[[T68]]"]
  related: ["[[HH-PRIV-01]]", "[[OWN-DEC-202]]"]
source: "guide 25.1"
---
A written threat model covers at least:
- guest project access (link and code exchange, expired or forwarded links);
- customer account linking and merges (shared contacts, mistaken links);
- cross-customer record access (altered IDs, search, downloads, caches);
- worker assignment (unassigned, reassigned or disabled workers);
- privileged finance and configuration actions;
- private media and uploads;
- inbound webhooks from Bird and Resend (forged, replayed or oversized calls, [[OWN-DEC-120]]);
- offline worker devices (lost phone, cached packet, [[OWN-DEC-121]]);
- exports;
- staff password sign-in with optional MFA ([[OWN-DEC-114]]).

Each material threat maps to a server control, a negative test, monitoring ([[HH-SEC-07]]) and its accepted residual risk.

Security review before real customer data ([[OWN-DEC-136]]): AI agents run a full multi-angle security review covering at least the threats above, and every finding is fixed. No human reviewer is required for go-live. The review, its findings and the fixes are recorded as release evidence. The data purpose and access inventory is in [[HH-PRIV-01]].

**Changed by [[OWN-DEC-202]] (2026-10-22):** staff password sign-in with mandatory MFA for every active staff account.

**Reviewed by [[TSK-0109]] (2026-10-26):** the threat model above is mapped to server controls, negative tests, monitoring and residual risk in `docs/security/review-2026.md`; the review was done by AI agents ([[OWN-DEC-136]]) and every finding is fixed or recorded as a PROPOSED item in [[OQ-SECURITY-REVIEW-DETAILS]].
