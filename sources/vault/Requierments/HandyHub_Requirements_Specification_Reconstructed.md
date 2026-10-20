---
title: "HandyHub Software & Operations Requirements Specification (Reconstructed)"
doc_id: HH-REQ-SPEC
status: baseline-draft
authority: "Primary software/operations requirements baseline; owner approval pending"
owner_domain: "Product requirements (swe-architecture with business owner)"
last_reviewed: 2026-10-03
related:
  - "AI Development Plans/03-requirements-traceability-matrix.md"
  - "AI Development Plans/04-service-registry.md"
  - "AI Development Plans/02-gap-analysis.md"
---

> **Document control (added 2026-10-03):** This specification is the requirements baseline used by the [AI Development Plans control center](../AI%20Development%20Plans/README.md). Requirement text below is unchanged; only traceability ID keys (after tables/lists and service cards), repository file links and Appendices C–D were added. Known contradictions and gaps are tracked in [02 Gap analysis](../AI%20Development%20Plans/02-gap-analysis.md); traceability in [03 RTM](../AI%20Development%20Plans/03-requirements-traceability-matrix.md).

**HANDYHUB**

**Software & Operations Requirements Specification**

*Reconstructed master requirements from the “Handyman Business Expertise Roles” workflow*

| **Field**              | **Baseline**                                                                                                                                                             |
|------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Business               | HandyHub                                                                                                                                                                 |
| Website                | handyhub247.com                                                                                                                                                          |
| Launch market          | Kentuckiana — Kentucky and Indiana                                                                                                                                       |
| Languages              | English and Spanish                                                                                                                                                      |
| Pricing floor          | \$150 minimum job value                                                                                                                                                  |
| Initial staffing       | 2 employees; subcontractors may be added later                                                                                                                           |
| Deposits               | Required only for larger jobs according to an admin-configured threshold/policy                                                                                          |
| Invoices & payments    | Electronic invoices; cash and checks accepted; system must record all payment methods                                                                                    |
| Implementation posture | Designed for implementation by an AI coding agent; requirements must be explicit, testable, permission-aware, and traceable                                              |
| Document status        | Reconstructed from recovered prior-chat requirements and the original service-source files; not represented as a byte-for-byte copy of the unavailable prior attachment. |

**Core design principle**

A worker must never arrive at a job without the information, safety guidance, approved scope, tools, materials, and escalation path required to perform the work professionally. The Start Job experience is therefore treated as an operational control, not merely a timer button.

# Document map

- 1\. Purpose, scope, assumptions and requirement language

- 2\. Users, roles and permission model

- 3\. Product modules and system boundaries

- 4\. Customer journey and lead-to-job workflow

- 5\. Estimating, pricing, deposits, invoicing and payments

- 6\. Scheduling, dispatch and arrival management

- 7\. Worker Start Job Operational Briefing — mandatory

- 8\. In-job execution, change orders, incidents and communications

- 9\. Quality control, completion, closeout and follow-up

- 10\. Documents, photos, records and audit trail

- 11\. Notifications, bilingual experience and customer communications

- 12\. AI business roles and human-review boundaries

- 13\. Engineering, operations, security and privacy ownership

- 14\. Data model and state machines

- 15\. Non-functional requirements

- 16\. Reporting and management dashboards

- 17\. Service catalog — 26 detailed service cards

- 18\. Acceptance criteria — 60 end-to-end tests

- 19\. Release readiness and implementation handoff

# 1. Purpose, scope, assumptions and requirement language

This specification defines the customer-facing website/application, internal operations workspace, worker field experience, administrative controls, records, automation, and AI-assisted business functions required to operate HandyHub as a professional field-service business. The intent is to remove ambiguity for implementation and to make every important workflow testable.

## 1.1 Fixed business assumptions

- HandyHub serves Kentuckiana across Kentucky and Indiana; serviceability must be determined by configured coverage rules rather than by a hard-coded city list.

- The customer experience must support English and Spanish, including forms, job communications, worker/customer-facing notices, and standard document templates where translations are available.

- A \$150 minimum applies to jobs unless an authorized administrator changes the business rule. The system must surface the minimum before a customer commits to booking or paying.

- Pricing is project-specific and follows estimating standards rather than a single flat-price catalog. The system must preserve estimate inputs, assumptions, quantities, labor, materials, fees, discounts, taxes if applicable, and approval history.

- The initial field team is two employees. The data model and permissions must scale to subcontractors later without redesigning core jobs, scheduling, documentation, or audit history.

- Deposits are for larger jobs only. The threshold, percentage or fixed amount, exceptions, refund/cancellation treatment, and approval authority must be configurable by an administrator.

- Invoices are electronic. Cash and check payments are also accepted and must be recorded with date, collector, amount, reference/memo, receipt, and reconciliation status.

- Launch is intended as soon as practical. Requirements therefore distinguish launch-critical capabilities from later optimization while preserving a scalable architecture.

**Traceability IDs (added 2026-10-03; row text unchanged — see [03 Requirements traceability matrix](../AI%20Development%20Plans/03-requirements-traceability-matrix.md)):** BIZ-001 HandyHub serves Kentuckiana across Kentucky and Indiana;... · BIZ-002 The customer experience must support English and Spanish,... · BIZ-003 A \$150 minimum applies to jobs unless an authorized admin... · BIZ-004 Pricing is project-specific and follows estimating standa... · BIZ-005 The initial field team is two employees. The data model a... · BIZ-006 Deposits are for larger jobs only. The threshold, percent... · BIZ-007 Invoices are electronic. Cash and check payments are also... · BIZ-008 Launch is intended as soon as practical. Requirements the...

## 1.2 Requirement language and priority

| **Term**      | **Meaning**                                                                                                           |
|---------------|-----------------------------------------------------------------------------------------------------------------------|
| MUST          | Required for release or for the described feature to be considered complete.                                          |
| SHOULD        | Expected unless there is a documented technical/business reason to defer.                                             |
| MAY           | Optional enhancement that must not break required flows.                                                              |
| BLOCKING GATE | The system prevents progression until a required condition is satisfied or an authorized override is recorded.        |
| HUMAN REVIEW  | AI or automation may prepare/recommend, but a designated person must approve before the action becomes authoritative. |

# 2. Users, roles and permission model

| **Role**                       | **Required access boundary**                                                                                                                                                           |
|--------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Guest / Prospect               | Browse services, service area, trust information, submit inquiry/estimate request; cannot view private job data.                                                                       |
| Customer                       | View own estimates, approvals, appointments, messages, invoices, payments, photos/documents explicitly shared with them; cannot view internal notes or other customers.                |
| Worker / Employee              | View assigned jobs and required operational data; create field documentation; cannot change financial policy, delete audit records, or view unrelated customer records.                |
| Lead Worker / Field Supervisor | Worker rights plus approved field overrides, quality checks, incident escalation, team coordination and limited change-order preparation.                                              |
| Dispatcher / Scheduler         | Manage assignments, availability, arrival windows, routing notes, job readiness, rescheduling and customer notifications.                                                              |
| Estimator                      | Manage estimate inputs, measurements, pricing drivers, scope, exclusions, alternates and revisions subject to pricing permissions.                                                     |
| Customer Service               | Manage leads, customer communications, complaints, follow-ups and non-financial job coordination.                                                                                      |
| Bookkeeper / Accounting        | Invoices, payments, cash/check reconciliation, deposits, receivables, vendor/subcontractor records and accounting exports; no unrestricted field-data access unless needed.            |
| Administrator / Owner          | Full operational administration, policy configuration, user/role management, exception approvals, reporting and audit access.                                                          |
| Subcontractor (future)         | Only assigned work package, approved site briefing, required safety/SOP/material information, submission of field evidence and limited messaging; no broad customer/accounting access. |
| AI Assistant Role              | Role-scoped advisory/automation identity. Must never gain permissions merely because it can generate text; access is limited by the human role and task policy invoking it.            |

**Traceability IDs (added 2026-10-03; row text unchanged — see [03 Requirements traceability matrix](../AI%20Development%20Plans/03-requirements-traceability-matrix.md)):** ROLE-001 Guest / Prospect · ROLE-002 Customer · ROLE-003 Worker / Employee · ROLE-004 Lead Worker / Field Supervisor · ROLE-005 Dispatcher / Scheduler · ROLE-006 Estimator · ROLE-007 Customer Service · ROLE-008 Bookkeeper / Accounting · ROLE-009 Administrator / Owner · ROLE-010 Subcontractor (future) · ROLE-011 AI Assistant Role

## 2.1 Permission requirements

**PERM-001 — Least privilege.** Every user receives only the permissions necessary for assigned duties. Role membership and exceptions must be auditable.

**PERM-002 — Job-scoped field access.** Workers and subcontractors see only jobs assigned to them or explicitly shared for operational reasons.

**PERM-003 — Sensitive-note separation.** Internal risk, payment, complaint, employee, legal, and fraud notes must be separated from customer-visible notes.

**PERM-004 — Financial controls.** Only authorized roles can alter price, discount, tax, deposit, refund, write-off, or payment status.

**PERM-005 — Deletion controls.** Operational records, signed approvals, invoices, payments, safety acknowledgements, incidents, and audit events must use retention/void/supersede patterns instead of silent deletion.

**PERM-006 — Override controls.** Where a blocking gate can be overridden, the system must capture who overrode it, why, when, and the pre-override state.

**PERM-007 — Language independence.** Changing display language must not change the underlying canonical job data, status, amounts, or approvals.

# 3. Product modules and system boundaries

| **Module**            | **Required capability**                                                                                                                                           |
|-----------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Public website        | Services, service-area explanation, trust/credibility, bilingual content, contact/estimate request, accessibility, privacy/consent.                               |
| Lead intake / CRM     | Lead source, contact, service, property, urgency, photos, notes, qualification, follow-up and conversion.                                                         |
| Estimate workspace    | Scope, measurements, pricing drivers, material/labor assumptions, exclusions, options, approval, revision history and conversion to job.                          |
| Scheduling & dispatch | Availability, assignment, arrival windows, readiness, travel/route context, rescheduling, cancellations and notifications.                                        |
| Job operations        | Job record, site briefing, Start Job gate, time/progress, tasks, photos, materials, incidents, changes, QA and completion.                                        |
| Customer portal       | Estimate approval, appointment details, messages, shared documents/photos, invoices, payments, receipts and completion acknowledgement.                           |
| Documents & records   | Estimate, work authorization, change order, invoice, receipt, safety/incident records, photo evidence and audit log.                                              |
| Finance operations    | Deposits, invoices, payments, cash/check tracking, A/R status, job costing inputs, exports and reconciliation.                                                    |
| AI role workspace     | Role-specific recommendations/drafts with evidence, confidence/unknowns, permission boundaries and human approval gates.                                          |
| Administration        | Service catalog, SOPs, hazard templates, pricing rules, service area, users/roles, notification templates, language content and business policies.                |
| Reporting             | Lead funnel, estimate conversion, schedule utilization, job profitability inputs, rework, incidents, receivables, customer experience and operational exceptions. |

**Traceability IDs (added 2026-10-03; row text unchanged — see [03 Requirements traceability matrix](../AI%20Development%20Plans/03-requirements-traceability-matrix.md)):** MOD-001 Public website · MOD-002 Lead intake / CRM · MOD-003 Estimate workspace · MOD-004 Scheduling & dispatch · MOD-005 Job operations · MOD-006 Customer portal · MOD-007 Documents & records · MOD-008 Finance operations · MOD-009 AI role workspace · MOD-010 Administration · MOD-011 Reporting

# 4. Customer journey and lead-to-job workflow

| **Stage**       | **Definition of done**                                                                                                                                 |
|-----------------|--------------------------------------------------------------------------------------------------------------------------------------------------------|
| Discover        | Customer understands what HandyHub does, service area, minimum job amount, how estimates work, and the next action.                                    |
| Request         | Customer submits contact information, service category, property address/area, description, preferred timing, photos/files and consent.                |
| Qualify         | System/admin checks serviceability, scope fit, urgent/safety concerns, information completeness and whether site visit/remote estimate is appropriate. |
| Estimate        | Estimator creates documented scope, assumptions, exclusions, pricing and options; customer receives a versioned estimate.                              |
| Approve         | Customer accepts estimate/work authorization. System records timestamp, version, identity and any required deposit.                                    |
| Prepare         | Job is created; schedule, worker, SOP, hazards, tools/materials and customer/site details are assembled and readiness-checked.                         |
| Execute         | Worker uses Start Job briefing, documents arrival/condition, performs approved work, records changes/incidents/materials and communicates exceptions.  |
| Quality & close | Worker completes QA, cleanup, before/after evidence and customer walkthrough; final invoice is issued and payment tracked.                             |
| Follow-up       | Receipt, care/warranty guidance if applicable, feedback request, complaint/rework workflow and accounting closeout.                                    |

**Traceability IDs (added 2026-10-03; row text unchanged — see [03 Requirements traceability matrix](../AI%20Development%20Plans/03-requirements-traceability-matrix.md)):** STG-001 Discover · STG-002 Request · STG-003 Qualify · STG-004 Estimate · STG-005 Approve · STG-006 Prepare · STG-007 Execute · STG-008 Quality & close · STG-009 Follow-up

**CX-001 — Service minimum disclosure.** Before a lead is converted to a booked job, the customer must be informed that the normal minimum job value is \$150, with any authorized exception clearly documented.

**CX-002 — No false booking confirmation.** An inquiry is not a confirmed appointment until the system records a scheduled date/window and sends confirmation.

**CX-003 — Versioned approvals.** An approval applies to a specific estimate/change-order version. Later material changes require a new approval.

**CX-004 — Customer-visible scope.** The customer portal must show the approved scope and relevant exclusions in plain language.

**CX-005 — Property profile reuse.** Repeat customers may reuse property/site information, but every new job must confirm that access, occupants, pets, parking, hazards and work-area conditions are still current.

**CX-006 — Cancellation/reschedule record.** Cancellations and reschedules must retain prior schedule history, reason, actor and customer notification result.

**CX-007 — Complaint to rework linkage.** Any complaint or return visit must link to the original job and identify whether it is warranty, workmanship rework, new scope or customer-caused condition.

# 5. Estimating, pricing, deposits, invoicing and payments

## 5.1 Estimate record

**EST-001 — Estimate requirement.** Estimate number, customer, property, service(s), date, preparer and expiration/validity policy.

**EST-002 — Estimate requirement.** Detailed scope by line/work package; quantities/measurements when relevant; labor assumption; material allowance or named materials; equipment/rental/disposal/travel/other charges when used.

**EST-003 — Estimate requirement.** Explicit exclusions, customer responsibilities, access assumptions, concealed-condition assumptions, schedule assumptions and permit/licensing dependencies when applicable.

**EST-004 — Estimate requirement.** Price subtotal, discounts with authorization, tax treatment when applicable, minimum-job adjustment if needed, deposit rule, total, and payment schedule.

**EST-005 — Estimate requirement.** Options/alternates must be separately identifiable so acceptance is unambiguous.

**EST-006 — Estimate requirement.** Every revision must preserve the prior version and the reason for change.

**EST-007 — Estimate requirement.** Converted jobs must retain the approved estimate snapshot even if catalog/pricing rules later change.

## 5.2 Payments and financial controls

**FIN-001 — Minimum job control.** If calculated work is below \$150, the estimate must either apply the minimum or record an authorized exception. The customer-facing total must never silently change after approval.

**FIN-002 — Deposit policy.** Deposits apply only to larger jobs according to configurable policy. The system must not assume every job requires a deposit.

**FIN-003 — Electronic invoice.** A final or progress invoice must be generated electronically with line items, prior payments/deposits, balance, due date/policy, and payment instructions.

**FIN-004 — Cash receipt.** Cash collection requires collector, amount, date/time, job/invoice, receipt number, optional note and reconciliation status. A customer receipt must be available.

**FIN-005 — Check receipt.** Check collection requires collector, amount, date/time, job/invoice, check/reference number, payer name if needed, optional photo/reference subject to privacy controls, deposit/reconciliation status, and receipt.

**FIN-006 — No silent payment edits.** Changes to recorded payments must be corrected by auditable adjustment/void/reversal, not by overwriting history.

**FIN-007 — Job costing separation.** Customer price and internal job cost are separate. Workers should see required material quantities and approved purchasing limits without automatically seeing margins unless their role permits it.

