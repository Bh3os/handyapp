-- 0012 Delivery states, consent and SMS keywords (TSK-0048; HH-COM-02, HH-COM-05, HH-COM-12, HH-INT-22,
-- ENT-ConsentPreference, ENT-Message, OWN-DEC-147, INT-Bird, INT-Resend).
-- - consent_records: append-only consent and communication preferences per destination and purpose. The latest
--   record is the current state; transactional texts (the SMS opt-in) and marketing are separate purposes, and having
--   a number is never consent. STOP appends a withdrawal and START a new opt-in, with the webhook receipt as evidence.
-- - message_delivery_events: every provider status that changed a delivery, from the stored webhook receipts, so the
--   shown state is what the provider reported (delivered only when a status webhook said so; "read" is never shown).
-- - message_deliveries gains the time of the provider status it shows.
-- - sms.help_reply: the HELP answer is not worded in the graph, so it is NOT CONFIGURED (a PROPOSED text is in the
--   code); Bird answers HELP with its keyword rule until the owner sets the wording there.
CREATE TABLE platform.consent_records (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq                bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  purpose            text NOT NULL CHECK (purpose IN ('service_communication', 'transactional_sms', 'marketing')),
  channel            text NOT NULL CHECK (channel IN ('email', 'sms')),
  -- The normalised destination: lower-case e-mail or an E.164 number.
  destination        text NOT NULL CHECK (char_length(destination) BETWEEN 3 AND 320),
  subject_kind       text CHECK (subject_kind IN ('customer_contact', 'staff_user')),
  subject_id         text CHECK (char_length(subject_id) <= 100),
  granted            boolean NOT NULL,
  disclosure_version text CHECK (char_length(disclosure_version) <= 100),
  source             text NOT NULL CHECK (source IN ('request_form', 'portal', 'sms_keyword', 'provider_suppression', 'staff_recorded')),
  -- Safe evidence only: a webhook receipt ID, the keyword, a staff note reference; never message text.
  evidence           jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(evidence) = 'object'),
  recorded_by        text NOT NULL CHECK (recorded_by <> ''),
  recorded_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (purpose <> 'transactional_sms' OR channel = 'sms')
);
CREATE INDEX consent_records_current ON platform.consent_records (destination, purpose, channel, seq DESC);
CREATE TRIGGER consent_records_append_only BEFORE UPDATE OR DELETE ON platform.consent_records
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE platform.consent_records IS 'Append-only consent per destination and purpose (ENT-ConsentPreference).';

CREATE TABLE platform.message_delivery_events (
  id            bigserial PRIMARY KEY,
  delivery_id   uuid NOT NULL REFERENCES platform.message_deliveries (id),
  receipt_id    uuid NOT NULL UNIQUE REFERENCES platform.webhook_receipts (id),
  provider_type text NOT NULL CHECK (char_length(provider_type) BETWEEN 1 AND 120),
  from_state    text NOT NULL,
  to_state      text NOT NULL,
  occurred_at   timestamptz,
  recorded_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX message_delivery_events_delivery ON platform.message_delivery_events (delivery_id, id);
COMMENT ON TABLE platform.message_delivery_events IS 'Provider statuses applied to deliveries (HH-COM-02).';

ALTER TABLE platform.message_deliveries ADD COLUMN status_at timestamptz;
CREATE INDEX message_deliveries_provider_message ON platform.message_deliveries (provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by) VALUES
  ('sms.help_reply', 1, 'not_configured', NULL, false,
   ARRAY['HH-COM-12', 'OWN-DEC-147', 'OQ-ATTORNEY-PRIVACY'], 'migration:0012');
