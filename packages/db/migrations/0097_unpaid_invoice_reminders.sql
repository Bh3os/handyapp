-- 0097 Unpaid-invoice reminders and "Overdue—owner decision" (TSK-0091; OWN-DEC-210, OWN-DEC-112, OWN-DEC-151,
-- OWN-DEC-158, OWN-DEC-190, HH-FIN-19, HH-COM-05, HH-COM-06, HH-COM-13, T65, FACT-REMINDER-CADENCES, FACT-PAYMENT-DUE,
-- FACT-AUTOMATIC-MESSAGES, ENT-Invoice, ENT-Message, RULE-DECIDED-VALUES-ACTIVE, RULE-SERVER-AUTHZ, RULE-MONEY-CENTS).
-- The server decides who may do what and when a reminder is due (apps/server/src/modules/finance/invoice-reminders.ts);
-- this migration seeds the decided values and keeps the records true whatever path writes.
-- 1. reminders.cadences version 3 (OWN-DEC-210): two automatic unpaid-invoice reminder emails, 3 and 7 calendar days
--    after the invoice's due date, once each per invoice and stage; further collection follow-up is released by staff.
--    The 24-hour and 3-day staff-released drafts of OWN-DEC-112 are gone. The other reminders keep their values.
-- 2. messages.automatic version 4: the unpaid-invoice reminder joins the automatic list (OWN-DEC-210). The staff
--    follow-up (reminder.unpaid_invoice_follow_up) stays staff-released.
-- 3. The two email templates, in the style of the 21 owner templates (OWN-DEC-151), written under the owner's
--    authorization of OWN-DEC-210 ("Do not require additional Owner approval for routine reminders that meet these
--    rules"); the wording is listed in OQ-UNPAID-REMINDER-DETAILS for the Owner's review. No amount, no threat, a portal
--    link and a way to say it is already paid or wrong. No text-message version: SMS reminders stay off until A2P
--    10DLC and consent are in place (OWN-DEC-190).
-- 4. finance.invoice_collection_steps: what staff record about collecting an issued final invoice, append-only: a
--    revised due date (the reminders count from it), a payment plan or a collection hold (no automatic reminder while
--    it is active) and its end, a staff-released follow-up reminder, and the Owner's "Overdue—owner decision". Recorded
--    by the Owner or Office; the overdue decision by the Owner only. Never changed afterwards, never deleted.
-- 5. Staff-released unpaid-invoice reminder drafts never released are cancelled (replaced_by_automatic).
-- 6. Every issued final invoice with a balance gets one planning job, which schedules its reminders from the records
--    (or nothing: a payment recorded, a dispute, a review, a plan or a hold). PROPOSED: a stage whose time has already
--    passed is not sent late.

-- 1. The new cadence version.
UPDATE platform.policy_version SET status = 'superseded' WHERE key = 'reminders.cadences' AND status = 'active';
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by, change_reason)
  SELECT 'reminders.cadences', coalesce(max(version), 0) + 1, 'configured',
         '{"unansweredEstimate": {"afterDeliveryHours": 72, "release": "automatic"}, "unansweredQuestion": {"afterDeliveryHours": 72, "closeAfterReminderHours": 24, "release": "automatic"}, "appointment": {"hoursBefore": 24, "release": "automatic"}, "satisfaction": {"daysAfterCompletion": 2, "release": "staff"}, "unpaidInvoice": {"firstDaysAfterDue": 3, "secondDaysAfterDue": 7, "release": "automatic", "followUp": "staff"}, "repeatService": {"schedule": "customer_agreed", "release": "staff"}}',
         false,
         ARRAY['FACT-REMINDER-CADENCES', 'OWN-DEC-210', 'OWN-DEC-153', 'OWN-DEC-157', 'OWN-DEC-208', 'OWN-DEC-113'],
         'migration:0097',
         'OWN-DEC-210: two automatic unpaid-invoice reminders, 3 and 7 calendar days after the due date; staff release any further follow-up'
    FROM platform.policy_version WHERE key = 'reminders.cadences';

