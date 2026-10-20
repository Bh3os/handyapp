-- 0008 Notification templates, deliveries and the automatic-message policy (TSK-0047; HH-COM-03, HH-COM-04, HH-COM-06,
-- FACT-AUTOMATIC-MESSAGES, RULE-LANGUAGES).
-- - Templates are versioned per message type, channel and locale; a version is never edited (a change is a new
--   version). Customer templates exist only in English; a Spanish staff version is released only as AI-reviewed after
--   the separate comparison check (HH-LANG-04, OWN-DEC-79).
-- - A delivery row is the metadata of one notification: template version and audience, event, record reference,
--   destination, channel permission, queued time, attempts, provider message ID, state and error code. It never holds
--   the rendered text. Its unique key (message type, channel, subject) makes a retried event send once.
-- - The automatic-message policy is one configured list (messages.automatic); every other message is a staff-released
--   draft. Seeded active here because the owner decided it (RULE-DECIDED-VALUES-ACTIVE).
CREATE TABLE platform.message_templates (
  message_key text NOT NULL CHECK (message_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  channel     text NOT NULL CHECK (channel IN ('email', 'sms')),
  audience    text NOT NULL CHECK (audience IN ('customer', 'staff')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_key, channel),
  UNIQUE (message_key, channel, audience)
);

CREATE TABLE platform.message_template_versions (
  message_key       text NOT NULL,
  channel           text NOT NULL,
  audience          text NOT NULL,
  locale            text NOT NULL CHECK (locale IN ('en', 'es')),
  version           integer NOT NULL CHECK (version >= 1),
  subject           text CHECK (char_length(subject) BETWEEN 1 AND 200),
  body              text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  translation_review text NOT NULL CHECK (translation_review IN ('source', 'ai_reviewed')),
  source_ids        text[] NOT NULL CHECK (cardinality(source_ids) >= 1),
  released_by       text NOT NULL CHECK (released_by <> ''),
  released_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_key, channel, locale, version),
  FOREIGN KEY (message_key, channel, audience) REFERENCES platform.message_templates (message_key, channel, audience),
  -- Customer output is English only (RULE-LANGUAGES, OWN-DEC-45).
  CHECK (audience = 'staff' OR locale = 'en'),
  -- English is the source; Spanish is released only as AI-reviewed, never as human-reviewed.
  CHECK ((locale = 'en') = (translation_review = 'source')),
  CHECK ((channel = 'email') = (subject IS NOT NULL))
);
CREATE TRIGGER message_template_versions_append_only BEFORE UPDATE OR DELETE ON platform.message_template_versions
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();

CREATE TABLE platform.message_deliveries (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq                bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  message_key        text NOT NULL CHECK (message_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  channel            text NOT NULL CHECK (channel IN ('email', 'sms')),
  audience           text NOT NULL CHECK (audience IN ('customer', 'staff')),
  -- One notification per message type, channel and subject (for example the request ID): retries never duplicate.
  subject_key        text NOT NULL CHECK (char_length(subject_key) BETWEEN 1 AND 200),
  release            text NOT NULL CHECK (release IN ('automatic', 'staff_released')),
  state              text NOT NULL CHECK (state IN ('draft', 'queued', 'sent', 'delivered', 'failed', 'suppressed', 'cancelled')),
  locale             text NOT NULL CHECK (locale IN ('en', 'es')),
  template_version   integer,
  outbox_event_id    uuid REFERENCES platform.outbox_events (id),
  record_type        text CHECK (record_type ~ '^[a-z][a-z0-9_]*$'),
  record_id          text CHECK (char_length(record_id) <= 100),
  recipient_kind     text NOT NULL CHECK (recipient_kind IN ('customer_contact', 'staff_user')),
  recipient_id       text CHECK (char_length(recipient_id) <= 100),
  destination        text NOT NULL CHECK (char_length(destination) BETWEEN 3 AND 320),
  channel_permission text NOT NULL CHECK (channel_permission IN ('preferred', 'permitted', 'staff_account')),
  -- Draft inputs (staff-released messages only); identifiers and short texts, never access secrets.
  variables          jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(variables) = 'object'),
  released_by        text,
  attempts           integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  provider           text CHECK (provider IN ('resend', 'bird', 'fake')),
  provider_message_id text CHECK (char_length(provider_message_id) <= 200),
  error_code         text CHECK (char_length(error_code) <= 120),
  queued_at          timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_key, channel, subject_key, recipient_kind, destination),
  CHECK (audience = 'staff' OR locale = 'en'),
  CHECK (release = 'staff_released' OR released_by IS NULL),
  CHECK (state = 'draft' OR release = 'automatic' OR released_by IS NOT NULL),
  CHECK (release = 'staff_released' OR variables = '{}'::jsonb),
  CHECK (state <> 'draft' OR release = 'staff_released')
);
CREATE INDEX message_deliveries_record ON platform.message_deliveries (record_type, record_id, seq);
CREATE INDEX message_deliveries_open ON platform.message_deliveries (state, updated_at) WHERE state IN ('draft', 'queued', 'failed');

