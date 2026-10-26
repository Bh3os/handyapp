-- 0122 Spanish worker notes and proposed replies: the Owner/Office review queue and English customer replies
-- (TSK-0155; HH-COM-16, HH-COM-08, HH-COM-01, ENT-Message, ENT-QueueItem, ENT-AuditEvent, OWN-DEC-211, OWN-DEC-162,
-- RULE-LANGUAGES, RULE-AI-WAVE2, RULE-SERVER-AUTHZ). The server decides who may do what
-- (apps/server/src/modules/inbox/proposals.ts); this migration keeps the records true whatever path writes.
-- - comms.reply_proposals: a customer reply a worker proposes from an assigned job, in Spanish or English, exactly as
--   written. It is internal: it is stored apart from comms.messages (the customer-visible messages), so no path that
--   renders a portal conversation, an email, a text or a customer document reads it. States, as the worker sees
--   them: draft (the worker may still change the text), awaiting_review (frozen; an Owner or Office review item is
--   open, or the reviewer asked the worker for clarification), sent (an Owner or Office reviewer wrote the English
--   message and sent it: sent_message_id names that outbound staff reply) and rejected (with the reviewer's reason;
--   it never sends). Sent and rejected are final. The original text is kept with the sent message for context and
--   audit, and nothing is ever deleted (a staging reset only).
-- - comms.reply_proposal_events: the proposal's history, append-only: submitted, the reviewer's clarification
--   question, the worker's answer, rejected, sent. Only a live Owner or Office grant decides, asks or sends.
-- - comms.messages: an internal message (a staff note, including a worker's note from the job) lies only in its
--   project's internal conversation, and an email, text or portal message only in the customer conversation, so an
--   internal note can never be listed in the portal's Messages tab or read as a reply's text.
-- No translation exists (wave 2 stays disabled, RULE-AI-WAVE2): the reviewer writes the English message.

CREATE TABLE comms.reply_proposals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL,
  -- The assigned job it was written from (a worker reaches a project only through a job of it).
  job_id           uuid NOT NULL,
  author_staff_id  uuid NOT NULL REFERENCES identity.staff_users (id),
  -- The worker's text exactly as written (Spanish or English); internal only, never sent as written.
  original_text    text NOT NULL CHECK (char_length(original_text) <= 2000 AND original_text ~ '\S'),
  state            text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'awaiting_review', 'sent', 'rejected')),
  -- The reviewer asked the worker for clarification and the worker has not answered yet.
  clarification_open boolean NOT NULL DEFAULT false,
  submitted_at     timestamptz,
  decided_by       uuid REFERENCES identity.staff_users (id),
  decided_at       timestamptz,
  reject_reason    text CHECK (char_length(reject_reason) <= 1000 AND reject_reason ~ '\S'),
  -- The English staff reply the reviewer sent (comms.messages, direction outbound).
  sent_message_id  uuid UNIQUE REFERENCES comms.messages (id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  version          integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT reply_proposals_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id),
  CHECK ((state = 'draft') = (submitted_at IS NULL)),
  CHECK ((state = 'sent') = (sent_message_id IS NOT NULL)),
  CHECK ((state = 'rejected') = (reject_reason IS NOT NULL)),
  CHECK ((state IN ('sent', 'rejected')) = (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CHECK (NOT clarification_open OR state = 'awaiting_review')
);
CREATE INDEX reply_proposals_author ON comms.reply_proposals (author_staff_id, created_at DESC);
CREATE INDEX reply_proposals_project ON comms.reply_proposals (project_id, created_at DESC);
COMMENT ON TABLE comms.reply_proposals IS
  'Customer replies workers propose (Spanish or English), reviewed by Owner or Office; never sent as written (HH-COM-16).';

CREATE FUNCTION comms.reply_proposal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a proposed reply is kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.state NOT IN ('draft', 'awaiting_review') OR NEW.clarification_open THEN
      RAISE EXCEPTION 'a proposed reply starts as a draft or awaiting review' USING ERRCODE = 'check_violation';
    END IF;
    NEW.version := 1;
  ELSE
    IF (NEW.id, NEW.project_id, NEW.job_id, NEW.author_staff_id, NEW.created_at)
       IS DISTINCT FROM (OLD.id, OLD.project_id, OLD.job_id, OLD.author_staff_id, OLD.created_at) THEN
      RAISE EXCEPTION 'a proposed reply stays on its job and author' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.state IN ('sent', 'rejected') THEN
      RAISE EXCEPTION 'PROPOSAL_FINAL: a sent or rejected proposal never changes' USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.original_text IS DISTINCT FROM OLD.original_text AND OLD.state <> 'draft' THEN
      RAISE EXCEPTION 'PROPOSAL_FROZEN: the original text is kept as submitted' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.state = 'awaiting_review' AND NEW.state = 'draft' THEN
      RAISE EXCEPTION 'a submitted proposal never returns to draft' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.submitted_at IS DISTINCT FROM OLD.submitted_at AND OLD.submitted_at IS NOT NULL THEN
      RAISE EXCEPTION 'the submission time never changes' USING ERRCODE = 'restrict_violation';
    END IF;
    NEW.version := OLD.version + 1;
  END IF;
  -- Only a live Owner or Office grant decides (OWN-DEC-211: only Owner or Office send the customer reply).
  IF NEW.decided_by IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.decided_by IS NULL)
     AND NOT finance.has_live_role(NEW.decided_by, ARRAY['owner', 'office']) THEN
    RAISE EXCEPTION 'only an Owner or Office account decides a proposed reply' USING ERRCODE = 'check_violation';
  END IF;
  -- The sent message is the reviewer's outbound staff reply on the proposal's own project.
  IF NEW.sent_message_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM comms.messages m
        WHERE m.id = NEW.sent_message_id AND m.direction = 'outbound' AND m.project_id = NEW.project_id
          AND m.author_staff_id = NEW.decided_by) THEN
    RAISE EXCEPTION 'a sent proposal names the reviewer''s reply on its project' USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER reply_proposals_guard BEFORE INSERT OR UPDATE OR DELETE ON comms.reply_proposals
  FOR EACH ROW EXECUTE FUNCTION comms.reply_proposal_guard();

