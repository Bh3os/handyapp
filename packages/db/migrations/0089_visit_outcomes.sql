-- 0089 Visit outcomes: delays, no access, customer absence, weather, missing resources and readiness issues
-- (TSK-0078; HH-SCH-09, HH-WORK-03, HH-PORT-07, ENT-Visit, OWN-DEC-68, OWN-DEC-107, RULE-SERVER-AUTHZ). The server
-- decides who may record and follow up (apps/server/src/modules/field/outcomes.ts); this migration keeps the records
-- true whatever path writes.
-- - work.visit_outcomes: one explicit outcome a worker assigned to the visit (or the Owner) recorded, with a note,
--   while the visit was booked and not yet finished (confirmed, on the way or arrived). Each opens a staff follow-up;
--   the follow-up is recorded once, by staff, with what was done. Never deleted; the outcome itself never changes.
-- - "No access" moves the visit to no_access, now also from on the way and arrived (the worker reached the property
--   and could not get in), only in the transaction that records the outcome and never once work started on the visit.
--   no_access is final and releases the visit's reservations (0052). No outcome completes a visit or marks work done.

CREATE TABLE work.visit_outcomes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id          uuid NOT NULL REFERENCES work.visits (id),
  project_id        uuid NOT NULL REFERENCES crm.projects (id),
  job_id            uuid REFERENCES work.jobs (id),
  kind              text NOT NULL CHECK (kind IN ('delay', 'no_access', 'customer_absent', 'weather',
                      'missing_resources', 'readiness_issue')),
  -- What the worker saw, as they wrote it (staff only; never sent to the customer).
  note              text NOT NULL CHECK (char_length(btrim(note)) BETWEEN 1 AND 2000),
  -- The visit's state when it was recorded.
  visit_state       text NOT NULL CHECK (visit_state IN ('confirmed', 'en_route', 'arrived')),
  recorded_by       uuid NOT NULL REFERENCES identity.staff_users (id),
  recorded_at       timestamptz NOT NULL DEFAULT now(),
  -- The staff follow-up: what was done (rescheduled, cancelled, the customer contacted), once.
  followed_up_by    uuid REFERENCES identity.staff_users (id),
  followed_up_at    timestamptz,
  follow_up_note    text CHECK (char_length(btrim(follow_up_note)) BETWEEN 1 AND 2000),
  CONSTRAINT visit_outcomes_follow_up CHECK (
    (followed_up_at IS NULL) = (followed_up_by IS NULL) AND (followed_up_at IS NULL) = (follow_up_note IS NULL))
);
CREATE INDEX visit_outcomes_visit ON work.visit_outcomes (visit_id, recorded_at);
CREATE INDEX visit_outcomes_open ON work.visit_outcomes (project_id) WHERE followed_up_at IS NULL;
COMMENT ON TABLE work.visit_outcomes IS
  'Explicit visit outcomes (HH-SCH-09) with a note and their staff follow-up; never deleted, never mark work done.';

CREATE FUNCTION work.visit_outcome_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'visit outcomes are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT project_id, job_id, state INTO v FROM work.visits WHERE id = NEW.visit_id;
    IF (v.project_id, v.job_id) IS DISTINCT FROM (NEW.project_id, NEW.job_id) THEN
      RAISE EXCEPTION 'a visit outcome names its visit''s own project and job' USING ERRCODE = 'check_violation';
    END IF;
    IF v.state IS DISTINCT FROM NEW.visit_state OR v.state NOT IN ('confirmed', 'en_route', 'arrived') THEN
      RAISE EXCEPTION 'a visit outcome is recorded while the visit is booked and not yet finished'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT (work.assigned_to_visit(NEW.visit_id, NEW.recorded_by) OR work.has_live_role(NEW.recorded_by, 'owner')) THEN
      RAISE EXCEPTION 'a visit outcome is recorded by a worker assigned to the visit or the Owner'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.followed_up_at IS NOT NULL THEN
      RAISE EXCEPTION 'a visit outcome is recorded before its follow-up' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.kind = 'no_access' AND EXISTS (SELECT 1 FROM work.work_starts WHERE visit_id = NEW.visit_id) THEN
      RAISE EXCEPTION 'no access is never recorded once work started on the visit' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.visit_id, NEW.project_id, NEW.job_id, NEW.kind, NEW.note, NEW.visit_state, NEW.recorded_by,
      NEW.recorded_at)
     IS DISTINCT FROM (OLD.id, OLD.visit_id, OLD.project_id, OLD.job_id, OLD.kind, OLD.note, OLD.visit_state,
                       OLD.recorded_by, OLD.recorded_at) THEN
    RAISE EXCEPTION 'a visit outcome never changes' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.followed_up_at IS NOT NULL THEN
    RAISE EXCEPTION 'a visit outcome is followed up once' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER visit_outcomes_guard BEFORE INSERT OR UPDATE OR DELETE ON work.visit_outcomes
  FOR EACH ROW EXECUTE FUNCTION work.visit_outcome_guard();

