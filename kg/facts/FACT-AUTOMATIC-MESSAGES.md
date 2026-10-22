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

**Value:** one configured list (a single policy list in the notification outbox). Only these customer messages send automatically:

| # | Message | Trigger | Decision |
| --- | --- | --- | --- |
| 1 | Request receipt (reference, services, summary, next steps, how to view the request) | request saved | [[OWN-DEC-95]] |
| 2 | One-time verification code | customer asks for or resends a code | [[OWN-DEC-65]], [[OWN-DEC-96]] |
| 3 | Secure project-access link / instructions (including re-requested access) | request saved; access re-requested | [[OWN-DEC-65]], [[OWN-DEC-97]] |
| 4 | "HandyHub has a question about your request. View and reply securely." | staff publish a question | [[OWN-DEC-98]] |
| 5 | Estimate-visit options available | staff publish visit windows | [[OWN-DEC-99]] |
| 6 | Estimate visit confirmed | slot reserved | [[OWN-DEC-99]] |
| 7 | Not-a-fit decision notice pointing to the project | staff publish the decision | [[OWN-DEC-100]] |
| 8 | "Your HandyHub estimate is ready" (no amounts) | estimate version published | [[OWN-DEC-102]] |
| 9 | Approval receipt with PDF of the approved estimate and terms | approval recorded | [[OWN-DEC-105]] |
| 10 | Work appointment confirmed | work visit reserved | [[OWN-DEC-105]] |
| 11 | Appointment changed | a reschedule/reassignment is committed (not merely requested) | [[OWN-DEC-119]] |
| 12 | On-the-way notice with assigned workers' first names and the arrival window | the assigned worker taps "On my way" | [[OWN-DEC-107]] |
| 13 | "Your HandyHub invoice is ready" (no amounts) | invoice issued | [[OWN-DEC-110]] |
| 14 | Payment receipt | invoice reaches $0.00 (Paid); or staff record a verified onsite payment and send its receipt | [[OWN-DEC-111]], [[OWN-DEC-110]] |

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
