-- 0049 The visit model: UTC instants with an explicit IANA zone and the history of every window (TSK-0061; HH-SCH-01,
-- HH-SCH-02, HH-DATA-06, HH-SCH-05, T09, T37, T41, ENT-Visit, ENT-SchedulingTask, ENT-Property, FACT-TIMEZONE,
-- FACT-HOURS, OWN-DEC-99, OWN-DEC-105, OWN-DEC-144).
-- - visits: one scheduled occurrence of on-site work or an estimate visit (ENT-Visit). Its purpose is `site_estimate`
--   (an "Estimate visit": on the existing project, no job, no price approval) or a work visit (`service`,
--   `follow_up`, `return_work`) on the project's job; one job may have several visits. The current window is the local
--   date, the arrival window's wall-clock start and end, the IANA zone (the property's), the UTC offset chosen at each
--   end and the two UTC instants. The planning facts (expected work duration, preparation and travel buffers, number
--   of workers, equipment) stay empty until staff enter them: nothing here assumes a duration or a window.
--   Assignments are reservations (ENT-Reservation), not columns of the visit.
-- - visit_windows: every window a visit has had, version by version, written by the database itself whenever a
--   visit is created or its window changes, so no change can skip the history. Append-only.
-- - A visit is created tentative. No visit can be confirmed by this migration: confirmation needs a database-level
--   reservation of every required worker and resource (ENT-Reservation, HH-SCH-04) and the preconditions of HH-SCH-06,
--   which the reservation and confirmation migrations add by replacing work.visit_guard(). The other edges are
--   ENT-Visit's.
-- - The database checks every stored window against its own time-zone data: the local date and time in the zone, and
--   the local time with the stored offset, must both give the stored instant. A time inside a spring-forward gap
--   therefore cannot be stored, and a time inside a repeated hour is stored with the offset of the reading chosen.
--   Sessions run in UTC (packages/db client), but nothing here depends on the session's zone.
-- - scheduling_tasks: "fulfilled only after a committed visit" now reads the job's visits.

CREATE TABLE work.visits (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose                    text NOT NULL CHECK (purpose IN ('site_estimate', 'service', 'follow_up', 'return_work')),
  project_id                 uuid NOT NULL REFERENCES crm.projects (id),
  job_id                     uuid,
  property_id                uuid NOT NULL REFERENCES crm.properties (id),
  state                      text NOT NULL DEFAULT 'tentative' CHECK (state IN ('tentative', 'confirmed', 'en_route',
                               'arrived', 'completed', 'expired', 'canceled', 'no_access')),
  version                    integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  -- The current window (version window_version of work.visit_windows).
  window_version             integer NOT NULL DEFAULT 1 CHECK (window_version >= 1),
  local_date                 date NOT NULL,
  window_start               time NOT NULL,
  window_end                 time NOT NULL,
  time_zone                  text NOT NULL CHECK (time_zone ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+)+$'
                               AND char_length(time_zone) <= 64),
  -- Minutes east of UTC at each end (Louisville: -240 in summer, -300 in winter).
  start_offset_minutes       smallint NOT NULL CHECK (start_offset_minutes BETWEEN -720 AND 840),
  end_offset_minutes         smallint NOT NULL CHECK (end_offset_minutes BETWEEN -720 AND 840),
  starts_at                  timestamptz NOT NULL,
  ends_at                    timestamptz NOT NULL,
  window_set_by              uuid NOT NULL REFERENCES identity.staff_users (id),
  window_reason              text CHECK (char_length(btrim(window_reason)) BETWEEN 1 AND 500),
  -- Planning facts, entered by staff; empty means not entered yet.
  expected_duration_minutes  integer CHECK (expected_duration_minutes BETWEEN 1 AND 20160),
  preparation_buffer_minutes integer CHECK (preparation_buffer_minutes BETWEEN 0 AND 1440),
  travel_buffer_minutes      integer CHECK (travel_buffer_minutes BETWEEN 0 AND 1440),
  required_workers           smallint CHECK (required_workers BETWEEN 1 AND 20),
  equipment                  text[] NOT NULL DEFAULT '{}' CHECK (cardinality(equipment) <= 50),
  created_by                 uuid NOT NULL REFERENCES identity.staff_users (id),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT visits_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id),
  -- An estimate visit belongs to the project and creates no job; every other purpose is a visit of the job.
  CONSTRAINT visits_purpose_link CHECK ((purpose = 'site_estimate') = (job_id IS NULL)),
  CONSTRAINT visits_window_order CHECK (window_end > window_start AND ends_at > starts_at)
);
CREATE INDEX visits_project ON work.visits (project_id, starts_at);
CREATE INDEX visits_job ON work.visits (job_id, starts_at) WHERE job_id IS NOT NULL;
CREATE INDEX visits_starts ON work.visits (starts_at);
COMMENT ON TABLE work.visits IS
  'Visits (ENT-Visit): purpose, project or job, the local window with its IANA zone and UTC instants, state, version.';

