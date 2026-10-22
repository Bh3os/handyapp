-- 0065 Messaging core: the owner's templates, the template-variable registry's records and the message lifecycle
-- (TSK-0119; HH-COM-13, HH-COM-14, HH-COM-04, HH-COM-02, OWN-DEC-151, OWN-DEC-152, OWN-DEC-158, FACT-AUTOMATIC-MESSAGES,
-- OQ-MESSAGES-OUTSIDE-THE-21, T74).
-- - Template versions gain the owner's template ID (request_received ... account_email_changed, and the seven
--   messages of the owner's 2026-10-22 answer). Versions stay append-only: earlier versions keep a NULL template ID.
-- - Deliveries gain the rest of the record of OWN-DEC-152 section 7: the template ID and layout version used, when the
--   message is due (scheduled_at) and when the provider accepted it (sent_at), the consent or preference decision
--   applied, and the names (never the values) of the variables a failed render was missing.
-- - platform.message_delivery_attempts: the retry history, one append-only row per send attempt with what happened.
-- - The owner-worded email templates are released (English; the staff notice also in Spanish, AI-reviewed). Their
--   wording is the owner's (OWN-DEC-151 section 4) or was written under the owner's 2026-10-22 answer "Write them,
--   approved" (recorded PROPOSED in OQ-MESSAGES-OUTSIDE-THE-21 until its decision node exists). Text-message versions
--   are unchanged: texts stay off until A2P 10DLC (OWN-DEC-190).
-- - messages.automatic version 2 lists the automatic customer messages of FACT-AUTOMATIC-MESSAGES; the three routine
--   reminders join it when TSK-0121 makes them automatic.
ALTER TABLE platform.message_template_versions
  ADD COLUMN template_id text CHECK (template_id ~ '^[a-z][a-z0-9_]{1,59}$');
COMMENT ON COLUMN platform.message_template_versions.template_id IS
  'The owner''s template ID (OWN-DEC-151 section 4), for versions released from TSK-0119 on.';

ALTER TABLE platform.message_deliveries
  ADD COLUMN template_id text CHECK (template_id ~ '^[a-z][a-z0-9_]{1,59}$'),
  ADD COLUMN layout_version integer CHECK (layout_version >= 1),
  ADD COLUMN scheduled_at timestamptz,
  ADD COLUMN sent_at timestamptz,
  ADD COLUMN consent_decision text CHECK (consent_decision ~ '^[a-z][a-z0-9_]{1,59}$'),
  ADD COLUMN missing_variables text[] NOT NULL DEFAULT '{}' CHECK (cardinality(missing_variables) <= 60);
COMMENT ON COLUMN platform.message_deliveries.scheduled_at IS
  'When the message is due to send (HH-COM-14): the queued time, or the later release time it waits for.';
COMMENT ON COLUMN platform.message_deliveries.sent_at IS
  'When the provider accepted the message (provider acceptance, never shown as delivery).';
COMMENT ON COLUMN platform.message_deliveries.missing_variables IS
  'Names of the template variables a failed render was missing or that are not wired yet; never their values.';

CREATE TABLE platform.message_delivery_attempts (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  delivery_id         uuid NOT NULL REFERENCES platform.message_deliveries (id),
  attempt             integer NOT NULL CHECK (attempt >= 1),
  state               text NOT NULL CHECK (state IN ('queued', 'sent', 'delivered', 'failed', 'suppressed', 'cancelled')),
  error_code          text CHECK (char_length(error_code) <= 120),
  provider            text CHECK (provider IN ('resend', 'bird', 'fake')),
  provider_message_id text CHECK (char_length(provider_message_id) <= 200),
  template_version    integer,
  recorded_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (delivery_id, attempt)
);
CREATE TRIGGER message_delivery_attempts_append_only BEFORE UPDATE OR DELETE ON platform.message_delivery_attempts
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE platform.message_delivery_attempts IS
  'Retry history of message deliveries (HH-COM-14): one row per send attempt; metadata only, never message text.';

