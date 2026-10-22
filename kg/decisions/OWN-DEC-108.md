---
id: OWN-DEC-108
type: decision
title: During work: job-specific SOP checklist, change orders, hazard pause
status: active
area: field
links:
  related: ["[[OWN-DEC-17]]", "[[OWN-DEC-68]]", "[[OWN-DEC-79]]", "[[OWN-DEC-80]]", "[[OWN-DEC-82]]", "[[OQ-SAFETY-REVIEW]]", "[[SOP-HI-01]]", "[[HH-PKT-03]]", "[[HH-WORK-01]]", "[[HH-WORK-02]]", "[[HH-WORK-04]]", "[[HH-WORK-05]]", "[[HH-WORK-07]]", "[[HH-WORK-09]]", "[[HH-CHG-01]]", "[[HH-CHG-02]]", "[[HH-CHG-03]]", "[[HH-CHG-04]]", "[[HH-INC-03]]", "[[OWN-DEC-168]]", "[[OWN-DEC-169]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-HUMAN-REVIEW]]"]
  uses: ["[[ENT-ChangeOrder]]", "[[ENT-Hold]]"]
source: "owner-answers-verbatim 2026-10-12T19:01:14.144Z [8 During]; decision-briefs 2026-10-12T19:02:18"
---
Partly replaced by [[OWN-DEC-168]], [[OWN-DEC-169]] (2026-10-21): change orders are valid 7 days and are the only way to change accepted work.

Owner, 2026-10-12, journey Step 8, during work.

Question asked:
> Step 8 - During work: the worker can't start until the Start Job gate passes (safety checklist, no critical hold). If they find something new, they create a change order (extra line, price, reason, photos). The customer approves or declines it in the project (same rules as the estimate: verified, typed name), or in person on the worker's phone with a signature. Work on the changed scope waits until it is approved. If a hazard is found, work stops, a critical hold is written, and the customer is told 'Work is paused for safety review' without technical details. OK?

Owner wording:
> Yes. Include a job-specific Standard Operating Procedure (SOP) checklist in the worker workflow:
>
> **Before starting**
> Show the approved scope, site information, hazards, safety checklist, tools, and materials. Start Work remains blocked until required checks pass and no critical hold remains.
>
> **After safety checks**
> Open the ordered checklist for that job’s selected services:
> 1. Site preparation and property protection.
> 2. Setup and required measurements/checks.
> 3. Service-specific work steps.
> 4. Quality checks at the appropriate stages.
> 5. Cleanup and waste handling.
> 6. Final checks, completion photos, and customer walkthrough.
>
> Each step shows what to do, the expected result, and any required photo, measurement, or note. Workers check off completed steps; progress is saved and resumes where they stopped. Required steps cannot be silently skipped.
>
> Use established service SOPs and applicable manufacturer instructions, adapted to the approved job. Provide English/Spanish staff content using the latest translation-review policy. Do not invent technical procedures for uncertain or hazardous work.
>
> **Changes and hazards**
> Workers may draft a change order with scope, price, reason, and evidence. Authorized staff publish it; the customer approves the exact version through verified project access or a customer-specific in-person approval flow. A signature alone must not substitute for identifying the authorized customer.
>
> Changed work waits for approval; unaffected safe, approved work may continue. A critical hazard stops affected work, creates a hold, and triggers appropriate escalation. The customer sees “Work is paused for safety review.” Resume requires documented resolution, updated instructions, and renewed safety checks.
>
> Implement, test, and publish the complete workflow on private staging.

Effect:
- Before starting the worker sees approved scope, site information, hazards, safety checklist, tools and materials. Start Work stays blocked until required checks pass and no critical hold remains ([[RULE-SAFETY-GATES]]).
- After the safety checks the ordered checklist for the job's services opens in the six stages above. Each step shows what to do, the expected result and any required photo, measurement or note; progress is saved (server and offline packet) and resumes where it stopped.
- Required steps cannot be skipped silently: a skip needs a reason, is visible to the reviewer and blocks completion when the step is mandatory.
- Checklist text comes only from the established SOPs in the vault, imported verbatim with source references ([[SOP-HI-01]] and the other SOP nodes), and applicable manufacturer instructions. No procedure is invented; a stage without an SOP step shows "No SOP step recorded for this stage — ask the office". Licensed-trade and hazardous work gets no procedure and routes to a hold ([[RULE-HUMAN-REVIEW]]). Until competent review ([[OWN-DEC-17]], [[OQ-SAFETY-REVIEW]]) staging shows a "Pending competent review" banner; production needs the reviewer sign-off.
- Spanish staff content follows the AI-reviewed translation policy ([[OWN-DEC-79]]).
- Change orders: a worker drafts scope, price in cents, reason and evidence; authorized staff publish; the customer approves the exact version through verified project access or an in-person flow that identifies the customer (for example a code to the verified contact). A signature alone never identifies the customer.
- Change-dependent steps wait for approval; unaffected safe approved work continues.
- A critical hazard stops the affected work and writes a critical hold in the same transaction as the report, under the job lock, then escalates ([[OWN-DEC-80]]). The customer sees only "Work is paused for safety review." Resuming needs a documented resolution, updated instructions and renewed safety checks (the gate passes again).

Links: uses [[ENT-ChangeOrder]], [[ENT-Hold]]; constrained by [[RULE-SAFETY-GATES]], [[RULE-HUMAN-REVIEW]].
