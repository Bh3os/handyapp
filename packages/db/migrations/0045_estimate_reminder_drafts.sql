-- 0045 Unanswered-estimate reminder drafts and their stop rules (TSK-0060; HH-EST-14, HH-COM-05, HH-COM-09, T65,
-- OWN-DEC-78, OWN-DEC-132, FACT-REMINDER-CADENCES, ENT-Message).
-- - A reminder is a staff-released draft (platform.message_deliveries, release = 'staff_released'). A draft that is
--   stopped before anyone released it (the customer answered, the version was accepted, declined, expired, withdrawn
--   or superseded, the project closed) or that staff dismiss is cancelled with its reason: until now a cancelled
--   staff-released delivery needed a release actor, so a never-released draft could not be cancelled truthfully.
-- - Who or what cancelled it, and when, is recorded on the row (the reason is the row's error_code, as for a delivery
--   cancelled at send time); the audit log keeps the event itself.
-- - A cancelled, sent or delivered delivery never becomes a draft or queued again (one send per draft).
ALTER TABLE platform.message_deliveries
  ADD COLUMN cancelled_by text CHECK (char_length(cancelled_by) BETWEEN 1 AND 100),
  ADD COLUMN cancelled_at timestamptz;

ALTER TABLE platform.message_deliveries DROP CONSTRAINT message_deliveries_check2;
ALTER TABLE platform.message_deliveries ADD CONSTRAINT message_deliveries_release_actor CHECK (
  state = 'draft' OR release = 'automatic' OR released_by IS NOT NULL OR (state = 'cancelled' AND cancelled_at IS NOT NULL)
);
ALTER TABLE platform.message_deliveries ADD CONSTRAINT message_deliveries_cancelled CHECK (
  (cancelled_at IS NULL) = (cancelled_by IS NULL) AND (cancelled_at IS NULL OR state = 'cancelled')
);

CREATE FUNCTION platform.message_delivery_final_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state IN ('cancelled', 'sent', 'delivered') AND NEW.state IN ('draft', 'queued') THEN
    RAISE EXCEPTION 'a % delivery is never drafted or queued again', OLD.state USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER message_deliveries_final_guard BEFORE UPDATE OF state ON platform.message_deliveries
  FOR EACH ROW EXECUTE FUNCTION platform.message_delivery_final_guard();

-- The staff screens list one version's reminder drafts.
CREATE INDEX message_deliveries_reminders ON platform.message_deliveries (record_type, record_id, message_key)
  WHERE release = 'staff_released';
