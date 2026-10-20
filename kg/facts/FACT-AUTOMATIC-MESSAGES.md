---
id: FACT-AUTOMATIC-MESSAGES
type: fact
title: Messages that send automatically; everything else is staff-released
status: active
area: messaging
links:
  decided_by: ["[[OWN-DEC-65]]", "[[OWN-DEC-95]]", "[[OWN-DEC-98]]", "[[OWN-DEC-99]]", "[[OWN-DEC-100]]", "[[OWN-DEC-102]]", "[[OWN-DEC-105]]", "[[OWN-DEC-107]]", "[[OWN-DEC-110]]", "[[OWN-DEC-111]]", "[[OWN-DEC-114]]", "[[OWN-DEC-119]]"]
  uses: ["[[INT-Resend]]", "[[INT-Bird]]"]
  related: ["[[OWN-DEC-96]]", "[[OWN-DEC-97]]", "[[OWN-DEC-103]]", "[[OWN-DEC-120]]", "[[OWN-DEC-124]]", "[[HH-COM-04]]", "[[HH-COM-05]]", "[[HH-AUTO-01]]"]
source: "OWN-DEC-65, 95-111, 114, 119, 120; decision-briefs 2026-10-12T18:43-19:32"
---
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
