---
id: OWN-DEC-176
type: decision
title: "Erasing a request that never became a job keeps only its reference, dates and final status"
status: active
area: privacy
links:
  uses: ["[[FACT-RETENTION-SCHEDULE]]"]
  related: ["[[OWN-DEC-70]]", "[[OWN-DEC-177]]", "[[HH-PRIV-08]]"]
source: "owner answers 2026-10-21 R7-Q3"
---
Owner answer (round 7, question 3), option chosen "Reference and dates only (Recommended)":

> Implement the following HandyHub retention and data-minimization policy for requests that never became jobs.
>
> **1. Retention period**
> - Retain unsuccessful or abandoned requests for up to 2 years under the approved retention schedule, unless an applicable legal hold or longer lawful retention requirement applies.
> - After 2 years, perform a retention eligibility check before processing the request.
>
> **2. Remove personal information**
> Delete the following when no other valid retention requirement applies:
> - Customer name
> - Email address and phone number
> - Property address
> - Job descriptions and answers
> - Uploaded photographs and attachments
> - Internal notes
> - Customer and staff conversations
> - Unnecessary request metadata containing personal information
> - Related temporary files and access tokens
>
> **3. Preserve minimal administrative history**
> Keep only:
> - Request reference number, if non-identifying
> - Creation date
> - Closure date
> - Final request status
> - Non-identifying retention-processing metadata where necessary
>
> Do not preserve any field that could reasonably identify the customer, directly or through combination with other available records, unless a separate lawful retention requirement applies.
>
> **4. Consent records**
> - Preserve consent evidence only for as long as required or justified by applicable law, compliance obligations, or active permissions.
> - Where identifiable consent evidence must remain, keep it in a separate restricted compliance record with its own retention deadline.
> - Never retain personal information indefinitely merely because it was once included in a consent record.
>
> **5. Security and deletion**
> - Remove personal data from applicable application databases, document storage, search indexes, and operational caches.
> - Revoke associated secure access links.
> - Prevent deleted information from reappearing through background jobs or stale indexes.
> - Handle backups according to the approved backup-retention and secure-expiration policy.
> - Log the retention action without reproducing deleted personal information.
>
> **6. Business reporting**
> - Preserve anonymous request statistics and conversion metrics.
> - Ensure archived records cannot be used to reconstruct deleted customer profiles.
> - Keep anonymized reporting separate from active customer records.
>
> **7. Owner controls**
> - Allow the Owner to review retention eligibility and applicable legal holds.
> - Prevent deletion of records under active legal holds.
> - Provide a clear retention-processing summary.
> - Never delete required financial, contractual, or legal records belonging to other projects.
>
> **8. Testing**
> Test retention eligibility, anonymization, attachment deletion, consent retention, cross-record references, legal holds, backup expiration, and audit integrity in private staging.
>
> Implement this policy consistently with the previously approved HandyHub privacy and retention requirements.

Effect:
- Requests that never became jobs are kept up to 2 years under the schedule ([[FACT-RETENTION-SCHEDULE]]), then a retention eligibility check (holds, longer obligations) comes before any processing; the Owner still confirms the deletion through the reviewed Delete action ([[OWN-DEC-70]]).
- Deleted when no other valid retention applies: name, email, phone, property address, job descriptions and answers, photos and attachments, internal notes, customer and staff conversations, unnecessary metadata with personal information, related temporary files and access tokens.
- Kept: the request reference (if non-identifying), creation date, closure date, final status and non-identifying retention metadata; nothing that could identify the customer alone or combined with other records.
- Consent evidence is kept only as long as required; identifiable evidence that must remain moves to a separate restricted compliance record with its own deadline ([[OWN-DEC-177]]).
- Removal covers databases, document storage, search indexes and caches; access links are revoked; deleted data cannot come back through jobs or stale indexes; backups follow the backup-retention policy; the retention log never reproduces deleted data.
- Anonymous request statistics and conversion metrics stay, kept apart and unable to rebuild a deleted profile. Records other projects need are never deleted.
- Answers [[OQ-RECORD-ERASURE]]; whether a reference-only remainder is acceptable goes to the attorney packet ([[OWN-DEC-186]]). Built by [[TSK-0137]].