-- The visit guard of 0052, with no access also from on the way and arrived.
CREATE OR REPLACE FUNCTION work.visit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  window_changed boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'visits are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  PERFORM work.visit_window_check(NEW);
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'tentative' OR NEW.version <> 1 OR NEW.window_version <> 1 THEN
      RAISE EXCEPTION 'a visit is created tentative' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM crm.projects WHERE id = NEW.project_id AND property_id = NEW.property_id) THEN
      RAISE EXCEPTION 'a visit is at its project''s property' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.purpose, NEW.project_id, NEW.job_id, NEW.property_id, NEW.created_by, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.purpose, OLD.project_id, OLD.job_id, OLD.property_id, OLD.created_by, OLD.created_at)
  THEN
    RAISE EXCEPTION 'a visit keeps its purpose, project, job and property' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'each change of a visit raises its version by one' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.state IS DISTINCT FROM OLD.state THEN
    IF NOT ((OLD.state, NEW.state) IN (('tentative', 'confirmed'), ('tentative', 'expired'), ('confirmed', 'en_route'),
            ('en_route', 'arrived'), ('arrived', 'completed'), ('confirmed', 'canceled'), ('confirmed', 'no_access'),
            ('en_route', 'no_access'), ('arrived', 'no_access'))) THEN
      RAISE EXCEPTION 'a visit cannot move from % to %', OLD.state, NEW.state USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.state = 'confirmed' AND work.visit_reservation_problem(NEW) IS NOT NULL THEN
    RAISE EXCEPTION 'a visit is confirmed only with a reservation of every required worker and resource (%)',
      work.visit_reservation_problem(NEW) USING ERRCODE = 'check_violation';
  END IF;
  window_changed := (NEW.local_date, NEW.window_start, NEW.window_end, NEW.time_zone, NEW.start_offset_minutes,
                     NEW.end_offset_minutes, NEW.starts_at, NEW.ends_at)
                    IS DISTINCT FROM (OLD.local_date, OLD.window_start, OLD.window_end, OLD.time_zone,
                     OLD.start_offset_minutes, OLD.end_offset_minutes, OLD.starts_at, OLD.ends_at);
  IF window_changed THEN
    IF OLD.state NOT IN ('tentative', 'confirmed') OR NEW.state IS DISTINCT FROM OLD.state THEN
      RAISE EXCEPTION 'a visit''s window changes only while it is tentative or confirmed' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.window_version <> OLD.window_version + 1 THEN
      RAISE EXCEPTION 'a new window is the next window version' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF (NEW.window_version, NEW.window_set_by, NEW.window_reason)
        IS DISTINCT FROM (OLD.window_version, OLD.window_set_by, OLD.window_reason) THEN
    RAISE EXCEPTION 'a window version records a new window' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- No access only with its recorded outcome in the same transaction, and never once work started on the visit.
CREATE FUNCTION work.visit_no_access_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state = 'no_access' AND OLD.state IS DISTINCT FROM 'no_access' THEN
    IF NOT EXISTS (SELECT 1 FROM work.visit_outcomes
                    WHERE visit_id = NEW.id AND kind = 'no_access' AND xmin = pg_current_xact_id()::xid) THEN
      RAISE EXCEPTION 'a visit has no access only with the recorded outcome' USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM work.work_starts WHERE visit_id = NEW.id) THEN
      RAISE EXCEPTION 'no access is never recorded once work started on the visit' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER visits_no_access_check AFTER UPDATE OF state ON work.visits
  FOR EACH ROW EXECUTE FUNCTION work.visit_no_access_check();

-- A staging reset is the only path that empties this table (TSK-0141).
CREATE TRIGGER visit_outcomes_reset_only_truncate BEFORE TRUNCATE ON work.visit_outcomes
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();
