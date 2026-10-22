---
id: OWN-DEC-152
type: decision
title: "Message delivery: routine transactional messages send automatically; owner-released sensitive notices; status model, outbox, tests and staging"
status: active
area: messaging
links:
  supersedes: ["[[OWN-DEC-65]]"]
  constrained_by: ["[[RULE-SYNTHETIC-DATA]]", "[[RULE-HUMAN-REVIEW]]"]
  uses: ["[[FACT-AUTOMATIC-MESSAGES]]", "[[INT-Resend]]", "[[INT-Bird]]"]
  related: ["[[OWN-DEC-111]]", "[[OWN-DEC-120]]", "[[HH-COM-06]]", "[[HH-COM-14]]"]
source: "owner answers 2026-10-21 R2-Q1 (specification sections 3, 5, 7, 8, 9, 12-16); R2-Q2"
---
Round 2, question 1: delivery sections of the owner's specification (sections 1, 2, 4 and 6 are in [[OWN-DEC-151]]).

> # 3. NOTIFICATION DELIVERY RULES
>
> ## 3.1 Automatic transactional emails
>
> Automatically send approved transactional notifications when the relevant event has been successfully committed.
>
> Examples include:
>
> - Request received
> - Appointment options published
> - Appointment confirmed
> - Estimate approved
> - Deposit invoice issued
> - Payment receipt created
> - Account security notification
>
> Do not require staff to manually release routine transactional notifications once production sending has been authorized.
>
> ## 3.2 Staff-controlled communications
>
> Require staff to explicitly release personalized customer replies.
>
> Require owner approval before sending sensitive communications involving:
>
> - Work pauses involving safety or liability
> - Incidents and property damage
> - Material customer disputes
> - Exceptional financial commitments
> - Other events already governed by an owner-approval rule
>
> Do not substitute a notification for a required workflow approval.
>
> ## 3.3 Email delivery hours
>
> Send approved transactional emails immediately after the event occurs, including outside business hours.
>
> Staff replies are delivered immediately after staff release.
>
> ## 3.4 SMS delivery hours
>
> Keep SMS delivery disabled until the required A2P 10DLC registration, consent requirements, and provider configuration are complete.
>
> For eligible non-urgent SMS messages:
>
> - Deliver only within configured permitted hours.
> - Default to 8:00 AM–10:00 PM in the recipient's local time zone, subject to stricter applicable requirements.
> - Queue messages outside permitted hours.
> - Resume delivery at the next allowed time.
> - Recheck message relevance, consent, and opt-out status before sending.
> - Do not send obsolete appointment reminders or expired scheduling notices.
>
> Determine the customer's applicable time zone using reliable location data.
>
> Do not assume that all Indiana customers use Eastern Time.
>
> A business's service hours are not necessarily the legally permitted marketing-message hours. Use message classification and applicable requirements.
>
> Urgent safety situations must use an approved escalation procedure, not an unrestricted SMS quiet-hours bypass.
>
> ## 3.5 Customer portal notifications
>
> Display project updates immediately in the customer's authenticated project portal.
>
> Portal visibility must not depend on successful email or SMS delivery.
>
> ## 3.6 Communication preferences
>
> Respect customer channel preferences where compatible with necessary service and security notices.
>
> Separate:
>
> - Transactional notifications
> - Account security notifications
> - Internal staff notifications
> - Marketing communications
>
> Do not treat ordinary service interactions as marketing consent.
>
> Provide required unsubscribe or opt-out mechanisms for applicable marketing communications.

