-- 0075 Automatic routine reminders and delivery hours (TSK-0121, TSK-0122; OWN-DEC-153, OWN-DEC-154, OWN-DEC-157,
-- OWN-DEC-190, OWN-DEC-207, OWN-DEC-208, OWN-DEC-152 sections 3.3 and 3.4, FACT-REMINDER-CADENCES, FACT-HOURS,
-- HH-EST-14, HH-LEAD-06, HH-COM-11, HH-COM-05, HH-COM-09, HH-COM-15, RULE-DECIDED-VALUES-ACTIVE).
-- 1. reminders.cadences version 2 (FACT-REMINDER-CADENCES as changed by OWN-DEC-153 and OWN-DEC-157): one automatic
--    estimate reminder 72 hours (3 days) after the version was successfully delivered; one automatic question reminder
--    72 hours after the notice was delivered, "Closed—no response" 24 hours after that reminder was actually sent
--    (OWN-DEC-208); the automatic appointment reminder 24 hours before every confirmed visit. The +24 h estimate draft
--    and the 24 h / 48 h question drafts are gone. The satisfaction check (2 days = the 48 hours of OWN-DEC-157), the
--    unpaid-invoice and the repeat-service reminders keep their values and stay staff-released (TSK-0092, TSK-0091).
--    The per-cadence contactHoursOnly flags are replaced by the delivery rule of item 2.
-- 2. messages.delivery_hours (OWN-DEC-152 sections 3.3 and 3.4, OWN-DEC-154, OWN-DEC-207): emails at any hour; texts only
--    inside the recipient's permitted local hours (contact.hours in the recipient's zone, sms.unknown_zone_hours when it
--    is unknown). It replaces the PROPOSED replies.contact_hours of migration 0046, which is superseded with no
--    successor of its own name.
-- 3. sms.live_delivery: the global switch of live texts, off until A2P 10DLC and its consent requirements are complete
--    (OWN-DEC-190, OWN-DEC-152 section 3.4).
-- 4. messages.automatic version 3: the three routine reminders join the automatic list (OWN-DEC-153).
-- 5. Deliveries record which text window applied (text_window).
-- 6. The reminders already in progress:
--    - waiting reminder drafts (never released) are cancelled with the reason replaced_by_automatic; an appointment
--      draft's subject is set aside (suffix :replaced) so the visit's window gets its automatic reminder under the same
--      subject; their queue items (estimate_reminder, appointment_reminder, the question reminder drafts) are resolved;
--    - the pending draft jobs of the removed automations are cancelled;
--    - every published estimate version, every published question whose notice was sent and every confirmed visit more
--      than 24 hours ahead gets one planning job, which schedules its automatic reminder from the records (or nothing,
--      when a reminder already went out or a stop rule applies). PROPOSED: a visit already within 24 hours gets no
--      late reminder.

-- 1. The new cadence version.
UPDATE platform.policy_version SET status = 'superseded' WHERE key = 'reminders.cadences' AND status = 'active';
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by, change_reason)
  SELECT 'reminders.cadences', coalesce(max(version), 0) + 1, 'configured',
         '{"unansweredEstimate": {"afterDeliveryHours": 72, "release": "automatic"}, "unansweredQuestion": {"afterDeliveryHours": 72, "closeAfterReminderHours": 24, "release": "automatic"}, "appointment": {"hoursBefore": 24, "release": "automatic"}, "satisfaction": {"daysAfterCompletion": 2, "release": "staff"}, "unpaidInvoice": {"firstHours": 24, "finalHours": 72, "release": "staff"}, "repeatService": {"schedule": "customer_agreed", "release": "staff"}}',
         false,
         ARRAY['FACT-REMINDER-CADENCES', 'OWN-DEC-153', 'OWN-DEC-157', 'OWN-DEC-208', 'OWN-DEC-112', 'OWN-DEC-113'],
         'migration:0075',
         'OWN-DEC-153: one automatic 3-day estimate reminder, one automatic 3-day question reminder, the 24-hour appointment reminder'
    FROM platform.policy_version WHERE key = 'reminders.cadences';

-- 2. Delivery hours by channel.
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by, change_reason) VALUES
  ('messages.delivery_hours', 1, 'configured', '{"email": "any_hour", "text": "recipient_permitted_hours"}', false,
   ARRAY['OWN-DEC-154', 'OWN-DEC-152', 'OWN-DEC-207', 'HH-COM-15', 'FACT-HOURS'], 'migration:0075',
   'OWN-DEC-154: emails at once at any hour; texts wait for the recipient''s permitted local hours');
UPDATE platform.policy_version SET status = 'superseded' WHERE key = 'replies.contact_hours' AND status = 'active';

-- 3. Live texts stay off until A2P 10DLC.
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by, change_reason) VALUES
  ('sms.live_delivery', 1, 'configured', '{"enabled": false}', false,
   ARRAY['OWN-DEC-190', 'OWN-DEC-152', 'HH-COM-15'], 'migration:0075',
   'OWN-DEC-190: SMS delivery stays disabled until the A2P 10DLC registration and consent requirements are complete');

