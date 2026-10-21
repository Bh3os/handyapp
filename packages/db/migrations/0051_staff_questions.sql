-- 0051 Staff questions, customer replies and no-response handling (TSK-0051; HH-LEAD-03, HH-LEAD-06, HH-COM-06,
-- HH-COM-09, HH-COM-05, HH-PORT-09, HH-SEC-05, T30, T65, ENT-Question, ENT-Request, ENT-Message, ENT-Photo,
-- OWN-DEC-98, OWN-DEC-101, FACT-REMINDER-CADENCES, FACT-REOPEN-PERIOD, RULE-SERVER-AUTHZ).
--
-- - intake.questions: one row per question staff published inside a project (publishing is the release, OWN-DEC-98).
--   Its text, kind, author and publication time never change and it is never deleted. Only its progress moves, each
--   step once and forward: answered (by the customer's reply), the successful send of its notice (the clock of the
--   reminders starts there, never at a failed send, OWN-DEC-101) and the successful send of its first and final
--   reminders (staff may close "Closed—no response" only after the final one was actually sent).
-- - intake.question_replies: the customer's reply, kept exactly as written with its author and time, append-only; one
--   reply answers one question (PROPOSED). "I'm not sure" is recorded beside the text, never instead of the history.
-- - intake.question_reply_photos: the photos a reply attached (customer uploads under a reply upload capability,
--   validated like request photos, HH-SEC-05), append-only.
-- - intake.upload_capabilities gains the 'reply' scope: one capability for one question's reply, held by the verified
--   customer's browser; its photos are bound to the request and project when the reply is submitted.
-- - intake.request_decisions admits the staff decision 'close_no_response' (ENT-Request "Closed—no response").
-- - comms.messages admits customer messages written in the portal's Messages tab (channel 'portal', HH-PORT-09): an
--   inbound message of the verified customer's own contact, placed on its project by the session (match rule
--   'portal_session'), kept exactly as written and never moved to another project.
-- Nothing here holds a business value: the cadences and the reopen period are the configured reminders.cadences and
-- request.reopen_period (migration 0005).

CREATE TABLE intake.questions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id             uuid NOT NULL REFERENCES intake.requests (id),
  project_id             uuid NOT NULL REFERENCES crm.projects (id),
  -- 'measurement': the customer may answer "I'm not sure" (OWN-DEC-98). PROPOSED: staff mark it when publishing.
  kind                   text NOT NULL CHECK (kind IN ('general', 'measurement')),
  -- Exactly as the staff member wrote it.
  body                   text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  author_staff_id        uuid NOT NULL REFERENCES identity.staff_users (id),
  published_at           timestamptz NOT NULL DEFAULT now(),
  state                  text NOT NULL DEFAULT 'published' CHECK (state IN ('published', 'answered')),
  answered_at            timestamptz,
  -- The first successful send of the question notice (email or text); NULL while none succeeded.
  notice_sent_at         timestamptz,
  first_reminder_sent_at timestamptz,
  final_reminder_sent_at timestamptz,
  version                integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CHECK ((state = 'answered') = (answered_at IS NOT NULL)),
  CHECK (first_reminder_sent_at IS NULL OR notice_sent_at IS NOT NULL),
  CHECK (final_reminder_sent_at IS NULL OR notice_sent_at IS NOT NULL)
);
CREATE INDEX questions_request ON intake.questions (request_id, published_at);
CREATE INDEX questions_project ON intake.questions (project_id, published_at);
COMMENT ON TABLE intake.questions IS
  'Staff questions published in a project (ENT-Question, OWN-DEC-98): text immutable; progress moves forward once.';

CREATE FUNCTION intake.question_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'QUESTION_KEPT: questions are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW.id, NEW.request_id, NEW.project_id, NEW.kind, NEW.body, NEW.author_staff_id, NEW.published_at)
     IS DISTINCT FROM (OLD.id, OLD.request_id, OLD.project_id, OLD.kind, OLD.body, OLD.author_staff_id,
                       OLD.published_at) THEN
    RAISE EXCEPTION 'QUESTION_IMMUTABLE: a published question never changes' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.state = 'answered' AND NEW.state <> 'answered' THEN
    RAISE EXCEPTION 'QUESTION_ANSWERED: an answered question stays answered' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (OLD.answered_at IS NOT NULL AND NEW.answered_at IS DISTINCT FROM OLD.answered_at)
     OR (OLD.notice_sent_at IS NOT NULL AND NEW.notice_sent_at IS DISTINCT FROM OLD.notice_sent_at)
     OR (OLD.first_reminder_sent_at IS NOT NULL AND NEW.first_reminder_sent_at IS DISTINCT FROM OLD.first_reminder_sent_at)
     OR (OLD.final_reminder_sent_at IS NOT NULL AND NEW.final_reminder_sent_at IS DISTINCT FROM OLD.final_reminder_sent_at)
  THEN
    RAISE EXCEPTION 'QUESTION_HISTORY: a recorded time never changes' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'QUESTION_VERSION: every change is a new version' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER questions_guard BEFORE UPDATE OR DELETE ON intake.questions
  FOR EACH ROW EXECUTE FUNCTION intake.question_guard();