-- The owner's templates (email, English). New message types first get their template row.
INSERT INTO platform.message_templates (message_key, channel, audience) VALUES
  ('request.receipt', 'email', 'customer'),
  ('project.access_link', 'email', 'customer'),
  ('estimate_visit.options', 'email', 'customer'),
  ('estimate_visit.confirmed', 'email', 'customer'),
  ('reminder.unanswered_estimate', 'email', 'customer'),
  ('estimate.question_answered', 'email', 'customer'),
  ('reminder.unanswered_question', 'email', 'customer'),
  ('approval.receipt', 'email', 'customer'),
  ('work_visit.options', 'email', 'customer'),
  ('appointment.confirmed', 'email', 'customer'),
  ('reminder.appointment', 'email', 'customer'),
  ('visit.cancelled', 'email', 'customer'),
  ('invoice.deposit', 'email', 'customer'),
  ('change_order.proposed', 'email', 'customer'),
  ('job.paused', 'email', 'customer'),
  ('job.complete', 'email', 'customer'),
  ('payment.receipt', 'email', 'customer'),
  ('reminder.satisfaction_check', 'email', 'customer'),
  ('staff.reply', 'email', 'customer'),
  ('staff_notice.customer_reply', 'email', 'staff'),
  ('account.contact_changed', 'email', 'customer'),
  ('decision.not_a_fit', 'email', 'customer'),
  ('appointment.changed', 'email', 'customer'),
  ('visit.on_the_way', 'email', 'customer')
ON CONFLICT (message_key, channel) DO NOTHING;

-- One version per message: the next version number of its email template in its locale.
CREATE FUNCTION pg_temp.release(
  p_key text, p_audience text, p_locale text, p_template_id text, p_subject text, p_body text, p_sources text[]
) RETURNS void LANGUAGE sql AS $$
  INSERT INTO platform.message_template_versions
    (message_key, channel, audience, locale, version, subject, body, translation_review, source_ids, released_by,
     template_id)
  SELECT p_key, 'email', p_audience, p_locale,
         coalesce((SELECT max(version) FROM platform.message_template_versions
                    WHERE message_key = p_key AND channel = 'email' AND locale = p_locale), 0) + 1,
         p_subject, p_body, CASE WHEN p_locale = 'en' THEN 'source' ELSE 'ai_reviewed' END, p_sources,
         'migration:0065', p_template_id
$$;

-- MESSAGE 01-21: the owner's wording (OWN-DEC-151 section 4), verbatim.
SELECT pg_temp.release('request.receipt', 'customer', 'en', 'request_received',
$s$HandyHub | We've Received Your Request #{reference}$s$,
$b$Hi {customerName},

Thank you for contacting HandyHub!

We've received your request #{reference}. Our team will review the details and get back to you as soon as possible. We aim to respond within one hour during our service hours.

Please note that this is a request confirmation, not a confirmed appointment or final price. We'll confirm any appointment separately with a date and arrival window.

If you have questions or additional details to share, feel free to contact us and reference your request number.

Thank you for considering HandyHub!

The HandyHub Team$b$, ARRAY['OWN-DEC-151', 'OWN-DEC-95']);

SELECT pg_temp.release('project.access_link', 'customer', 'en', 'secure_access_link',
$s$HandyHub | Your Secure Project Access Link$s$,
$b$Hi {customerName},

You can securely access your HandyHub project using the link below:

{secureAccessLink}

From your project page, you can review updates, estimates, appointments, and available documents.

For your security, this link expires on {linkExpiration}. If it expires, you can request a new link.

Please do not share this link with anyone.

If you didn't request this link, you can safely ignore this email.

The HandyHub Team$b$, ARRAY['OWN-DEC-151', 'OWN-DEC-97']);