-- 4. The automatic list with the routine reminders.
UPDATE platform.policy_version SET status = 'superseded' WHERE key = 'messages.automatic' AND status = 'active';
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by, change_reason)
SELECT 'messages.automatic', max(version) + 1, 'configured',
   '{"customer": ["request.receipt", "contact.verification_code", "project.access_link", "question.notice", "estimate_visit.options", "estimate_visit.confirmed", "decision.not_a_fit", "estimate.ready", "estimate.question_answered", "approval.receipt", "work_visit.options", "appointment.confirmed", "appointment.changed", "visit.cancelled", "visit.on_the_way", "invoice.deposit", "change_order.proposed", "invoice.ready", "job.complete", "payment.receipt", "account.contact_changed", "reminder.unanswered_estimate", "reminder.unanswered_question", "reminder.appointment"], "staffAccount": ["staff.invitation", "staff.password_reset"], "staffNotifications": ["staff_notice.customer_reply", "staff_notice.estimate_changes_requested", "staff_notice.estimate_declined", "staff_notice.case_opened", "staff_notice.urgent_field_alert", "staff_notice.schedule_change"]}',
   false,
   ARRAY['FACT-AUTOMATIC-MESSAGES', 'OWN-DEC-153', 'OWN-DEC-151', 'OWN-DEC-152', 'OWN-DEC-155', 'OWN-DEC-156', 'OWN-DEC-158'],
   'migration:0075', 'TSK-0121: the routine reminders send automatically (OWN-DEC-153)'
FROM platform.policy_version WHERE key = 'messages.automatic';

-- 5. The text window a delivery waited for or was sent in.
ALTER TABLE platform.message_deliveries
  ADD COLUMN text_window text CHECK (text_window IN ('recipient_zone', 'unknown_zone_fallback', 'not_held'));
COMMENT ON COLUMN platform.message_deliveries.text_window IS
  'Texts only (TSK-0122, HH-COM-15): the permitted-hours window applied: the recipient''s own zone, the unknown-zone '
  'fallback (sms.unknown_zone_hours), or not held (codes, account notices, access links, On my way).';
CREATE INDEX message_deliveries_automatic_reminders ON platform.message_deliveries (record_type, record_id, message_key)
  WHERE release = 'automatic';
COMMENT ON COLUMN intake.questions.final_reminder_sent_at IS
  'The actual send of the question''s reminder: from TSK-0121 the single automatic reminder (OWN-DEC-153); before it '
  'the final staff-released draft. first_reminder_sent_at is kept for reminders sent before TSK-0121.';

-- 6. The reminders in progress.
UPDATE platform.message_deliveries
   SET state = 'cancelled', error_code = 'replaced_by_automatic', cancelled_by = 'system', cancelled_at = now(),
       updated_at = now(),
       subject_key = CASE WHEN message_key = 'reminder.appointment' THEN subject_key || ':replaced' ELSE subject_key END
 WHERE message_key IN ('reminder.unanswered_estimate', 'reminder.unanswered_question', 'reminder.appointment')
   AND state = 'draft';

UPDATE ops.queue_items SET resolved_at = now(), resolution = 'replaced_by_automatic', updated_at = now()
 WHERE resolved_at IS NULL
   AND (type IN ('estimate_reminder', 'appointment_reminder')
        OR (type = 'question_reminder' AND reason IN ('question_reminder_first', 'question_reminder_final')));

UPDATE platform.jobs SET state = 'cancelled', finished_at = now(), updated_at = now()
 WHERE state = 'queued'
   AND automation IN ('estimate.reminder_draft', 'questions.reminder_draft', 'appointment.reminder_draft');

INSERT INTO platform.jobs (automation, job_key, target_type, target_id, payload, request_id, run_at, max_attempts)
SELECT 'estimate.reminder_plan', 'estimate.reminder_plan:' || v.id || ':0075', 'estimate_version', v.id::text, '{}',
       'migration:0075', now(), 5
  FROM estimating.estimate_versions v
 WHERE v.state = 'published'
ON CONFLICT (job_key) DO NOTHING;

INSERT INTO platform.jobs (automation, job_key, target_type, target_id, payload, request_id, run_at, max_attempts)
SELECT 'questions.reminder_plan', 'questions.reminder_plan:' || q.id || ':0075', 'question', q.id::text,
       jsonb_build_object('questionId', q.id::text), 'migration:0075', now(), 5
  FROM intake.questions q
 WHERE q.state = 'published' AND q.notice_sent_at IS NOT NULL
   AND q.first_reminder_sent_at IS NULL AND q.final_reminder_sent_at IS NULL
ON CONFLICT (job_key) DO NOTHING;

INSERT INTO platform.jobs (automation, job_key, target_type, target_id, payload, request_id, run_at, max_attempts)
SELECT 'appointment.reminder_plan', 'appointment.reminder_plan:' || v.id || ':w' || v.window_version || ':0075', 'visit',
       v.id::text,
       jsonb_build_object('windowVersion', v.window_version,
                          'bookedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
       'migration:0075', now(), 5
  FROM work.visits v
 WHERE v.state = 'confirmed' AND v.starts_at > now() + interval '24 hours'
ON CONFLICT (job_key) DO NOTHING;