**FIN-008 — Change order before extra work.** Material additional scope that changes price or approved deliverables must use a change order or documented emergency/exception approval before work proceeds, except immediate safety stabilization as allowed by policy.

# 6. Scheduling, dispatch and arrival management

**SCH-001 — Readiness before scheduling.** A job may be tentatively scheduled before all preparation is complete, but dispatch must visibly flag missing prerequisites such as deposit, materials, permit/approval, customer access confirmation, SOP or worker qualification.

**SCH-002 — Assignment.** Each scheduled job records assigned worker(s), lead worker, date, arrival window, expected duration, preparation time if applicable, and dependencies.

**SCH-003 — Worker availability.** Scheduling must prevent or warn on overlapping assignments and respect configured working hours, approved time off and worker capability/qualification tags.

**SCH-004 — Travel context.** The worker view must provide address and a directions handoff plus parking/access notes; exact geolocation tracking is not required unless separately approved.

**SCH-005 — Day-of confirmation.** System should support customer reminder/confirmation and a dispatcher view of unconfirmed, rescheduled, blocked or late jobs.

**SCH-006 — En route / arrived.** Workers can set en-route and arrived statuses. Customer notifications must use configured templates and avoid exposing private worker information beyond policy.

**SCH-007 — Delay handling.** If delayed, worker/dispatcher can update ETA/window, capture reason and notify the customer while preserving the original schedule.

**SCH-008 — No-start condition.** If the site is inaccessible, unsafe, materially different, customer absent where required, or prerequisites are missing, the worker can record No Start/Blocked with evidence and escalation rather than forcing job start.

# 7. Worker Start Job Operational Briefing — mandatory

**This is a launch-critical feature. Selecting an assigned job must present a field-ready briefing that answers, before work begins: Where am I going? Who is expecting me? What exactly is approved? What can hurt me or others? What must I check? What tools and materials do I need? What SOP applies? What would make me stop and escalate? What evidence must I capture?**

## 7.1 Briefing sections displayed to the worker

| **Briefing section**    | **Required content**                                                                                                                                                                                                                                                                |
|-------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Job identity            | Job number, service(s), customer name, work address, scheduled window, estimated duration, assigned team/lead, current status.                                                                                                                                                      |
| Arrival & access        | Primary site contact, approved phone/messaging method, gate/parking/loading information, lockbox/access instructions, building/unit, elevator/loading restrictions, security/HOA notes, access hours, pets, children/occupants, bathroom/water/electric availability when relevant. |
| Property/site profile   | Property type; approximate age if known; occupied/vacant; known wall/ceiling/floor/exterior substrates; prior damage/moisture; utilities; work-area constraints; photos/maps/sketches; customer-provided information clearly labeled as such.                                       |
| Approved scope          | Exact tasks, rooms/areas, quantities, selected options, inclusions, exclusions, customer responsibilities, estimate version, change orders, special finish/color/model details.                                                                                                     |
| Customer expectations   | Priority outcome, finish preference, items to protect, noise/dust sensitivity, pets/occupancy plan, access limits, requested communication cadence, cleanup expectation and any approved special instructions.                                                                      |
| SOP                     | Service-specific approved SOP version with pre-work, setup, execution, quality checks, cleanup and closeout steps. Worker can open the full SOP and a condensed field checklist.                                                                                                    |
| Hazards                 | Pre-identified hazards from service template + site-specific hazards from intake/estimate/previous visits. Each hazard shows severity, control, PPE, stop-work trigger and escalation path.                                                                                         |
| Safety guidance         | Required PPE; ladder/scaffold/height controls; electrical/water/gas isolation; ventilation/respiratory/dust controls; chemical/SDS references; manual handling; occupant protection; weather/temperature conditions; prohibited actions.                                            |
| Tools & equipment       | Required tool checklist, optional tools, equipment/rental items, charged-battery/consumable checks, ladder/access equipment, containment/cleanup equipment, special calibration/test devices.                                                                                       |
| Materials & consumables | Required materials by item/quantity/size/color/model/specification; who supplies them; loaded/verified status; substitutions allowed/not allowed; customer-supplied item condition check; expected waste/extra allowance if defined.                                                |
| Documents & approvals   | Approved estimate/work authorization, deposit status when applicable, permit/license/inspection dependency status, change orders, customer photos, product instructions, drawings and any safety/technical documents.                                                               |
| Pre-start evidence      | Required arrival photo(s), existing-condition photos, damage notes, floor/wall protection setup, serial/model verification for installed customer products, measurement confirmation and customer acknowledgement when needed.                                                      |
| Emergency & escalation  | Dispatcher/owner contact, incident reporting button, stop-work button, emergency-services reminder, utility shutoff location if known and relevant, customer-not-home/inaccessible path, unexpected condition path.                                                                 |
| Closeout preview        | Required QA checks, after photos, cleanup checklist, material return/waste handling, customer walkthrough/signature, invoice/payment handoff and follow-up items so the worker knows the end-state before starting.                                                                 |

**Traceability IDs (added 2026-10-03; row text unchanged — see [03 Requirements traceability matrix](../AI%20Development%20Plans/03-requirements-traceability-matrix.md)):** BRF-001 Job identity · BRF-002 Arrival & access · BRF-003 Property/site profile · BRF-004 Approved scope · BRF-005 Customer expectations · BRF-006 SOP · BRF-007 Hazards · BRF-008 Safety guidance · BRF-009 Tools & equipment · BRF-010 Materials & consumables · BRF-011 Documents & approvals · BRF-012 Pre-start evidence · BRF-013 Emergency & escalation · BRF-014 Closeout preview

## 7.2 Start Job gating logic

**START-001 — Assigned worker only.** Start Job is available only to an authorized assigned worker/lead or an authorized supervisor override.

**START-002 — Briefing freshness.** The worker must see a “last updated” time and changes made after the worker last viewed the briefing must be highlighted.

**START-003 — Scope acknowledgement.** Worker acknowledges the current approved scope and exclusions. This is not a legal waiver; it is an operational confirmation that the correct work package is being opened.

**START-004 — Safety acknowledgement.** Worker confirms review of listed hazards, controls, PPE and stop-work conditions. High-risk service/site flags may require separate checkboxes or supervisor confirmation.

**START-005 — Tools readiness.** Critical tools/equipment must be marked loaded/available or the worker must record an exception and resolution before starting.

**START-006 — Materials readiness.** Critical materials must be marked available and matched to the job. Missing material may block start when the job cannot be performed safely/competently without it.

**START-007 — Pre-start site check.** Worker confirms actual site conditions match the briefing or records differences. Material differences trigger Risk Triage and/or supervisor review.

**START-008 — Required photos.** If the service requires arrival/existing-condition photos, the system blocks start until captured or an authorized reason is recorded.

**START-009 — Customer-supplied products.** Worker records visible condition/model/quantity before installation or service when liability depends on customer-supplied items.

**START-010 — Permit/license/qualification flags.** Where admin policy marks a job as requiring permit, licensed trade, certified task or special qualification, Start Job must be blocked unless prerequisite status is approved.

**START-011 — Stop-work clarity.** The screen must prominently state that a worker can stop and escalate for unsafe conditions, concealed damage, suspect hazardous materials, unapproved electrical/plumbing/gas/structural scope, aggressive occupants/animals, severe weather or any material mismatch.

**START-012 — Offline field access.** The latest authorized briefing, SOP/checklist, key job data and emergency/escalation contacts should remain available if mobile connectivity drops; changes made offline must sync with conflict handling.

**START-013 — Language support.** Worker may view the briefing in English or Spanish where translations exist; version identifiers and critical numeric/specification data must remain consistent.

**START-014 — Start event.** On successful start, system records worker, timestamp, job version/briefing version, acknowledgements and any exceptions. It may begin the work timer according to timekeeping policy.

**START-015 — No blind start.** There must be no shortcut that starts a job from a notification or list row without opening the briefing/checklist first, unless an admin-configured low-risk exception flow is intentionally enabled and audited.

## 7.3 Professional usability enhancements

- “Ready / Needs Attention / Blocked” banner summarizing job readiness with the exact missing items.

- One-tap call/message to the approved site contact and one-tap escalation to dispatcher/owner.

- “What changed?” panel for scope, schedule, materials, hazards, customer instructions or access changes made since last worker review.

- Persistent “Stop Work / Report Hazard” control accessible during the job, not hidden inside settings.

- Loadout mode that groups tools/materials by truck/shop/customer-supplied/rental and allows scan/check-off before departure.

- Photo prompts tied to workflow moments (arrival, protection, concealed condition, progress, completion) rather than a single undifferentiated gallery.

- Large-button, glove-friendly mobile layout with minimal typing and voice-to-note support where privacy policy permits.

- Automatic draft of customer arrival/completion updates, but worker/admin controls the actual send according to policy.

- Resume card after interruption showing the last completed SOP/task step and unresolved exception items.

- Worker-facing “Do not perform” list for out-of-scope, prohibited or licensed/permit-dependent work.

