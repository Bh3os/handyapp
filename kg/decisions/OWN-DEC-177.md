---
id: OWN-DEC-177
type: decision
title: "Provisional retention defaults for staff accounts, consent records, settings history, technical logs and expired links"
status: active
area: privacy
links:
  uses: ["[[FACT-RETENTION-SCHEDULE]]"]
  related: ["[[OWN-DEC-70]]", "[[HH-PRIV-01]]", "[[HH-DATA-09]]", "[[OQ-RETENTION-REVIEW]]"]
source: "owner answers 2026-10-21 R7-Q4"
---
Owner answer (round 7, question 4), option chosen "Proposed defaults (Recommended)", with security, privacy and retention refinements:

> Implement these provisional HandyHub retention policies:
>
> **1. Staff Accounts — 7 Years After Departure**
> - Immediately disable employee access when employment ends.
> - Revoke active sessions, credentials, and project permissions.
> - Retain only necessary historical staff identity, employment, authorization, and business records according to their applicable retention requirements.
> - Set 7 years after departure as the default retention-review threshold for staff account records, not permission to keep unnecessary personal information.
> - Preserve records under legal holds or longer applicable retention obligations.
>
> **2. Consent Records — 5 Years After Last Relevant Use**
> - Retain necessary proof of customer consent, its scope, source, timestamp, and withdrawal history.
> - Retain evidence needed to establish compliance for the applicable period.
> - Use 5 years as a provisional review threshold, subject to legal requirements.
> - Do not automatically delete consent evidence while the related permission is active or while a relevant claim or retention obligation remains.
> - Separate marketing consent from contractual acceptance and account-security verification records.
>
> **3. Settings and Content History**
> - Preserve historical settings, approved terms, pricing rules, and document/template versions for as long as retained business records depend on them.
> - Keep historical versions immutable when they form part of an accepted agreement or auditable decision.
> - Delete unreferenced historical configuration only after retention eligibility review.
> - Preserve links between historical records and the exact configuration versions used.
>
> **4. Technical Logs — 90 Days**
> - Retain ordinary application and diagnostic logs for 90 days by default.
> - Exclude credentials, authentication tokens, unnecessary personal information, and other secrets from logs.
> - Retain security-incident evidence longer when justified by an active investigation, legal hold, or applicable requirement.
> - Separate technical diagnostic logs from financial, contractual, security, and audit records that have longer retention periods.
>
> **5. Expired Sessions and Access Links — 30 Days**
> - Expire and revoke sessions and access links immediately according to their actual security expiration rules.
> - Never allow an expired token to authenticate a customer or employee.
> - Retain only minimal, non-reusable metadata for up to 30 days when needed for security investigations, abuse prevention, or troubleshooting.
> - Remove active token secrets and unnecessary sensitive values promptly when no longer needed.
> - Maintain secure revocation and replay protection.
>
> **6. Retention Automation**
> - Implement scheduled retention eligibility checks.
> - Never automatically delete records under legal holds.
> - Separate retention-review dates from final deletion authorization.
> - Allow authorized owner review of eligible records.
> - Maintain tamper-evident deletion and retention-operation audit records.
> - Handle backups, indexes, caches, and external providers according to documented deletion procedures.
> - Do not create indefinite retention merely because a related record references an otherwise unnecessary field.
>
> **7. Production Requirements**
> - Have the CPA and attorney confirm applicable record-retention periods before enabling irreversible production deletion.
> - Preserve existing approved retention rules for invoices, estimates, incidents, and other regulated or contractually important records.
> - Ensure the new defaults do not conflict with existing business-record retention requirements.
> - Test staff offboarding, consent withdrawal, expiration, legal holds, archival, and deletion eligibility in private staging.
>
> Implement these settings as configurable policies, not hardcoded values.
>
> Do not activate irreversible automatic deletion until retention requirements have been verified and approved.

Effect:
- Configurable, provisional retention policies ([[FACT-RETENTION-SCHEDULE]]): staff accounts 7 years after departure (a review threshold; access is disabled and sessions, credentials and permissions revoked at once on departure); consent records 5 years after the last relevant use (a review threshold; never deleted while the permission is active or a claim or obligation remains; marketing consent kept apart from contractual acceptance and security verification); settings and content history while retained records depend on them (immutable when part of an agreement or auditable decision; unreferenced history deleted only after review; links to the exact versions kept); technical logs 90 days (no credentials, tokens, unnecessary personal data or secrets; security evidence longer when justified; kept apart from financial, contractual, security and audit records); expired sessions and access links expire immediately under their security rules, with minimal non-reusable metadata kept up to 30 days and token secrets removed promptly.
- Automation: scheduled eligibility checks; legal holds always block; review dates are separate from deletion authorization; the Owner reviews eligible records; deletion and retention operations are tamper-evident; backups, indexes, caches and providers follow documented procedures; no indefinite retention just because another record references an unnecessary field.
- No irreversible automatic deletion until the CPA and the attorney confirm the periods ([[OQ-RETENTION-REVIEW]]); existing schedule rows stay as they are.
- Still without a period, NOT CONFIGURED and part of the CPA and attorney review: the access-code reveal log, action-queue items, unlinked inbound messages and their linking corrections, technical records other than logs (background jobs, outbox events, idempotency keys, unlinked webhook receipts), the deletion-review entries themselves, and the copies vendors keep (Bird, Resend, Cloudflare R2, Render backups). Customer accounts follow [[OWN-DEC-71]].
- Answers [[OQ-RETENTION-UNSCHEDULED]]. Built by [[TSK-0138]].
