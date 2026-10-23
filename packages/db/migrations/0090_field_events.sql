-- 0090 Field events: the staff app's sync queue on the server (TSK-0080; HH-OFF-05, HH-OFF-06, HH-OFF-07, T27, T51,
-- T52, ENT-FieldEvent, OWN-DEC-121, RULE-SERVER-AUTHZ). The server decides what an event may do
-- (apps/server/src/modules/field/sync.ts); this migration keeps the records true whatever path writes.
-- - work.field_events: one row per event a phone recorded and uploaded, keyed by the UUID the phone generated, so
--   an event resent any number of times is ingested once.
-- - An event is either synchronized (applied now, or already recorded) or needs review: a conflict with the server's
--   newer state, a worker no longer assigned (then or now), or evidence another account's phone held, uploaded by the
--   Owner. An event in review was never applied; it is kept, never deleted, and the Owner records once what was done.
-- - What the phone sent (who, what, when, the payload and its attachment references) never changes.

CREATE TABLE work.field_events (
  -- The UUID the phone generated for the event (its sync key).
  client_id          uuid PRIMARY KEY,
  -- Who recorded the event on the phone, and who uploaded it (the same, except the Owner's recovery upload).
  actor_id           uuid NOT NULL REFERENCES identity.staff_users (id),
  uploaded_by        uuid NOT NULL REFERENCES identity.staff_users (id),
  type               text NOT NULL CHECK (type IN ('tap_on_my_way', 'tap_arrived', 'tap_finished')),
  visit_id           uuid NOT NULL REFERENCES work.visits (id),
  project_id         uuid NOT NULL REFERENCES crm.projects (id),
  job_id             uuid REFERENCES work.jobs (id),
  -- The visit version the phone last saw, when it sent one.
  base_version       integer CHECK (base_version >= 1),
  device_recorded_at timestamptz NOT NULL,
  received_at        timestamptz NOT NULL DEFAULT now(),
  payload            jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  attachment_refs    jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(attachment_refs) = 'array'),
  -- The phone's upload attempt that reached the server (its retry count plus one).
  attempts           integer NOT NULL DEFAULT 1 CHECK (attempts BETWEEN 1 AND 10000),
  state              text NOT NULL CHECK (state IN ('synchronized', 'needs_review', 'reviewed')),
  -- What ingestion found: applied or already_recorded (synchronized); conflict, not_assigned or recovered (review).
  outcome            text NOT NULL CHECK (outcome IN ('applied', 'already_recorded', 'conflict', 'not_assigned',
                       'recovered')),
  -- The refusal behind a conflict or a refused assignment (a stable code such as VISIT_NOT_ACTIVE).
  detail             text CHECK (detail ~ '^[A-Z][A-Z_]{1,63}$'),
  -- The Owner's review: what was done (a timestamp corrected, nothing to apply), once.
  reviewed_by        uuid REFERENCES identity.staff_users (id),
  reviewed_at        timestamptz,
  review_note        text CHECK (char_length(btrim(review_note)) BETWEEN 1 AND 2000),
  CONSTRAINT field_events_outcome CHECK (
    (outcome IN ('applied', 'already_recorded')) = (state = 'synchronized')),
  CONSTRAINT field_events_recovery CHECK ((outcome = 'recovered') = (actor_id <> uploaded_by)),
  CONSTRAINT field_events_review CHECK (
    (state = 'reviewed') = (reviewed_at IS NOT NULL) AND (reviewed_at IS NULL) = (reviewed_by IS NULL)
    AND (reviewed_at IS NULL) = (review_note IS NULL))
);
CREATE INDEX field_events_visit ON work.field_events (visit_id, device_recorded_at);
CREATE INDEX field_events_actor ON work.field_events (actor_id, received_at);
CREATE INDEX field_events_review ON work.field_events (received_at) WHERE state = 'needs_review';
COMMENT ON TABLE work.field_events IS
  'Field events uploaded from staff phones (HH-OFF-05): ingested once per client UUID; conflicts and unauthorized '
  'writes kept for Owner review, never applied, never deleted.';

CREATE FUNCTION work.field_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'field events are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT project_id, job_id INTO v FROM work.visits WHERE id = NEW.visit_id;
    IF (v.project_id, v.job_id) IS DISTINCT FROM (NEW.project_id, NEW.job_id) THEN
      RAISE EXCEPTION 'a field event names its visit''s own project and job' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.state = 'reviewed' THEN
      RAISE EXCEPTION 'a field event is reviewed after it was received' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.outcome = 'recovered' AND NOT work.has_live_role(NEW.uploaded_by, 'owner') THEN
      RAISE EXCEPTION 'only the Owner uploads another account''s field events' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.client_id, NEW.actor_id, NEW.uploaded_by, NEW.type, NEW.visit_id, NEW.project_id, NEW.job_id,
      NEW.base_version, NEW.device_recorded_at, NEW.received_at, NEW.payload, NEW.attachment_refs, NEW.attempts,
      NEW.outcome, NEW.detail)
     IS DISTINCT FROM (OLD.client_id, OLD.actor_id, OLD.uploaded_by, OLD.type, OLD.visit_id, OLD.project_id,
      OLD.job_id, OLD.base_version, OLD.device_recorded_at, OLD.received_at, OLD.payload, OLD.attachment_refs,
      OLD.attempts, OLD.outcome, OLD.detail) THEN
    RAISE EXCEPTION 'a field event never changes' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NOT (OLD.state = 'needs_review' AND NEW.state = 'reviewed') THEN
    RAISE EXCEPTION 'only a field event in review is reviewed, once' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NOT work.has_live_role(NEW.reviewed_by, 'owner') THEN
    RAISE EXCEPTION 'the Owner reviews field events' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER field_events_guard BEFORE INSERT OR UPDATE OR DELETE ON work.field_events
  FOR EACH ROW EXECUTE FUNCTION work.field_event_guard();

-- A staging reset is the only path that empties this table (TSK-0141).
CREATE TRIGGER field_events_reset_only_truncate BEFORE TRUNCATE ON work.field_events
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();