CREATE TABLE comms.reply_proposal_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq          bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  proposal_id  uuid NOT NULL REFERENCES comms.reply_proposals (id),
  kind         text NOT NULL CHECK (kind IN ('submitted', 'clarification_requested', 'clarification_answered',
                 'rejected', 'sent')),
  staff_id     uuid NOT NULL REFERENCES identity.staff_users (id),
  -- The clarification question, the worker's answer or the rejection reason (internal, never sent).
  text         text CHECK (char_length(text) <= 2000 AND text ~ '\S'),
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind IN ('clarification_requested', 'clarification_answered', 'rejected')) = (text IS NOT NULL))
);
CREATE INDEX reply_proposal_events_proposal ON comms.reply_proposal_events (proposal_id, seq);
CREATE TRIGGER reply_proposal_events_append_only BEFORE UPDATE OR DELETE ON comms.reply_proposal_events
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE comms.reply_proposal_events IS
  'History of a proposed reply: submission, clarification round trips, rejection, sending (append-only).';

CREATE FUNCTION comms.reply_proposal_event_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind IN ('clarification_requested', 'rejected', 'sent')
     AND NOT finance.has_live_role(NEW.staff_id, ARRAY['owner', 'office']) THEN
    RAISE EXCEPTION 'only an Owner or Office account reviews a proposed reply' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.kind IN ('submitted', 'clarification_answered') AND NOT EXISTS (
       SELECT 1 FROM comms.reply_proposals p WHERE p.id = NEW.proposal_id AND p.author_staff_id = NEW.staff_id) THEN
    RAISE EXCEPTION 'only the author submits or answers for a proposed reply' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reply_proposal_events_check BEFORE INSERT ON comms.reply_proposal_events
  FOR EACH ROW EXECUTE FUNCTION comms.reply_proposal_event_check();

-- A staging reset is the only path that empties them (TSK-0141).
CREATE TRIGGER reply_proposals_reset_only_truncate BEFORE TRUNCATE ON comms.reply_proposals
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();
CREATE TRIGGER reply_proposal_events_reset_only_truncate BEFORE TRUNCATE ON comms.reply_proposal_events
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();

-- Internal notes and customer-visible messages stay apart (OWN-DEC-211 7, 8): an internal message only in its
-- project's internal conversation; an email, text or portal message only in a customer conversation.
CREATE FUNCTION comms.message_audience_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  aud text;
BEGIN
  IF NEW.conversation_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT audience INTO aud FROM comms.conversations WHERE id = NEW.conversation_id;
  IF (NEW.direction = 'internal') <> (aud = 'internal') THEN
    RAISE EXCEPTION 'MESSAGE_AUDIENCE: internal notes and customer messages stay in their own conversations'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER messages_audience_check BEFORE INSERT OR UPDATE OF conversation_id, direction ON comms.messages
  FOR EACH ROW EXECUTE FUNCTION comms.message_audience_check();