CREATE TABLE intake.question_replies (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- PROPOSED: one reply answers one question; more is said in the project's Messages.
  question_id       uuid NOT NULL UNIQUE REFERENCES intake.questions (id),
  request_id        uuid NOT NULL REFERENCES intake.requests (id),
  project_id        uuid NOT NULL REFERENCES crm.projects (id),
  -- The verified customer contact of the session that sent it.
  author_contact_id uuid NOT NULL REFERENCES crm.contacts (id),
  -- Exactly as the customer wrote it (never trimmed or translated); NULL when the reply is "I'm not sure" or photos.
  body              text CHECK (body IS NULL OR (char_length(body) <= 5000 AND btrim(body) <> '')),
  not_sure          boolean NOT NULL DEFAULT false,
  -- The reply reopened a "Closed—no response" request within the reopen period (FACT-REOPEN-PERIOD).
  reopened_request  boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX question_replies_request ON intake.question_replies (request_id, created_at);
CREATE TRIGGER question_replies_append_only BEFORE UPDATE OR DELETE ON intake.question_replies
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE intake.question_replies IS 'Customer replies to staff questions, as written (OWN-DEC-98); append-only.';

CREATE TABLE intake.question_reply_photos (
  reply_id uuid NOT NULL REFERENCES intake.question_replies (id),
  photo_id uuid NOT NULL UNIQUE REFERENCES intake.photos (id),
  position smallint NOT NULL CHECK (position >= 1),
  PRIMARY KEY (reply_id, photo_id),
  UNIQUE (reply_id, position)
);
CREATE TRIGGER question_reply_photos_append_only BEFORE UPDATE OR DELETE ON intake.question_reply_photos
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE intake.question_reply_photos IS 'The photos a customer reply attached (HH-SEC-05); append-only.';

-- A reply upload capability names its request and its question.
ALTER TABLE intake.upload_capabilities DROP CONSTRAINT upload_capabilities_scope_check;
ALTER TABLE intake.upload_capabilities
  ADD CONSTRAINT upload_capabilities_scope_check CHECK (scope IN ('draft', 'request', 'reply')),
  ADD COLUMN question_id uuid REFERENCES intake.questions (id),
  ADD CONSTRAINT upload_capabilities_reply_question CHECK ((scope = 'reply') = (question_id IS NOT NULL));
COMMENT ON COLUMN intake.upload_capabilities.question_id IS
  'Reply capabilities only (TSK-0051): the question whose reply the photos are for.';

ALTER TABLE intake.request_decisions DROP CONSTRAINT request_decisions_action_check;
ALTER TABLE intake.request_decisions ADD CONSTRAINT request_decisions_action_check CHECK (action IN (
  'ask_question', 'prepare_online_estimate', 'arrange_estimate_visit', 'not_a_fit', 'not_a_fit_owner_review',
  'close_no_response'));

-- Portal messages (HH-PORT-09): the customer writes in the project's conversation from the portal.
ALTER TABLE comms.messages DROP CONSTRAINT messages_channel_check;
ALTER TABLE comms.messages
  ADD CONSTRAINT messages_channel_check CHECK (channel IN ('email', 'sms', 'internal', 'portal'));
ALTER TABLE comms.messages DROP CONSTRAINT messages_match_rule_check;
ALTER TABLE comms.messages ADD CONSTRAINT messages_match_rule_check CHECK (match_rule IN (
  'reply_token', 'thread_reference', 'verified_email', 'verified_phone', 'latest_conversation', 'staff',
  'portal_session'));
-- An inbound email or text comes from a verified webhook receipt; a portal message from the customer's session.
ALTER TABLE comms.messages DROP CONSTRAINT messages_check1;
ALTER TABLE comms.messages ADD CONSTRAINT messages_inbound_source CHECK (
  direction <> 'inbound' OR channel = 'portal'
  OR (webhook_receipt_id IS NOT NULL AND from_address IS NOT NULL AND provider IS NOT NULL)
);
ALTER TABLE comms.messages ADD CONSTRAINT messages_portal CHECK (
  channel <> 'portal' OR (
    direction = 'inbound' AND webhook_receipt_id IS NULL AND provider IS NULL AND provider_message_id IS NULL
    AND from_address IS NULL AND link_state = 'matched' AND match_rule = 'portal_session' AND contact_id IS NOT NULL
    AND project_id IS NOT NULL AND conversation_id IS NOT NULL AND body_text IS NOT NULL AND body_state = 'received'
  )
);
ALTER TABLE comms.messages ADD CONSTRAINT messages_portal_rule CHECK (
  match_rule IS DISTINCT FROM 'portal_session' OR channel = 'portal'
);

-- The original stays unchanged (OWN-DEC-120); an internal message, a staff reply and a portal message stay on their
-- project (0046's rule, extended to the portal).
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
  IF (NEW.direction IN ('internal', 'outbound') OR NEW.channel = 'portal')
     AND (NEW.project_id, NEW.conversation_id, NEW.contact_id, NEW.link_state)
         IS DISTINCT FROM (OLD.project_id, OLD.conversation_id, OLD.contact_id, OLD.link_state) THEN
    RAISE EXCEPTION 'MESSAGE_IMMUTABLE: an internal message, a staff reply or a portal message stays on its project'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
