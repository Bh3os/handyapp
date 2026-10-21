-- 0060 Appointment reminder drafts 24 hours before (TSK-0067; HH-COM-11, HH-COM-05, HH-COM-06, HH-COM-09, T65,
-- ENT-Visit, ENT-Message, FACT-REMINDER-CADENCES, OWN-DEC-78, OWN-DEC-107).
-- - An appointment reminder is a staff-released draft (platform.message_deliveries, message_key
--   'reminder.appointment', record 'visit', one subject per visit and window version). No table is added: the draft,
--   its release, its send and its cancellation are the delivery row, and the audit log keeps each event.
-- - The application cancels a waiting reminder (a draft, or a released one not yet handed to the provider) in the same
--   transaction as the reschedule or cancellation that makes it outdated, and records the audit event (TSK-0066 writes,
--   apps/server/src/modules/visits/reminders.ts). This trigger is the database's backstop for every other way a visit
--   leaves 'confirmed' (on the way, arrived, completed, no access: later tasks' writes): its waiting reminders are
--   cancelled with the reason 'visit_<state>' and the visit's appointment_reminder queue item is resolved, in the same
--   transaction, so an outdated reminder is never sent. The send-time recheck (notify.release) checks again.
CREATE FUNCTION work.visit_state_cancels_reminders() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state IS DISTINCT FROM OLD.state AND OLD.state = 'confirmed' AND NEW.state <> 'confirmed' THEN
    UPDATE platform.message_deliveries
       SET state = 'cancelled', error_code = 'visit_' || NEW.state, cancelled_by = 'system', cancelled_at = now(),
           updated_at = now()
     WHERE record_type = 'visit' AND record_id = NEW.id::text AND message_key = 'reminder.appointment'
       AND (state = 'draft' OR (state = 'queued' AND provider_message_id IS NULL));
    UPDATE ops.queue_items
       SET resolved_at = now(), updated_at = now(), resolution = 'visit_' || NEW.state, version = version + 1
     WHERE type = 'appointment_reminder' AND subject_type = 'visit' AND subject_id = NEW.id::text
       AND resolved_at IS NULL;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER visits_cancel_reminders AFTER UPDATE OF state ON work.visits
  FOR EACH ROW EXECUTE FUNCTION work.visit_state_cancels_reminders();
COMMENT ON FUNCTION work.visit_state_cancels_reminders() IS
  'A visit that leaves confirmed cancels its waiting appointment reminders and resolves their queue item (HH-COM-11).';
