---
id: HH-PRIV-01
type: requirement
title: "Data inventory, purpose and access classes, and the retention schedule"
status: active
priority: P0
area: privacy
links:
  decided_by: ["[[OWN-DEC-70]]", "[[OWN-DEC-123]]", "[[OWN-DEC-142]]", "[[OWN-DEC-143]]", "[[OWN-DEC-177]]", "[[OWN-DEC-201]]"]
  depends_on: ["[[HH-DATA-09]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]", "[[RULE-NO-INVENTED-FACTS]]", "[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[FACT-RETENTION-SCHEDULE]]", "[[ENT-RetentionReview]]", "[[ENT-AuditEvent]]", "[[INT-Render]]", "[[INT-R2]]", "[[INT-Bird]]", "[[INT-Resend]]", "[[INT-Square]]"]
  tested_by: ["[[T72]]", "[[T74]]"]
  part_of: ["[[S09]]", "[[S08]]"]
source: "guide 25.2 (inventory table) and HH-PRIV-01; OWN-DEC-70, OWN-DEC-123"
---
A data inventory lists every category with purpose, owner, retention trigger, period, holds, deletion or anonymization method, backup behaviour and vendor destinations (Render hosting and database, Cloudflare R2 files, Bird SMS, Resend email; Square is used outside the software).

Purpose and access classes (guide 25.2):

| Data class | Purpose | Allowed audience | Control requirement |
| --- | --- | --- | --- |
| Contact | Verification and service communication | The customer; relevant office roles | Verified values; channel and purpose preferences; protected exports |
| Service address | Qualification and work delivery | The authorized customer and operational staff | Collected when needed; confirmed per job |
| Interior and work photos | Estimation, evidence, quality | Role and project scope; customer-shared items only | Minimize faces, valuables and documents; metadata policy; separate marketing consent |
| Access secret | Site entry | Assigned staff with need during the visit | Protected field; expiry; never in messages, broad exports or caches |
| Estimate and approval | Scope and commercial commitment evidence | The authorized customer; estimating, operations and finance as needed | Exact version; retention and hold policy |
| Payment reference | Receipt and reconciliation | The authorized customer; finance; limited collection role | Minimal references; no card data |
| Incident | Response, follow-up, evidence | The Owner and the reporting worker; Office sees only the case status ([[OWN-DEC-143]]) | Minimal sensitive personal detail; legal or incident holds |
| Worker timestamps | Operations and the accountant's export | Owner | Employment and privacy policy; no customer visibility |
| Analytics | Reliability and task success | Authorized aggregate reporting | No free-form inputs, access secrets, photos or private IDs |
| Logs and audit | Reliability, integrity, accountability | Authorized technical and administrative scope | Redaction, controlled access, retention, tamper protection |

Retention:
- Periods per category come from [[FACT-RETENTION-SCHEDULE]] (configurable defaults the Owner may extend; longer legal, tax, insurance or contractual requirements override them). Audit records are kept 7 years ([[OWN-DEC-142]]); nothing is kept forever by default.
- Expired records enter the Owner's deletion-review queue ([[ENT-RetentionReview]]); nothing is deleted automatically.
- Before deletion the system checks for unresolved complaints, warranties, disputes, claims, investigations, unfiled tax returns, and legal or insurance holds; a hold blocks deletion of the record and its related evidence.
- There is no separate one-year contact-removal rule for lost requests.
- Regulated employee medical or exposure records are excluded from routine deletion and need a separate reviewed schedule (human review).
- Durations that are not in the schedule are never invented.

**Changed by [[OWN-DEC-177]], [[OWN-DEC-201]] (2026-10-21):** provisional periods for staff accounts, consent, history, logs and expired links; the table-to-retention mapping is reviewed before any production deletion.

**Built by [[TSK-0138]] (2026-10-26):** the five provisional values are active configuration; the daily review opens entries for disabled staff accounts, withdrawn consent histories and the expired sessions and links of each month; settings history is kept while referenced and technical logs are kept by the host, outside the database. Their Delete is not performed until the CPA and the attorney confirm the periods. PROPOSED details: [[OQ-RETENTION-DEFAULTS-DETAILS]].

**Built by [[TSK-0152]] (2026-10-26):** the table-to-retention mapping is a reviewed report (`docs/retention-mapping-review.md`: its digest, categories, tables and findings) with a live audit of the database on the Retention reviews screen; the Owner records each review with the CPA's and the attorney's confirmations, and production deletion stays disabled until the mapping in force is so reviewed. PROPOSED details: [[OQ-PRIVACY-REFINEMENT-DETAILS]].

**Limitation (process requirement; reviewer: CPA and attorney):** The retention periods are provisional until a CPA and an attorney confirm them ([[OQ-RETENTION-REVIEW]]).