**Traceability IDs (added 2026-10-03; row text unchanged — see [03 Requirements traceability matrix](../AI%20Development%20Plans/03-requirements-traceability-matrix.md)):** UXE-001 “Ready / Needs Attention / Blocked” banner summarizing jo... · UXE-002 One-tap call/message to the approved site contact and one... · UXE-003 “What changed?” panel for scope, schedule, materials, haz... · UXE-004 Persistent “Stop Work / Report Hazard” control accessible... · UXE-005 Loadout mode that groups tools/materials by truck/shop/cu... · UXE-006 Photo prompts tied to workflow moments (arrival, protecti... · UXE-007 Large-button, glove-friendly mobile layout with minimal t... · UXE-008 Automatic draft of customer arrival/completion updates, b... · UXE-009 Resume card after interruption showing the last completed... · UXE-010 Worker-facing “Do not perform” list for out-of-scope, pro...

# 8. In-job execution, change orders, incidents and communications

**JOB-001 — Task checklist.** Job work may be broken into ordered tasks. Completion status must not erase notes, photos, measurements or exceptions associated with the task.

**JOB-002 — Time events.** System supports start/pause/resume/complete work events; policy determines whether travel, breaks and preparation are separately tracked.

**JOB-003 — Progress evidence.** Workers can attach photos, measurements, notes and material usage to a task or job milestone.

**JOB-004 — Unexpected condition.** Worker can record concealed damage, substrate failure, moisture, hazardous-material suspicion, access issue, missing customer-supplied item or other condition with photos and severity.

**JOB-005 — Change-order request.** Worker can propose additional work but cannot unilaterally bind the customer unless role/policy explicitly permits. Price/scope changes require recorded approval.

**JOB-006 — Emergency stabilization.** Policy may allow minimal action necessary to prevent immediate injury or property damage; the worker records why it was necessary and what was done, with prompt supervisor/customer notification.

**JOB-007 — Material substitution.** Any substitution affecting appearance, specification, warranty, safety, cost or customer expectation requires approval according to policy.

**JOB-008 — Incident reporting.** Injury, property damage, near miss, customer conflict, tool/equipment failure and suspected hazardous-material exposure must have a structured incident form and escalation.

**JOB-009 — Customer communication log.** Job-related calls/messages/notes that affect scope, access, timing, approval or dispute must be logged or summarized in the job record.

**JOB-010 — Scope protection.** The worker interface must continually distinguish approved work, optional/unapproved requests and prohibited/out-of-scope work to reduce scope creep.

**JOB-011 — Reassignment/handoff.** If a worker changes mid-job, the new worker receives unresolved tasks, open hazards, changes, materials status and prior evidence before resuming.

**JOB-012 — Supervisor review queue.** High-risk exceptions, incidents, unresolved quality failures, major change orders and blocked jobs appear in an owner/supervisor action queue.

# 9. Quality control, completion, closeout and follow-up

**QA-001 — Service-specific QA.** Each service card defines observable completion checks. Worker cannot mark complete without answering required checks or recording an exception.

**QA-002 — Cleanup.** Completion includes cleanup, debris/waste handling and removal of protection/containment as appropriate. Cleanup photos may be required for dusty/dirty services.

**QA-003 — After photos.** Required completion photos must be mapped to work areas or tasks, not merely uploaded without context.

**QA-004 — Customer walkthrough.** Where a customer/representative is present, worker records walkthrough outcome: accepted, accepted with punch items, unavailable, or disputed.

**QA-005 — Punch list.** Open punch items remain linked to the job with owner, due date and completion evidence. They cannot disappear when an invoice is issued.

**QA-006 — Invoice readiness.** System checks approved estimate/change orders, deposits/payments, completion status and unresolved financial exceptions before final invoice issuance.

**QA-007 — Payment capture.** Worker may record allowed payment methods according to role; cash/check require receipt workflow and later reconciliation.

**QA-008 — Care/warranty notes.** When service/material requires care instructions, cure time, inspection interval or warranty information, the customer receives the applicable template or custom note.

**QA-009 — Feedback.** Follow-up request should occur after completion according to configured timing and must not interfere with unresolved complaint/rework cases.

**QA-010 — Rework classification.** Return work is classified as warranty/workmanship, incomplete punch, new scope, customer damage/change, manufacturer/product issue or other reason for accurate operations and costing.

**QA-011 — Closeout lock.** After financial and operational closeout, material edits to scope, approvals or payments require an auditable correction process.

**QA-012 — Lessons learned.** Owner/Quality Assistant can tag recurring defect, hazard, estimate miss, material miss or process issue for SOP/service-card improvement.

# 10. Documents, photos, records and audit trail

| **Record**            | **Minimum contents**                                                                                                                                            |
|-----------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Lead/request record   | Original submission, consent, source and attachments.                                                                                                           |
| Estimate & revisions  | Every version, approval/rejection, expiration and conversion reference.                                                                                         |
| Work authorization    | Approved scope snapshot and customer acknowledgement/authorization mechanism.                                                                                   |
| Change orders         | Scope/price delta, reason, author, customer approval, date/time and job linkage.                                                                                |
| Job briefing snapshot | Briefing/SOP/hazard/tool/material versions acknowledged at job start.                                                                                           |
| Photos/files          | Timestamp, uploader, job/task/area label, customer-visible/internal classification, caption and retention status.                                               |
| Safety/incident       | Hazards, acknowledgements, stop-work events, incident details, actions and follow-up.                                                                           |
| Quality record        | Checklist, punch items, after photos, customer walkthrough status.                                                                                              |
| Invoice/receipt       | Version, line items, balance, due state, payments and delivery status.                                                                                          |
| Payments              | Method, amount, collector/processor, reference, date/time, reconciliation and correction events.                                                                |
| Audit log             | Actor, action, object, timestamp, previous/new values for protected changes where appropriate, IP/device metadata only if justified by privacy/security policy. |
| Communication log     | Operationally important calls/messages/notes and delivery status for automated notifications.                                                                   |

**Traceability IDs (added 2026-10-03; row text unchanged — see [03 Requirements traceability matrix](../AI%20Development%20Plans/03-requirements-traceability-matrix.md)):** RECT-001 Lead/request record · RECT-002 Estimate & revisions · RECT-003 Work authorization · RECT-004 Change orders · RECT-005 Job briefing snapshot · RECT-006 Photos/files · RECT-007 Safety/incident · RECT-008 Quality record · RECT-009 Invoice/receipt · RECT-010 Payments · RECT-011 Audit log · RECT-012 Communication log

**REC-001 — Immutable approvals.** Approved estimates, change orders, safety acknowledgements and payment events must not be silently rewritten.

**REC-002 — Photo classification.** Every photo must be internal-only or customer-shareable. Default visibility should minimize accidental disclosure.

**REC-003 — Photo consent.** Customer/property photos used for marketing require separate permission from photos needed to estimate/document work.

**REC-004 — Retention policy.** Admin can configure/document retention rules by record type while preserving legal/accounting/safety needs; the application should avoid indefinite collection of data without purpose.

**REC-005 — Access log for sensitive data.** Administrative access to sensitive customer, employee, payment or incident records should be auditable.

**REC-006 — Exportability.** Authorized users can export a complete job packet containing scope, approvals, operational record, photos selected by policy, invoice/payment and closeout information.

# 11. Notifications, bilingual experience and customer communications

| **Event**                | **Communication requirement**                                                                                          |
|--------------------------|------------------------------------------------------------------------------------------------------------------------|
| Lead received            | Confirms request received without falsely implying a booked appointment.                                               |
| Estimate ready           | Provides secure link/instructions, amount/summary and response action.                                                 |
| Estimate reminder        | Optional configured reminder; suppress after approval/rejection/expiration.                                            |
| Appointment confirmation | Date/window, service summary, property, preparation instructions and reschedule/contact path.                          |
| Appointment reminder     | Appropriate lead time; customer-preparation checklist.                                                                 |
| En route / delay         | ETA/window update and approved contact method.                                                                         |
| Work blocked             | Explains operational issue in customer-appropriate language and next step; internal hazard details may remain private. |
| Change order             | Clear added/removed scope, price/time impact and approval action.                                                      |
| Completion               | Work complete/punch status, care instructions and invoice/receipt next step.                                           |
| Invoice/receipt          | Secure invoice or receipt; never expose payment data beyond need.                                                      |
| Follow-up                | Feedback/review request only when case is not in active complaint/rework handling.                                     |

**Traceability IDs (added 2026-10-03; row text unchanged — see [03 Requirements traceability matrix](../AI%20Development%20Plans/03-requirements-traceability-matrix.md)):** NTF-001 Lead received · NTF-002 Estimate ready · NTF-003 Estimate reminder · NTF-004 Appointment confirmation · NTF-005 Appointment reminder · NTF-006 En route / delay · NTF-007 Work blocked · NTF-008 Change order · NTF-009 Completion · NTF-010 Invoice/receipt · NTF-011 Follow-up

**COM-001 — Template versioning.** English and Spanish templates must be versioned; admin can preview before activation.

**COM-002 — No sensitive details in insecure channel.** SMS/email notifications should avoid exposing lockbox codes, sensitive incident details, internal notes or unnecessary personal data.

**COM-003 — Delivery state.** System records queued/sent/delivered/failed status where provider supports it and allows manual retry or alternative contact.

**COM-004 — Preference and consent.** Marketing communication preferences are separate from operational service messages; consent must be stored according to applicable policy.

**COM-005 — Human tone.** Automated messages must identify the business and provide a clear path to reach a person for changes/problems.

**COM-006 — Translation controls.** Critical translations should be approved before production use; untranslated dynamic customer text should not be silently machine-translated without indication/policy.

# 12. AI business roles and human-review boundaries

| **AI role**                        | **Purpose**                                                                               | **Allowed assistance**                                                                               | **Mandatory boundary**                                                                                  |
|------------------------------------|-------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------|
| Risk Triage                        | Job/site/service hazards, unusual conditions, missing information, escalation priority    | Read job/intake/photos/incident flags as permitted; propose risk flags and questions                 | Cannot declare site safe, waive controls, or authorize regulated work. Human reviews high-risk outputs. |
| Legal & Compliance Administrator   | Business records, permit/license/process checklists, contract/admin consistency           | Prepare checklists/drafts and flag missing approvals based on configured sources/policies            | No final legal conclusion; current law/requirements require verified sources and human decision.        |
| Safety & Liability Manager         | Safety plan, hazard controls, incident-prevention workflow                                | Draft service/site controls, PPE/checklists, investigate process gaps                                | Cannot replace qualified safety professional or authorize unsafe exceptions.                            |
| Quality Assistant                  | QA checklists, defect patterns, rework and evidence completeness                          | Flag incomplete closeout, recurring defects, missing photos/checks; propose corrective action        | Human decides acceptance, warranty position and disciplinary actions.                                   |
| Owner Analyst                      | Executive operational/financial dashboard and exception review                            | Summarize KPIs, trends, bottlenecks and unresolved decisions                                         | Must distinguish facts from estimates/assumptions; cannot post financial adjustments without authority. |
| Business Strategy Analyst          | Growth, service mix, process priorities and scenario analysis                             | Use aggregated business data; propose experiments/decisions                                          | Recommendations only; must not fabricate demand or results.                                             |
| Job Planner                        | Convert approved scope into work plan, sequence, readiness list, loadout and dependencies | Draft tasks, estimated sequence, materials/tools and prerequisites from service templates + job data | Worker/lead validates field plan; cannot override scope/safety requirements.                            |
| Scheduling                         | Assignment/availability suggestions and capacity planning                                 | Recommend slots/worker fit, flag conflicts and readiness risks                                       | Human-configured rules control actual schedule changes/notifications.                                   |
| Marketing                          | Campaign/content drafts using approved claims and services                                | Draft website/social/email material from approved business facts and media permissions               | Cannot invent reviews, credentials, prices, results or use customer media without consent.              |
| Lead Intake                        | Structure incoming lead data, identify missing info and route follow-up                   | Summarize request, service match, urgency, qualification questions                                   | Must not promise price/schedule beyond policy.                                                          |
| Estimate Assistant                 | Prepare estimate draft inputs, quantities, scope language and pricing-driver checklist    | Use service standards and verified job data; identify unknowns                                       | Authorized estimator owns final scope/price; AI cannot silently change approved estimate.               |
| Customer Service                   | Draft responses, classify issue, retrieve job context and next-step options               | Prepare customer messages and follow-up tasks                                                        | Sensitive disputes/refunds/liability admissions require human review.                                   |
| Sales & Growth Assistant           | Follow-up sequences, conversion analysis and ethical sales support                        | Prioritize qualified leads and draft communications                                                  | No deceptive urgency, fabricated scarcity or unauthorized discounts.                                    |
| Job Costing                        | Compare estimated vs recorded labor/material/other cost inputs                            | Compute variances and missing-cost flags                                                             | Accounting/owner validates source data and classification.                                              |
| Bookkeeping & Accounting Assistant | Transaction coding support, A/R/A/P workflows, reconciliation support                     | Prepare classifications/reports and exception lists                                                  | Human controls books, reconciliation signoff, payment adjustments and financial statements.             |
| Tax & Cash Flow Assistant          | Cash timing, tax-calendar support, scenario planning and reserves                         | Prepare forecasts/checklists from accounting data and verified tax inputs                            | No unsupported tax conclusions; filing positions and payments require qualified/human approval.         |

**Traceability IDs (added 2026-10-03; row text unchanged — see [03 Requirements traceability matrix](../AI%20Development%20Plans/03-requirements-traceability-matrix.md)):** AIR-001 Risk Triage · AIR-002 Legal & Compliance Administrator · AIR-003 Safety & Liability Manager · AIR-004 Quality Assistant · AIR-005 Owner Analyst · AIR-006 Business Strategy Analyst · AIR-007 Job Planner · AIR-008 Scheduling · AIR-009 Marketing · AIR-010 Lead Intake · AIR-011 Estimate Assistant · AIR-012 Customer Service · AIR-013 Sales & Growth Assistant · AIR-014 Job Costing · AIR-015 Bookkeeping & Accounting Assistant · AIR-016 Tax & Cash Flow Assistant

## 12.1 Universal AI controls

- AI output is advisory/draft unless an explicit workflow grants a constrained automation action.

- AI must operate only on data the invoking user is authorized to access.

- Every consequential output should identify source data, assumptions/unknowns and recommended human review where appropriate.

- AI must not fabricate completed inspections, customer approvals, signatures, photos, measurements, payments, licenses, permits, safety checks or legal/accounting facts.

- Automated actions that affect customer commitments, price, payment, schedule, scope, safety status, employee discipline or legal position require policy-defined approval.

- AI prompts/results containing customer/job data should follow privacy, retention and vendor/security controls defined by the system owner.

**Traceability IDs (added 2026-10-03; row text unchanged — see [03 Requirements traceability matrix](../AI%20Development%20Plans/03-requirements-traceability-matrix.md)):** AIC-001 AI output is advisory/draft unless an explicit workflow g... · AIC-002 AI must operate only on data the invoking user is authori... · AIC-003 Every consequential output should identify source data, a... · AIC-004 AI must not fabricate completed inspections, customer app... · AIC-005 Automated actions that affect customer commitments, price... · AIC-006 AI prompts/results containing customer/job data should fo...

# 13. Engineering, operations, security and privacy ownership

| **Ownership role**                  | **Required responsibility**                                                                                                                             |
|-------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------|
| Website strategist / UX designer    | Make services, service area, credibility and next action obvious; map bilingual/mobile customer journeys and field-worker usability.                    |
| Website developer                   | Build responsive site, forms, customer portal, worker/admin interfaces and integrations.                                                                |
| Website maintainer                  | Hosting, domain renewal, updates, backups, broken forms, uptime/recovery and dependency maintenance.                                                    |
| Business systems administrator      | Configure scheduling, customer records, estimates, invoices, payments, document storage, roles and operational data quality.                            |
| Automation specialist               | Connect approved deterministic workflows (for example approved estimate → job preparation tasks) with retry/error logging and human exception handling. |
| IT / cybersecurity administrator    | Business email, MFA, password management, access control, secure devices, backups, incident response and offboarding.                                   |
| Privacy / data responsibility owner | Data minimization, access, retention, customer/photo/marketing consent, vendor review and privacy-request workflow.                                     |

**Traceability IDs (added 2026-10-03; row text unchanged — see [03 Requirements traceability matrix](../AI%20Development%20Plans/03-requirements-traceability-matrix.md)):** OWN-001 Website strategist / UX designer · OWN-002 Website developer · OWN-003 Website maintainer · OWN-004 Business systems administrator · OWN-005 Automation specialist · OWN-006 IT / cybersecurity administrator · OWN-007 Privacy / data responsibility owner

# 14. Data model and state machines

| **Entity**          | **Core fields / purpose**                                                                                            |
|---------------------|----------------------------------------------------------------------------------------------------------------------|
| Customer            | identity/contact, language, communication preferences, marketing consent, billing info, linked properties            |
| Property/Site       | address/serviceability, access, parking, property notes, pets/occupants, known hazards, photos, recurring site facts |
| Lead                | source, requested service, problem, urgency, attachments, qualification, status                                      |
| Estimate            | version, scope, line items, assumptions/exclusions, approvals, minimum/deposit rule, status                          |
| Job                 | approved work snapshot, schedule, assignments, status, readiness, site briefing, timestamps                          |
| Work Package/Task   | service/SOP link, area, ordered steps, status, evidence and exceptions                                               |
| Service Card        | service definition, intake fields, estimating drivers, SOP, tools, materials, hazards, safety, QA                    |
| SOP Version         | steps, prerequisites, controls, prohibited actions, revision/approval/effective date                                 |
| Hazard              | source, type, severity, control, PPE, stop-work trigger, status, reviewer                                            |
| Tool/Equipment Item | required/optional, source, readiness, inspection/calibration notes                                                   |
| Material Item       | spec, quantity, source, loaded/used/returned/waste, substitution status                                              |
| Photo/File          | job/task/area, class, caption, uploader, timestamp, shareability/consent                                             |
| Change Order        | delta scope/price/time, reason, status, approval and version linkage                                                 |
| Incident            | type, severity, people/property affected, evidence, immediate action, escalation, follow-up                          |
| Quality Check       | criterion, result, evidence, defect/punch item, reviewer                                                             |
| Invoice             | version, line items, deposits/credits, balance, due state, delivery                                                  |
| Payment             | method, amount, date, collector/processor, reference, reconciliation/correction                                      |
| Communication       | channel, sender/recipient role, template/body, job/lead link, delivery state                                         |
| Audit Event         | actor, action, object, timestamp, protected change metadata                                                          |

**Traceability IDs (added 2026-10-03; row text unchanged — see [03 Requirements traceability matrix](../AI%20Development%20Plans/03-requirements-traceability-matrix.md)):** ENT-001 Customer · ENT-002 Property/Site · ENT-003 Lead · ENT-004 Estimate · ENT-005 Job · ENT-006 Work Package/Task · ENT-007 Service Card · ENT-008 SOP Version · ENT-009 Hazard · ENT-010 Tool/Equipment Item · ENT-011 Material Item · ENT-012 Photo/File · ENT-013 Change Order · ENT-014 Incident · ENT-015 Quality Check · ENT-016 Invoice · ENT-017 Payment · ENT-018 Communication · ENT-019 Audit Event

## 14.1 Primary state machines

| **Object**   | **Allowed high-level states**                                                                                                                      |
|--------------|----------------------------------------------------------------------------------------------------------------------------------------------------|
| Lead         | New → Contacted → Qualified → Estimate Needed → Estimate Sent → Converted / Lost / Closed                                                          |
| Estimate     | Draft → Internal Review → Sent → Viewed → Approved / Declined / Expired → Revised/Superseded                                                       |
| Job          | Preparation → Ready → Scheduled → En Route → Arrived → Started → Paused/Blocked → Work Complete → QA/Punch → Customer Closeout → Invoiced → Closed |
| Change order | Draft → Internal Review → Sent → Approved / Declined → Applied / Superseded                                                                        |
| Invoice      | Draft → Issued → Partially Paid → Paid / Past Due / Void/Adjusted according to policy                                                              |
| Incident     | Reported → Triaged → Action Required → Follow-up → Closed                                                                                          |
| Punch item   | Open → Assigned → Corrected → Verified → Closed                                                                                                    |

**Traceability IDs (added 2026-10-03; row text unchanged — see [03 Requirements traceability matrix](../AI%20Development%20Plans/03-requirements-traceability-matrix.md)):** STM-001 Lead · STM-002 Estimate · STM-003 Job · STM-004 Change order · STM-005 Invoice · STM-006 Incident · STM-007 Punch item

# 15. Non-functional requirements

| **ID**  | **Area**                       | **Requirement**                                                                                                                                                                    |
|---------|--------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| NFR-001 | Mobile-first field usability   | Worker core actions (briefing, start, photos, checklist, hazard/incident, change request, complete) must work on a modern phone with touch-friendly controls.                      |
| NFR-002 | Responsive customer experience | Public and portal flows must be usable on mobile, tablet and desktop.                                                                                                              |
| NFR-003 | Accessibility                  | Use semantic structure, keyboard support, visible focus, adequate contrast, labels/errors and accessible documents/forms appropriate to WCAG-oriented implementation.              |
| NFR-004 | Performance                    | Critical job detail and Start Job briefing should load promptly on ordinary mobile connections; large images should use optimized previews with original retention where required. |
| NFR-005 | Offline resilience             | Field-critical cached data and queued evidence submissions should tolerate temporary connectivity loss and visibly show sync status/conflicts.                                     |
| NFR-006 | Security                       | Encryption in transit, secure credential storage, MFA for privileged users, session controls, least privilege, secure secrets, patching and dependency management.                 |
| NFR-007 | Backup & recovery              | Automated backups for critical operational data with documented restore testing and recovery ownership.                                                                            |
| NFR-008 | Auditability                   | Protected business events are attributable to actor/time and cannot be silently erased.                                                                                            |
| NFR-009 | Privacy                        | Collect only necessary personal/site data; separate operational evidence from marketing usage; role-restrict sensitive records.                                                    |
| NFR-010 | Bilingual                      | Core customer journey and standard operational messages support English/Spanish without duplicating canonical records.                                                             |
| NFR-011 | Observability                  | Application errors, failed notifications/integrations, sync failures and automation failures must be visible to responsible administrators.                                        |
| NFR-012 | Idempotent automation          | Retries must not create duplicate jobs, invoices, payments or customer communications.                                                                                             |
| NFR-013 | Versioning                     | SOPs, service cards, estimates, notification templates and other controlled content retain versions and effective dates.                                                           |
| NFR-014 | Data export                    | Authorized business owner can export core customer/job/financial operational records in usable formats to avoid platform lock-in.                                                  |
| NFR-015 | Environment separation         | Production credentials/data should be separated from development/testing; test data must not send real customer messages or alter real payments.                                   |
| NFR-016 | Error recovery                 | User-facing failures preserve entered work when feasible and provide a recovery path instead of losing forms/photos silently.                                                      |
| NFR-017 | Searchability                  | Authorized users can search by customer, phone/email, property, job/estimate/invoice number, service and status.                                                                   |
| NFR-018 | Scalability                    | Architecture supports additional employees/subcontractors, service areas, service cards and higher job volume without redesigning identity or job ownership.                       |
| NFR-019 | Change safety                  | Critical business configuration changes should support preview/validation and audit history; destructive configuration changes require confirmation.                               |
| NFR-020 | Data integrity                 | Money uses fixed-precision handling; dates/times retain timezone context; status transitions are validated server-side, not only in UI.                                            |

# 16. Reporting and management dashboards

| **Dashboard**        | **Minimum measures**                                                                                                    |
|----------------------|-------------------------------------------------------------------------------------------------------------------------|
| Lead funnel          | leads by source/service, contacted, qualified, estimates sent, approvals, losses and reason codes                       |
| Estimate performance | estimate value, conversion, revisions, average response time, discounts/exceptions, below-minimum attempts              |
| Schedule operations  | utilization, late/rescheduled/blocked/no-start jobs, readiness failures and reasons                                     |
| Field execution      | planned vs recorded duration, job pauses, open tasks, material exceptions, change orders                                |
| Quality              | first-pass QA, punch items, rework, complaints, recurring defect tags and service/SOP patterns                          |
| Safety               | hazards, stop-work events, near misses/incidents, corrective actions and recurring risk patterns                        |
| Finance              | invoiced, collected, A/R aging, deposits, cash/check pending reconciliation, adjustments, job-costing completeness      |
| Customer             | repeat customers, feedback, complaint status, response/closure times                                                    |
| AI operations        | recommendations/actions by role, human approvals/rejections, failure/exception rates for automations                    |
| System health        | failed notifications, integration errors, backup status, privileged access changes and unresolved security/admin alerts |

**Traceability IDs (added 2026-10-03; row text unchanged — see [03 Requirements traceability matrix](../AI%20Development%20Plans/03-requirements-traceability-matrix.md)):** RPT-001 Lead funnel · RPT-002 Estimate performance · RPT-003 Schedule operations · RPT-004 Field execution · RPT-005 Quality · RPT-006 Safety · RPT-007 Finance · RPT-008 Customer · RPT-009 AI operations · RPT-010 System health

# 17. Service catalog — 26 detailed service cards

Each service card is both a customer/estimating definition and an operational template. The actual job briefing combines the service-card defaults with job-specific facts. Service-card defaults never override a site-specific hazard, manufacturer instruction, permit/licensing requirement, or approved change order.

## Home Improvement

Home-improvement work frequently combines customer-supplied products, drilling/fastening, ladders, exterior exposure or structural interfaces. The worker briefing must make scope and “do not cross” boundaries explicit.

### HI-01 — Precision Picture Hanging & Art Installation

| **Field**                          | **Service-card requirement**                                                                                                                               |
|------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Customer/estimator intake          | wall type and thickness; item dimensions/weight; exact placement; stud/anchor availability; number of items; height/access; customer-supplied hardware     |
| Typical tools & equipment          | stud finder/scanner, laser level, tape, drill/driver, bits, anchors/fasteners, ladder as needed, hand tools, dust protection                               |
| Typical materials/consumables      | rated anchors/fasteners, bumpers, patching touch-up materials if included                                                                                  |
| Common hazards / risk flags        | hidden electrical/plumbing, heavy-object handling, ladder work, fragile/high-value items, drilling dust                                                    |
| Worker safety / stop-work guidance | verify substrate; confirm fastener capacity; two-person lift when required; protect floor/wall; stop if hidden-service risk or wall condition is uncertain |
| Quality / completion checks        | secure mounting, level/alignment, no wall/item damage, customer-approved placement, cleanup                                                                |

**Traceability IDs (added 2026-10-03):** HI-01.INT intake · HI-01.TLS tools & equipment · HI-01.MAT materials · HI-01.HAZ hazards · HI-01.SAF safety / stop-work · HI-01.QAC quality checks

**Repository files (added 2026-10-03):** [Pricing](../Pricing/pricing-picture-hanging.md) · [Inventory](../Required%20inventory/inventory-picture-hanging.md) · [Agreement](../Service%20Agreements/contract-picture-hanging.md) · [SOP](../Standard%20Of%20Operations/sop-picture-hanging.md) · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#HI-01)

**Implementation note:** The app must convert this template into job-specific checklists. Quantities, models, access, hazards and controls must come from the actual approved job where known; the service card is not permission to perform work beyond worker qualification, manufacturer instructions, permit/license requirements or the approved customer scope.

### HI-02 — Deep-Clean Barbecue & Grill Maintenance

| **Field**                          | **Service-card requirement**                                                                                                                   |
|------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------|
| Customer/estimator intake          | grill fuel type, make/model, condition, location, access to water/power, customer expectations, corrosion/damage                               |
| Typical tools & equipment          | scrapers, brushes, non-damaging detailing tools, wet/dry or HEPA vacuum as appropriate, steam/cleaning equipment, PPE                          |
| Typical materials/consumables      | approved degreaser/cleaner, cloths, bags, absorbents, protective coverings                                                                     |
| Common hazards / risk flags        | hot surfaces, sharp metal, grease/fire risk, gas connections, chemical exposure, slips                                                         |
| Worker safety / stop-work guidance | confirm unit is cool/off; isolate fuel/power per manufacturer; avoid modifying gas components beyond scope; ventilate; control chemicals/waste |
| Quality / completion checks        | components reassembled correctly, burner ports unobstructed where in scope, no leaks/loose parts introduced, surfaces clean/dry, area restored |

**Traceability IDs (added 2026-10-03):** HI-02.INT intake · HI-02.TLS tools & equipment · HI-02.MAT materials · HI-02.HAZ hazards · HI-02.SAF safety / stop-work · HI-02.QAC quality checks

**Repository files (added 2026-10-03):** [Pricing](../Pricing/pricing-grill-cleaning.md) · [Inventory](../Required%20inventory/inventory-grill-cleaning.md) · [Agreement](../Service%20Agreements/contract-grill-cleaning.md) · [SOP](../Standard%20Of%20Operations/sop-grill-cleaning.md) · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#HI-02)

**Implementation note:** The app must convert this template into job-specific checklists. Quantities, models, access, hazards and controls must come from the actual approved job where known; the service card is not permission to perform work beyond worker qualification, manufacturer instructions, permit/license requirements or the approved customer scope.

### HI-03 — Driveway Pressure Washing & Surface Restoration

| **Field**                          | **Service-card requirement**                                                                                                                                     |
|------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Customer/estimator intake          | surface type/condition, area, drainage, nearby doors/windows/landscaping, stain types, water source, weather                                                     |
| Typical tools & equipment          | pressure washer, rotary surface cleaner, appropriate nozzles, hoses, barriers, PPE                                                                               |
| Typical materials/consumables      | surface-compatible cleaners/pre-treatments, absorbents, rinse water controls as needed                                                                           |
| Common hazards / risk flags        | high-pressure injection injury, slips, flying debris, chemicals, electrical proximity, property damage, runoff                                                   |
| Worker safety / stop-work guidance | exclude people/pets; test inconspicuous area; use surface-appropriate pressure; protect electrical/openings/landscape; manage runoff; stop for damaged substrate |
| Quality / completion checks        | uniform cleaning without etching/striping, stain treatment documented, runoff controlled, adjacent property protected, site safe and rinsed                      |

**Traceability IDs (added 2026-10-03):** HI-03.INT intake · HI-03.TLS tools & equipment · HI-03.MAT materials · HI-03.HAZ hazards · HI-03.SAF safety / stop-work · HI-03.QAC quality checks

**Repository files (added 2026-10-03):** [Pricing](../Pricing/pricing-driveway-cleaning.md) · [Inventory](../Required%20inventory/inventory-driveway-cleaning.md) · [Agreement](../Service%20Agreements/contract-driveway-cleaning.md) · [SOP](../Standard%20Of%20Operations/sop-driveway-cleaning.md) · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#HI-03)

**Implementation note:** The app must convert this template into job-specific checklists. Quantities, models, access, hazards and controls must come from the actual approved job where known; the service card is not permission to perform work beyond worker qualification, manufacturer instructions, permit/license requirements or the approved customer scope.

### HI-04 — Professional TV Wall Mounting & Wire Hiding

| **Field**                          | **Service-card requirement**                                                                                                                                                         |
|------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Customer/estimator intake          | TV size/weight/model, mount model, wall/substrate, stud layout, desired height, cable plan, outlet/low-voltage situation                                                             |
| Typical tools & equipment          | stud scanner, level, drill/driver, torque/hand tools, socket set, fish tools for approved low-voltage path, ladder, lift help                                                        |
| Typical materials/consumables      | rated fasteners, customer/HandyHub mount, low-voltage pass-through components if permitted, cable management                                                                         |
| Common hazards / risk flags        | heavy lift, drilling into hidden utilities, ladder, electrical exposure, wall damage                                                                                                 |
| Worker safety / stop-work guidance | verify mount/TV ratings; use structural attachment per instructions; do not perform unlicensed line-voltage work; two-person lift when needed; stop on uncertain substrate/utilities |
| Quality / completion checks        | secure mount, correct hardware, level, articulation clearance, cables managed within approved scope, TV powers/functions if customer authorizes test                                 |

**Traceability IDs (added 2026-10-03):** HI-04.INT intake · HI-04.TLS tools & equipment · HI-04.MAT materials · HI-04.HAZ hazards · HI-04.SAF safety / stop-work · HI-04.QAC quality checks

**Repository files (added 2026-10-03):** [Pricing](../Pricing/pricing-tv-mounting.md) · [Inventory](../Required%20inventory/inventory-tv-mounting.md) · [Agreement](../Service%20Agreements/contract-tv-mounting.md) · [SOP](../Standard%20Of%20Operations/sop-tv-mounting.md) · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#HI-04)

**Implementation note:** The app must convert this template into job-specific checklists. Quantities, models, access, hazards and controls must come from the actual approved job where known; the service card is not permission to perform work beyond worker qualification, manufacturer instructions, permit/license requirements or the approved customer scope.

### HI-05 — Door Hardware & Smart Lock Installation

| **Field**                          | **Service-card requirement**                                                                                                                      |
|------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------|
| Customer/estimator intake          | door material/thickness, existing bore/backset, lock model, handing, strike alignment, Wi-Fi/app needs, customer account/privacy                  |
| Typical tools & equipment          | screwdrivers, drill/driver, bits, chisels, measuring tools, templates, file, vacuum                                                               |
| Typical materials/consumables      | lock/hardware, screws, strike plate, batteries, approved shims/wood filler if included                                                            |
| Common hazards / risk flags        | pinch/cut, drilling, door damage, security/privacy, account credentials                                                                           |
| Worker safety / stop-work guidance | protect customer credentials; have customer control personal account/password; verify emergency/manual operation; do not leave property unsecured |
| Quality / completion checks        | smooth latch/deadbolt, secure attachment, door closes/locks, customer controls codes/accounts, old keys/hardware disposition confirmed            |

**Traceability IDs (added 2026-10-03):** HI-05.INT intake · HI-05.TLS tools & equipment · HI-05.MAT materials · HI-05.HAZ hazards · HI-05.SAF safety / stop-work · HI-05.QAC quality checks

**Repository files (added 2026-10-03):** [Pricing](../Pricing/pricing-smart-locks.md) · [Inventory](../Required%20inventory/inventory-smart-locks.md) · [Agreement](../Service%20Agreements/contract-smart-locks.md) · [SOP](../Standard%20Of%20Operations/sop-smart-locks.md) · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#HI-05)

**Implementation note:** The app must convert this template into job-specific checklists. Quantities, models, access, hazards and controls must come from the actual approved job where known; the service card is not permission to perform work beyond worker qualification, manufacturer instructions, permit/license requirements or the approved customer scope.

### HI-06 — Gutter Maintenance & Leaf Protection

| **Field**                          | **Service-card requirement**                                                                                                                      |
|------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------|
| Customer/estimator intake          | building height/roofline, gutter type/length, downspouts, access, ground conditions, known leaks/sagging, guard product                           |
| Typical tools & equipment          | ladders/access equipment, stabilizer, hand scoop/tools, hose, drill/driver, fall-protection equipment where policy requires, PPE                  |
| Typical materials/consumables      | fasteners, sealant, guard system, bags, replacement minor hardware if included                                                                    |
| Common hazards / risk flags        | falls, overhead power, unstable ladders, sharp metal, insects, roof edge, wet/slippery surfaces                                                   |
| Worker safety / stop-work guidance | weather/ground check; ladder setup; maintain exclusion zone; stop near unsafe power lines/roof conditions or beyond approved height/access policy |
| Quality / completion checks        | debris removed, flow verified, leaks/sags addressed only in approved scope, guards secure/aligned, site cleaned                                   |

**Traceability IDs (added 2026-10-03):** HI-06.INT intake · HI-06.TLS tools & equipment · HI-06.MAT materials · HI-06.HAZ hazards · HI-06.SAF safety / stop-work · HI-06.QAC quality checks

**Repository files (added 2026-10-03):** [Pricing](../Pricing/pricing-gutter-maintenance.md) · [Inventory](../Required%20inventory/inventory-gutter-guards.md) · [Agreement](../Service%20Agreements/contract-gutter-maintenance.md) · [SOP](../Standard%20Of%20Operations/sop-gutter-maintenance.md) · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#HI-06)

**Implementation note:** The app must convert this template into job-specific checklists. Quantities, models, access, hazards and controls must come from the actual approved job where known; the service card is not permission to perform work beyond worker qualification, manufacturer instructions, permit/license requirements or the approved customer scope.

### HI-07 — Attic Insulation Upgrades

| **Field**                          | **Service-card requirement**                                                                                                                                                                      |
|------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Customer/estimator intake          | attic access, area, existing insulation, moisture/pest history, ventilation, recessed lights, wiring, target insulation plan, material type                                                       |
| Typical tools & equipment          | respiratory PPE, coveralls, lighting, insulation blower where used, measuring/depth markers, hand tools, vacuum                                                                                   |
| Typical materials/consumables      | approved insulation, baffles, markers, containment/protection, approved light/penetration protection materials                                                                                    |
| Common hazards / risk flags        | heat stress, low clearance, dust/fibers, electrical, falls through ceiling, pests/mold, combustion/ventilation issues                                                                             |
| Worker safety / stop-work guidance | pre-inspect moisture/electrical/combustion concerns; do not cover unsafe fixtures/vents; maintain soffit ventilation; use respiratory/skin protection; stop on mold, active leak or unsafe wiring |
| Quality / completion checks        | target coverage/depth per approved plan, vents clear, fixtures protected as required, access/weatherstripping restored, no insulation contamination in living space                               |

**Traceability IDs (added 2026-10-03):** HI-07.INT intake · HI-07.TLS tools & equipment · HI-07.MAT materials · HI-07.HAZ hazards · HI-07.SAF safety / stop-work · HI-07.QAC quality checks

**Repository files (added 2026-10-03):** [Pricing](../Pricing/pricing-attic-insulation.md) · [Inventory](../Required%20inventory/inventory-attic-insulation.md) · [Agreement](../Service%20Agreements/contract-attic-insulation.md) · [SOP](../Standard%20Of%20Operations/sop-attic-insulation.md) · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#HI-07)

**Implementation note:** The app must convert this template into job-specific checklists. Quantities, models, access, hazards and controls must come from the actual approved job where known; the service card is not permission to perform work beyond worker qualification, manufacturer instructions, permit/license requirements or the approved customer scope.

### HI-08 — Closet & Shelving System Installation

| **Field**                          | **Service-card requirement**                                                                                           |
|------------------------------------|------------------------------------------------------------------------------------------------------------------------|
| Customer/estimator intake          | wall/substrate, dimensions/layout, load expectation, system model, obstructions, desired heights                       |
| Typical tools & equipment          | laser/level, stud finder, drill/driver, bits, saw if authorized, measuring tools, hand tools                           |
| Typical materials/consumables      | track/brackets/shelves/rods, rated fasteners, anchors, trim/patch materials if included                                |
| Common hazards / risk flags        | drilling hidden utilities, sharp edges, lifting, ladder, falling loads                                                 |
| Worker safety / stop-work guidance | confirm load path/fastener rating; locate studs/utilities; follow manufacturer spacing; do not overload wall/substrate |
| Quality / completion checks        | level/plumb, secure fasteners, intended components installed, basic load/fit check, no sharp projections, area clean   |

**Traceability IDs (added 2026-10-03):** HI-08.INT intake · HI-08.TLS tools & equipment · HI-08.MAT materials · HI-08.HAZ hazards · HI-08.SAF safety / stop-work · HI-08.QAC quality checks

**Repository files (added 2026-10-03):** [Pricing](../Pricing/pricing-closet-shelving.md) · [Inventory](../Required%20inventory/inventory-closet-shelving.md) · [Agreement](../Service%20Agreements/contract-closet-shelving.md) · [SOP](../Standard%20Of%20Operations/sop-closet-shelving.md) · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#HI-08)

**Implementation note:** The app must convert this template into job-specific checklists. Quantities, models, access, hazards and controls must come from the actual approved job where known; the service card is not permission to perform work beyond worker qualification, manufacturer instructions, permit/license requirements or the approved customer scope.

### HI-09 — Custom Trim & Architectural Molding Installation

| **Field**                          | **Service-card requirement**                                                                                                                         |
|------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------|
| Customer/estimator intake          | room dimensions, profile/material, finish state, wall/ceiling condition, corner geometry, paint/stain responsibility                                 |
| Typical tools & equipment          | miter saw, nailer/compressor or approved fastening system, measuring/angle tools, level, caulk tools, PPE/dust control                               |
| Typical materials/consumables      | trim/molding, fasteners, adhesive/caulk as specified, filler, shims, finishing materials if included                                                 |
| Common hazards / risk flags        | saw/nailer injury, dust, hidden wiring/pipes, ladder, finish damage                                                                                  |
| Worker safety / stop-work guidance | guarded tool use; eye/hearing protection; dust collection; scan fastening paths; ladder controls                                                     |
| Quality / completion checks        | tight joints appropriate to finish level, secure attachment, consistent reveals/alignment, filled/caulked per scope, surface ready for agreed finish |

**Traceability IDs (added 2026-10-03):** HI-09.INT intake · HI-09.TLS tools & equipment · HI-09.MAT materials · HI-09.HAZ hazards · HI-09.SAF safety / stop-work · HI-09.QAC quality checks

**Repository files (added 2026-10-03):** [Pricing](../Pricing/pricing-trim-molding.md) · [Inventory](../Required%20inventory/inventory-trim-molding.md) · [Agreement](../Service%20Agreements/contract-trim-molding.md) · [SOP](../Standard%20Of%20Operations/sop-trim-molding.md) · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#HI-09)

**Implementation note:** The app must convert this template into job-specific checklists. Quantities, models, access, hazards and controls must come from the actual approved job where known; the service card is not permission to perform work beyond worker qualification, manufacturer instructions, permit/license requirements or the approved customer scope.

### HI-10 — Structural Fence Maintenance & Structural Repairs

| **Field**                          | **Service-card requirement**                                                                                                                                |
|------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Customer/estimator intake          | fence type/material, damaged posts/rails/pickets/gate, property-line assumptions, underground utility concerns, soil/access                                 |
| Typical tools & equipment          | post/rail tools, saw, drill/driver, digging tools, level, clamps, PPE, concrete tools if approved                                                           |
| Typical materials/consumables      | pressure-treated/cedar components, exterior structural fasteners, brackets, concrete if in scope, gate hardware                                             |
| Common hazards / risk flags        | underground utilities, collapse/unstable sections, saw/drill, heavy materials, property boundary dispute                                                    |
| Worker safety / stop-work guidance | verify scope/property authorization; utility-location/permit policy before digging; brace unstable sections; stop for major structural/boundary uncertainty |
| Quality / completion checks        | stable posts/rails, aligned replacement pieces, gate functions, fasteners appropriate, site/backfill clean and safe                                         |

**Traceability IDs (added 2026-10-03):** HI-10.INT intake · HI-10.TLS tools & equipment · HI-10.MAT materials · HI-10.HAZ hazards · HI-10.SAF safety / stop-work · HI-10.QAC quality checks

**Repository files (added 2026-10-03):** [Pricing](../Pricing/pricing-fence-repair.md) · [Inventory](../Required%20inventory/inventory-fence-repair.md) · [Agreement](../Service%20Agreements/contract-fence-repair.md) · [SOP](../Standard%20Of%20Operations/sop-fence-repair.md) · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#HI-10)

**Implementation note:** The app must convert this template into job-specific checklists. Quantities, models, access, hazards and controls must come from the actual approved job where known; the service card is not permission to perform work beyond worker qualification, manufacturer instructions, permit/license requirements or the approved customer scope.

### HI-11 — Structural Deck Maintenance & Deck Board Repairs

| **Field**                          | **Service-card requirement**                                                                                                                                                 |
|------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Customer/estimator intake          | deck size/height, damaged boards/rails/stairs, framing condition, ledger/joist observations, material match, access                                                          |
| Typical tools & equipment          | saws, drill/driver, pry tools, clamps, socket/bolt tools, ladder/access, PPE                                                                                                 |
| Typical materials/consumables      | deck boards, structural/exterior screws/bolts, brackets/hangers only if approved, replacement rail/stair components                                                          |
| Common hazards / risk flags        | falls, unstable framing, nails/splinters, saws, heavy materials, concealed structural decay                                                                                  |
| Worker safety / stop-work guidance | restrict access; inspect support before loading/removing boards; stop for major structural/ledger/foundation issues outside approved repair; use fall controls as applicable |
| Quality / completion checks        | replaced elements secure/flush, stairs/rails stable, trip hazards removed, fasteners correct, unresolved structural concerns documented                                      |

**Traceability IDs (added 2026-10-03):** HI-11.INT intake · HI-11.TLS tools & equipment · HI-11.MAT materials · HI-11.HAZ hazards · HI-11.SAF safety / stop-work · HI-11.QAC quality checks

**Repository files (added 2026-10-03):** [Pricing](../Pricing/pricing-deck-repair.md) · [Inventory](../Required%20inventory/inventory-deck-repair.md) · [Agreement](../Service%20Agreements/contract-deck-repair.md) · [SOP](../Standard%20Of%20Operations/sop-deck-repair.md) · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#HI-11)

**Implementation note:** The app must convert this template into job-specific checklists. Quantities, models, access, hazards and controls must come from the actual approved job where known; the service card is not permission to perform work beyond worker qualification, manufacturer instructions, permit/license requirements or the approved customer scope.

## Drywall

Drywall work is dust-intensive and can uncover moisture, mold, utilities or suspect hazardous materials. Containment, pre-existing-condition evidence and stop-work triggers are central.

### DW-01 — Professional Patching, Repair & Handyman Services

| **Field**                          | **Service-card requirement**                                                                                                           |
|------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------|
| Customer/estimator intake          | hole/damage size/location, cause of damage, active leak status, wall/ceiling type, texture/finish, paint responsibility                |
| Typical tools & equipment          | utility knife/saw, drill/driver, taping knives, sanding/vacuum, light, measuring tools, PPE                                            |
| Typical materials/consumables      | drywall, backing, screws, tape/mesh, joint compound, primer if included                                                                |
| Common hazards / risk flags        | hidden utilities, silica/dust, ladder for ceilings, possible mold/moisture, sharp tools                                                |
| Worker safety / stop-work guidance | confirm leak/source resolved; scan before cutting; isolate dust; stop on mold/suspect hazardous material or extensive concealed damage |
| Quality / completion checks        | stable patch, flat/feathered finish appropriate to scope, texture match within agreed tolerance, primed if included, dust cleaned      |

**Traceability IDs (added 2026-10-03):** DW-01.INT intake · DW-01.TLS tools & equipment · DW-01.MAT materials · DW-01.HAZ hazards · DW-01.SAF safety / stop-work · DW-01.QAC quality checks

**Repository files (added 2026-10-03):** [Pricing](../Pricing/pricing-drywall-patching.md) · [Inventory](../Required%20inventory/inventory-drywall-patching.md) · [Agreement](../Service%20Agreements/contract-drywall-patching.md) · [SOP](../Standard%20Of%20Operations/sop%20drywall-patching.md) · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#DW-01)

**Implementation note:** The app must convert this template into job-specific checklists. Quantities, models, access, hazards and controls must come from the actual approved job where known; the service card is not permission to perform work beyond worker qualification, manufacturer instructions, permit/license requirements or the approved customer scope.

### DW-02 — Texture Matching & Popcorn Ceiling Removal

| **Field**                          | **Service-card requirement**                                                                                                                                                     |
|------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Customer/estimator intake          | home/ceiling age, prior testing, area/height, texture type, paint/coating, occupied status, finish target                                                                        |
| Typical tools & equipment          | containment system, scraper, sprayer as appropriate, HEPA vacuum, sanding tools, access equipment, PPE/respiratory equipment per plan                                            |
| Typical materials/consumables      | plastic/containment, joint compound, texture materials, primer, disposal bags                                                                                                    |
| Common hazards / risk flags        | suspect asbestos in older textures, lead paint, falls, dust, electrical fixtures, water exposure                                                                                 |
| Worker safety / stop-work guidance | do not disturb suspect hazardous material without required evaluation/testing/authorization; isolate area; control dust; de-energize/protect fixtures as needed; height controls |
| Quality / completion checks        | approved texture removed/matched, substrate not damaged beyond repair scope, smooth/texture finish meets target, containment cleanup documented                                  |

**Traceability IDs (added 2026-10-03):** DW-02.INT intake · DW-02.TLS tools & equipment · DW-02.MAT materials · DW-02.HAZ hazards · DW-02.SAF safety / stop-work · DW-02.QAC quality checks

**Repository files (added 2026-10-03):** [Pricing](../Pricing/pricing-popcorn-removal.md) · [Inventory](../Required%20inventory/inventory-popcorn-removal.md) · [Agreement](../Service%20Agreements/contract-popcorn-removal.md) · [SOP](../Standard%20Of%20Operations/sop%20popcorn-removal.md) · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#DW-02)

**Implementation note:** The app must convert this template into job-specific checklists. Quantities, models, access, hazards and controls must come from the actual approved job where known; the service card is not permission to perform work beyond worker qualification, manufacturer instructions, permit/license requirements or the approved customer scope.

### DW-03 — Residential Remodeling & Home Additions

| **Field**                          | **Service-card requirement**                                                                                                                                                      |
|------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Customer/estimator intake          | approved design/scope, framing locations, utilities, permits/inspections status, drywall type, moisture/fire requirements, finish level                                           |
| Typical tools & equipment          | framing tools, saws, screw guns, lifts, taping/finishing tools, lasers, access equipment, PPE                                                                                     |
| Typical materials/consumables      | studs/track, drywall type, screws, tape, compound, corner bead, backing, protection                                                                                               |
| Common hazards / risk flags        | structural work, electrical/plumbing/HVAC interfaces, heavy panels, lifts, dust, falls, fire/moisture assemblies                                                                  |
| Worker safety / stop-work guidance | verify approved plans/permit dependencies; do not conceal unapproved utility work; use correct board/system; lifting/team controls; inspections before concealment where required |
| Quality / completion checks        | walls/ceilings straight within project tolerance, correct materials, fastener/tape/finish quality, penetrations/interfaces documented, inspection prerequisites satisfied         |

**Traceability IDs (added 2026-10-03):** DW-03.INT intake · DW-03.TLS tools & equipment · DW-03.MAT materials · DW-03.HAZ hazards · DW-03.SAF safety / stop-work · DW-03.QAC quality checks

**Repository files (added 2026-10-03):** [Pricing](../Pricing/pricing-drywall-remodeling.md) · [Inventory](../Required%20inventory/inventory-drywall-remodeling.md) · [Agreement](../Service%20Agreements/contract-drywall-remodeling.md) · [SOP](../Standard%20Of%20Operations/sop%20drywall-remodeling.md) · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#DW-03)

**Implementation note:** The app must convert this template into job-specific checklists. Quantities, models, access, hazards and controls must come from the actual approved job where known; the service card is not permission to perform work beyond worker qualification, manufacturer instructions, permit/license requirements or the approved customer scope.

### DW-04 — High-Volume Residential New Construction

| **Field**                          | **Service-card requirement**                                                                                                                       |
|------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------|
| Customer/estimator intake          | builder plans, unit/room schedule, board types/thicknesses, fire/sound assemblies, delivery staging, inspections, finish level                     |
| Typical tools & equipment          | panel lifts/carts, screw guns, cutting tools, automatic finishing tools where used, scaffolds/stilts only under approved policy, PPE               |
| Typical materials/consumables      | bulk drywall, screws, tape, compound, corner bead, specialty assemblies                                                                            |
| Common hazards / risk flags        | material handling, falls, scaffold/stilt risk, repetitive strain, dust, incomplete framing/utilities                                               |
| Worker safety / stop-work guidance | coordinate inspections; verify assembly specifications; safe staging/handling; equipment qualification; do not cover incomplete/failed inspections |
| Quality / completion checks        | correct board/assembly placement, fastening/finish quality, corners/openings, production checklist, punch under lighting, clean handoff            |

**Traceability IDs (added 2026-10-03):** DW-04.INT intake · DW-04.TLS tools & equipment · DW-04.MAT materials · DW-04.HAZ hazards · DW-04.SAF safety / stop-work · DW-04.QAC quality checks

**Repository files (added 2026-10-03):** [Pricing](../Pricing/pricing-new-construction.md) · [Inventory](../Required%20inventory/inventory-new-construction.md) · [Agreement](../Service%20Agreements/contract-new-construction.md) · [SOP](../Standard%20Of%20Operations/sop%20new-construction.md) · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#DW-04)

**Implementation note:** The app must convert this template into job-specific checklists. Quantities, models, access, hazards and controls must come from the actual approved job where known; the service card is not permission to perform work beyond worker qualification, manufacturer instructions, permit/license requirements or the approved customer scope.

## Painting

Painting/coating work depends on surface condition, product compatibility, ventilation, preparation quality, weather for exterior work, and protection of customer property.

### PT-01 — Professional Residential Interior Painting

| **Field**                          | **Service-card requirement**                                                                                                   |
|------------------------------------|--------------------------------------------------------------------------------------------------------------------------------|
| Customer/estimator intake          | rooms/areas, colors/finish, paint brand/product if specified, wall condition, furniture/occupancy, repair scope                |
| Typical tools & equipment          | brushes/rollers/sprayer if approved, ladders, sanding/HEPA vacuum, lighting, masking tools, PPE                                |
| Typical materials/consumables      | primer/paint, caulk/filler, tape/plastic/drop cloths, patch materials                                                          |
| Common hazards / risk flags        | ladders, VOC/chemical exposure, dust/lead in older coatings, slips, customer property damage                                   |
| Worker safety / stop-work guidance | ventilate; protect contents; assess older coatings before aggressive disturbance; ladder controls; follow product instructions |
| Quality / completion checks        | uniform coverage, clean cut lines, agreed sheen/color, repaired prep areas, no overspray/drips on protected surfaces, cleanup  |

**Traceability IDs (added 2026-10-03):** PT-01.INT intake · PT-01.TLS tools & equipment · PT-01.MAT materials · PT-01.HAZ hazards · PT-01.SAF safety / stop-work · PT-01.QAC quality checks

**Repository files (added 2026-10-03):** [Pricing](../Pricing/pricing-interior-painting.md) · [Inventory](../Required%20inventory/inventory-interior-painting.md) · [Agreement](../Service%20Agreements/contract-interior-painting.md) · [SOP](../Standard%20Of%20Operations/sop-interior-painting.md) · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#PT-01)

**Implementation note:** The app must convert this template into job-specific checklists. Quantities, models, access, hazards and controls must come from the actual approved job where known; the service card is not permission to perform work beyond worker qualification, manufacturer instructions, permit/license requirements or the approved customer scope.

### PT-02 — Outdoor Deck & Fence Staining and Sealing

| **Field**                          | **Service-card requirement**                                                                                                              |
|------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------|
| Customer/estimator intake          | wood species/age, existing coating, moisture condition, area, color/product, weather forecast, landscaping                                |
| Typical tools & equipment          | washer with appropriate pressure, sanding tools, sprayer/brushes, moisture meter if used, masking, PPE                                    |
| Typical materials/consumables      | cleaner/stripper/brightener, stain/sealer, masking/protection, rags with safe disposal controls                                           |
| Common hazards / risk flags        | slips, pressure washing, chemicals, sanding dust, flammable/oily rags, weather/heat                                                       |
| Worker safety / stop-work guidance | verify wood dry enough per product; protect plants/adjacent surfaces; pressure appropriate; manage oily rags; postpone unsuitable weather |
| Quality / completion checks        | even preparation/coating, no lap/overspray defects beyond agreed tolerance, dry/cure guidance provided, site protected/clean              |

**Traceability IDs (added 2026-10-03):** PT-02.INT intake · PT-02.TLS tools & equipment · PT-02.MAT materials · PT-02.HAZ hazards · PT-02.SAF safety / stop-work · PT-02.QAC quality checks

**Repository files (added 2026-10-03):** [Pricing](../Pricing/pricing-deck-staining.md) · [Inventory](../Required%20inventory/inventory-deck-staining.md) · [Agreement](../Service%20Agreements/contract-deck-staining.md) · [SOP](../Standard%20Of%20Operations/sop-deck-staining.md) · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#PT-02)

**Implementation note:** The app must convert this template into job-specific checklists. Quantities, models, access, hazards and controls must come from the actual approved job where known; the service card is not permission to perform work beyond worker qualification, manufacturer instructions, permit/license requirements or the approved customer scope.

### PT-03 — Brick Limewashing & Elastomeric Masonry Coatings

| **Field**                          | **Service-card requirement**                                                                                                                        |
|------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------|
| Customer/estimator intake          | masonry type/condition, efflorescence/cracks, moisture source, product/system, color/sample, height/access, weather                                 |
| Typical tools & equipment          | washing equipment, masonry prep tools, masking, spray/brush equipment, access equipment, PPE                                                        |
| Typical materials/consumables      | approved masonry cleaner, limewash/coating, crack/prep materials as specified, masking                                                              |
| Common hazards / risk flags        | falls, pressure wash, chemical/alkaline materials, overspray, moisture trapping/wrong coating, weather                                              |
| Worker safety / stop-work guidance | confirm compatible coating system; address active moisture cause before coating when required; PPE/skin/eye protection; weather and height controls |
| Quality / completion checks        | prepared clean surface, approved sample/look, consistent finish, openings/landscape protected, defects/limitations documented                       |

**Traceability IDs (added 2026-10-03):** PT-03.INT intake · PT-03.TLS tools & equipment · PT-03.MAT materials · PT-03.HAZ hazards · PT-03.SAF safety / stop-work · PT-03.QAC quality checks

**Repository files (added 2026-10-03):** [Pricing](../Pricing/pricing-brick-limewashing.md) · [Inventory](../Required%20inventory/inventory-brick-limewashing.md) · [Agreement](../Service%20Agreements/contract-brick-limewashing.md) · [SOP](../Standard%20Of%20Operations/sop-brick-limewashing.md) · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#PT-03)

**Implementation note:** The app must convert this template into job-specific checklists. Quantities, models, access, hazards and controls must come from the actual approved job where known; the service card is not permission to perform work beyond worker qualification, manufacturer instructions, permit/license requirements or the approved customer scope.

### PT-04 — Wallpaper Removal & Surface Restoration

| **Field**                          | **Service-card requirement**                                                                                                                               |
|------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Customer/estimator intake          | wallpaper type/layers, wall substrate, age, painted/unpainted wall, room area, desired finish                                                              |
| Typical tools & equipment          | scorer only when appropriate, steamer/sprayer, scrapers, sanding/HEPA vacuum, protection, PPE                                                              |
| Typical materials/consumables      | removal solution, water/control materials, joint compound, primer, protection                                                                              |
| Common hazards / risk flags        | steam/hot water, electrical outlets, ladder, dust/older coatings, drywall paper damage                                                                     |
| Worker safety / stop-work guidance | protect/de-energize near outlets as appropriate; test removal method; avoid excessive saturation; control dust; stop on suspect hazardous coating/material |
| Quality / completion checks        | wallpaper/adhesive removed to agreed level, substrate repairs smooth, surface clean/dry, primed if included, no unmanaged damage                           |

**Traceability IDs (added 2026-10-03):** PT-04.INT intake · PT-04.TLS tools & equipment · PT-04.MAT materials · PT-04.HAZ hazards · PT-04.SAF safety / stop-work · PT-04.QAC quality checks

**Repository files (added 2026-10-03):** [Pricing](../Pricing/pricing-wallpaper-removal.md) · [Inventory](../Required%20inventory/inventory-wallpaper-removal.md) · [Agreement](../Service%20Agreements/contract-wallpaper-removal.md) · [SOP](../Standard%20Of%20Operations/sop-wallpaper-removal.md) · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#PT-04)

**Implementation note:** The app must convert this template into job-specific checklists. Quantities, models, access, hazards and controls must come from the actual approved job where known; the service card is not permission to perform work beyond worker qualification, manufacturer instructions, permit/license requirements or the approved customer scope.

## Cleaning

Cleaning work is highly site-dependent and often performed around occupants, chemicals, personal property and hidden sharps/biohazards. Chemical compatibility, privacy and exception handling are mandatory.

### CL-01 — Routine House Cleaning

| **Field**                          | **Service-card requirement**                                                                                                           |
|------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------|
| Customer/estimator intake          | rooms, occupancy/pets, surfaces/materials, priority areas, excluded rooms/items, product preferences/allergies if volunteered          |
| Typical tools & equipment          | vacuum, mop, microfiber system, bathroom/kitchen tools, PPE                                                                            |
| Typical materials/consumables      | approved cleaners/disinfectants, bags, cloths, consumables                                                                             |
| Common hazards / risk flags        | slips, chemical mixing, sharps/biohazard surprises, pets, fragile items                                                                |
| Worker safety / stop-work guidance | never mix incompatible chemicals; signage/control wet floors; stop and escalate on sharps/biohazard/unsafe animal/aggressive situation |
| Quality / completion checks        | specified surfaces cleaned, floors complete, bathrooms/kitchen standard met, trash handled, no damage, rooms secured as found          |

**Traceability IDs (added 2026-10-03):** CL-01.INT intake · CL-01.TLS tools & equipment · CL-01.MAT materials · CL-01.HAZ hazards · CL-01.SAF safety / stop-work · CL-01.QAC quality checks

**Repository files (added 2026-10-03):** [Pricing](../Pricing/pricing-routine-cleaning.md) · [Inventory](../Required%20inventory/inventory-routine-cleaning.md) · [Agreement](../Service%20Agreements/contract-routine-cleaning.md) · [SOP](../Standard%20Of%20Operations/sop%20Routine%20Cleaning%20Checklist.md) · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#CL-01)

**Implementation note:** The app must convert this template into job-specific checklists. Quantities, models, access, hazards and controls must come from the actual approved job where known; the service card is not permission to perform work beyond worker qualification, manufacturer instructions, permit/license requirements or the approved customer scope.

### CL-02 — Elite Deep Cleaning Service

| **Field**                          | **Service-card requirement**                                                                                                                |
|------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------|
| Customer/estimator intake          | deep-clean scope, appliance interiors, grout, high/low areas, furniture movement limits, surface sensitivities                              |
| Typical tools & equipment          | routine cleaning kit plus detail brushes, extension tools, approved steam/scrub equipment, PPE                                              |
| Typical materials/consumables      | surface-specific cleaners/descalers/degreasers, cloths, bags                                                                                |
| Common hazards / risk flags        | chemical exposure, heavy/light furniture movement, ladders, sharp appliance edges, slips                                                    |
| Worker safety / stop-work guidance | test sensitive surfaces; move only approved/light items; unplug/isolate appliances per instruction; chemical compatibility; ladder controls |
| Quality / completion checks        | deep-clean checklist complete, hard-to-reach areas addressed, appliances restored, no residue/damage, customer exclusions respected         |

**Traceability IDs (added 2026-10-03):** CL-02.INT intake · CL-02.TLS tools & equipment · CL-02.MAT materials · CL-02.HAZ hazards · CL-02.SAF safety / stop-work · CL-02.QAC quality checks

**Repository files (added 2026-10-03):** [Pricing](../Pricing/pricing-deep-cleaning.md) · [Inventory](../Required%20inventory/inventory-deep-cleaning.md) · [Agreement](../Service%20Agreements/contract-deep-cleaning.md) · [SOP](../Standard%20Of%20Operations/sop%20Deep%20Cleaning%20CheckList.md) · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#CL-02)

**Implementation note:** The app must convert this template into job-specific checklists. Quantities, models, access, hazards and controls must come from the actual approved job where known; the service card is not permission to perform work beyond worker qualification, manufacturer instructions, permit/license requirements or the approved customer scope.

### CL-03 — Move-In & Move-Out Cleaning

| **Field**                          | **Service-card requirement**                                                                                                                  |
|------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| Customer/estimator intake          | vacant/occupied status, rooms, cabinets/appliances, lease/landlord checklist if supplied, utilities/water availability                        |
| Typical tools & equipment          | deep-clean kit, vacuum/mop, glass/detail tools, ladder/extension as needed, PPE                                                               |
| Typical materials/consumables      | cleaners, bags, cloths, liners, specialty products approved for surfaces                                                                      |
| Common hazards / risk flags        | slips, unknown debris/sharps, chemicals, ladder, unsecured property                                                                           |
| Worker safety / stop-work guidance | initial walkthrough for damage/hazards; photograph pre-existing issues if required; control sharps/chemicals; secure property at exit         |
| Quality / completion checks        | checklist completed, cabinets/fixtures/floors as scoped, waste removed to agreed location, pre-existing damage separated from cleaning result |

**Traceability IDs (added 2026-10-03):** CL-03.INT intake · CL-03.TLS tools & equipment · CL-03.MAT materials · CL-03.HAZ hazards · CL-03.SAF safety / stop-work · CL-03.QAC quality checks

**Repository files (added 2026-10-03):** [Pricing](../Pricing/pricing-move-in-out.md) · [Inventory](../Required%20inventory/inventory-move-in-move-out.md) · [Agreement](../Service%20Agreements/contract-move-in-out.md) · [SOP](../Standard%20Of%20Operations/sop%20Move-In%20and%20Move-Out%20Cleaning%20Checklist.md) · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#CL-03)

**Implementation note:** The app must convert this template into job-specific checklists. Quantities, models, access, hazards and controls must come from the actual approved job where known; the service card is not permission to perform work beyond worker qualification, manufacturer instructions, permit/license requirements or the approved customer scope.

### CL-04 — Post-Construction & Post-Renovation Cleaning

| **Field**                          | **Service-card requirement**                                                                                                                            |
|------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------|
| Customer/estimator intake          | construction complete status, dust/debris type, surfaces, paint/adhesive residue, contractor punch activity, occupancy readiness                        |
| Typical tools & equipment          | HEPA vacuum, microfiber systems, scrapers appropriate to surface, floor tools, PPE/respiratory protection as plan requires                              |
| Typical materials/consumables      | cleaners, bags, filters, cloths, surface-safe residue removers                                                                                          |
| Common hazards / risk flags        | fine dust, silica/wood dust, sharp debris, unfinished electrical/fixtures, ladders, chemicals                                                           |
| Worker safety / stop-work guidance | confirm area released for cleaning; do not work amid unsafe active construction; respiratory/dust control; sharps management; verify power/water safety |
| Quality / completion checks        | fine dust removed in passes, residues treated without damage, vents/fixtures/surfaces detailed as scoped, site ready for turnover                       |

**Traceability IDs (added 2026-10-03):** CL-04.INT intake · CL-04.TLS tools & equipment · CL-04.MAT materials · CL-04.HAZ hazards · CL-04.SAF safety / stop-work · CL-04.QAC quality checks

**Repository files (added 2026-10-03):** [Pricing](../Pricing/pricing-post-construction.md) · [Inventory](../Required%20inventory/inventory-post-construction.md) · [Agreement](../Service%20Agreements/contract-post-construction.md) · [SOP](../Standard%20Of%20Operations/sop%20Post-Construction%20Cleaning%20Checklist.md) · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#CL-04)

**Implementation note:** The app must convert this template into job-specific checklists. Quantities, models, access, hazards and controls must come from the actual approved job where known; the service card is not permission to perform work beyond worker qualification, manufacturer instructions, permit/license requirements or the approved customer scope.

### CL-05 — Airbnb Turnover & Vacation Rental Management

| **Field**                          | **Service-card requirement**                                                                                                       |
|------------------------------------|------------------------------------------------------------------------------------------------------------------------------------|
| Customer/estimator intake          | checkout/check-in times, host checklist, linens, amenities/restock levels, damage-report rule, access/security codes policy        |
| Typical tools & equipment          | cleaning kit, laundry resources as applicable, inspection/photo device, PPE                                                        |
| Typical materials/consumables      | linens, toiletries/restock items, cleaners, bags                                                                                   |
| Common hazards / risk flags        | time pressure, sharps/biohazard, guest property, security/access privacy, damaged items                                            |
| Worker safety / stop-work guidance | protect access codes; never discard guest property without policy; escalate biohazard/damage; verify lockup and urgent maintenance |
| Quality / completion checks        | clean/reset checklist, linens/amenities, documented damage, staging standard, property locked and host notified of exceptions      |

**Traceability IDs (added 2026-10-03):** CL-05.INT intake · CL-05.TLS tools & equipment · CL-05.MAT materials · CL-05.HAZ hazards · CL-05.SAF safety / stop-work · CL-05.QAC quality checks

**Repository files (added 2026-10-03):** [Pricing](../Pricing/pricing-airbnb-turnover.md) · [Inventory](../Required%20inventory/inventory-airbnb-turnover.md) · [Agreement](../Service%20Agreements/contract-airbnb-turnover.md) · [SOP](../Standard%20Of%20Operations/sop%20Airbnb%20Cleaning%20and%20Turnover%20Checklist.md) · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#CL-05)

**Implementation note:** The app must convert this template into job-specific checklists. Quantities, models, access, hazards and controls must come from the actual approved job where known; the service card is not permission to perform work beyond worker qualification, manufacturer instructions, permit/license requirements or the approved customer scope.

### CL-06 — Hotel-Style Luxury Housekeeping

| **Field**                          | **Service-card requirement**                                                                                                                |
|------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------|
| Customer/estimator intake          | recurring service plan, privacy boundaries, laundry/wardrobe preferences, delicate items, access, preferred products                        |
| Typical tools & equipment          | premium cleaning/laundry/organization tools appropriate to residence, PPE                                                                   |
| Typical materials/consumables      | approved laundry/cleaning consumables, organization supplies if authorized                                                                  |
| Common hazards / risk flags        | privacy/confidentiality, delicate/high-value property, chemical/surface damage, ergonomic strain                                            |
| Worker safety / stop-work guidance | strict privacy; do not photograph/access personal records without need; follow garment/surface care labels; escalation for valuables/damage |
| Quality / completion checks        | consistent room standard, laundry/wardrobe tasks per instructions, high-value items undisturbed except authorized care, secure closeout     |

**Traceability IDs (added 2026-10-03):** CL-06.INT intake · CL-06.TLS tools & equipment · CL-06.MAT materials · CL-06.HAZ hazards · CL-06.SAF safety / stop-work · CL-06.QAC quality checks

**Repository files (added 2026-10-03):** [Pricing](../Pricing/pricing-hotel-housekeeping.md) · [Inventory](../Required%20inventory/inventory-hotel-housekeeping.md) · [Agreement](../Service%20Agreements/contract-hotel-housekeeping.md) · [SOP](../Standard%20Of%20Operations/sop%20Hotel-Style%20Housekeeping%20Checklist.md) · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#CL-06)

**Implementation note:** The app must convert this template into job-specific checklists. Quantities, models, access, hazards and controls must come from the actual approved job where known; the service card is not permission to perform work beyond worker qualification, manufacturer instructions, permit/license requirements or the approved customer scope.

### CL-07 — Air Duct & Ventilation Cleaning

| **Field**                          | **Service-card requirement**                                                                                                                                                                                 |
|------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Customer/estimator intake          | HVAC system type, accessible registers/returns, reported concern, filter size, suspected mold/pest/contamination, equipment capability                                                                       |
| Typical tools & equipment          | appropriate negative-pressure/vacuum/brush tools for authorized scope, register tools, HEPA equipment, PPE                                                                                                   |
| Typical materials/consumables      | filters, protective coverings, bags, cleaning materials approved for components                                                                                                                              |
| Common hazards / risk flags        | electrical/mechanical equipment, dust/allergens, sharp duct edges, ladder, suspect mold/contamination, damage to duct lining                                                                                 |
| Worker safety / stop-work guidance | system off/isolation per procedure; do not make unsupported indoor-air-quality claims; stop on suspected significant mold, asbestos-containing material, damaged ducts or scope requiring licensed HVAC work |
| Quality / completion checks        | registers/accessible duct scope completed, debris controlled, filter installed if included, system restored, limitations and unresolved conditions documented                                                |

**Traceability IDs (added 2026-10-03):** CL-07.INT intake · CL-07.TLS tools & equipment · CL-07.MAT materials · CL-07.HAZ hazards · CL-07.SAF safety / stop-work · CL-07.QAC quality checks

**Repository files (added 2026-10-03):** [Pricing](../Pricing/pricing-air-duct-cleaning.md) · [Inventory](../Required%20inventory/inventory-air-duct-cleaning.md) · [Agreement](../Service%20Agreements/contract-air-duct-cleaning.md) · [SOP](../Standard%20Of%20Operations/sop%20Air%20Duct%20and%20Vent%20Cleaning%20Checklist.md) · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#CL-07)

**Implementation note:** The app must convert this template into job-specific checklists. Quantities, models, access, hazards and controls must come from the actual approved job where known; the service card is not permission to perform work beyond worker qualification, manufacturer instructions, permit/license requirements or the approved customer scope.

# 18. Acceptance criteria — 60 end-to-end tests

| **ID** | **Test**                    | **Pass condition**                                                                                                                                                                                                     |
|--------|-----------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| AT-001 | Lead minimum disclosure     | A prospect submits a request for a small task. The UI discloses the \$150 minimum before booking/approval; the stored lead retains acknowledgement or communication state.                                             |
| AT-002 | Bilingual lead form         | Switching English↔Spanish preserves already-entered lead values and submits one canonical lead record.                                                                                                                 |
| AT-003 | Serviceability              | An address outside configured service coverage is flagged for review/not-serviceable without falsely confirming a booking.                                                                                             |
| AT-004 | Photo upload                | Lead can attach photos; upload failure is visible and recoverable without losing the rest of the form.                                                                                                                 |
| AT-005 | Estimate versioning         | Estimator sends v1, revises to v2, and both versions remain retrievable; customer approval attaches only to the accepted version.                                                                                      |
| AT-006 | Below-minimum estimate      | Calculated total below \$150 applies configured minimum or requires authorized exception before send.                                                                                                                  |
| AT-007 | Estimate exclusions         | Customer-visible estimate includes exclusions/assumptions before approval.                                                                                                                                             |
| AT-008 | Deposit conditionality      | A normal small job does not automatically require a deposit; a job meeting configured large-job criteria can require one.                                                                                              |
| AT-009 | Deposit gate                | Where deposit is required, the job readiness state shows it missing and blocks/flags dispatch according to policy.                                                                                                     |
| AT-010 | Approved estimate to job    | Conversion creates a job containing an immutable snapshot/reference of the approved estimate.                                                                                                                          |
| AT-011 | Schedule conflict           | Dispatcher attempting to overlap the same worker receives a blocking or explicit override warning.                                                                                                                     |
| AT-012 | Schedule history            | Rescheduling preserves the original appointment, reason, actor and notification outcome.                                                                                                                               |
| AT-013 | Day-of worker list          | Worker sees only authorized assigned jobs with status/readiness summaries.                                                                                                                                             |
| AT-014 | Briefing required           | Tapping Start from an assigned job opens the operational briefing first; no start event occurs until required acknowledgement is complete.                                                                             |
| AT-015 | Site access info            | Briefing displays job address, site contact, access/parking and customer/site notes configured for that job.                                                                                                           |
| AT-016 | Approved scope              | Briefing displays the current approved scope, exclusions and accepted change orders.                                                                                                                                   |
| AT-017 | SOP version                 | Briefing displays service SOP/checklist and records the version acknowledged at start.                                                                                                                                 |
| AT-018 | Hazards                     | Briefing merges service-template hazards and site/job-specific hazards without overwriting either source.                                                                                                              |
| AT-019 | Safety controls             | Each high-priority hazard can show control/PPE/stop-work guidance and acknowledgement status.                                                                                                                          |
| AT-020 | Tools checklist             | Critical tool marked missing keeps job in Needs Attention/Blocked according to configuration and records resolution/override.                                                                                          |
| AT-021 | Materials checklist         | Critical material quantity/model is visible and can be verified; substitution requiring approval cannot be silently marked equivalent.                                                                                 |
| AT-022 | Pre-start photos            | Service/job configured to require arrival photos cannot start until photos exist or authorized exception is recorded.                                                                                                  |
| AT-023 | Site mismatch               | Worker records that site conditions differ materially; Start is blocked/paused and a triage/escalation task is generated.                                                                                              |
| AT-024 | Permit/license prerequisite | Admin-marked licensed/permit-dependent work cannot start while prerequisite is pending.                                                                                                                                |
| AT-025 | Offline briefing            | After loading a job, worker loses connectivity and can still view cached scope, site info, SOP, hazards, tools/materials and escalation contacts.                                                                      |
| AT-026 | Offline evidence sync       | Worker captures permitted notes/photos offline; UI shows pending sync and later associates them with the correct job without duplicates.                                                                               |
| AT-027 | Briefing change highlight   | Dispatcher changes access instructions after worker last viewed job; worker sees “changed” indicator before start/resume.                                                                                              |
| AT-028 | En route notification       | Worker sets En Route; customer gets configured operational message and system logs delivery state.                                                                                                                     |
| AT-029 | Delay update                | Worker/dispatcher changes ETA; original schedule remains in history and customer receives the updated window.                                                                                                          |
| AT-030 | No-start blocked site       | Worker selects unsafe/inaccessible; records reason/evidence; system does not force work timer/start and queues supervisor follow-up.                                                                                   |
| AT-031 | Task evidence               | Worker adds measurement/photo to a specific task; it remains associated after task completion.                                                                                                                         |
| AT-032 | Change order                | Worker proposes extra scope; work remains unapproved until authorized customer approval; approved delta updates active scope without rewriting original.                                                               |
| AT-033 | Customer verbal request     | Worker records customer request without immediately treating it as approved paid scope.                                                                                                                                |
| AT-034 | Emergency stabilization     | Authorized emergency-stabilization path records reason, actions, evidence and notifications separately from normal change order.                                                                                       |
| AT-035 | Incident report             | Worker can report injury/property damage/near miss; high severity triggers required escalation queue.                                                                                                                  |
| AT-036 | Stop-work access            | Stop Work/Report Hazard control remains available after job start and does not require navigating back to admin screens.                                                                                               |
| AT-037 | Material usage              | Worker records materials used/returned/waste without editing customer price.                                                                                                                                           |
| AT-038 | Reassignment                | A second worker assigned mid-job receives open tasks, hazards, changes and material status before resume.                                                                                                              |
| AT-039 | Service-specific QA         | Completion is blocked until required QA checks for the service are answered or exception is authorized.                                                                                                                |
| AT-040 | After photos                | Configured completion photos are required and tagged to job area/task.                                                                                                                                                 |
| AT-041 | Punch list                  | Customer/worker identifies unfinished item; job can be work-complete but punch-open; item remains assigned and visible.                                                                                                |
| AT-042 | Customer walkthrough        | System records accepted / accepted-with-punch / unavailable / disputed outcome.                                                                                                                                        |
| AT-043 | Final invoice readiness     | Invoice generation reflects approved estimate + approved change orders + prior deposit/payment and does not include unapproved requested work.                                                                         |
| AT-044 | Cash payment                | Authorized user records cash; receipt is created and accounting dashboard shows it pending/complete reconciliation according to workflow.                                                                              |
| AT-045 | Check payment               | Authorized user records check with reference and receipt; correction uses auditable reversal/adjustment instead of deleting history.                                                                                   |
| AT-046 | Payment privacy             | Worker without accounting permission cannot access unrelated financial details or change reconciliation status.                                                                                                        |
| AT-047 | Customer portal isolation   | Customer A cannot access Customer B estimate/job/invoice by altering URL/object identifier.                                                                                                                            |
| AT-048 | Internal note isolation     | Internal risk/complaint/legal/employee note does not appear in customer portal/export intended for customer.                                                                                                           |
| AT-049 | Photo visibility            | Internal-only photo stays hidden from customer until authorized share classification is changed.                                                                                                                       |
| AT-050 | Marketing photo consent     | Operational job photo is not automatically eligible for marketing; separate consent state is checked.                                                                                                                  |
| AT-051 | Role offboarding            | Disabled employee account loses access while prior audit records still identify historical actions.                                                                                                                    |
| AT-052 | AI least privilege          | AI invoked by worker cannot retrieve unrelated jobs or owner-only financial data.                                                                                                                                      |
| AT-053 | AI approval boundary        | Estimate Assistant can draft but cannot mark an estimate customer-approved or alter approved price without authorized workflow.                                                                                        |
| AT-054 | Automation retry            | A transient integration failure retries without creating duplicate job/invoice/message.                                                                                                                                |
| AT-055 | Notification failure        | Failed customer message is visible to responsible staff with retry/alternative-contact path.                                                                                                                           |
| AT-056 | Search                      | Authorized admin finds a record by customer, property, job/estimate/invoice number and service.                                                                                                                        |
| AT-057 | Audit protected change      | Admin changes deposit policy or user privilege; audit captures actor/time/old-new state or sufficient change detail.                                                                                                   |
| AT-058 | Backup restore evidence     | Operational owner can show latest backup status and documented restore-test result/record according to maintenance process.                                                                                            |
| AT-059 | Rework linkage              | Return visit is linked to original job and classified as warranty/rework/new scope/customer issue/product issue/other.                                                                                                 |
| AT-060 | Closeout packet             | Authorized admin exports a job packet containing approved scope/change history, operational start/briefing acknowledgement, selected evidence, QA/punch, invoice and payment/receipt records according to permissions. |

# 19. Release readiness and implementation handoff

## 19.1 Launch-critical (P0)

- Public bilingual service/inquiry flow with service-area handling and \$150 minimum disclosure.

- Customer/contact/property/lead records with secure access and duplicate handling.

- Estimate creation, versioning, customer approval and conversion to job.

- Scheduling/assignment and day-of worker job list.

- Complete Worker Start Job Operational Briefing with scope, site info, SOP, hazards, safety guidance, tools, materials, documents, pre-start evidence and stop-work/escalation.

- In-job tasks, photos/notes, exception/change-order request, incident reporting and basic time/status events.

- Service-specific QA/closeout, customer walkthrough/punch, electronic invoice and cash/check payment recording/receipts.

- Role-based access, audit logging for protected events, backups, basic observability and privacy/photo visibility controls.

- Admin management of services/SOP versions/hazard templates/tools/material templates and core business configuration.

**Traceability IDs (added 2026-10-03; row text unchanged — see [03 Requirements traceability matrix](../AI%20Development%20Plans/03-requirements-traceability-matrix.md)):** LAUNCH-001 Public bilingual service/inquiry flow with service-area h... · LAUNCH-002 Customer/contact/property/lead records with secure access... · LAUNCH-003 Estimate creation, versioning, customer approval and conv... · LAUNCH-004 Scheduling/assignment and day-of worker job list. · LAUNCH-005 Complete Worker Start Job Operational Briefing with scope... · LAUNCH-006 In-job tasks, photos/notes, exception/change-order reques... · LAUNCH-007 Service-specific QA/closeout, customer walkthrough/punch,... · LAUNCH-008 Role-based access, audit logging for protected events, ba... · LAUNCH-009 Admin management of services/SOP versions/hazard template...

## 19.2 Near-term (P1)

- Offline sync hardening, scan/check loadout improvements, route/ETA integration, richer customer portal, automated reminders, accounting exports/reconciliation aids.

- AI role workspaces with permission-scoped retrieval, draft outputs, evidence/unknown labeling and human approvals.

- Rework analytics, service/SOP feedback loop, job costing, dashboards and exception queues.

- Subcontractor onboarding/agreements/limited portal after policy and insurance/compliance workflow is defined.

**Traceability IDs (added 2026-10-03; row text unchanged — see [03 Requirements traceability matrix](../AI%20Development%20Plans/03-requirements-traceability-matrix.md)):** NEAR-001 Offline sync hardening, scan/check loadout improvements,... · NEAR-002 AI role workspaces with permission-scoped retrieval, draf... · NEAR-003 Rework analytics, service/SOP feedback loop, job costing,... · NEAR-004 Subcontractor onboarding/agreements/limited portal after...

## 19.3 Implementation handoff checklist

- Create traceability from each requirement ID to one or more implementation tickets and acceptance tests.

- Define the exact service-area coverage configuration for launch and who may override it.

- Define the large-job deposit threshold/policy and authorized exceptions.

- Approve initial SOPs, hazards, tools, materials, stop-work conditions and QA checklists for every active service before enabling booking.

- Identify services requiring permit/license/qualification review or specialist referral and encode those as preparation/start gates.

- Approve English/Spanish customer templates and critical safety terminology.

- Configure roles for the two initial employees using least privilege; do not pre-grant future subcontractor permissions.

- Run all 60 acceptance tests in staging with non-production test contacts/payments before launch.

- Perform a field usability test on an actual phone: load briefing, go offline, start, capture photo, report hazard, create change request, complete QA, record payment, and sync.

- Perform security review of authentication, authorization/object access, uploads, secrets, backups, notification links and payment/invoice data before production.

**Traceability IDs (added 2026-10-03; row text unchanged — see [03 Requirements traceability matrix](../AI%20Development%20Plans/03-requirements-traceability-matrix.md)):** HND-001 Create traceability from each requirement ID to one or mo... · HND-002 Define the exact service-area coverage configuration for... · HND-003 Define the large-job deposit threshold/policy and authori... · HND-004 Approve initial SOPs, hazards, tools, materials, stop-wor... · HND-005 Identify services requiring permit/license/qualification... · HND-006 Approve English/Spanish customer templates and critical s... · HND-007 Configure roles for the two initial employees using least... · HND-008 Run all 60 acceptance tests in staging with non-productio... · HND-009 Perform a field usability test on an actual phone: load b... · HND-010 Perform security review of authentication, authorization/...

# Appendix A — Worker Start Job field checklist (implementation-ready)

| **Phase**         | **Checklist**                                                                                                                                                                                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Before leaving    | Confirm correct job/customer/address/time; read latest changes; verify access/parking; review scope/exclusions; review hazards/safety; load critical tools/equipment/materials; check customer-supplied items/rentals; confirm required documents/approvals.           |
| On arrival        | Confirm address/work area/contact; park/access appropriately; identify pets/occupants; inspect actual site vs briefing; capture required existing-condition photos; protect work area; identify utilities/emergency constraints relevant to task.                      |
| Before starting   | Confirm scope with customer only as needed; do not accept material extra work outside change process; complete required safety/PPE/site checks; confirm materials/models/colors; acknowledge SOP/hazards; start only when Ready or authorized exception is documented. |
| During work       | Follow SOP/manufacturer instructions; keep protection/containment; document concealed conditions; stop/escalate unsafe or unapproved conditions; record task progress/materials; obtain change approval before added work.                                             |
| Before completion | Perform service QA; correct defects/punch items within scope; capture after photos; clean area; remove waste/protection; account for tools/materials; restore utilities/components altered within scope.                                                               |
| Customer closeout | Walk through work when possible; record acceptance/punch/dispute/unavailable; provide care/cure/use notes; explain invoice/payment next step without making unauthorized promises.                                                                                     |
| After job         | Submit unresolved issues/incident/change follow-up; sync evidence; record cash/check correctly; return unused materials/rentals; close only when required operational/financial steps are complete.                                                                    |

**Traceability IDs (added 2026-10-03; row text unchanged — see [03 Requirements traceability matrix](../AI%20Development%20Plans/03-requirements-traceability-matrix.md)):** APXA-001 Before leaving · APXA-002 On arrival · APXA-003 Before starting · APXA-004 During work · APXA-005 Before completion · APXA-006 Customer closeout · APXA-007 After job

# Appendix B — Canonical 26-service inventory

| **Code** | **Category**     | **Service**                                       |
|----------|------------------|---------------------------------------------------|
| HI-01    | Home Improvement | Precision Picture Hanging & Art Installation      |
| HI-02    | Home Improvement | Deep-Clean Barbecue & Grill Maintenance           |
| HI-03    | Home Improvement | Driveway Pressure Washing & Surface Restoration   |
| HI-04    | Home Improvement | Professional TV Wall Mounting & Wire Hiding       |
| HI-05    | Home Improvement | Door Hardware & Smart Lock Installation           |
| HI-06    | Home Improvement | Gutter Maintenance & Leaf Protection              |
| HI-07    | Home Improvement | Attic Insulation Upgrades                         |
| HI-08    | Home Improvement | Closet & Shelving System Installation             |
| HI-09    | Home Improvement | Custom Trim & Architectural Molding Installation  |
| HI-10    | Home Improvement | Structural Fence Maintenance & Structural Repairs |
| HI-11    | Home Improvement | Structural Deck Maintenance & Deck Board Repairs  |
| DW-01    | Drywall          | Professional Patching, Repair & Handyman Services |
| DW-02    | Drywall          | Texture Matching & Popcorn Ceiling Removal        |
| DW-03    | Drywall          | Residential Remodeling & Home Additions           |
| DW-04    | Drywall          | High-Volume Residential New Construction          |
| PT-01    | Painting         | Professional Residential Interior Painting        |
| PT-02    | Painting         | Outdoor Deck & Fence Staining and Sealing         |
| PT-03    | Painting         | Brick Limewashing & Elastomeric Masonry Coatings  |
| PT-04    | Painting         | Wallpaper Removal & Surface Restoration           |
| CL-01    | Cleaning         | Routine House Cleaning                            |
| CL-02    | Cleaning         | Elite Deep Cleaning Service                       |
| CL-03    | Cleaning         | Move-In & Move-Out Cleaning                       |
| CL-04    | Cleaning         | Post-Construction & Post-Renovation Cleaning      |
| CL-05    | Cleaning         | Airbnb Turnover & Vacation Rental Management      |
| CL-06    | Cleaning         | Hotel-Style Luxury Housekeeping                   |
| CL-07    | Cleaning         | Air Duct & Ventilation Cleaning                   |

**End of specification.** All production implementation should treat safety, legal/compliance, tax/accounting and regulated-trade questions as policy/data that must be verified and approved by the responsible human owner or qualified professional; this document defines software workflow controls and does not itself authorize regulated work.


# Appendix C — Repository cross-reference (added 2026-10-03)

Canonical service identity, slugs and aliases are maintained in the [04 Service registry](../AI%20Development%20Plans/04-service-registry.md). File links below point to the current brainstorming/planning files, none of which is owner-approved yet.

| Code | Service | Pricing | Inventory | Agreement | SOP | Registry |
|---|---|---|---|---|---|---|
| HI-01 | Precision Picture Hanging & Art Installation | [pricing-picture-hanging](../Pricing/pricing-picture-hanging.md) | [inventory-picture-hanging](../Required%20inventory/inventory-picture-hanging.md) | [contract-picture-hanging](../Service%20Agreements/contract-picture-hanging.md) | [sop-picture-hanging](../Standard%20Of%20Operations/sop-picture-hanging.md) | [HI-01](../AI%20Development%20Plans/04-service-registry.md#HI-01) |
| HI-02 | Deep-Clean Barbecue & Grill Maintenance | [pricing-grill-cleaning](../Pricing/pricing-grill-cleaning.md) | [inventory-grill-cleaning](../Required%20inventory/inventory-grill-cleaning.md) | [contract-grill-cleaning](../Service%20Agreements/contract-grill-cleaning.md) | [sop-grill-cleaning](../Standard%20Of%20Operations/sop-grill-cleaning.md) | [HI-02](../AI%20Development%20Plans/04-service-registry.md#HI-02) |
| HI-03 | Driveway Pressure Washing & Surface Restoration | [pricing-driveway-cleaning](../Pricing/pricing-driveway-cleaning.md) | [inventory-driveway-cleaning](../Required%20inventory/inventory-driveway-cleaning.md) | [contract-driveway-cleaning](../Service%20Agreements/contract-driveway-cleaning.md) | [sop-driveway-cleaning](../Standard%20Of%20Operations/sop-driveway-cleaning.md) | [HI-03](../AI%20Development%20Plans/04-service-registry.md#HI-03) |
| HI-04 | Professional TV Wall Mounting & Wire Hiding | [pricing-tv-mounting](../Pricing/pricing-tv-mounting.md) | [inventory-tv-mounting](../Required%20inventory/inventory-tv-mounting.md) | [contract-tv-mounting](../Service%20Agreements/contract-tv-mounting.md) | [sop-tv-mounting](../Standard%20Of%20Operations/sop-tv-mounting.md) | [HI-04](../AI%20Development%20Plans/04-service-registry.md#HI-04) |
| HI-05 | Door Hardware & Smart Lock Installation | [pricing-smart-locks](../Pricing/pricing-smart-locks.md) | [inventory-smart-locks](../Required%20inventory/inventory-smart-locks.md) | [contract-smart-locks](../Service%20Agreements/contract-smart-locks.md) | [sop-smart-locks](../Standard%20Of%20Operations/sop-smart-locks.md) | [HI-05](../AI%20Development%20Plans/04-service-registry.md#HI-05) |
| HI-06 | Gutter Maintenance & Leaf Protection | [pricing-gutter-maintenance](../Pricing/pricing-gutter-maintenance.md) | [inventory-gutter-guards](../Required%20inventory/inventory-gutter-guards.md) | [contract-gutter-maintenance](../Service%20Agreements/contract-gutter-maintenance.md) | [sop-gutter-maintenance](../Standard%20Of%20Operations/sop-gutter-maintenance.md) | [HI-06](../AI%20Development%20Plans/04-service-registry.md#HI-06) |
| HI-07 | Attic Insulation Upgrades | [pricing-attic-insulation](../Pricing/pricing-attic-insulation.md) | [inventory-attic-insulation](../Required%20inventory/inventory-attic-insulation.md) | [contract-attic-insulation](../Service%20Agreements/contract-attic-insulation.md) | [sop-attic-insulation](../Standard%20Of%20Operations/sop-attic-insulation.md) | [HI-07](../AI%20Development%20Plans/04-service-registry.md#HI-07) |
| HI-08 | Closet & Shelving System Installation | [pricing-closet-shelving](../Pricing/pricing-closet-shelving.md) | [inventory-closet-shelving](../Required%20inventory/inventory-closet-shelving.md) | [contract-closet-shelving](../Service%20Agreements/contract-closet-shelving.md) | [sop-closet-shelving](../Standard%20Of%20Operations/sop-closet-shelving.md) | [HI-08](../AI%20Development%20Plans/04-service-registry.md#HI-08) |
| HI-09 | Custom Trim & Architectural Molding Installation | [pricing-trim-molding](../Pricing/pricing-trim-molding.md) | [inventory-trim-molding](../Required%20inventory/inventory-trim-molding.md) | [contract-trim-molding](../Service%20Agreements/contract-trim-molding.md) | [sop-trim-molding](../Standard%20Of%20Operations/sop-trim-molding.md) | [HI-09](../AI%20Development%20Plans/04-service-registry.md#HI-09) |
| HI-10 | Structural Fence Maintenance & Structural Repairs | [pricing-fence-repair](../Pricing/pricing-fence-repair.md) | [inventory-fence-repair](../Required%20inventory/inventory-fence-repair.md) | [contract-fence-repair](../Service%20Agreements/contract-fence-repair.md) | [sop-fence-repair](../Standard%20Of%20Operations/sop-fence-repair.md) | [HI-10](../AI%20Development%20Plans/04-service-registry.md#HI-10) |
| HI-11 | Structural Deck Maintenance & Deck Board Repairs | [pricing-deck-repair](../Pricing/pricing-deck-repair.md) | [inventory-deck-repair](../Required%20inventory/inventory-deck-repair.md) | [contract-deck-repair](../Service%20Agreements/contract-deck-repair.md) | [sop-deck-repair](../Standard%20Of%20Operations/sop-deck-repair.md) | [HI-11](../AI%20Development%20Plans/04-service-registry.md#HI-11) |
| DW-01 | Professional Patching, Repair & Handyman Services | [pricing-drywall-patching](../Pricing/pricing-drywall-patching.md) | [inventory-drywall-patching](../Required%20inventory/inventory-drywall-patching.md) | [contract-drywall-patching](../Service%20Agreements/contract-drywall-patching.md) | [sop drywall-patching](../Standard%20Of%20Operations/sop%20drywall-patching.md) | [DW-01](../AI%20Development%20Plans/04-service-registry.md#DW-01) |
| DW-02 | Texture Matching & Popcorn Ceiling Removal | [pricing-popcorn-removal](../Pricing/pricing-popcorn-removal.md) | [inventory-popcorn-removal](../Required%20inventory/inventory-popcorn-removal.md) | [contract-popcorn-removal](../Service%20Agreements/contract-popcorn-removal.md) | [sop popcorn-removal](../Standard%20Of%20Operations/sop%20popcorn-removal.md) | [DW-02](../AI%20Development%20Plans/04-service-registry.md#DW-02) |
| DW-03 | Residential Remodeling & Home Additions | [pricing-drywall-remodeling](../Pricing/pricing-drywall-remodeling.md) | [inventory-drywall-remodeling](../Required%20inventory/inventory-drywall-remodeling.md) | [contract-drywall-remodeling](../Service%20Agreements/contract-drywall-remodeling.md) | [sop drywall-remodeling](../Standard%20Of%20Operations/sop%20drywall-remodeling.md) | [DW-03](../AI%20Development%20Plans/04-service-registry.md#DW-03) |
| DW-04 | High-Volume Residential New Construction | [pricing-new-construction](../Pricing/pricing-new-construction.md) | [inventory-new-construction](../Required%20inventory/inventory-new-construction.md) | [contract-new-construction](../Service%20Agreements/contract-new-construction.md) | [sop new-construction](../Standard%20Of%20Operations/sop%20new-construction.md) | [DW-04](../AI%20Development%20Plans/04-service-registry.md#DW-04) |
| PT-01 | Professional Residential Interior Painting | [pricing-interior-painting](../Pricing/pricing-interior-painting.md) | [inventory-interior-painting](../Required%20inventory/inventory-interior-painting.md) | [contract-interior-painting](../Service%20Agreements/contract-interior-painting.md) | [sop-interior-painting](../Standard%20Of%20Operations/sop-interior-painting.md) | [PT-01](../AI%20Development%20Plans/04-service-registry.md#PT-01) |
| PT-02 | Outdoor Deck & Fence Staining and Sealing | [pricing-deck-staining](../Pricing/pricing-deck-staining.md) | [inventory-deck-staining](../Required%20inventory/inventory-deck-staining.md) | [contract-deck-staining](../Service%20Agreements/contract-deck-staining.md) | [sop-deck-staining](../Standard%20Of%20Operations/sop-deck-staining.md) | [PT-02](../AI%20Development%20Plans/04-service-registry.md#PT-02) |
| PT-03 | Brick Limewashing & Elastomeric Masonry Coatings | [pricing-brick-limewashing](../Pricing/pricing-brick-limewashing.md) | [inventory-brick-limewashing](../Required%20inventory/inventory-brick-limewashing.md) | [contract-brick-limewashing](../Service%20Agreements/contract-brick-limewashing.md) | [sop-brick-limewashing](../Standard%20Of%20Operations/sop-brick-limewashing.md) | [PT-03](../AI%20Development%20Plans/04-service-registry.md#PT-03) |
| PT-04 | Wallpaper Removal & Surface Restoration | [pricing-wallpaper-removal](../Pricing/pricing-wallpaper-removal.md) | [inventory-wallpaper-removal](../Required%20inventory/inventory-wallpaper-removal.md) | [contract-wallpaper-removal](../Service%20Agreements/contract-wallpaper-removal.md) | [sop-wallpaper-removal](../Standard%20Of%20Operations/sop-wallpaper-removal.md) | [PT-04](../AI%20Development%20Plans/04-service-registry.md#PT-04) |
| CL-01 | Routine House Cleaning | [pricing-routine-cleaning](../Pricing/pricing-routine-cleaning.md) | [inventory-routine-cleaning](../Required%20inventory/inventory-routine-cleaning.md) | [contract-routine-cleaning](../Service%20Agreements/contract-routine-cleaning.md) | [sop Routine Cleaning Checklist](../Standard%20Of%20Operations/sop%20Routine%20Cleaning%20Checklist.md) | [CL-01](../AI%20Development%20Plans/04-service-registry.md#CL-01) |
| CL-02 | Elite Deep Cleaning Service | [pricing-deep-cleaning](../Pricing/pricing-deep-cleaning.md) | [inventory-deep-cleaning](../Required%20inventory/inventory-deep-cleaning.md) | [contract-deep-cleaning](../Service%20Agreements/contract-deep-cleaning.md) | [sop Deep Cleaning CheckList](../Standard%20Of%20Operations/sop%20Deep%20Cleaning%20CheckList.md) | [CL-02](../AI%20Development%20Plans/04-service-registry.md#CL-02) |
| CL-03 | Move-In & Move-Out Cleaning | [pricing-move-in-out](../Pricing/pricing-move-in-out.md) | [inventory-move-in-move-out](../Required%20inventory/inventory-move-in-move-out.md) | [contract-move-in-out](../Service%20Agreements/contract-move-in-out.md) | [sop Move-In and Move-Out Cleaning Checklist](../Standard%20Of%20Operations/sop%20Move-In%20and%20Move-Out%20Cleaning%20Checklist.md) | [CL-03](../AI%20Development%20Plans/04-service-registry.md#CL-03) |
| CL-04 | Post-Construction & Post-Renovation Cleaning | [pricing-post-construction](../Pricing/pricing-post-construction.md) | [inventory-post-construction](../Required%20inventory/inventory-post-construction.md) | [contract-post-construction](../Service%20Agreements/contract-post-construction.md) | [sop Post-Construction Cleaning Checklist](../Standard%20Of%20Operations/sop%20Post-Construction%20Cleaning%20Checklist.md) | [CL-04](../AI%20Development%20Plans/04-service-registry.md#CL-04) |
| CL-05 | Airbnb Turnover & Vacation Rental Management | [pricing-airbnb-turnover](../Pricing/pricing-airbnb-turnover.md) | [inventory-airbnb-turnover](../Required%20inventory/inventory-airbnb-turnover.md) | [contract-airbnb-turnover](../Service%20Agreements/contract-airbnb-turnover.md) | [sop Airbnb Cleaning and Turnover Checklist](../Standard%20Of%20Operations/sop%20Airbnb%20Cleaning%20and%20Turnover%20Checklist.md) | [CL-05](../AI%20Development%20Plans/04-service-registry.md#CL-05) |
| CL-06 | Hotel-Style Luxury Housekeeping | [pricing-hotel-housekeeping](../Pricing/pricing-hotel-housekeeping.md) | [inventory-hotel-housekeeping](../Required%20inventory/inventory-hotel-housekeeping.md) | [contract-hotel-housekeeping](../Service%20Agreements/contract-hotel-housekeeping.md) | [sop Hotel-Style Housekeeping Checklist](../Standard%20Of%20Operations/sop%20Hotel-Style%20Housekeeping%20Checklist.md) | [CL-06](../AI%20Development%20Plans/04-service-registry.md#CL-06) |
| CL-07 | Air Duct & Ventilation Cleaning | [pricing-air-duct-cleaning](../Pricing/pricing-air-duct-cleaning.md) | [inventory-air-duct-cleaning](../Required%20inventory/inventory-air-duct-cleaning.md) | [contract-air-duct-cleaning](../Service%20Agreements/contract-air-duct-cleaning.md) | [sop Air Duct and Vent Cleaning Checklist](../Standard%20Of%20Operations/sop%20Air%20Duct%20and%20Vent%20Cleaning%20Checklist.md) | [CL-07](../AI%20Development%20Plans/04-service-registry.md#CL-07) |

# Appendix D — Document control and review notes (added 2026-10-03)

| Item | Note |
|---|---|
| Status | Baseline draft reconstructed from prior requirements work (see the document header table). Not yet approved by the owner. |
| Authority | Primary requirements baseline for software and operations behaviour. Owner decisions recorded in [20 Decision log](../AI%20Development%20Plans/20-decision-log.md) take precedence when they explicitly supersede a requirement. |
| Traceability | Existing IDs (PERM, CX, EST, FIN, SCH, START, JOB, QA, REC, COM, NFR, AT) are unchanged. ID keys added on 2026-10-03: BIZ, ROLE, MOD, STG, BRF, UXE, RECT, NTF, AIR, AIC, OWN, ENT, STM, RPT, LAUNCH, NEAR, HND, APXA and service-card field keys `<CODE>.INT/TLS/MAT/HAZ/SAF/QAC`. |
| Known issues | Tracked in [02 Gap analysis](../AI%20Development%20Plans/02-gap-analysis.md) (contradictions with pricing, agreements, SOPs and inventory files). |
| Folder name | The folder name "Requierments" is misspelled. A controlled rename is planned in [34 Naming and migration plan](../AI%20Development%20Plans/34-naming-and-migration-plan.md); do not rename ad hoc. |
| Change record | See [25 Change log](../AI%20Development%20Plans/25-change-log.md). |
