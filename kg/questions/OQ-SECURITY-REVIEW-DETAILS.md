---
id: OQ-SECURITY-REVIEW-DETAILS
type: question
title: The security review details no decision gives (TSK-0109)
status: open
area: security
links:
  related: ["[[TSK-0109]]", "[[OWN-DEC-136]]", "[[HH-SEC-01]]", "[[HH-SEC-02]]", "[[HH-SEC-03]]", "[[HH-SEC-04]]", "[[HH-SEC-07]]", "[[OQ-AI-GUARDRAILS-DETAILS]]", "[[RULE-AI-WAVE2]]", "[[RULE-NO-INVENTED-FACTS]]"]
source: "TSK-0109 (2026-10-26): docs/security/review-2026.md, the AI security review before real customer data (OWN-DEC-136); the values and follow-ups below are PROPOSED"
---
**Question:** does the owner approve, or change, these PROPOSED values and follow-ups of the security review before real customer data ([[OWN-DEC-136]], `docs/security/review-2026.md`)?

- **Who answers:** the owner. The review was done by AI agents, as [[OWN-DEC-136]] decides; no human reviewer signed it and none is claimed.
- **PROPOSED, built (engineering values; no owner fact is invented):**
  - A server request waits at most 10 seconds for a free database connection, then fails (AVAIL-1).
  - `/readyz` keeps an "every migration applied" answer for the life of the process (AVAIL-2).
  - Production refuses to start without `PUBLIC_ORIGIN` and `STAFF_ORIGIN` (separate hosts, [[OWN-DEC-133]]) and without a measured `TRUST_PROXY_HOPS` (CONF-1, CONF-2). The value for Render is measured by the operator; it is not guessed here.
  - AI suggestion requests: 60 per staff member per hour across every use (AI-1). AI redaction adds Spanish code words (código, clave, contraseña, combinación, candado), a code a few words after its word, and street addresses written as a house number, capitalised words and a street type (AI-2, AI-3; [[OQ-AI-GUARDRAILS-DETAILS]]).
  - Security signals on the Owner's system health screen ([[HH-SEC-07]]): counted over the last 24 hours from the audit log; needs attention at 20 requests outside a customer's scope or 30 wrong passwords and codes; privileged changes (roles, account and authenticator changes, deposit waivers, reopen, refunds, exports, the launch phase) are counted, never an alert by themselves (MON-1).
- **PROPOSED follow-ups, not built (each a separate task):**
  - An exception item in the Owner's action queue when a security signal crosses its threshold ([[HH-SEC-07]], [[HH-OPS-01]]); today the health screen shows it (MON-1).
  - Move the staff invite and reset token from the link's path to its fragment (`/invite#<token>`), as the customer access link does: the token would then never reach Render's request logs or a link scanner's request; the app already removes it from the address bar and history and the server masks it in its own logs (P-6). It changes the operations command's output that 57 end-to-end specs read.
  - Open a write route's transaction after its rate limits and avoid a second pool connection inside it, so sustained parallel requests cannot hold every connection even for the 10-second wait (P-7).
  - Route the 27 routes marked AUTHENTICATION (customer account, organization and saved-property routes among them) through matrix actions decided by the policy, leaving the marker to sign-in, sign-out and the second factor (P-1).
  - Refuse an unsafe request that carries a session cookie but neither `Sec-Fetch-Site` nor `Origin`, or give customer sessions a CSRF token too (P-2); require a params schema with a UUID pattern for every `:id` path (P-3).
  - Strip location and camera metadata (EXIF, XMP) from photos before a copy is shared with a customer or downloaded for publication; originals stay unchanged as evidence (P-5).
  - Staging's log email sender writes whole messages (codes and links) to the staging log by design (TSK-0112): keep it until Resend is set up, then remove `EMAIL_PROVIDER=log` (P-4).
  - A `Permissions-Policy` header, an explicit request body limit, `includeSubDomains` for HSTS once the owner's DNS allows it, and no source maps in the production bundles (P-8, P-9, P-14).
- **Until answered:** the built values stay active as PROPOSED; the follow-ups are recorded residual risks in the review.
