---
id: HH-SEC-07
type: requirement
title: Monitoring of security signals with alert volume a small team can handle
status: active
priority: P0
area: security
links:
  depends_on: ["[[HH-NFR-02]]"]
  uses: ["[[INT-Bird]]", "[[INT-Resend]]"]
  tested_by: ["[[T74]]"]
source: "guide 25.3"
---
- These produce monitoring signals: access denials, unusual verification attempts (many codes or contacts), repeated object-ID probing, privileged changes, suspicious or rejected uploads, and webhook signature or replay failures.
- Signals are grouped and thresholded so the alert volume suits the owner and two employees; important ones appear as exceptions in the owner's queue ([[HH-OPS-01]]).
- No claim of continuous staffed monitoring is made unless it is actually configured.

**Built by [[TSK-0109]] (2026-10-26):** a security-signals check on the Owner's system health screen counts, over the last 24 hours of the audit log, requests outside a customer's scope, wrong passwords and codes, and privileged changes, and needs attention at 20 denials or 30 failures (PROPOSED, [[OQ-SECURITY-REVIEW-DETAILS]]); webhook signature failures and staff permission refusals stay in the server log, and the screen says so. The exception in the owner's queue when a signal crosses its threshold is not built yet (PROPOSED follow-up). No staffed monitoring is claimed.