> # 5. TRIGGER AND DELIVERY MATRIX
>
> | Template | Event | Timing | Release authority |
> |---|---|---|---|
> | request_received | Request submitted | Immediately | Automatic |
> | secure_access_link | Authorized link requested | Immediately | Automatic |
> | estimate_visit_options | Visit windows published | Immediately | Automatic |
> | estimate_visit_confirmed | Estimate visit booked | Immediately | Automatic |
> | estimate_reminder | Estimate pending | After 3 days | Automatic |
> | estimate_follow_up | Staff answer released | Immediately | Staff releases answer |
> | question_reminder | Question unanswered | Configured delay | Automatic |
> | estimate_approval_confirmation | Estimate approved | Immediately | Automatic |
> | work_appointment_windows | Work windows published | Immediately | Automatic |
> | work_appointment_confirmed | Work appointment booked | Immediately | Automatic |
> | appointment_reminder | Confirmed visit upcoming | 24 hours before | Automatic |
> | visit_cancelled | Confirmed visit cancelled | Immediately | Automatic |
> | deposit_invoice | Deposit invoice issued | Immediately | Automatic |
> | proposed_change | Change proposal published | Immediately | Automatic |
> | work_paused | Work paused | After owner approval | Owner |
> | job_complete | Authorized job closure | Immediately | Automatic |
> | payment_receipt | Payment confirmed | Immediately | Automatic |
> | customer_follow_up | Eligible completed job | Approved campaign schedule | Automatic if eligible |
> | staff_reply_wrapper | Staff reply released | Immediately | Staff |
> | staff_customer_replied | Customer reply received | Immediately | Automatic |
> | account_email_changed | Email change completed | Immediately | Automatic |

> # 7. MESSAGE STATUS MODEL
>
> Every outgoing message should have a reliable lifecycle.
>
> Use existing statuses where equivalent; otherwise support states such as:
>
> - `DRAFT`
> - `PENDING_APPROVAL`
> - `APPROVED`
> - `SCHEDULED`
> - `QUEUED`
> - `SENDING`
> - `PROVIDER_ACCEPTED`
> - `DELIVERED`
> - `FAILED`
> - `CANCELLED`
> - `EXPIRED`
> - `SUPPRESSED`
>
> Keep template-approval status separate from individual message-delivery status.
>
> Distinguish provider acceptance from verified delivery.
>
> Not all providers or channels can reliably confirm that the recipient read a message.
>
> Every message should record:
>
> - Message ID
> - Template ID and version
> - Triggering event ID
> - Related project/job/request ID
> - Recipient and channel
> - Required approval or release identity
> - Created time
> - Scheduled time
> - Sent time
> - Provider message ID
> - Available delivery status
> - Failure reason
> - Retry history
> - Suppression reason
> - Applicable consent/preferences decision
>
> Protect these records according to the approved retention schedule.

> # 8. RELIABLE EVENT-DRIVEN ARCHITECTURE
>
> Use the existing framework and infrastructure.
>
> Do not create a second messaging architecture if one already exists.
>
> Prefer transactional event recording and a durable outbox or an equivalent reliable delivery mechanism.
>
> Required behavior:
>
> 1. A business event is successfully committed.
> 2. The system records the notification event transactionally where practical.
> 3. The appropriate template and version are selected.
> 4. The recipient, permissions, preferences, and message classification are checked.
> 5. A message is created with a unique idempotency key.
> 6. Delivery is queued or scheduled.
> 7. The provider sends the message.
> 8. Provider responses update the delivery status.
> 9. Temporary failures are retried with bounded exponential backoff.
> 10. Permanent failures are surfaced to authorized staff.
>
> Use idempotency to avoid duplicate notifications caused by:
>
> - Repeated button clicks
> - Webhook redelivery
> - Concurrent workers
> - Application restarts
> - Network timeouts
> - Repeated scheduler executions
>
> Prevent duplicate payment receipts, estimate confirmations, and appointment notices.
>
> Use a dead-letter or failed-job process for messages that exhaust retries.
>
> Never silently discard failed notifications.

> # 9. CUSTOMER AND STAFF PORTAL REQUIREMENTS
>
> ## Customer portal
>
> Customers should be able to:
>
> - View project communications
> - Read staff replies
> - Reply to authorized project conversations
> - Review estimate documents
> - Review approved estimate versions
> - Select appointment windows
> - Review confirmed appointments
> - View invoices and payment receipts
> - Access current project status
> - Request new secure access links
>
> Customers must not see internal staff notifications or private risk/incident notes.
>
> ## Staff portal
>
> Authorized staff should be able to:
>
> - Review customer conversations
> - Draft replies
> - Release eligible replies
> - View message delivery status
> - Identify failed notifications
> - See pending approval requirements
> - Review customer questions
> - Publish appointment options
> - Identify expired appointment offers
> - Review customer responses
> - Retry eligible failed messages with authorization
> - Access only assigned or otherwise authorized projects
>
> Sensitive owner-only approvals must not be bypassable by ordinary staff.
>
> The staff interface must support the existing Spanish-only staff experience.

