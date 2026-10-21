-- 0052 Capacity and double-booking prevention (TSK-0062; HH-SCH-03, HH-SCH-04, HH-DATA-04, T38, T39, T42,
-- ENT-Reservation, ENT-StaffUser, ENT-Visit, FACT-HOURS, OWN-DEC-05, OWN-DEC-28, OWN-DEC-82, OWN-DEC-119,
-- OWN-DEC-123, OWN-DEC-144).
-- - Capacity is modelled per individual worker (HH-SCH-03): the working days and hours the Owner sets
--   (worker_schedules, one append-only version per change, with the hours of that version in working_hours, local to
--   the business zone of the version), the approved time off the Owner records (time_off, withdrawn but never
--   deleted) and the worker's reservations. Nothing here assumes any hours: a worker without a schedule version has
--   no working hours yet (NOT CONFIGURED) and cannot be reserved. Equipment items are registered by the Owner
--   (equipment, retired but never deleted); no item is invented.
-- - reservations (ENT-Reservation) link one worker or one equipment item to a visit for a UTC range. Two exclusion
--   constraints make overlapping active reservations or holds of one worker, or of one item, impossible in the
--   database itself, whatever the screen or the number of concurrent transactions (HH-SCH-04): a second overlapping
--   insert waits for the first transaction and then fails, so two confirmations of the same last capacity give one
--   success and one conflict. A two-person visit reserves both workers in one transaction (T39), so either both rows
--   commit or none does. A reservation is ended once (rescheduled, reassigned, released, a hold that expired or was
--   released, the visit cancelled, expired or without access) and is never edited otherwise or deleted: the ended rows
--   are the booking history (HH-SCH-07). One mechanism serves estimate visits and work visits (OWN-DEC-119).
-- - A hold (kind 'hold', OWN-DEC-144: an offered window held for 24 hours, TSK-0063) blocks the capacity exactly like
--   a confirmed reservation until it is converted to confirmed or ended; its expiry instant is recorded with it.
-- - work.visit_guard() is replaced: a visit is confirmed only when the active confirmed reservations of the visit
--   cover it exactly: the number of workers it needs (one of them the lead), at least one item per equipment entry, all
--   for the reserved range of the visit and with no hold left. PROPOSED reserved range: from the travel buffer before
--   the arrival window starts to the preparation buffer plus the expected work after the arrival window ends
--   (@handyhub/domain/capacity reservedRange computes the same range). The same check runs at commit whenever the
--   reservations of a confirmed visit change (a deferred constraint trigger), so a reschedule or reassignment can
--   never leave a confirmed visit with a partial team.
-- - Availability changes never cancel an appointment (OWN-DEC-123): recorded time off, a disabled account or a
--   retired item flags the upcoming reservations it touches (reservation_flags, append-only), in the same
--   transaction; a new working-hours version is checked by the server, which flags the reservations outside it.
-- - A visit that is cancelled, expires or has no access ends its active reservations in the same transaction.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- The working days and hours of one worker, version by version (OWN-DEC-123: set by the Owner).
CREATE TABLE work.worker_schedules (
  staff_user_id uuid NOT NULL REFERENCES identity.staff_users (id),
  version       integer NOT NULL CHECK (version >= 1),
  -- The zone the hours are local to: the business zone (FACT-TIMEZONE) when the version was set.
  time_zone     text NOT NULL CHECK (time_zone ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+)+$' AND char_length(time_zone) <= 64),
  set_by        uuid NOT NULL REFERENCES identity.staff_users (id),
  reason        text CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
  set_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (staff_user_id, version)
);
COMMENT ON TABLE work.worker_schedules IS
  'Working-hours versions per worker (HH-SCH-03, OWN-DEC-123): append-only; the latest version is in force.';

CREATE TABLE work.working_hours (
  staff_user_id uuid NOT NULL,
  version       integer NOT NULL,
  -- ISO weekday: 1 Monday ... 7 Sunday.
  weekday       smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  -- Minutes after local midnight; 1440 is the end of the day.
  start_minute  smallint NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute    smallint NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
  CHECK (end_minute > start_minute),
  FOREIGN KEY (staff_user_id, version) REFERENCES work.worker_schedules (staff_user_id, version),
  CONSTRAINT working_hours_no_overlap EXCLUDE USING gist (staff_user_id WITH =, version WITH =, weekday WITH =,
    int4range(start_minute, end_minute) WITH &&)
);
COMMENT ON TABLE work.working_hours IS 'The hours of each working day of a schedule version (local, business zone).';

