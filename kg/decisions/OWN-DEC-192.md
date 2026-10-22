---
id: OWN-DEC-192
type: decision
title: "Rules Review: the PROPOSED rules already built are approved, except the amendments of round 12"
status: active
area: ops
links:
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-HUMAN-REVIEW]]", "[[RULE-SERVER-AUTHZ]]"]
  related: ["[[OWN-DEC-174]]", "[[OQ-CONFIRMATION-PRECONDITIONS]]", "[[OQ-WINDOW-OFFER-RULES]]", "[[OQ-VISIT-CHANGE-DETAILS]]", "[[OQ-PACKET-DETAILS]]", "[[OQ-QUESTION-HANDLING]]", "[[OQ-CUSTOMER-ACCOUNT-DEFAULTS]]", "[[OQ-ACCESS-RECOVERY]]", "[[OQ-PORTAL-REFRESH-INTERVAL]]", "[[OQ-PORTAL-WORDING]]", "[[OQ-PRIVACY-REQUESTS]]", "[[TSK-0065]]", "[[TSK-0097]]", "[[TSK-0098]]", "[[TSK-0099]]"]
source: "owner answers 2026-10-21 R12 (Rules Review)"
---
The owner reviewed the summary page asked for in [[OWN-DEC-174]] (the Rules Review: 60 PROPOSED rules A1 to J2 built on staging) and answered (round 12), verbatim opening:

> HandyHub Rules Review — Final Owner Decisions
> Decision: Approve all proposed rules except the amendments below.
> I authorize you to finalize the HandyHub Rules Review using these corrections. Incorporate the decisions already established for HandyHub, and use the relevant Legal & Compliance, Safety & Liability, Bookkeeping & Accounting, Business Strategy, and Software Security skills when implementing or validating the affected workflows.
> My priorities are:
>
> * Protect customers, employees, and the business.
> * Maintain legally defensible, accurate records.
> * Avoid unnecessary Owner approval bottlenecks.
> * Automate routine operations safely.
> * Preserve audit trails and customer trust.
> * Complete the website and prepare for launch ASAP.
>
> The amendments below supersede the corresponding proposed rules.

Section J, verbatim:

> J — Scheduling Board
> Approve J1 and J2 as built.

Closing parts of the answer, verbatim:

> Additional Requirements
> 1. Preserve all previously approved HandyHub decisions unless expressly superseded here.
> 2. Resolve conflicting rules consistently and document the chosen interpretation.
> 3. Enforce critical approvals, access restrictions, scheduling conflicts, and safety protections server-side.
> 4. Do not create new Owner approval requirements for routine operations that can safely be automated.
> 5. Use existing authentication, scheduling, payment, document, and messaging integrations instead of duplicating functionality.
> 6. Keep historical estimates, approved change orders, accounting records, and audit evidence intact.
> 7. Use English for customers and support Spanish in the employee portal.
> 8. Run unit, integration, security, and end-to-end tests for every modified workflow.
> 9. Deploy implemented and validated features to protected staging.
> 10. Keep the Owner Acceptance Testing phase and the staging-only Reset Test Data feature.
> 11. Do not invite real customers or launch publicly until I explicitly authorize the appropriate release stage.
> 12. Do not falsely claim that legal, accounting, accessibility, or manual tests have been completed when they have not.
> Finalization
> Mark all rules as APPROVED once the amendments above have been incorporated, except for any specific implementation that still requires mandatory legal, accounting, or security verification.
> Do not leave unrelated completed work blocked by those reviews.
> Provide a final implementation report containing:
> * Rules approved unchanged
> * Rules modified
> * Conflicts resolved
> * Actual code changes
> * Test results
> * Staging deployment status
> * Remaining production launch blockers
> Proceed with implementation now without requesting additional approval for routine technical decisions.

Rules approved as built (J1 and J2 included), as they read on the page:

- **A3** Planning or moving a tentative visit is never blocked by holds; only confirming is.
- **A5** The customer only sees "This time can't be confirmed yet, so nothing is booked. HandyHub needs to finish reviewing your project first." (or the deposit-due message). Holds and staff details are never shown.
- **A6** Staff see each tentative visit's missing items under "Not ready to confirm", and the Confirm button appears only when nothing blocks.
- **B2** A choice made at or after expiry is refused ("These times are no longer held. HandyHub will offer new times."), and staff get a queue item to offer new times.
- **B5** Staff may withdraw an open offer with a written reason; the holds are released.
- **B6** The customer can ask for other times with an optional note (up to 500 characters). That releases the holds and opens a time-sensitive queue item; Estimators see it too.
- **B8** If a window can no longer be kept (time off, hours or a gate changed), the choice is refused with "That time is no longer available. Choose another time or request other times." and nothing changes.
- **C1** A reason is required for every reschedule of a booked visit, every reassignment, every cancellation and every declined customer request.
- **C3** Notice for the 24-hour cancellation rule is measured from the customer's request (or when staff record it for them) to the start of the arrival window.
- **C5** Only a verified deposit counts toward the fee; an uncleared check is shown separately and never counted.
- **C7** A reassignment keeps the window and reruns every confirmation check. On the board, dragging a visit onto another worker's lane only pre-fills Reassign.
- **C8** A visit has one open customer request at a time. A request closes on its own if the visit leaves "confirmed" some other way.
- **C9** A cancelled visit leaves the job's scheduling task open, so staff plan a new visit.
- **D4** Earlier photos shown in the packet are the project's internal or customer-shared photos (never restricted incident photos), opened through 5-minute secure links.
- **D5** The directions button opens the address in a maps app; nothing is sent until the worker taps it.
- **D6** The packet's scope shows description, quantity and unit only. It never shows a price, total, deposit or discount.
- **E1** Before publishing a question, staff must tick "This question does not ask the customer to inspect a hazardous area." The reply form also says "Only share what you can see or photograph safely."
- **E3** A reply answers its question, and anything more goes in Messages. The request returns to HandyHub's review once every open question is answered.
- **E6** Limits: 5,000 characters per reply or message, and per network per hour 30 reply-photo uploads and 60 portal messages.
- **F7** An open project page refreshes itself every 30 seconds (paused while the tab is hidden), and also when the customer presses Refresh.
- **H2** The Owner can't disable their own account, and the last active Owner can never be removed.
- **H5** When a worker is disabled, their upcoming appointments and offered windows are flagged for the Owner, never cancelled automatically.
- **H6** Requests still assigned to a disabled person also appear in the queue so you can reassign them.
- **H8** Spanish role names: Propietario, Oficina / Despacho, Estimador, Trabajador.
- **H9** In the audit log, sign-in entries (including failed sign-ins) are visible to the Owner only, and customers appear without their contact details.
- **J1** The week view runs Monday to Sunday.
- **J2** A worker with no working hours set shows 0 free minutes; the board never assumes hours.

Effect:
- Every rule listed above is decided as built and stops being PROPOSED; D4, D5 and D6 with server-side access control. G1 and G2 are approved only after the wording review of [[OWN-DEC-199]].
- The amended rules are decided in the owner's new wording: A1, A2, A4 ([[OWN-DEC-193]]); B1, B3, B4, B7 ([[OWN-DEC-194]]); C2, C4, C6 ([[OWN-DEC-195]]); D1, D2, D3 ([[OWN-DEC-196]]); E2, E4, E5 ([[OWN-DEC-197]]); F1 to F6 ([[OWN-DEC-198]]); G ([[OWN-DEC-199]]); H1, H3, H4, H7 ([[OWN-DEC-200]]); I1 to I5 ([[OWN-DEC-201]]). Each amendment supersedes the rule it names.
- A rule is marked APPROVED once its amendment is built, except where mandatory legal, accounting or security verification still applies; those reviews never block unrelated completed work.
- The additional requirements apply to every task that implements a rule: earlier decisions stay unless superseded; conflicts are resolved consistently with the chosen interpretation documented ([[OQ-READINGS-2026-10-21]]); critical approvals, access restrictions, scheduling conflicts and safety protections are enforced on the server; no new owner approval for routine operations that can be automated safely; existing integrations reused; historical estimates, change orders, accounting records and audit evidence kept intact; English for customers and Spanish in the employee portal ([[OWN-DEC-162]]); unit, integration, security and end-to-end tests for every modified workflow; validated features deployed to protected staging; Owner Acceptance Testing and Reset Test Data kept ([[OWN-DEC-191]]); no real customers or public launch without the owner's explicit release decision; no claim that legal, accounting, accessibility or manual tests were done when they were not.
- The final implementation report lists rules approved unchanged, rules modified, conflicts resolved, the actual code changes, test results, staging status and the remaining launch blockers.
- Answers, together with the amendments, [[OQ-CONFIRMATION-PRECONDITIONS]], [[OQ-WINDOW-OFFER-RULES]], [[OQ-VISIT-CHANGE-DETAILS]], [[OQ-PACKET-DETAILS]], [[OQ-QUESTION-HANDLING]], [[OQ-CUSTOMER-ACCOUNT-DEFAULTS]], [[OQ-ACCESS-RECOVERY]], [[OQ-PORTAL-REFRESH-INTERVAL]], [[OQ-PORTAL-WORDING]] and [[OQ-PRIVACY-REQUESTS]], and the PROPOSED notes of [[TSK-0065]], [[TSK-0097]], [[TSK-0098]] and [[TSK-0099]]. The configuration and catalog flags are updated by [[TSK-0153]].