SELECT pg_temp.release('estimate_visit.options', 'customer', 'en', 'estimate_visit_options',
$s$HandyHub | Choose a Time for Your Estimate Visit$s$,
$b$Hi {customerName},

We're ready to schedule your on-site estimate visit!

Our team has prepared available appointment options for request #{reference}.

Please use the secure link below to review the available dates and arrival windows:

{appointmentLink}

These appointment options are available until {holdExpiration}. If none of the options works for you, you can request another time.

Your appointment is not confirmed until you select an available window and receive a confirmation.

We look forward to meeting you!

The HandyHub Team$b$, ARRAY['OWN-DEC-151', 'OWN-DEC-99', 'OWN-DEC-144']);

SELECT pg_temp.release('estimate_visit.confirmed', 'customer', 'en', 'estimate_visit_confirmed',
$s$HandyHub | Your Estimate Visit Is Confirmed$s$,
$b$Hi {customerName},

Your on-site estimate appointment with HandyHub has been confirmed.

**Appointment details:**

Date: {visitDate}

Arrival window: {startTime} – {endTime} ({timeZone})

Reference: {visitNumber}

Our team will visit the property to assess the requested work and gather the information needed to prepare your estimate.

Please ensure the areas requiring inspection are safely accessible.

This is an estimate visit, not an appointment to perform the work. Your final estimate will be provided separately.

If you need to make changes, please contact our team.

We look forward to seeing you!

The HandyHub Team$b$, ARRAY['OWN-DEC-151', 'OWN-DEC-99']);

SELECT pg_temp.release('reminder.unanswered_estimate', 'customer', 'en', 'estimate_reminder',
$s$HandyHub | Following Up on Estimate #{estimateNumber}$s$,
$b$Hi {customerName},

We wanted to follow up on estimate #{estimateNumber} that we recently sent you.

Your estimate is still available for review, and we're happy to answer any questions before you make a decision.

You can review the details here:

{estimateLink}

If you're ready to move forward, you can approve your estimate through the secure link.

Thank you for considering HandyHub. We look forward to the opportunity to work with you!

The HandyHub Team$b$, ARRAY['OWN-DEC-151', 'OWN-DEC-153']);

SELECT pg_temp.release('estimate.question_answered', 'customer', 'en', 'estimate_follow_up',
$s$HandyHub | Update on Estimate #{reference}$s$,
$b$Hi {customerName},

Our team has responded to your question regarding estimate #{reference}.

You can review our response using your secure estimate link:

{estimateLink}

Your estimate remains unchanged unless an updated version is issued and approved.

If you have additional questions, we're happy to help.

The HandyHub Team$b$, ARRAY['OWN-DEC-151', 'OWN-DEC-152']);

SELECT pg_temp.release('reminder.unanswered_question', 'customer', 'en', 'question_reminder',
$s$HandyHub | We Need Your Response for Request #{reference}$s$,
$b$Hi {customerName},

We're following up on a question our team sent regarding your HandyHub request #{reference}.

We need a little more information before we can proceed with the next step.

You can review the question and send your response securely here:

{projectLink}

If you're unsure about the answer, feel free to let us know. Our team will be happy to help.

Thank you for your time. We look forward to moving your request forward!

The HandyHub Team$b$, ARRAY['OWN-DEC-151', 'OWN-DEC-153']);

SELECT pg_temp.release('approval.receipt', 'customer', 'en', 'estimate_approval_confirmation',
$s$HandyHub | Estimate #{estimateNumber} Approved$s$,
$b$Hi {customerName},

Thank you for choosing HandyHub!

We've received and recorded your approval of estimate #{estimateNumber} for your project.

Your approved estimate and confirmation document are available to view or download securely through your project page:

{projectLink}

A copy of the approved estimate will remain available in your project records.

**What's next?**

Our team will review the approved project and coordinate the next steps, including any required deposit and scheduling.

Please note that approving an estimate does not automatically confirm a work appointment. We'll send you a separate notification when appointment options become available.

We appreciate your trust and look forward to working with you!

The HandyHub Team$b$, ARRAY['OWN-DEC-151', 'OWN-DEC-155']);

