-- 0025 The first-response clock and intake review holds (TSK-0043; HH-LEAD-04, HH-LEAD-05, OWN-DEC-115, OWN-DEC-116,
-- OWN-DEC-125, FACT-RESPONSE-TARGET, FACT-HOURS, FACT-TIMEZONE, ENT-Hold, HH-WORK-02, RULE-SAFETY-GATES).
--
-- The first-response clock (one per request):
-- - Started in the submission's transaction with the configuration it was started under (response.target,
--   contact.hours, business.timezone) pinned on the row, so a later change never moves an existing deadline. While any
--   of the three is NOT CONFIGURED the clock has no deadline and its figures are unavailable, never zero.
-- - It stops only at the first meaningful response: a meaningful customer message whose delivery succeeded, or a
--   completed customer conversation recorded by staff. Opening, assigning, drafting, notes, qualification, the
--   automatic receipt and failed deliveries never stop it. Each response or failure is one append-only event; the clock
--   row is their projection (the earliest response that still stands), so a delivery that fails after it was accepted
--   puts the clock back to running and the history keeps both.
-- - Instants are UTC; the business-hours arithmetic is in @handyhub/domain (business-hours.ts).
-- Review holds (HH-LEAD-04): a potential hazard or restricted scope found at intake is a hold that blocks the estimate
-- path until it is resolved with a note and the reviewer named, or cancelled as entered in error. The table is the one
-- holds table that scheduling and Start Work extend later (job-level Hold / Ready, critical safety holds, task
-- blocks); today it admits review holds on a request only. Holds are never deleted and a closed request keeps them.

CREATE TABLE intake.response_clocks (
  request_id       uuid PRIMARY KEY REFERENCES intake.requests (id),
  project_id       uuid NOT NULL REFERENCES crm.projects (id),
  -- When the request was received; counting begins at the next opening when that is outside the hours.
  started_at       timestamptz NOT NULL,
  -- The configuration the clock was started under (NULL while NOT CONFIGURED) and the versions it was read at.
  target_minutes   integer CHECK (target_minutes BETWEEN 1 AND 1440),
  hours_open       text CHECK (hours_open ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  hours_close      text CHECK (hours_close ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  time_zone        text CHECK (char_length(time_zone) BETWEEN 1 AND 64),
  config_versions  jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(config_versions) = 'object'),
  -- The internal response target's deadline (never shown to customers).
  due_at           timestamptz,
  -- The first meaningful response that still stands.
  stopped_at       timestamptz,
  stop_kind        text CHECK (stop_kind IN ('response_sent', 'conversation_recorded')),
  stop_ref         text CHECK (char_length(stop_ref) BETWEEN 1 AND 100),
  -- Business minutes from receipt to the response, and whether that was within the target (Owner Dashboard).
  business_minutes integer CHECK (business_minutes >= 0),
  within_target    boolean,
  version          integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK ((target_minutes IS NULL) = (due_at IS NULL)),
  CHECK (target_minutes IS NULL OR (hours_open IS NOT NULL AND hours_close IS NOT NULL AND time_zone IS NOT NULL)),
  CHECK ((stopped_at IS NULL) = (stop_kind IS NULL) AND (stopped_at IS NULL) = (stop_ref IS NULL)),
  CHECK (stopped_at IS NULL OR stopped_at >= started_at),
  CHECK ((business_minutes IS NULL) = (within_target IS NULL)),
  CHECK (business_minutes IS NULL OR (stopped_at IS NOT NULL AND due_at IS NOT NULL)),
  CHECK (stopped_at IS NULL OR due_at IS NULL OR business_minutes IS NOT NULL)
);
CREATE INDEX response_clocks_started ON intake.response_clocks (started_at);
CREATE INDEX response_clocks_running ON intake.response_clocks (due_at) WHERE stopped_at IS NULL;

-- A clock keeps its request, start and pinned configuration; it is never deleted.
CREATE FUNCTION intake.response_clock_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'response clocks are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW.request_id, NEW.project_id, NEW.started_at, NEW.target_minutes, NEW.hours_open, NEW.hours_close,
      NEW.time_zone, NEW.config_versions, NEW.due_at)
     IS DISTINCT FROM (OLD.request_id, OLD.project_id, OLD.started_at, OLD.target_minutes, OLD.hours_open,
                       OLD.hours_close, OLD.time_zone, OLD.config_versions, OLD.due_at) THEN
    RAISE EXCEPTION 'a response clock keeps its start and its configuration' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER response_clocks_guard BEFORE UPDATE OR DELETE ON intake.response_clocks
  FOR EACH ROW EXECUTE FUNCTION intake.response_clock_guard();