-- A version is the next one of its worker, in a known zone; its hours are written with it, in the same transaction.
CREATE FUNCTION work.worker_schedule_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.version <> coalesce((SELECT max(version) FROM work.worker_schedules WHERE staff_user_id = NEW.staff_user_id),
                             0) + 1 THEN
    RAISE EXCEPTION 'a working-hours version is the next version of its worker' USING ERRCODE = 'check_violation';
  END IF;
  BEGIN
    PERFORM now() AT TIME ZONE NEW.time_zone;
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE EXCEPTION 'unknown time zone %', NEW.time_zone USING ERRCODE = 'check_violation';
  END;
  RETURN NEW;
END $$;
CREATE TRIGGER worker_schedules_guard BEFORE INSERT ON work.worker_schedules
  FOR EACH ROW EXECUTE FUNCTION work.worker_schedule_guard();
CREATE TRIGGER worker_schedules_append_only BEFORE UPDATE OR DELETE ON work.worker_schedules
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();

CREATE FUNCTION work.working_hours_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM work.worker_schedules s
                  WHERE s.staff_user_id = NEW.staff_user_id AND s.version = NEW.version
                    AND s.xmin = pg_current_xact_id()::xid) THEN
    RAISE EXCEPTION 'working hours are written with their schedule version' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER working_hours_guard BEFORE INSERT ON work.working_hours
  FOR EACH ROW EXECUTE FUNCTION work.working_hours_guard();
CREATE TRIGGER working_hours_append_only BEFORE UPDATE OR DELETE ON work.working_hours
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();

-- Approved time off, recorded by the Owner. No reason is stored (it may be personal).
CREATE TABLE work.time_off (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES identity.staff_users (id),
  starts_at     timestamptz NOT NULL,
  ends_at       timestamptz NOT NULL,
  -- The zone it was entered in (the business zone).
  time_zone     text NOT NULL CHECK (time_zone ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+)+$' AND char_length(time_zone) <= 64),
  recorded_by   uuid NOT NULL REFERENCES identity.staff_users (id),
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  withdrawn_at  timestamptz,
  withdrawn_by  uuid REFERENCES identity.staff_users (id),
  CHECK (ends_at > starts_at),
  CHECK ((withdrawn_at IS NULL) = (withdrawn_by IS NULL))
);
CREATE INDEX time_off_worker ON work.time_off (staff_user_id, starts_at) WHERE withdrawn_at IS NULL;
COMMENT ON TABLE work.time_off IS 'Approved time off per worker (HH-SCH-03): withdrawn once, never edited or deleted.';

CREATE FUNCTION work.time_off_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'time off is withdrawn, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.withdrawn_at IS NOT NULL OR NEW.withdrawn_at IS NULL
     OR (to_jsonb(NEW) - 'withdrawn_at' - 'withdrawn_by') IS DISTINCT FROM (to_jsonb(OLD) - 'withdrawn_at' - 'withdrawn_by')
  THEN
    RAISE EXCEPTION 'time off is withdrawn once, never edited' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER time_off_guard BEFORE UPDATE OR DELETE ON work.time_off
  FOR EACH ROW EXECUTE FUNCTION work.time_off_guard();

-- Equipment items, registered by the Owner. Active names are unique (case-insensitive).
CREATE TABLE work.equipment (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 120),
  created_by uuid NOT NULL REFERENCES identity.staff_users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  retired_by uuid REFERENCES identity.staff_users (id),
  CHECK ((retired_at IS NULL) = (retired_by IS NULL))
);
CREATE UNIQUE INDEX equipment_active_name ON work.equipment (lower(name)) WHERE retired_at IS NULL;
COMMENT ON TABLE work.equipment IS 'Equipment items that visits reserve (HH-SCH-03): retired once, never deleted.';

