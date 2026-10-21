---
id: ENT-PolicyVersion
type: entity
title: "Policy and legal-document version"
status: active
area: platform
links:
  decided_by: ["[[OWN-DEC-122]]", "[[OWN-DEC-127]]", "[[OWN-DEC-72]]", "[[OWN-DEC-128]]"]
  constrained_by: ["[[RULE-DECIDED-VALUES-ACTIVE]]"]
source: "guide 22.1; vault 05 BusinessPolicyVersion; OWN-DEC-122"
---
A versioned value set for one policy key, or one legal document version.

**Keys:** deposit rule, estimate validity, tax mode, payment term (per project default), payment methods and instructions, contact hours, business time zone, reminder cadences, reopen period, visit fee, retention schedule, publishing permission, business details; legal documents: estimate terms, privacy notice, website terms, SMS terms, and the SMS opt-in disclosure shown beside the request-form checkbox (its version is recorded with each SMS opt-in, [[HH-INT-22]]).

**Fields:** key; values; version; status (active, superseded; legal documents also draft and owner review pending); decision cited; changed by; effective from; content hash for documents.

**Invariants:** decided values are seeded active citing the decision; no activation step blocks workflows; a new version never rewrites records that pinned an older one; missing facts stay missing.

**Who may change:** the Owner; every change is audited.