SELECT pg_temp.release('work_visit.options', 'customer', 'en', 'work_appointment_windows',
$s$HandyHub | Choose Your Work Appointment$s$,
$b$Hi {customerName},

Thank you for approving your HandyHub estimate!

We're ready to schedule your project #{jobNumber}.

Our team has prepared available work appointment windows for you to choose from.

Please review the options and select your preferred appointment using the secure link below:

{appointmentLink}

**Important:** These appointment options are held for 24 hours, until {holdExpiration}.

If none of the available times works for you, you can request additional options.

Your work appointment will be confirmed only after you successfully select an available window and receive a confirmation.

We look forward to getting your project started!

The HandyHub Team$b$, ARRAY['OWN-DEC-151', 'OWN-DEC-156', 'OWN-DEC-144']);

SELECT pg_temp.release('appointment.confirmed', 'customer', 'en', 'work_appointment_confirmed',
$s$HandyHub | Your Work Appointment Is Confirmed$s$,
$b$Hi {customerName},

Great news! Your HandyHub work appointment has been confirmed.

**Appointment details:**

Job reference: {jobNumber}

Service: {serviceName}

Date: {visitDate}

Arrival window: {startTime} – {endTime} ({timeZone})

Our team is scheduled to arrive within the confirmed arrival window.

Please ensure the work area is safely accessible and that any preparation instructions we've provided have been completed.

You can review your appointment and project details here:

{projectLink}

If you need to reschedule or have questions before your appointment, please contact us as soon as possible.

Thank you for choosing HandyHub. We look forward to working with you!

The HandyHub Team$b$, ARRAY['OWN-DEC-151', 'OWN-DEC-105']);

SELECT pg_temp.release('reminder.appointment', 'customer', 'en', 'appointment_reminder',
$s$HandyHub | Upcoming Appointment Reminder$s$,
$b$Hi {customerName},

This is a friendly reminder about your upcoming appointment with HandyHub.

**Appointment details:**

Date: {date}

Arrival window: {start} – {end} ({zone})

Visit reference: {visitNumber}

Please make sure the work area is safely accessible when our team arrives.

If you need to reschedule or have any questions, please contact us as soon as possible.

We look forward to seeing you!

The HandyHub Team$b$, ARRAY['OWN-DEC-151', 'OWN-DEC-153', 'OWN-DEC-158']);

SELECT pg_temp.release('visit.cancelled', 'customer', 'en', 'visit_cancelled',
$s$HandyHub | Visit #{visitNumber} Cancelled$s$,
$b$Hi {customerName},

This is to confirm that your scheduled HandyHub visit #{visitNumber} has been cancelled.

If you'd like to reschedule, please contact our team, and we'll help you find another available appointment.

We apologize for any inconvenience and appreciate your understanding.

The HandyHub Team$b$, ARRAY['OWN-DEC-151', 'OWN-DEC-152']);

SELECT pg_temp.release('invoice.deposit', 'customer', 'en', 'deposit_invoice',
$s$HandyHub | Deposit Invoice #{invoiceNumber}$s$,
$b$Hi {customerName},

Your deposit invoice #{invoiceNumber} has been prepared for HandyHub job #{jobNumber}, based on your approved estimate.

You can review the deposit amount, payment instructions, and invoice details using the secure link below:

{invoiceLink}

Please review the invoice and contact us if you have any questions.

Thank you for choosing HandyHub!

The HandyHub Team$b$, ARRAY['OWN-DEC-151', 'OWN-DEC-152']);

SELECT pg_temp.release('change_order.proposed', 'customer', 'en', 'proposed_change',
$s$HandyHub | Proposed Change to Job #{jobNumber}$s$,
$b$Hi {customerName},

Our team has prepared a proposed change to your HandyHub project #{jobNumber}.

Please review the details, including any adjustments to the work scope, pricing, or schedule, using the secure link below:

{changeOrderLink}

**No proposed changes will be carried out until you have reviewed and approved them.**

If you have questions or would like to discuss the proposal, please contact us.

Thank you for working with HandyHub!

The HandyHub Team$b$, ARRAY['OWN-DEC-151', 'OWN-DEC-152']);