CREATE TABLE work.visit_windows (
  visit_id             uuid NOT NULL REFERENCES work.visits (id),
  window_version       integer NOT NULL CHECK (window_version >= 1),
  local_date           date NOT NULL,
  window_start         time NOT NULL,
  window_end           time NOT NULL,
  time_zone            text NOT NULL,
  start_offset_minutes smallint NOT NULL,
  end_offset_minutes   smallint NOT NULL,
  starts_at            timestamptz NOT NULL,
  ends_at              timestamptz NOT NULL,
  -- The visit's state when this window was set.
  visit_state          text NOT NULL,
  set_by               uuid NOT NULL REFERENCES identity.staff_users (id),
  reason               text,
  set_at               timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (visit_id, window_version)
);
CREATE TRIGGER visit_windows_append_only BEFORE UPDATE OR DELETE ON work.visit_windows
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE work.visit_windows IS 'Every window a visit has had (HH-SCH-01): append-only, written by the database.';

-- The window's local fields, zone, offsets and instants agree, by the database's own time-zone data.
CREATE FUNCTION work.visit_window_check(v work.visits) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  start_local timestamp := v.local_date + v.window_start;
  end_local   timestamp := v.local_date + v.window_end;
BEGIN
  BEGIN
    PERFORM now() AT TIME ZONE v.time_zone;
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE EXCEPTION 'unknown time zone %', v.time_zone USING ERRCODE = 'check_violation';
  END;
  IF (v.starts_at AT TIME ZONE v.time_zone) IS DISTINCT FROM start_local
     OR (v.ends_at AT TIME ZONE v.time_zone) IS DISTINCT FROM end_local THEN
    RAISE EXCEPTION 'a visit window''s instants show its local date and times in its zone'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v.starts_at IS DISTINCT FROM (start_local AT TIME ZONE 'UTC') - make_interval(mins => v.start_offset_minutes)
     OR v.ends_at IS DISTINCT FROM (end_local AT TIME ZONE 'UTC') - make_interval(mins => v.end_offset_minutes) THEN
    RAISE EXCEPTION 'a visit window''s offsets give its instants' USING ERRCODE = 'check_violation';
  END IF;
END $$;

-- A visit is created tentative, on its project's property, at window version 1. Afterwards it keeps its purpose,
-- project, job, property and creation; every change raises its version by one; the state moves only along ENT-Visit's
-- edges, and never to confirmed here (see the header); a window changes only while tentative or confirmed, as the
-- next window version, and never together with the state. Visits are never deleted.
CREATE FUNCTION work.visit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
    IF NEW.state = 'confirmed' THEN
      RAISE EXCEPTION 'a visit is confirmed only with a reservation of every required worker and resource'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT ((OLD.state, NEW.state) IN (('tentative', 'expired'), ('confirmed', 'en_route'), ('en_route', 'arrived'),
            ('arrived', 'completed'), ('confirmed', 'canceled'), ('confirmed', 'no_access'))) THEN
      RAISE EXCEPTION 'a visit cannot move from % to %', OLD.state, NEW.state USING ERRCODE = 'check_violation';
    END IF;
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
CREATE TRIGGER visits_guard BEFORE INSERT OR UPDATE OR DELETE ON work.visits
  FOR EACH ROW EXECUTE FUNCTION work.visit_guard();

-- Every window version, as it was set, in the same transaction.
CREATE FUNCTION work.visit_window_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.window_version <> OLD.window_version THEN
    INSERT INTO work.visit_windows (visit_id, window_version, local_date, window_start, window_end, time_zone,
      start_offset_minutes, end_offset_minutes, starts_at, ends_at, visit_state, set_by, reason)
    VALUES (NEW.id, NEW.window_version, NEW.local_date, NEW.window_start, NEW.window_end, NEW.time_zone,
      NEW.start_offset_minutes, NEW.end_offset_minutes, NEW.starts_at, NEW.ends_at, NEW.state, NEW.window_set_by,
      NEW.window_reason);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER visits_window_history AFTER INSERT OR UPDATE ON work.visits
  FOR EACH ROW EXECUTE FUNCTION work.visit_window_history();

-- A scheduling task is fulfilled only after a committed work visit of its job (HH-SCH-05, ENT-SchedulingTask).
CREATE OR REPLACE FUNCTION work.scheduling_task_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'scheduling tasks are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'open' OR NEW.version <> 1 THEN
      RAISE EXCEPTION 'a scheduling task is created open' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.job_id, NEW.project_id, NEW.purpose, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.job_id, OLD.project_id, OLD.purpose, OLD.created_at) THEN
    RAISE EXCEPTION 'a scheduling task keeps its job and purpose' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.state = 'fulfilled' AND OLD.state <> 'fulfilled' AND NOT EXISTS (
       SELECT 1 FROM work.visits
        WHERE job_id = NEW.job_id AND purpose <> 'site_estimate'
          AND state IN ('confirmed', 'en_route', 'arrived', 'completed')) THEN
    RAISE EXCEPTION 'a scheduling task is fulfilled only after a committed visit' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
