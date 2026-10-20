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
