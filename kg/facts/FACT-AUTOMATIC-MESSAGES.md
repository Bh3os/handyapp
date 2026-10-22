---
id: FACT-AUTOMATIC-MESSAGES
type: fact
title: Messages that send automatically; everything else is staff-released
status: active
area: messaging
links:
  decided_by: ["[[OWN-DEC-65]]", "[[OWN-DEC-95]]", "[[OWN-DEC-98]]", "[[OWN-DEC-99]]", "[[OWN-DEC-100]]", "[[OWN-DEC-102]]", "[[OWN-DEC-105]]", "[[OWN-DEC-107]]", "[[OWN-DEC-110]]", "[[OWN-DEC-111]]", "[[OWN-DEC-114]]", "[[OWN-DEC-119]]", "[[OWN-DEC-209]]", "[[OWN-DEC-210]]"]
  uses: ["[[INT-Resend]]", "[[INT-Bird]]"]
  related: ["[[OWN-DEC-96]]", "[[OWN-DEC-97]]", "[[OWN-DEC-103]]", "[[OWN-DEC-120]]", "[[OWN-DEC-124]]", "[[HH-COM-04]]", "[[HH-COM-05]]", "[[HH-AUTO-01]]"]
source: "OWN-DEC-65, 95-111, 114, 119, 120; decision-briefs 2026-10-12T18:43-19:32"
---
**Changed by [[OWN-DEC-209]] and [[OWN-DEC-210]] (2026-10-22):** the verification code, question notice, estimate ready, invoice ready, not-a-fit, appointment changed and on-the-way messages get owner-authorized templates in the 21-template style (28 templates in all); unpaid-invoice reminders become automatic, 3 and 7 calendar days after the due date, with the safeguards of [[OWN-DEC-210]], and leave the staff-released list. [[TSK-0119]] and [[TSK-0091]] update the numbered table and the seeded `messages.automatic` value together.

**Changed by [[OWN-DEC-151]], [[OWN-DEC-152]], [[OWN-DEC-153]], [[OWN-DEC-155]], [[OWN-DEC-156]], [[OWN-DEC-157]], [[OWN-DEC-158]] (2026-10-21):** the list below is replaced as follows; [[TSK-0119]] updates the numbered table and the seeded `messages.automatic` value together.
- Automatic (customer): request received; verification code; secure access link; question notice; estimate-visit options; estimate visit confirmed; not-a-fit notice; estimate ready; estimate question answered (after staff release the answer); estimate reminder (3 days); question reminder (3 days); estimate approval confirmation (link only); work-appointment windows; work appointment confirmed; appointment reminder (24 hours before); appointment changed; visit cancelled; on the way; deposit invoice; proposed change; invoice ready; job complete (authorized final completion only); payment receipt (each confirmed recorded payment, partial payments say so); account email changed (old and new verified address).
- Released by staff: staff replies (Send is the release); the service-quality follow-up 48 hours after completion; review requests and marketing (consent needed); deletion-outcome notices; unpaid-invoice reminders until [[OQ-MESSAGES-OUTSIDE-THE-21]] is answered; repeat-service reminders.
- Released by the Owner: work paused, and other sensitive communications ([[OWN-DEC-152]]).
- Content: the first name and non-sensitive reference numbers may appear; amounts, property addresses, access codes, tokens and private details never ([[OWN-DEC-158]]).
- Email any hour; texts only after A2P 10DLC, within the recipient's local permitted hours ([[OWN-DEC-154]]).

**Value:** one configured list (a single policy list in the notification outbox, `messages.automatic` version 2, migration 0065 of [[TSK-0119]]). Only these customer messages send automatically; each has its owner-worded template ([[OWN-DEC-151]], and the seven of [[OWN-DEC-209]], worded as listed in [[OQ-MESSAGES-OUTSIDE-THE-21]]):