-- Completed customer conversations staff record (a logged call or a conversation in person, with its outcome). Staff
-- only, never shown to customers; a correction is a new record.
CREATE TABLE intake.request_conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid NOT NULL REFERENCES intake.requests (id),
  project_id  uuid NOT NULL REFERENCES crm.projects (id),
  channel     text NOT NULL CHECK (channel IN ('phone', 'in_person')),
  outcome     text NOT NULL CHECK (char_length(btrim(outcome)) BETWEEN 1 AND 1000),
  visibility  text NOT NULL DEFAULT 'internal' CHECK (visibility = 'internal'),
  occurred_at timestamptz NOT NULL,
  recorded_by uuid NOT NULL REFERENCES identity.staff_users (id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (occurred_at <= recorded_at + interval '5 minutes')
);
CREATE INDEX request_conversations_request ON intake.request_conversations (request_id, occurred_at);
CREATE TRIGGER request_conversations_append_only BEFORE UPDATE OR DELETE ON intake.request_conversations
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();

-- What happened to each response: a meaningful message delivered (sent), its delivery failing, or a conversation.
CREATE TABLE intake.response_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq         bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  request_id  uuid NOT NULL REFERENCES intake.requests (id),
  kind        text NOT NULL CHECK (kind IN ('response_sent', 'response_failed', 'conversation_recorded')),
  -- The message delivery or the conversation.
  ref         text NOT NULL CHECK (char_length(ref) BETWEEN 1 AND 100),
  message_key text CHECK (message_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, kind, ref, occurred_at),
  CHECK ((kind = 'conversation_recorded') = (message_key IS NULL))
);
CREATE INDEX response_events_request ON intake.response_events (request_id, seq);
CREATE TRIGGER response_events_append_only BEFORE UPDATE OR DELETE ON intake.response_events
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();