> # 12. COMPLIANCE AND SECURITY
>
> Before enabling production messaging:
>
> - Validate applicable email requirements, including CAN-SPAM classification where relevant.
> - Validate SMS consent and registration requirements, including A2P 10DLC.
> - Apply appropriate quiet-hours requirements.
> - Respect opt-out requests.
> - Restrict marketing messages appropriately.
> - Authenticate outgoing email domains with SPF, DKIM, and DMARC as applicable.
> - Use verified sender domains.
> - Protect API credentials and signing secrets.
> - Validate incoming provider webhook signatures.
> - Restrict staff access by role.
> - Log security-sensitive actions without exposing credentials or access tokens.
> - Follow existing retention, privacy, and account deletion rules.
> - Have attorney-reviewed legal disclosures and policies checked before production use where required.
>
> Do not assume that passing technical tests establishes legal compliance.

> # 13. AUTOMATED TEST REQUIREMENTS
>
> Implement automated tests covering all 21 templates.
>
> ## Template tests
>
> Verify:
>
> - Correct subject
> - Correct wording
> - Valid substitutions
> - No unresolved placeholders
> - HTML and plain-text rendering
> - Working secure links
> - Proper fallbacks
> - Mobile email layout
>
> ## Trigger tests
>
> Verify each notification is sent at the correct business event and is suppressed when the event conditions are not satisfied.
>
> ## Timing tests
>
> Verify:
>
> - Immediate transactional emails
> - Three-day estimate reminders
> - 24-hour appointment reminders
> - 24-hour work-window expirations
> - SMS quiet-hour queueing
> - Eastern and Central time zones
> - Daylight saving time changes
> - Cancellation and rescheduling behavior
>
> ## Financial tests
>
> Verify:
>
> - Approved-estimate receipt generation
> - Deposit invoice issuance
> - Payment confirmation handling
> - Partial payment wording
> - Duplicate Square webhook handling
> - Reconciliation-safe receipt creation
>
> ## Security tests
>
> Verify:
>
> - Expired access links
> - Invalid or revoked tokens
> - Cross-customer access attempts
> - Missing permissions
> - Invalid webhook signatures
> - Account email-change notices
> - Staff role restrictions
> - No sensitive credentials in email, logs, or error reports
>
> ## Reliability tests
>
> Verify:
>
> - Provider timeouts
> - Network failures
> - Retries
> - Duplicate events
> - Simultaneous worker execution
> - Queue recovery after application restart
> - Delivery failure visibility
> - Scheduled-message cancellation
> - Stale queued-message suppression
>
> ## End-to-end testing
>
> Use staging test accounts to complete these scenarios:
>
> **Scenario A — New request**
>
> Customer sends request → Request recorded → Receipt email queued/sent through test provider → Customer accesses project.
>
> **Scenario B — Estimate scheduling**
>
> Staff publishes estimate-visit options → Customer receives notice → Customer selects window → Visit confirmed → Reminder scheduled.
>
> **Scenario C — Estimate approval**
>
> Estimate issued → Customer reviews estimate → Customer approves → Immutable receipt generated → Secure approval email sent → Job created.
>
> **Scenario D — Work scheduling**
>
> Staff publishes available work windows → Customer receives 24-hour notice → Customer selects appointment → Booking validated → Confirmation sent → Reminder scheduled.
>
> **Scenario E — Payment**
>
> Deposit invoice issued → Customer receives invoice → Payment confirmed in sandbox or manually recorded test workflow → Receipt generated once.
>
> **Scenario F — Change order**
>
> Staff creates proposal → Customer receives notification → Customer reviews and approves → Approved version preserved → Job updated according to authorization rules.
>
> **Scenario G — Staff communication**
>
> Staff drafts reply → Staff releases → Portal updates immediately → Customer receives email → SMS follows permitted hours → Customer replies → Authorized staff notified.
>
> **Scenario H — Cancellation**
>
> Visit confirmed → Reminder scheduled → Visit cancelled → Cancellation notice delivered → Pending reminder cancelled.
>
> **Scenario I — Security**
>
> Customer changes account email through authorized verification → Previous and new addresses receive appropriate notices → Audit record preserved.
>
> **Scenario J — Work interruption**
>
> Staff records pause → Required safety process followed → Owner reviews customer notice → Approved notice released → No unauthorized automatic sensitive notification.