CREATE FUNCTION work.equipment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'equipment items are retired, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.retired_at IS NOT NULL OR NEW.retired_at IS NULL
     OR (to_jsonb(NEW) - 'retired_at' - 'retired_by') IS DISTINCT FROM (to_jsonb(OLD) - 'retired_at' - 'retired_by') THEN
    RAISE EXCEPTION 'an equipment item is retired once, never edited' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER equipment_guard BEFORE UPDATE OR DELETE ON work.equipment
  FOR EACH ROW EXECUTE FUNCTION work.equipment_guard();

-- Assignments and reservations (ENT-Reservation).
CREATE TABLE work.reservations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id        uuid NOT NULL REFERENCES work.visits (id),
  resource        text NOT NULL CHECK (resource IN ('worker', 'equipment')),
  staff_user_id   uuid REFERENCES identity.staff_users (id),
  equipment_id    uuid REFERENCES work.equipment (id),
  -- Workers only: the lead or a member of the team.
  role            text CHECK (role IN ('lead', 'member')),
  kind            text NOT NULL CHECK (kind IN ('hold', 'confirmed')),
  hold_expires_at timestamptz,
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL,
  -- The visit's zone, so the range reads in local time.
  time_zone       text NOT NULL CHECK (time_zone ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+)+$' AND char_length(time_zone) <= 64),
  assigned_by     uuid NOT NULL REFERENCES identity.staff_users (id),
  reason          text CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
  created_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  -- Empty when the database ended it (the visit's state, an expired hold).
  ended_by        uuid REFERENCES identity.staff_users (id),
  ended_reason    text CHECK (ended_reason IN ('rescheduled', 'reassigned', 'released', 'hold_expired', 'hold_released',
                    'visit_expired', 'visit_canceled', 'visit_no_access')),
  CHECK (ends_at > starts_at),
  CHECK ((resource = 'worker') = (staff_user_id IS NOT NULL)),
  CHECK ((resource = 'equipment') = (equipment_id IS NOT NULL)),
  CHECK ((resource = 'worker') = (role IS NOT NULL)),
  CHECK ((kind = 'hold') = (hold_expires_at IS NOT NULL)),
  CHECK ((ended_at IS NULL) = (ended_reason IS NULL)),
  CHECK (ended_by IS NULL OR ended_at IS NOT NULL),
  -- HH-SCH-04: no two active reservations or holds of one worker, or of one item, overlap.
  CONSTRAINT reservations_worker_no_overlap EXCLUDE USING gist
    (staff_user_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
    WHERE (staff_user_id IS NOT NULL AND ended_at IS NULL),
  CONSTRAINT reservations_equipment_no_overlap EXCLUDE USING gist
    (equipment_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
    WHERE (equipment_id IS NOT NULL AND ended_at IS NULL)
);
CREATE UNIQUE INDEX reservations_one_lead ON work.reservations (visit_id) WHERE role = 'lead' AND ended_at IS NULL;
CREATE INDEX reservations_visit ON work.reservations (visit_id) WHERE ended_at IS NULL;
CREATE INDEX reservations_range ON work.reservations (starts_at, ends_at) WHERE ended_at IS NULL;
COMMENT ON TABLE work.reservations IS
  'Worker and equipment reservations and holds per visit (ENT-Reservation): no overlap per resource, ended once.';

-- A reservation is made for a live visit (a hold only while it is tentative), for an active worker without approved
-- time off in the range, or an item that is not retired. Afterwards it is either ended once (with its reason) or a
-- hold becomes confirmed; nothing else changes and nothing is deleted.
CREATE FUNCTION work.reservation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  visit_state text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'reservations are ended, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.ended_at IS NOT NULL THEN
      RAISE EXCEPTION 'a reservation is created active' USING ERRCODE = 'check_violation';
    END IF;
    SELECT state INTO visit_state FROM work.visits WHERE id = NEW.visit_id;
    IF visit_state IS NULL OR visit_state NOT IN ('tentative', 'confirmed')
       OR (NEW.kind = 'hold' AND visit_state <> 'tentative') THEN
      RAISE EXCEPTION 'a reservation is made for a tentative or confirmed visit' USING ERRCODE = 'check_violation';
    END IF;
    BEGIN
      PERFORM now() AT TIME ZONE NEW.time_zone;
    EXCEPTION WHEN invalid_parameter_value THEN
      RAISE EXCEPTION 'unknown time zone %', NEW.time_zone USING ERRCODE = 'check_violation';
    END;
    IF NEW.resource = 'worker' THEN
      IF NOT EXISTS (SELECT 1 FROM identity.staff_users WHERE id = NEW.staff_user_id AND status = 'active') THEN
        RAISE EXCEPTION 'only an active staff account is reserved' USING ERRCODE = 'check_violation';
      END IF;
      IF EXISTS (SELECT 1 FROM work.time_off o
                  WHERE o.staff_user_id = NEW.staff_user_id AND o.withdrawn_at IS NULL
                    AND tstzrange(o.starts_at, o.ends_at, '[)') && tstzrange(NEW.starts_at, NEW.ends_at, '[)')) THEN
        RAISE EXCEPTION 'a worker is not reserved during approved time off' USING ERRCODE = 'check_violation';
      END IF;
    ELSIF NOT EXISTS (SELECT 1 FROM work.equipment WHERE id = NEW.equipment_id AND retired_at IS NULL) THEN
      RAISE EXCEPTION 'a retired equipment item is not reserved' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'an ended reservation is history and never changes' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.ended_at IS NOT NULL THEN
    IF (to_jsonb(NEW) - 'ended_at' - 'ended_by' - 'ended_reason')
       IS DISTINCT FROM (to_jsonb(OLD) - 'ended_at' - 'ended_by' - 'ended_reason') THEN
      RAISE EXCEPTION 'ending a reservation changes nothing else' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.kind = 'hold' AND NEW.kind = 'confirmed' AND NEW.hold_expires_at IS NULL
     AND (to_jsonb(NEW) - 'kind' - 'hold_expires_at') = (to_jsonb(OLD) - 'kind' - 'hold_expires_at') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'a reservation is ended or a hold confirmed, never edited' USING ERRCODE = 'restrict_violation';
END $$;
CREATE TRIGGER reservations_guard BEFORE INSERT OR UPDATE OR DELETE ON work.reservations
  FOR EACH ROW EXECUTE FUNCTION work.reservation_guard();

-- Why a visit's active reservations do not cover it exactly, or null when they do (see the header).
CREATE FUNCTION work.visit_reservation_problem(v work.visits) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  from_ts timestamptz;
  to_ts   timestamptz;
  workers integer;
  leads   integer;
  items   integer;
  outside integer;
  holds   integer;
BEGIN
  IF v.expected_duration_minutes IS NULL OR v.required_workers IS NULL THEN
    RETURN 'the expected work and the number of workers are entered first';
  END IF;
  from_ts := v.starts_at - make_interval(mins => coalesce(v.travel_buffer_minutes, 0));
  to_ts := v.ends_at + make_interval(mins => coalesce(v.preparation_buffer_minutes, 0) + v.expected_duration_minutes);
  SELECT count(*) FILTER (WHERE resource = 'worker' AND kind = 'confirmed'),
         count(*) FILTER (WHERE resource = 'worker' AND kind = 'confirmed' AND role = 'lead'),
         count(*) FILTER (WHERE resource = 'equipment' AND kind = 'confirmed'),
         count(*) FILTER (WHERE kind = 'confirmed' AND (starts_at, ends_at) IS DISTINCT FROM (from_ts, to_ts)),
         count(*) FILTER (WHERE kind = 'hold')
    INTO workers, leads, items, outside, holds
    FROM work.reservations
   WHERE visit_id = v.id AND ended_at IS NULL;
  IF workers <> v.required_workers OR leads <> 1 THEN
    RETURN 'every required worker is reserved, one of them the lead';
  END IF;
  IF items < cardinality(v.equipment) THEN
    RETURN 'an item is reserved for every equipment entry';
  END IF;
  IF outside > 0 THEN
    RETURN 'the reservations cover the reserved range of the visit';
  END IF;
  IF holds > 0 THEN
    RETURN 'no hold of a confirmed visit is left';
  END IF;
  RETURN NULL;
END $$;

-- The reservations of a confirmed visit still cover it when the transaction commits.
CREATE FUNCTION work.reservations_cover_visit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v work.visits;
  problem text;
BEGIN
  SELECT * INTO v FROM work.visits WHERE id = NEW.visit_id;
  IF v.state = 'confirmed' THEN
    problem := work.visit_reservation_problem(v);
    IF problem IS NOT NULL THEN
      RAISE EXCEPTION 'a confirmed visit keeps a reservation of every required worker and resource (%)', problem
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER reservations_cover_visit AFTER INSERT OR UPDATE ON work.reservations
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION work.reservations_cover_visit();

-- The visit guard of 0049, with confirmation now allowed when the reservations cover the visit (see the header).
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
            ('en_route', 'arrived'), ('arrived', 'completed'), ('confirmed', 'canceled'), ('confirmed', 'no_access'))) THEN
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