-- The one automatic-message list (FACT-AUTOMATIC-MESSAGES). Each later decision adds its message to this same key as a
-- new version; there is no second list. The codes are the message types of apps/server/src/modules/notifications.
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by) VALUES
  ('messages.automatic', 1, 'configured',
   '{"customer": ["request.receipt", "contact.verification_code", "project.access_link", "question.notice", "estimate_visit.options", "estimate_visit.confirmed", "decision.not_a_fit", "estimate.ready", "approval.receipt", "appointment.confirmed", "appointment.changed", "visit.on_the_way", "invoice.ready", "payment.receipt"], "staffAccount": ["staff.invitation", "staff.password_reset"], "staffNotifications": ["staff_notice.customer_reply", "staff_notice.estimate_changes_requested", "staff_notice.estimate_declined", "staff_notice.case_opened", "staff_notice.urgent_field_alert", "staff_notice.schedule_change"]}',
   false,
   ARRAY['FACT-AUTOMATIC-MESSAGES', 'OWN-DEC-65', 'OWN-DEC-95', 'OWN-DEC-96', 'OWN-DEC-97', 'OWN-DEC-98', 'OWN-DEC-99',
         'OWN-DEC-100', 'OWN-DEC-102', 'OWN-DEC-103', 'OWN-DEC-105', 'OWN-DEC-107', 'OWN-DEC-110', 'OWN-DEC-111',
         'OWN-DEC-114', 'OWN-DEC-119', 'OWN-DEC-124'],
   'migration:0008');

-- Templates whose wording the owner gave verbatim (OWN-DEC-98, OWN-DEC-102, OWN-DEC-110). Every other message type
-- has no released template yet and stays NOT CONFIGURED until its wording is approved: nothing sends without one.
INSERT INTO platform.message_templates (message_key, channel, audience) VALUES
  ('question.notice', 'email', 'customer'),
  ('question.notice', 'sms', 'customer'),
  ('estimate.ready', 'email', 'customer'),
  ('estimate.ready', 'sms', 'customer'),
  ('invoice.ready', 'email', 'customer'),
  ('invoice.ready', 'sms', 'customer');
INSERT INTO platform.message_template_versions
  (message_key, channel, audience, locale, version, subject, body, translation_review, source_ids, released_by) VALUES
  ('question.notice', 'email', 'customer', 'en', 1, 'HandyHub has a question about your request',
   E'HandyHub has a question about your request. View and reply securely.\n\n{projectLink}',
   'source', ARRAY['OWN-DEC-98'], 'migration:0008'),
  ('question.notice', 'sms', 'customer', 'en', 1, NULL,
   'HandyHub has a question about your request. View and reply securely. {projectLink}',
   'source', ARRAY['OWN-DEC-98'], 'migration:0008'),
  ('estimate.ready', 'email', 'customer', 'en', 1, 'Your HandyHub estimate is ready',
   E'Your HandyHub estimate is ready.\n\n{projectLink}',
   'source', ARRAY['OWN-DEC-102'], 'migration:0008'),
  ('estimate.ready', 'sms', 'customer', 'en', 1, NULL,
   'Your HandyHub estimate is ready. {projectLink}',
   'source', ARRAY['OWN-DEC-102'], 'migration:0008'),
  ('invoice.ready', 'email', 'customer', 'en', 1, 'Your HandyHub invoice is ready',
   E'Your HandyHub invoice is ready.\n\n{projectLink}',
   'source', ARRAY['OWN-DEC-110'], 'migration:0008'),
  ('invoice.ready', 'sms', 'customer', 'en', 1, NULL,
   'Your HandyHub invoice is ready. {projectLink}',
   'source', ARRAY['OWN-DEC-110'], 'migration:0008');