> # 14. DEPLOYMENT AND RELEASE REQUIREMENTS
>
> Implement and publish the completed system to private staging.
>
> Use test email addresses, sandbox providers, and fake project data.
>
> Do not enable actual production delivery without owner authorization.
>
> For staging:
>
> - Keep the staging site protected.
> - Ensure test data cannot be confused with real production data.
> - Prevent accidental delivery to real customers.
> - Keep SMS disabled until registration and consent requirements are satisfied.
> - Use separate staging and production secrets where supported.
> - Show message states in the staff dashboard.
> - Provide realistic template previews.
> - Verify delivery logs.
> - Test every workflow.
>
> Do not falsely mark messages as successfully delivered if they were intercepted by a test provider or only previewed.
>
> Report this distinction accurately.

> # 15. FINAL ACCEPTANCE CRITERIA
>
> Consider the messaging implementation complete only when:
>
> 1. All 21 templates exist with correct wording and identifiers.
> 2. All required placeholders are mapped and validated.
> 3. Every automatic template has a verified trigger.
> 4. Staff-release and owner-approval requirements work.
> 5. No real customer communication occurs during staging tests.
> 6. Appointment confirmations never precede successful booking.
> 7. Estimate approval receipts preserve immutable approved documents.
> 8. Appointment reminders and follow-ups are cancelled when no longer relevant.
> 9. Delivery status and failures are visible to authorized staff.
> 10. Duplicate-event handling is tested.
> 11. Eastern and Central time-zone handling is verified.
> 12. Email and SMS scheduling policies work.
> 13. Security and project-access controls are verified.
> 14. Payment receipts are generated only for confirmed transactions.
> 15. Staff and customer portals correctly display communication records.
> 16. The full end-to-end staging test suite passes, or remaining failures are explicitly reported.
> 17. The system is deployed to private staging.
> 18. The owner receives a concise implementation report explaining exactly what is operational, what remains blocked, and what requires approval before production.

> # 16. IMPLEMENTATION REPORT FORMAT
>
> After implementation, return:
>
> **A. Completed functionality**
>
> List the notification workflows implemented and their actual test status.
>
> **B. Existing functionality reused**
>
> Identify existing modules that were preserved.
>
> **C. Changes made**
>
> Identify modified components, database migrations, event handlers, and integrations.
>
> **D. Tests**
>
> Show passed, failed, and untested scenarios. Do not claim tests passed unless they ran successfully.
>
> **E. Remaining issues**
>
> List blockers, unresolved dependencies, compliance requirements, and missing external configuration.
>
> **F. Staging deployment**
>
> Provide the verified staging URL and deployment status if deployment succeeds.
>
> **G. Production activation**
>
> Identify the exact owner approvals and verified configuration necessary to enable live communications.
>
> Do not mark the task complete simply because message templates are present.
>
> **Final objective:** Deliver a reliable, secure, professional, fully integrated HandyHub messaging system that minimizes unnecessary manual work, keeps customers informed, respects required approvals, and provides clear operational visibility to the owner and staff.

Round 2, question 2. Question asked: "Which of your new messages should send AUTOMATICALLY? The rest become drafts that a staff member reviews and sends. ("Work paused" always needs your approval before sending, as you said.)"

Owner answer:

> Select all four messages for **automatic delivery**, with the following safeguards:
>
> 1. **Visit Cancelled:** Send immediately after an authorized cancellation is successfully committed. Do not send for drafts, tentative cancellations, or ordinary rescheduling events. Cancel any pending appointment reminders.
>
> 2. **Deposit Invoice:** Send automatically only after the deposit invoice is officially issued and approved where required. Do not send when an invoice is merely drafted. Respect approved deposit waivers and use a secure invoice link.
>
> 3. **Job Complete:** Send automatically only after the job reaches its authorized final completion status, including required walkthrough and punch-list checks. An employee marking a visit as "Finished" must not independently trigger this message.
>
> 4. **Payment Receipt:** Send automatically after a payment is verified and recorded with an appropriate payment status. For Square, use verified payment confirmation. For cash, checks, and manual payments, apply the appropriate verification and reconciliation rules. Never claim that a pending or uncleared payment has fully settled.
>
> For all four:
> - Send only once per qualifying event.
> - Use the approved HandyHub templates.
> - Validate the event and required fields before delivery.
> - Keep complete audit and delivery records.
> - Display notifications immediately in the customer project portal.
> - Do not send unresolved placeholders.
> - Keep production delivery disabled until testing and final authorization are complete.
>
> **Work Paused must always require owner review and explicit approval before customer delivery.**
>
> Implement and test these rules in staging.

Effect:
- Replaces the staff-release default of [[OWN-DEC-65]]: once production sending is authorized, routine transactional notifications send automatically when their business event is committed; staff are never asked to release them by hand.
- Staff release personalized replies ([[OWN-DEC-154]]) and the service-quality follow-up ([[OWN-DEC-157]]). The Owner approves, before sending, the sensitive communications: work paused (MESSAGE 15), incidents and property damage, material disputes, exceptional financial commitments, and events already under an owner-approval rule. A notification never replaces a required workflow approval.
- Release authority per template is the section 5 matrix. Round 2 question 2 adds Visit Cancelled, Deposit Invoice, Job Complete and Payment Receipt to automatic delivery, with the owner's safeguards: a committed authorized cancellation only (never a draft, a tentative cancellation or a reschedule) that also cancels pending reminders; an officially issued deposit invoice only, respecting waivers; job complete only at the authorized final completion after walkthrough and punch-list checks, never on a worker's Finished; a payment receipt only for a verified, recorded payment, never claiming that pending or uncleared money has settled.
- The automatic list stays one policy list ([[FACT-AUTOMATIC-MESSAGES]], [[HH-COM-06]]), updated with these messages.
- Email: approved transactional emails send immediately at any hour; account security notices are never held by marketing quiet hours. Texts: disabled until A2P 10DLC registration, consent and provider setup are complete ([[OWN-DEC-190]]); then 8 AM–10 PM in the recipient's local zone, queued outside, rechecked before sending ([[OWN-DEC-154]], [[OWN-DEC-159]]).
- Portal visibility is immediate and never depends on email or text delivery.
- Classification keeps transactional, account security, internal staff and marketing messages apart; an ordinary service interaction is never marketing consent; marketing messages carry the required opt-out.
- Every message has the lifecycle and record of section 7 ([[HH-COM-14]]); template approval is separate from delivery status; provider acceptance is never shown as delivery.
- Delivery runs on the existing outbox and job queue ([[HH-ARC-08]], [[HH-ARC-09]]), never a second messaging system: one idempotency key per message, bounded exponential retry, a failed-job state visible to authorized staff, nothing silently discarded.
- Section 9 portal rules apply; owner-only approvals cannot be bypassed by ordinary staff; the staff interface is in Spanish for Spanish-speaking staff ([[OWN-DEC-162]]).
- Section 12: before production the sending domain is authenticated (SPF, DKIM, DMARC; it waits for the domain, [[OWN-DEC-184]]), webhook signatures are validated, and disclosures get attorney review ([[OQ-ATTORNEY-PRIVACY]]). Passing technical tests never establishes legal compliance.
- Section 13 tests and the end-to-end scenarios A–J run on staging test accounts; section 14: only test destinations and sandbox providers on staging, and nothing intercepted or previewed is reported as delivered; production delivery needs the owner's authorization. The hand-over report uses section 16.
- Partly replaces [[OWN-DEC-111]]: a payment receipt sends for each confirmed, recorded payment, saying clearly when it is partial, not only when the invoice reaches $0.00.
- Built by [[TSK-0119]] and [[TSK-0120]]; the triggers of events that do not exist yet are built with those events ([[TSK-0077]] work paused, [[TSK-0082]] proposed change, [[TSK-0084]] job complete, [[TSK-0085]] deposit invoice, [[TSK-0087]] payment receipt, [[TSK-0092]] follow-up).