SELECT pg_temp.release('job.paused', 'customer', 'en', 'work_paused',
$s$HandyHub | Important Update on Job #{jobNumber}$s$,
$b$Hi {customerName},

We're contacting you with an update regarding your HandyHub project #{jobNumber}.

Work has been temporarily paused while our team reviews an on-site issue.

We are assessing the situation and will contact you with the next steps before work resumes.

We understand that interruptions can be inconvenient, and we appreciate your patience.

If you have questions, please contact our team and reference your job number.

The HandyHub Team$b$, ARRAY['OWN-DEC-151', 'OWN-DEC-152']);

SELECT pg_temp.release('job.complete', 'customer', 'en', 'job_complete',
$s$HandyHub | Your Project #{jobNumber} Is Complete$s$,
$b$Hi {customerName},

Thank you for choosing HandyHub!

We're pleased to let you know that the work on your project #{jobNumber} has been completed.

We appreciate the opportunity to help with your home improvement needs.

If you notice anything that needs attention or have questions about the completed work, please contact us and reference your job number.

Thank you again for trusting HandyHub with your project!

The HandyHub Team$b$, ARRAY['OWN-DEC-151', 'OWN-DEC-152']);

SELECT pg_temp.release('payment.receipt', 'customer', 'en', 'payment_receipt',
$s$HandyHub | Payment Receipt #{receiptNumber}$s$,
$b$Hi {customerName},

Thank you for your payment!

We've recorded your payment for HandyHub invoice #{invoiceNumber}.

**Payment details:**

Receipt number: {receiptNumber}

Payment reference: {paymentNumber}

Invoice number: {invoiceNumber}

You can view your payment receipt here:

{receiptLink}

If you have questions about your payment or invoice, please contact our team.

Thank you for choosing HandyHub!

The HandyHub Team$b$, ARRAY['OWN-DEC-151', 'OWN-DEC-152']);

SELECT pg_temp.release('reminder.satisfaction_check', 'customer', 'en', 'customer_follow_up',
$s$HandyHub | How Was Your Experience?$s$,
$b$Hi {customerName},

Thank you for choosing HandyHub for your recent project #{jobNumber}!

We hope you're happy with the completed work.

Your feedback is important to us and helps us continue improving our services.

If you'd like to share your experience or have any questions about the work, we'd love to hear from you.

Thank you again for trusting HandyHub. We appreciate your business!

The HandyHub Team$b$, ARRAY['OWN-DEC-151', 'OWN-DEC-157']);

SELECT pg_temp.release('staff.reply', 'customer', 'en', 'staff_reply_wrapper',
$s$HandyHub | New Message About Your Project #{reference}$s$,
$b$Hi {customerName},

You have a new message from the HandyHub team regarding your project #{reference}.

**Message from {staffDisplayName}:**

{staffMessage}

You can view the conversation and reply securely through your project page:

{projectLink}

If you have additional questions, feel free to reply through your project.

Thank you for choosing HandyHub!

The HandyHub Team$b$, ARRAY['OWN-DEC-151', 'OWN-DEC-154']);

SELECT pg_temp.release('staff_notice.customer_reply', 'staff', 'en', 'staff_customer_replied',
$s$HandyHub Staff | Customer Replied to #{reference}$s$,
$b$Hello {staffName},

A customer has sent a new reply regarding HandyHub project #{reference}.

**Project details:**

Customer: {customerName}

Reference: {reference}

Received: {receivedDateTime}

Project status: {projectStatus}

Please open the staff portal to review the customer's message and respond if needed:

{staffProjectLink}

For customer privacy and security, review the full conversation through the authorized staff portal.

This is an internal HandyHub notification. Do not forward it to the customer.

HandyHub Staff Notifications$b$, ARRAY['OWN-DEC-151', 'OWN-DEC-98']);