-- A visit that is cancelled, expires or has no access ends its active reservations and holds.
CREATE FUNCTION work.visit_release_reservations() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state IN ('expired', 'canceled', 'no_access') AND NEW.state IS DISTINCT FROM OLD.state THEN
    UPDATE work.reservations
       SET ended_at = now(), ended_reason = 'visit_' || NEW.state
     WHERE visit_id = NEW.id AND ended_at IS NULL;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER visits_release_reservations AFTER UPDATE OF state ON work.visits
  FOR EACH ROW EXECUTE FUNCTION work.visit_release_reservations();

-- Upcoming appointments touched by an availability change, flagged for review, never cancelled (OWN-DEC-123).
CREATE TABLE work.reservation_flags (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES work.reservations (id),
  visit_id       uuid NOT NULL REFERENCES work.visits (id),
  cause          text NOT NULL CHECK (cause IN ('working_hours_changed', 'time_off_recorded', 'account_disabled',
                   'equipment_retired')),
  -- What caused it: the schedule version, the time-off record, the disabling or the item.
  cause_ref      text NOT NULL CHECK (char_length(cause_ref) BETWEEN 1 AND 100),
  flagged_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reservation_id, cause, cause_ref)
);
CREATE INDEX reservation_flags_visit ON work.reservation_flags (visit_id);
CREATE TRIGGER reservation_flags_append_only BEFORE UPDATE OR DELETE ON work.reservation_flags
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE work.reservation_flags IS
  'Upcoming reservations flagged for review by an availability change (OWN-DEC-123): append-only.';

