---
id: OQ-MESSAGES-OUTSIDE-THE-21
type: question
title: "Messages the 21 owner templates do not cover"
status: open
area: messaging
links:
  related: ["[[OWN-DEC-151]]", "[[OWN-DEC-152]]", "[[OWN-DEC-153]]", "[[OWN-DEC-175]]", "[[FACT-AUTOMATIC-MESSAGES]]", "[[OWN-DEC-209]]", "[[OWN-DEC-210]]"]
source: "owner answers 2026-10-21 (gap found while recording R1-R2)"
---
**Question:** the 21 templates of [[OWN-DEC-151]] leave out several messages the software already sends or drafts. Which wording, subject and release apply to them?

1. Automatic messages with earlier owner wording but not the new "HandyHub | ..." subject and "Hi {first name}," greeting: the verification code ([[OWN-DEC-150]]), the question notice ([[OWN-DEC-98]]), estimate ready ([[OWN-DEC-102]]), invoice ready ([[OWN-DEC-110]]). Do they adopt the new convention, and in which words?
2. Automatic messages with no wording at all: the not-a-fit notice ([[OWN-DEC-100]]), appointment changed ([[OWN-DEC-119]]), on the way ([[OWN-DEC-107]]).
3. Unpaid-invoice reminders ([[OWN-DEC-112]]): do they become automatic like the routine reminders of [[OWN-DEC-153]], and with what wording?
4. The privacy-request acknowledgment ([[OWN-DEC-175]]) and the privacy-request outcome notice ([[OWN-DEC-113]]).

- **Who answers:** the owner.
- **Until answered:** messages with released wording keep sending as they are; messages without wording stay NOT CONFIGURED (recorded as `template_not_configured` with a staff delivery issue, never shown as sent); unpaid-invoice reminders stay staff-released drafts; the privacy acknowledgment shows in the portal only.

**Answered in part (2026-10-22):** items 1 and 2 by [[OWN-DEC-209]] (the seven templates, wording written in the style of the 21 under the owner's authorization); item 3 by [[OWN-DEC-210]] (automatic reminders 3 and 7 days after the due date). Item 4 (the privacy-request acknowledgment and outcome notice) stays open.

**PROPOSED (TSK-0119, 2026-10-22): the wording written for items 1 and 2 under [[OWN-DEC-209]].** The owner gave no wording and authorized it to be written in the style of the 21 (owner confirmed 2026-10-22: the seven approved, 28 templates in all; "Hi there," confirmed; customer content English only; the verification code is an authentication message that delivery never holds in reminder queues or quiet hours). Under that authorization the content counts as Owner-approved; it is listed here so the Owner can review it and edit any template later as a new version. [[TSK-0119]] released it as email template versions (migration 0065); the delivery workflows are not marked verified until their tests pass ([[TSK-0120]]). Text-message forms are unchanged (texts stay off until A2P 10DLC, [[OWN-DEC-190]]). The verification code greets "Hi there," always, because the contact is not verified when the code is sent. The first name in a greeting is the first word of the contact's full name (PROPOSED reading: contacts store one full name). The action-button labels of the branded layout ("View your project", "Open your project", "View your estimate", "Choose a time", "Review the proposed change", "View your invoice", "View your receipt", "Open the secure link"; staff: "Open in the staff portal") are PROPOSED interface wording.

## MESSAGE 22 — Verification Code
**Template ID:** `verification_code` (message type `contact.verification_code`)

### Subject
HandyHub | Your Verification Code

### Body
Hi there,

Your HandyHub verification code is {verificationCode}. It expires in {codeLifetimeMinutes} minutes.

Enter this code where you requested it. For your security, do not share this code with anyone.

If you didn't request this code, you can safely ignore this email.

The HandyHub Team

## MESSAGE 23 — Question Notice
**Template ID:** `question_notice` (message type `question.notice`)

### Subject
HandyHub | We Have a Question About Your Request #{reference}

### Body
Hi {customerName},

HandyHub has a question about your request #{reference}.

You can view the question and reply securely through your project page:

{projectLink}

Your answer helps us move your request to the next step.

The HandyHub Team

## MESSAGE 24 — Estimate Ready
**Template ID:** `estimate_ready` (message type `estimate.ready`)

### Subject
HandyHub | Your Estimate #{estimateNumber} Is Ready

### Body
Hi {customerName},

Your HandyHub estimate #{estimateNumber} is ready.

You can review your estimate securely through your project page:

{projectLink}

If you have questions about your estimate, please contact us. We're happy to help.

Thank you for considering HandyHub!

The HandyHub Team

## MESSAGE 25 — Invoice Ready
**Template ID:** `invoice_ready` (message type `invoice.ready`)

### Subject
HandyHub | Your Invoice #{invoiceNumber} Is Ready

### Body
Hi {customerName},

Your HandyHub invoice #{invoiceNumber} is ready.

You can review the invoice details and the available payment options securely using the link below:

{invoiceLink}

If you have questions about your invoice, please contact our team.

Thank you for choosing HandyHub!

The HandyHub Team

## MESSAGE 26 — Not a Fit
**Template ID:** `not_a_fit` (message type `decision.not_a_fit`)

### Subject
HandyHub | Update on Your Request #{reference}

### Body
Hi {customerName},

Thank you for considering HandyHub for your request #{reference}.

After reviewing your request, our team has determined that we are not able to take on this project.

You can view the details of this decision through your secure project page:

{projectLink}

We appreciate your interest in HandyHub and your understanding.

The HandyHub Team

## MESSAGE 27 — Appointment Changed
**Template ID:** `appointment_changed` (message type `appointment.changed`)

### Subject
HandyHub | Your Appointment #{visitNumber} Has Been Updated

### Body
Hi {customerName},

Your HandyHub appointment #{visitNumber} has been updated, and the revised appointment is confirmed.

**Updated appointment details:**

Date: {visitDate}

Arrival window: {startTime} – {endTime} ({timeZone})

You can review your appointment and project details here:

{projectLink}

If the new time doesn't work for you, please contact us as soon as possible.

The HandyHub Team

## MESSAGE 28 — On the Way
**Template ID:** `on_the_way` (message type `visit.on_the_way`)

### Subject
HandyHub | Our Team Is on the Way

### Body
Hi {customerName},

Our team is on the way for your HandyHub visit #{visitNumber}.

Your team: {workerFirstNames}

Arrival window: {startTime} – {endTime} ({timeZone})

Please make sure the work area is safely accessible when our team arrives.

You can review your visit details here:

{projectLink}

The HandyHub Team