-- 2. The automatic list with the unpaid-invoice reminder.
UPDATE platform.policy_version SET status = 'superseded' WHERE key = 'messages.automatic' AND status = 'active';
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by, change_reason)
SELECT 'messages.automatic', max(version) + 1, 'configured',
   '{"customer": ["request.receipt", "contact.verification_code", "project.access_link", "question.notice", "estimate_visit.options", "estimate_visit.confirmed", "decision.not_a_fit", "estimate.ready", "estimate.question_answered", "approval.receipt", "work_visit.options", "appointment.confirmed", "appointment.changed", "visit.cancelled", "visit.on_the_way", "invoice.deposit", "change_order.proposed", "invoice.ready", "job.complete", "payment.receipt", "account.contact_changed", "reminder.unanswered_estimate", "reminder.unanswered_question", "reminder.appointment", "reminder.unpaid_invoice"], "staffAccount": ["staff.invitation", "staff.password_reset"], "staffNotifications": ["staff_notice.customer_reply", "staff_notice.estimate_changes_requested", "staff_notice.estimate_declined", "staff_notice.case_opened", "staff_notice.urgent_field_alert", "staff_notice.schedule_change"]}',
   false,
   ARRAY['FACT-AUTOMATIC-MESSAGES', 'OWN-DEC-210', 'OWN-DEC-153', 'OWN-DEC-151', 'OWN-DEC-152', 'OWN-DEC-158'],
   'migration:0097', 'TSK-0091: the unpaid-invoice reminders send automatically (OWN-DEC-210)'
FROM platform.policy_version WHERE key = 'messages.automatic';

-- 3. The email templates (English; customer content is English only).
INSERT INTO platform.message_templates (message_key, channel, audience) VALUES
  ('reminder.unpaid_invoice', 'email', 'customer'),
  ('reminder.unpaid_invoice_follow_up', 'email', 'customer')
ON CONFLICT (message_key, channel) DO NOTHING;

INSERT INTO platform.message_template_versions
  (message_key, channel, audience, locale, version, subject, body, translation_review, source_ids, released_by,
   template_id)
SELECT k.message_key, 'email', 'customer', 'en',
       coalesce((SELECT max(version) FROM platform.message_template_versions v
                  WHERE v.message_key = k.message_key AND v.channel = 'email' AND v.locale = 'en'), 0) + 1,
       k.subject, k.body, 'source', ARRAY['OWN-DEC-210', 'OWN-DEC-151', 'OQ-UNPAID-REMINDER-DETAILS'],
       'migration:0097', k.template_id
  FROM (VALUES
    ('reminder.unpaid_invoice', 'unpaid_invoice_reminder',
$s$HandyHub | Reminder About Invoice #{invoiceNumber}$s$,
$b$Hi {customerName},

This is a friendly reminder that your HandyHub invoice #{invoiceNumber} is still open in our records.

You can review the invoice and the available payment options securely using the link below:

{invoiceLink}

If you have already paid, thank you, and please disregard this reminder. If you believe the invoice is incorrect or have any questions, simply reply to this email or contact our team, and we'll be happy to help.

Thank you for choosing HandyHub!

The HandyHub Team$b$),
    ('reminder.unpaid_invoice_follow_up', 'unpaid_invoice_follow_up',
$s$HandyHub | Following Up on Invoice #{invoiceNumber}$s$,
$b$Hi {customerName},

We're following up on your HandyHub invoice #{invoiceNumber}, which is still open in our records.

You can review the invoice, its current balance and the available payment options securely using the link below:

{invoiceLink}

If you have already paid, or if you believe the invoice is incorrect, please reply to this email or contact our team so we can review it with you.

Thank you for choosing HandyHub!

The HandyHub Team$b$)
  ) AS k (message_key, template_id, subject, body);