CREATE FUNCTION work.flag_time_off() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO work.reservation_flags (reservation_id, visit_id, cause, cause_ref)
  SELECT r.id, r.visit_id, 'time_off_recorded', NEW.id::text
    FROM work.reservations r
   WHERE r.staff_user_id = NEW.staff_user_id AND r.ended_at IS NULL AND r.ends_at > now()
     AND tstzrange(r.starts_at, r.ends_at, '[)') && tstzrange(NEW.starts_at, NEW.ends_at, '[)')
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END $$;
CREATE TRIGGER time_off_flags AFTER INSERT ON work.time_off FOR EACH ROW EXECUTE FUNCTION work.flag_time_off();

CREATE FUNCTION work.flag_disabled_worker() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'disabled' AND OLD.status IS DISTINCT FROM 'disabled' THEN
    INSERT INTO work.reservation_flags (reservation_id, visit_id, cause, cause_ref)
    SELECT r.id, r.visit_id, 'account_disabled', NEW.id::text || '@' || to_char(NEW.disabled_at AT TIME ZONE 'UTC',
             'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      FROM work.reservations r
     WHERE r.staff_user_id = NEW.id AND r.ended_at IS NULL AND r.ends_at > now()
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER staff_users_flag_reservations AFTER UPDATE OF status ON identity.staff_users
  FOR EACH ROW EXECUTE FUNCTION work.flag_disabled_worker();

CREATE FUNCTION work.flag_retired_equipment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.retired_at IS NOT NULL AND OLD.retired_at IS NULL THEN
    INSERT INTO work.reservation_flags (reservation_id, visit_id, cause, cause_ref)
    SELECT r.id, r.visit_id, 'equipment_retired', NEW.id::text
      FROM work.reservations r
     WHERE r.equipment_id = NEW.id AND r.ended_at IS NULL AND r.ends_at > now()
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER equipment_flag_reservations AFTER UPDATE OF retired_at ON work.equipment
  FOR EACH ROW EXECUTE FUNCTION work.flag_retired_equipment();