-- The staff notice in Spanish for Spanish-speaking staff (HH-COM-03, OWN-DEC-162), released as AI-reviewed after the
-- separate comparison of placeholders and structure against the English source (OWN-DEC-79).
SELECT pg_temp.release('staff_notice.customer_reply', 'staff', 'es', 'staff_customer_replied',
$s$HandyHub Staff | El cliente respondió a #{reference}$s$,
$b$Hola {staffName}:

Un cliente envió una nueva respuesta sobre el proyecto de HandyHub #{reference}.

**Detalles del proyecto:**

Cliente: {customerName}

Referencia: {reference}

Recibida: {receivedDateTime}

Estado del proyecto: {projectStatus}

Abra el portal del personal para revisar el mensaje del cliente y responder si es necesario:

{staffProjectLink}

Por la privacidad y la seguridad del cliente, revise la conversación completa en el portal autorizado del personal.

Esta es una notificación interna de HandyHub. No la reenvíe al cliente.

Notificaciones del personal de HandyHub$b$, ARRAY['OWN-DEC-151', 'OWN-DEC-98', 'OWN-DEC-79']);

SELECT pg_temp.release('account.contact_changed', 'customer', 'en', 'account_email_changed',
$s$HandyHub | Your Account Email Was Changed$s$,
$b$Hi {customerName},

This email confirms that the sign-in email address associated with your HandyHub account was changed on {changeDate} at {changeTime} ({timeZone}).

If you made this change, no further action is needed.

**Didn't make this change?**

Please contact HandyHub immediately using our official support contact:

{supportContact}

For your security, do not share sign-in codes or account access links with anyone.

The HandyHub Team$b$, ARRAY['OWN-DEC-151', 'HH-ID-11']);