| # | Message | Trigger | Template ID | Decision |
| --- | --- | --- | --- | --- |
| 1 | Request receipt | request saved | `request_received` | [[OWN-DEC-95]], [[OWN-DEC-151]] |
| 2 | One-time verification code | customer asks for or resends a code | `verification_code` | [[OWN-DEC-65]], [[OWN-DEC-96]] |
| 3 | Secure project-access link (including re-requested access) | request saved; access re-requested | `secure_access_link` | [[OWN-DEC-97]], [[OWN-DEC-151]] |
| 4 | Question notice | staff publish a question | `question_notice` | [[OWN-DEC-98]] |
| 5 | Estimate-visit options available | staff publish visit windows | `estimate_visit_options` | [[OWN-DEC-99]], [[OWN-DEC-151]] |
| 6 | Estimate visit confirmed | slot reserved | `estimate_visit_confirmed` | [[OWN-DEC-99]], [[OWN-DEC-151]] |
| 7 | Not-a-fit decision notice pointing to the project | staff publish the decision | `not_a_fit` | [[OWN-DEC-100]] |
| 8 | Estimate ready (no amounts) | estimate version published | `estimate_ready` | [[OWN-DEC-102]] |
| 9 | Estimate question answered | staff release the answer | `estimate_follow_up` | [[OWN-DEC-151]], [[OWN-DEC-152]] |
| 10 | Estimate approval confirmation (link only) | approval recorded | `estimate_approval_confirmation` | [[OWN-DEC-105]], [[OWN-DEC-155]] |
| 11 | Work-appointment windows | staff publish work windows after approval | `work_appointment_windows` | [[OWN-DEC-156]] |
| 12 | Work appointment confirmed | work visit reserved | `work_appointment_confirmed` | [[OWN-DEC-105]], [[OWN-DEC-151]] |
| 13 | Appointment changed | a reschedule/reassignment is committed (not merely requested) | `appointment_changed` | [[OWN-DEC-119]] |
| 14 | Visit cancelled | an authorized cancellation is committed (never a reschedule) | `visit_cancelled` | [[OWN-DEC-152]] |
| 15 | On the way, with the assigned workers' first names and the arrival window | the assigned worker taps "On my way" | `on_the_way` | [[OWN-DEC-107]] |
| 16 | Deposit invoice | deposit invoice officially issued | `deposit_invoice` | [[OWN-DEC-152]] |
| 17 | Proposed change | change proposal published | `proposed_change` | [[OWN-DEC-152]] |
| 18 | Invoice ready (no amounts) | invoice issued | `invoice_ready` | [[OWN-DEC-110]] |
| 19 | Job complete | authorized final completion only | `job_complete` | [[OWN-DEC-152]] |
| 20 | Payment receipt | each confirmed, recorded payment (a partial payment says so) | `payment_receipt` | [[OWN-DEC-111]], [[OWN-DEC-152]] |
| 21 | Account email changed | sign-in email change completed (old and new verified address) | `account_email_changed` | [[OWN-DEC-151]], [[OWN-DEC-152]] |
| 22 | Estimate reminder (one, 3 days after successful delivery, while pending) | the version's estimate-ready notice delivered | `estimate_reminder` | [[OWN-DEC-153]], [[OWN-DEC-151]] |
| 23 | Question reminder (one, 3 days after the notice was delivered, while unanswered) | the question notice delivered | `question_reminder` | [[OWN-DEC-153]], [[OWN-DEC-151]] |
| 24 | Appointment reminder (24 hours before; none for a visit booked less than 24 hours ahead) | a visit confirmed or a reschedule committed | `appointment_reminder` | [[OWN-DEC-153]], [[OWN-DEC-151]] |

The estimate reminder, the question reminder and the appointment reminder ([[OWN-DEC-153]]) join this list when [[TSK-0121]] makes them automatic; until then they stay staff-released drafts with their owner-worded templates. **Built by [[TSK-0121]] (2026-10-22):** rows 22-24, `messages.automatic` version 3 (migration 0075); each is scheduled at its cadence and rechecked against its record when it sends. A message whose template is released but whose values its event does not supply yet is recorded as failed (`template_values_not_wired`) and shown to staff, never sent ([[HH-COM-13]]); [[TSK-0120]] wires the events that exist today.

Staff accounts (automatic): invitation and password-reset emails ([[OWN-DEC-114]]).

Staff notifications (automatic, internal): a customer reply to a question ([[OWN-DEC-98]]); Request Changes or Decline on an estimate ([[OWN-DEC-103]]); damage, injury or dispute cases to the owner ([[OWN-DEC-124]]); urgent field alerts (hazard, injury, stop-work) to the owner by text and app alert (owner answer 2026-10-05T18:03); schedule changes to affected workers ([[OWN-DEC-119]]).

Sent on a staff action with no second approval (not automatic, but the action is the release): a staff reply when Send is pressed ([[OWN-DEC-120]]).

Rules for every automatic message:
- One message per event: retries and double submissions never duplicate it; the current state is rechecked at send time, and stale or cancelled events send nothing ([[HH-COM-05]]).
- Email and text bodies carry no private details and no amounts; they link into verified project access.
- The customer's permitted, preferred channel is used, and both email and text when the customer gave both (owner answer 2026-10-05T17:41). Email via [[INT-Resend]], text via [[INT-Bird]].
- A delivery failure leaves the underlying record saved and shows staff a delivery issue with Retry.
- Customer messages are English ([[RULE-LANGUAGES]]). On staging, only approved test destinations receive them.

Everything else is a draft that staff release ([[OWN-DEC-65]] as amended): every reminder in [[FACT-REMINDER-CADENCES]], review requests, satisfaction checks, deletion-outcome notices, follow-ups and anything marketing (which also needs separate consent).