-- 4. The collection steps staff record on an issued final invoice.
CREATE TABLE finance.invoice_collection_steps (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   uuid NOT NULL,
  job_id       uuid NOT NULL,
  project_id   uuid NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('revised_due_date', 'payment_plan', 'collection_hold', 'arrangement_ended',
                 'follow_up_released', 'overdue_decided')),
  -- A revised due date only: the local date (business time zone) the reminders count from.
  due_on       date,
  -- The payment plan or collection hold an arrangement_ended row ends (once).
  ends_step_id uuid UNIQUE REFERENCES finance.invoice_collection_steps (id),
  -- The staff-released follow-up reminder's delivery.
  delivery_id  uuid UNIQUE REFERENCES platform.message_deliveries (id),
  -- What was agreed or decided, in the staff member's words (optional for a follow-up).
  note         text CHECK (char_length(note) BETWEEN 1 AND 2000 AND note = btrim(note)),
  recorded_by  uuid NOT NULL REFERENCES identity.staff_users (id),
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_collection_steps_invoice FOREIGN KEY (invoice_id, job_id) REFERENCES finance.invoices (id, job_id),
  CONSTRAINT invoice_collection_steps_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id),
  CONSTRAINT invoice_collection_steps_due_on CHECK ((kind = 'revised_due_date') = (due_on IS NOT NULL)),
  CONSTRAINT invoice_collection_steps_ends CHECK ((kind = 'arrangement_ended') = (ends_step_id IS NOT NULL)),
  CONSTRAINT invoice_collection_steps_delivery CHECK ((kind = 'follow_up_released') = (delivery_id IS NOT NULL)),
  CONSTRAINT invoice_collection_steps_note CHECK (kind = 'follow_up_released' OR note IS NOT NULL)
);
CREATE INDEX invoice_collection_steps_invoice_at ON finance.invoice_collection_steps (invoice_id, recorded_at);
COMMENT ON TABLE finance.invoice_collection_steps IS
  'Collection steps on an issued final invoice (OWN-DEC-210, HH-FIN-19): revised due dates, payment plans, collection '
  'holds and their end, staff-released follow-up reminders and the Owner''s overdue decision. Append-only.';

-- Recorded on an issued final invoice that still has a balance, by a live Owner or Office (the overdue decision: the
-- Owner); an end names a payment plan or collection hold of the same invoice. Never changed or deleted.
CREATE FUNCTION finance.invoice_collection_step_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  i record;
  ended record;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'collection steps are kept as recorded, never changed or deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  SELECT id, job_id, project_id, kind, state INTO i FROM finance.invoices WHERE id = NEW.invoice_id;
  IF NOT FOUND OR i.kind <> 'final' OR i.state NOT IN ('issued', 'partially_paid') THEN
    RAISE EXCEPTION 'collection steps are recorded on an issued final invoice with a balance'
      USING ERRCODE = 'check_violation';
  END IF;
  IF i.job_id <> NEW.job_id OR i.project_id <> NEW.project_id THEN
    RAISE EXCEPTION 'a collection step names its invoice''s own job and project' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT finance.has_live_role(NEW.recorded_by,
       (CASE WHEN NEW.kind = 'overdue_decided' THEN ARRAY['owner'] ELSE ARRAY['owner', 'office'] END)) THEN
    RAISE EXCEPTION 'the Owner or Office records collection steps; the overdue decision is the Owner''s'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.kind = 'arrangement_ended' THEN
    SELECT invoice_id, kind INTO ended FROM finance.invoice_collection_steps WHERE id = NEW.ends_step_id;
    IF NOT FOUND OR ended.invoice_id <> NEW.invoice_id OR ended.kind NOT IN ('payment_plan', 'collection_hold') THEN
      RAISE EXCEPTION 'an end names a payment plan or collection hold of the same invoice'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.recorded_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER invoice_collection_steps_guard BEFORE INSERT OR UPDATE OR DELETE ON finance.invoice_collection_steps
  FOR EACH ROW EXECUTE FUNCTION finance.invoice_collection_step_guard();

-- A staging reset is the only path that empties this table (TSK-0141).
CREATE TRIGGER invoice_collection_steps_reset_only_truncate BEFORE TRUNCATE ON finance.invoice_collection_steps
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();

-- 5. Staff-released drafts of the earlier configuration, never released.
UPDATE platform.message_deliveries
   SET state = 'cancelled', error_code = 'replaced_by_automatic', cancelled_by = 'system', cancelled_at = now(),
       updated_at = now()
 WHERE message_key = 'reminder.unpaid_invoice' AND state = 'draft';

-- 6. The issued final invoices: one planning job each.
INSERT INTO platform.jobs (automation, job_key, target_type, target_id, payload, request_id, run_at, max_attempts)
SELECT 'invoice.reminder_plan', 'invoice.reminder_plan:' || i.id || ':0097', 'invoice', i.id::text, '{}',
       'migration:0097', now(), 5
  FROM finance.invoices i
 WHERE i.kind = 'final' AND i.state IN ('issued', 'partially_paid')
ON CONFLICT (job_key) DO NOTHING;