-- Holds (ENT-Hold): one row per hold, with its whole history on the row (raised, review started, resolved or
-- cancelled), each change audited. Blocking while open or under review.
CREATE TABLE work.holds (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Later tasks add job_requirement (the job-level Hold / Ready), critical_safety and task_block with their scopes.
  kind              text NOT NULL CHECK (kind IN ('review')),
  scope_type        text NOT NULL CHECK (scope_type IN ('request')),
  scope_id          uuid NOT NULL,
  project_id        uuid NOT NULL REFERENCES crm.projects (id),
  request_id        uuid REFERENCES intake.requests (id),
  -- PROPOSED categories from the human-review areas (RULE-HUMAN-REVIEW).
  category          text NOT NULL CHECK (category IN ('hazardous_material', 'licensed_trade', 'structural',
                      'permit_licensing', 'other')),
  -- What was seen, as staff wrote it. Staff only.
  note              text NOT NULL CHECK (char_length(btrim(note)) BETWEEN 1 AND 1000),
  -- Where it was raised: the qualification revision whose risk flags named it.
  source            text NOT NULL CHECK (source IN ('qualification')),
  source_ref        text NOT NULL CHECK (char_length(source_ref) BETWEEN 1 AND 100),
  state             text NOT NULL DEFAULT 'open'
                      CHECK (state IN ('open', 'under_review', 'resolved', 'canceled_as_error')),
  raised_by         uuid NOT NULL REFERENCES identity.staff_users (id),
  raised_at         timestamptz NOT NULL DEFAULT now(),
  review_started_by uuid REFERENCES identity.staff_users (id),
  review_started_at timestamptz,
  -- How it was resolved and who assessed it (name and, where needed, qualification).
  resolution_note   text CHECK (char_length(btrim(resolution_note)) BETWEEN 1 AND 2000),
  reviewer          text CHECK (char_length(btrim(reviewer)) BETWEEN 1 AND 200),
  resolved_by       uuid REFERENCES identity.staff_users (id),
  resolved_at       timestamptz,
  cancel_reason     text CHECK (char_length(btrim(cancel_reason)) BETWEEN 1 AND 1000),
  canceled_by       uuid REFERENCES identity.staff_users (id),
  canceled_at       timestamptz,
  version           integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CHECK (scope_type <> 'request' OR (request_id IS NOT NULL AND scope_id = request_id)),
  CHECK ((review_started_at IS NULL) = (review_started_by IS NULL)),
  CHECK (state IN ('open', 'canceled_as_error') OR review_started_at IS NOT NULL),
  CHECK ((state = 'resolved') = (resolved_at IS NOT NULL)),
  CHECK ((resolved_at IS NULL) = (resolved_by IS NULL)
         AND (resolved_at IS NULL) = (resolution_note IS NULL)
         AND (resolved_at IS NULL) = (reviewer IS NULL)),
  CHECK ((state = 'canceled_as_error') = (canceled_at IS NOT NULL)),
  CHECK ((canceled_at IS NULL) = (canceled_by IS NULL) AND (canceled_at IS NULL) = (cancel_reason IS NULL))
);
CREATE INDEX holds_blocking ON work.holds (scope_type, scope_id) WHERE state IN ('open', 'under_review');
CREATE INDEX holds_project ON work.holds (project_id);
CREATE INDEX holds_request ON work.holds (request_id, raised_at);

-- A hold moves only forward (open -> under_review -> resolved, or -> canceled_as_error), keeps what was raised and is
-- never deleted. A resolved or cancelled hold is history and never changes again.
CREATE FUNCTION work.hold_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'holds are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.state IN ('resolved', 'canceled_as_error') THEN
    RAISE EXCEPTION 'a resolved or cancelled hold never changes' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW.id, NEW.kind, NEW.scope_type, NEW.scope_id, NEW.project_id, NEW.request_id, NEW.category, NEW.note,
      NEW.source, NEW.source_ref, NEW.raised_by, NEW.raised_at)
     IS DISTINCT FROM (OLD.id, OLD.kind, OLD.scope_type, OLD.scope_id, OLD.project_id, OLD.request_id, OLD.category,
                       OLD.note, OLD.source, OLD.source_ref, OLD.raised_by, OLD.raised_at) THEN
    RAISE EXCEPTION 'a hold keeps what was raised' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NOT ((OLD.state = 'open' AND NEW.state IN ('under_review', 'canceled_as_error'))
          OR (OLD.state = 'under_review' AND NEW.state IN ('resolved', 'canceled_as_error'))) THEN
    RAISE EXCEPTION 'hold % cannot move from % to %', OLD.id, OLD.state, NEW.state
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.review_started_at IS NOT NULL AND (NEW.review_started_at, NEW.review_started_by)
     IS DISTINCT FROM (OLD.review_started_at, OLD.review_started_by) THEN
    RAISE EXCEPTION 'a hold keeps when its review started' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'a hold change takes the next version' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER holds_guard BEFORE UPDATE OR DELETE ON work.holds FOR EACH ROW EXECUTE FUNCTION work.hold_guard();
COMMENT ON TABLE work.holds IS 'Holds (ENT-Hold): intake review holds today; job-level and safety holds later.';
COMMENT ON TABLE intake.response_clocks IS 'First-response clock per request (HH-LEAD-05): internal target only.';