-- The seven further messages, written in the owner's style under the owner's 2026-10-22 answer ("Write them,
-- approved"; confirmed the same day), recorded PROPOSED in OQ-MESSAGES-OUTSIDE-THE-21. The verification code greets
-- "Hi there," always: the contact is not verified yet when the code is sent.
SELECT pg_temp.release('contact.verification_code', 'customer', 'en', 'verification_code',
$s$HandyHub | Your Verification Code$s$,
$b$Hi there,

Your HandyHub verification code is {verificationCode}. It expires in {codeLifetimeMinutes} minutes.

Enter this code where you requested it. For your security, do not share this code with anyone.

If you didn't request this code, you can safely ignore this email.

The HandyHub Team$b$, ARRAY['OQ-MESSAGES-OUTSIDE-THE-21', 'OWN-DEC-150']);

SELECT pg_temp.release('question.notice', 'customer', 'en', 'question_notice',
$s$HandyHub | We Have a Question About Your Request #{reference}$s$,
$b$Hi {customerName},

HandyHub has a question about your request #{reference}.

You can view the question and reply securely through your project page:

{projectLink}

Your answer helps us move your request to the next step.

The HandyHub Team$b$, ARRAY['OQ-MESSAGES-OUTSIDE-THE-21', 'OWN-DEC-98']);

SELECT pg_temp.release('estimate.ready', 'customer', 'en', 'estimate_ready',
$s$HandyHub | Your Estimate #{estimateNumber} Is Ready$s$,
$b$Hi {customerName},

Your HandyHub estimate #{estimateNumber} is ready.

You can review your estimate securely through your project page:

{projectLink}

If you have questions about your estimate, please contact us. We're happy to help.

Thank you for considering HandyHub!

The HandyHub Team$b$, ARRAY['OQ-MESSAGES-OUTSIDE-THE-21', 'OWN-DEC-102']);

SELECT pg_temp.release('invoice.ready', 'customer', 'en', 'invoice_ready',
$s$HandyHub | Your Invoice #{invoiceNumber} Is Ready$s$,
$b$Hi {customerName},

Your HandyHub invoice #{invoiceNumber} is ready.

You can review the invoice details and the available payment options securely using the link below:

{invoiceLink}

If you have questions about your invoice, please contact our team.

Thank you for choosing HandyHub!

The HandyHub Team$b$, ARRAY['OQ-MESSAGES-OUTSIDE-THE-21', 'OWN-DEC-110']);

SELECT pg_temp.release('decision.not_a_fit', 'customer', 'en', 'not_a_fit',
$s$HandyHub | Update on Your Request #{reference}$s$,
$b$Hi {customerName},

Thank you for considering HandyHub for your request #{reference}.

After reviewing your request, our team has determined that we are not able to take on this project.

You can view the details of this decision through your secure project page:

{projectLink}

We appreciate your interest in HandyHub and your understanding.

The HandyHub Team$b$, ARRAY['OQ-MESSAGES-OUTSIDE-THE-21', 'OWN-DEC-100']);

SELECT pg_temp.release('appointment.changed', 'customer', 'en', 'appointment_changed',
$s$HandyHub | Your Appointment #{visitNumber} Has Been Updated$s$,
$b$Hi {customerName},

Your HandyHub appointment #{visitNumber} has been updated, and the revised appointment is confirmed.

**Updated appointment details:**

Date: {visitDate}

Arrival window: {startTime} – {endTime} ({timeZone})

You can review your appointment and project details here:

{projectLink}

If the new time doesn't work for you, please contact us as soon as possible.

The HandyHub Team$b$, ARRAY['OQ-MESSAGES-OUTSIDE-THE-21', 'OWN-DEC-119']);

SELECT pg_temp.release('visit.on_the_way', 'customer', 'en', 'on_the_way',
$s$HandyHub | Our Team Is on the Way$s$,
$b$Hi {customerName},

Our team is on the way for your HandyHub visit #{visitNumber}.

Your team: {workerFirstNames}

Arrival window: {startTime} – {endTime} ({timeZone})

Please make sure the work area is safely accessible when our team arrives.

You can review your visit details here:

{projectLink}

The HandyHub Team$b$, ARRAY['OQ-MESSAGES-OUTSIDE-THE-21', 'OWN-DEC-107']);

DROP FUNCTION pg_temp.release(text, text, text, text, text, text, text[]);

-- messages.automatic version 2 (FACT-AUTOMATIC-MESSAGES as changed by OWN-DEC-151 to OWN-DEC-158): the automatic
-- customer messages; the estimate, question and appointment reminders join when TSK-0121 makes them automatic.
UPDATE platform.policy_version SET status = 'superseded' WHERE key = 'messages.automatic' AND status = 'active';
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by, change_reason)
SELECT 'messages.automatic', max(version) + 1, 'configured',
   '{"customer": ["request.receipt", "contact.verification_code", "project.access_link", "question.notice", "estimate_visit.options", "estimate_visit.confirmed", "decision.not_a_fit", "estimate.ready", "estimate.question_answered", "approval.receipt", "work_visit.options", "appointment.confirmed", "appointment.changed", "visit.cancelled", "visit.on_the_way", "invoice.deposit", "change_order.proposed", "invoice.ready", "job.complete", "payment.receipt", "account.contact_changed"], "staffAccount": ["staff.invitation", "staff.password_reset"], "staffNotifications": ["staff_notice.customer_reply", "staff_notice.estimate_changes_requested", "staff_notice.estimate_declined", "staff_notice.case_opened", "staff_notice.urgent_field_alert", "staff_notice.schedule_change"]}',
   false,
   ARRAY['FACT-AUTOMATIC-MESSAGES', 'OWN-DEC-151', 'OWN-DEC-152', 'OWN-DEC-155', 'OWN-DEC-156', 'OWN-DEC-158'],
   'migration:0065', 'TSK-0119: the automatic messages of OWN-DEC-152'
FROM platform.policy_version WHERE key = 'messages.automatic';
