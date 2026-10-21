-- 0046 Staff replies and the reply contact-hours rule (TSK-0050; HH-COM-08, HH-COM-09, HH-COM-01, HH-COM-02, T65, T66,
-- ENT-Message, FACT-HOURS, FACT-TIMEZONE, OWN-DEC-120, OWN-DEC-101).
--
-- - comms.messages gains outbound staff replies: one row per reply a staff member sent from the project, in the
--   project's customer conversation, with the staff author, the contact it went to, the one destination it went to
--   (to_addresses) and the channel staff chose. The text is kept exactly as written and never changes, like every
--   other message. `delivery_id` is the reply's one notification delivery (platform.message_deliveries, message type
--   staff.reply), whose state says what truly happened to the email or text: queued (also while it waits for the
--   contact hours), sent, delivered where the provider reports it, failed or suppressed. The reply's own row is the
--   project message the customer reads in the portal (Messages tab); internal messages never are.
-- - replies.contact_hours: whether a staff reply's email or text waits for the daily contact hours (contact.hours in
--   business.timezone) when Send is pressed outside them. PROPOSED reading (proposed = true): FACT-HOURS holds
--   staff-released customer messages to 8 AM-10 PM and the owner's 2026-10-05 answer limits texts to customers to those
--   hours, while OWN-DEC-120 calls Send the release; no decision names replies explicitly. The message itself is in
--   the project conversation at once either way.
ALTER TABLE comms.messages ADD COLUMN delivery_id uuid UNIQUE REFERENCES platform.message_deliveries (id);
COMMENT ON COLUMN comms.messages.delivery_id IS
  'Outbound staff replies only (TSK-0050): the reply''s staff.reply delivery, which records whether it was sent.';

ALTER TABLE comms.messages ADD CONSTRAINT messages_outbound_reply CHECK (
  direction <> 'outbound' OR (
    channel IN ('email', 'sms') AND author_staff_id IS NOT NULL AND delivery_id IS NOT NULL
    AND link_state = 'matched' AND match_rule = 'staff' AND contact_id IS NOT NULL
    AND project_id IS NOT NULL AND conversation_id IS NOT NULL AND cardinality(to_addresses) = 1
    AND webhook_receipt_id IS NULL AND body_text IS NOT NULL
  )
);
ALTER TABLE comms.messages ADD CONSTRAINT messages_delivery_outbound CHECK (delivery_id IS NULL OR direction = 'outbound');

-- The original stays unchanged (OWN-DEC-120), now including the reply's delivery; an outbound reply, like an internal
-- message, stays on its project.
CREATE OR REPLACE FUNCTION comms.messages_original_unchanged() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'messages are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW.direction, NEW.channel, NEW.webhook_receipt_id, NEW.provider, NEW.provider_message_id, NEW.from_address,
      NEW.to_addresses, NEW.subject, NEW.body_text, NEW.body_state, NEW.body_truncated, NEW.email_message_id,
      NEW.in_reply_to, NEW.attachments, NEW.keyword, NEW.received_at, NEW.author_staff_id, NEW.created_at,
      NEW.delivery_id)
     IS DISTINCT FROM
     (OLD.direction, OLD.channel, OLD.webhook_receipt_id, OLD.provider, OLD.provider_message_id, OLD.from_address,
      OLD.to_addresses, OLD.subject, OLD.body_text, OLD.body_state, OLD.body_truncated, OLD.email_message_id,
      OLD.in_reply_to, OLD.attachments, OLD.keyword, OLD.received_at, OLD.author_staff_id, OLD.created_at,
      OLD.delivery_id) THEN
    RAISE EXCEPTION 'MESSAGE_IMMUTABLE: a received message never changes; only its linking does'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.direction IN ('internal', 'outbound')
     AND (NEW.project_id, NEW.conversation_id, NEW.contact_id, NEW.link_state)
         IS DISTINCT FROM (OLD.project_id, OLD.conversation_id, OLD.contact_id, OLD.link_state) THEN
    RAISE EXCEPTION 'MESSAGE_IMMUTABLE: an internal message or a staff reply stays on its project'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;

INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by) VALUES
  ('replies.contact_hours', 1, 'configured', '{"contactHoursOnly": true}',
   true, ARRAY['FACT-HOURS', 'HH-COM-09', 'OWN-DEC-120', 'OWN-DEC-101'], 'migration:0046');
