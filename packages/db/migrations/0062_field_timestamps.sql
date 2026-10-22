-- 0062 My Day: On my way, Arrived and Finished, per worker (TSK-0070; HH-OFF-09, HH-SCH-08, HH-PORT-07, HH-WORK-06,
-- T47, ENT-Visit, ENT-TimeStamp, ENT-AuditEvent, FACT-AUTOMATIC-MESSAGES, OWN-DEC-107, OWN-DEC-69, OWN-DEC-149,
-- RULE-SAFETY-GATES, RULE-HUMAN-REVIEW, RULE-DECIDED-VALUES-ACTIVE).
-- - visit.on_my_way: the assigned worker may tap "On my way" from three hours before the visit (OWN-DEC-107), a decided
--   value seeded active. Time alone never records anything: only the worker's tap does.
-- - work.visit_departures: each assigned worker's own "On my way" tap on a visit, once (a repeated tap records
--   nothing). The tap that moved the visit confirmed -> en_route is marked; it is the one that sends the customer's
--   on-the-way notice, so a visit has at most one. Append-only.
-- - work.time_stamps (ENT-TimeStamp): each assigned worker's "Arrived" and "Finished", one of each per worker and
--   visit, at the server's time (the device's time is kept beside it when the app sends one, for the offline drafts of
--   TSK-0079; it never replaces the server's). Append-only: a wrong or forgotten value is corrected, never edited.
-- - work.time_stamp_corrections: the Owner's corrections (HH-WORK-06): the value set, the value it replaced (null: the
--   value was missing) and the reason; the recorded tap stays as it was. Append-only.
-- - The database keeps the sequence honest: a departure, an Arrived or a Finished is recorded only by a worker with an
--   active confirmed reservation of that visit, in a state that allows it; the visit moves to en_route only with the
--   departure that moved it, to arrived only with an Arrived recorded in the same transaction, and to completed only
--   when every assigned worker has a Finished value, one of them written in the same transaction. Nothing here starts
--   work, passes the Start Work gate or releases a hold (RULE-SAFETY-GATES). No pay, overtime or deduction is computed
--   anywhere (payroll stays a human-review area, RULE-HUMAN-REVIEW).

INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by) VALUES
  ('visit.on_my_way', 1, 'configured', '{"earliestMinutesBefore": 180}', false,
   ARRAY['OWN-DEC-107', 'HH-SCH-08'], 'migration:0062');

-- Whether staff_user_id holds an active confirmed worker reservation of the visit.
CREATE FUNCTION work.assigned_to_visit(visit uuid, staff uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM work.reservations
                  WHERE visit_id = visit AND staff_user_id = staff AND resource = 'worker' AND kind = 'confirmed'
                    AND ended_at IS NULL)
$$;

CREATE TABLE work.visit_departures (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id           uuid NOT NULL REFERENCES work.visits (id),
  staff_user_id      uuid NOT NULL REFERENCES identity.staff_users (id),
  -- This tap moved the visit confirmed -> en_route (the accepted tap of HH-PORT-07).
  moved_visit        boolean NOT NULL,
  device_recorded_at timestamptz,
  recorded_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (visit_id, staff_user_id)
);
CREATE UNIQUE INDEX visit_departures_one_moving ON work.visit_departures (visit_id) WHERE moved_visit;
CREATE TRIGGER visit_departures_append_only BEFORE UPDATE OR DELETE ON work.visit_departures
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE work.visit_departures IS
  'Each assigned worker''s "On my way" tap per visit (HH-SCH-08): the tap that moved the visit is marked. Append-only.';

CREATE FUNCTION work.visit_departure_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v record;
BEGIN
  NEW.recorded_at := now();
  SELECT state INTO v FROM work.visits WHERE id = NEW.visit_id;
  IF NOT work.assigned_to_visit(NEW.visit_id, NEW.staff_user_id) THEN
    RAISE EXCEPTION 'only a worker assigned to the visit records On my way' USING ERRCODE = 'check_violation';
  END IF;
  IF v.state NOT IN ('confirmed', 'en_route') OR (NEW.moved_visit AND v.state <> 'confirmed') THEN
    RAISE EXCEPTION 'On my way is recorded for a confirmed or en-route visit only' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER visit_departures_guard BEFORE INSERT ON work.visit_departures
  FOR EACH ROW EXECUTE FUNCTION work.visit_departure_guard();

CREATE TABLE work.time_stamps (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id           uuid NOT NULL REFERENCES work.visits (id),
  project_id         uuid NOT NULL REFERENCES crm.projects (id),
  -- The visit's job (null for an estimate visit).
  job_id             uuid REFERENCES work.jobs (id),
  staff_user_id      uuid NOT NULL REFERENCES identity.staff_users (id),
  kind               text NOT NULL CHECK (kind IN ('arrived', 'finished')),
  recorded_at        timestamptz NOT NULL DEFAULT now(),
  device_recorded_at timestamptz,
  UNIQUE (visit_id, staff_user_id, kind)
);
CREATE INDEX time_stamps_staff ON work.time_stamps (staff_user_id, recorded_at);
CREATE INDEX time_stamps_job ON work.time_stamps (job_id) WHERE job_id IS NOT NULL;
CREATE TRIGGER time_stamps_append_only BEFORE UPDATE OR DELETE ON work.time_stamps
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE work.time_stamps IS
  'Arrived and Finished per assigned worker and visit (ENT-TimeStamp, HH-WORK-06): server time; append-only.';

CREATE FUNCTION work.time_stamp_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v record;
BEGIN
  NEW.recorded_at := now();
  SELECT project_id, job_id, state INTO v FROM work.visits WHERE id = NEW.visit_id;
  IF v.project_id IS DISTINCT FROM NEW.project_id OR v.job_id IS DISTINCT FROM NEW.job_id THEN
    RAISE EXCEPTION 'a timestamp names its visit''s project and job' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT work.assigned_to_visit(NEW.visit_id, NEW.staff_user_id) THEN
    RAISE EXCEPTION 'only a worker assigned to the visit records Arrived or Finished' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.kind = 'arrived' AND v.state NOT IN ('en_route', 'arrived') THEN
    RAISE EXCEPTION 'Arrived is recorded once the visit is on the way' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.kind = 'finished' AND (v.state <> 'arrived' OR NOT EXISTS (
       SELECT 1 FROM work.time_stamps
        WHERE visit_id = NEW.visit_id AND staff_user_id = NEW.staff_user_id AND kind = 'arrived')) THEN
    RAISE EXCEPTION 'Finished is recorded after the worker''s own Arrived' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER time_stamps_guard BEFORE INSERT ON work.time_stamps
  FOR EACH ROW EXECUTE FUNCTION work.time_stamp_guard();

CREATE TABLE work.time_stamp_corrections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id      uuid NOT NULL REFERENCES work.visits (id),
  staff_user_id uuid NOT NULL REFERENCES identity.staff_users (id),
  kind          text NOT NULL CHECK (kind IN ('arrived', 'finished')),
  -- The recorded tap this corrects (null: the worker never recorded it, the value was missing).
  time_stamp_id uuid REFERENCES work.time_stamps (id),
  -- The value in force before this correction (the recorded tap or an earlier correction); null: it was missing.
  previous_at   timestamptz,
  corrected_at  timestamptz NOT NULL,
  reason        text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
  corrected_by  uuid NOT NULL REFERENCES identity.staff_users (id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (corrected_at <= created_at)
);
CREATE INDEX time_stamp_corrections_visit ON work.time_stamp_corrections (visit_id, staff_user_id, kind, created_at);
CREATE TRIGGER time_stamp_corrections_append_only BEFORE UPDATE OR DELETE ON work.time_stamp_corrections
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE work.time_stamp_corrections IS
  'The Owner''s corrections of Arrived and Finished (HH-WORK-06): the value set, the value replaced and the reason; '
  'the recorded tap is kept. Append-only.';

-- A correction names the worker's recorded tap of that kind when there is one, and a worker who was assigned to the
-- visit (an active confirmed reservation) or recorded something there.
CREATE FUNCTION work.time_stamp_correction_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  stamp uuid;
BEGIN
  NEW.created_at := now();
  IF NEW.corrected_at > NEW.created_at THEN
    RAISE EXCEPTION 'a corrected time is never in the future' USING ERRCODE = 'check_violation';
  END IF;
  SELECT id INTO stamp FROM work.time_stamps
   WHERE visit_id = NEW.visit_id AND staff_user_id = NEW.staff_user_id AND kind = NEW.kind;
  IF stamp IS DISTINCT FROM NEW.time_stamp_id THEN
    RAISE EXCEPTION 'a correction names the worker''s recorded tap of that kind' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT work.assigned_to_visit(NEW.visit_id, NEW.staff_user_id)
     AND NOT EXISTS (SELECT 1 FROM work.time_stamps WHERE visit_id = NEW.visit_id AND staff_user_id = NEW.staff_user_id)
  THEN
    RAISE EXCEPTION 'a correction is for a worker of the visit' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER time_stamp_corrections_guard BEFORE INSERT ON work.time_stamp_corrections
  FOR EACH ROW EXECUTE FUNCTION work.time_stamp_correction_guard();

-- The visit follows the records: en_route with the departure that moved it, arrived with an Arrived, completed when
-- every assigned worker has a Finished value; each written in the same transaction as the state change.
CREATE FUNCTION work.visit_field_records() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state IS NOT DISTINCT FROM OLD.state THEN
    RETURN NULL;
  END IF;
  IF NEW.state = 'en_route' AND NOT EXISTS (
       SELECT 1 FROM work.visit_departures
        WHERE visit_id = NEW.id AND moved_visit AND xmin = pg_current_xact_id()::xid) THEN
    RAISE EXCEPTION 'a visit is on the way only by an assigned worker''s On my way' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.state = 'arrived' AND NOT EXISTS (
       SELECT 1 FROM work.time_stamps
        WHERE visit_id = NEW.id AND kind = 'arrived' AND xmin = pg_current_xact_id()::xid) THEN
    RAISE EXCEPTION 'a visit has arrived only by an assigned worker''s Arrived' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.state = 'completed' THEN
    IF NOT EXISTS (SELECT 1 FROM work.time_stamps
                    WHERE visit_id = NEW.id AND kind = 'finished' AND xmin = pg_current_xact_id()::xid)
       AND NOT EXISTS (SELECT 1 FROM work.time_stamp_corrections
                        WHERE visit_id = NEW.id AND kind = 'finished' AND xmin = pg_current_xact_id()::xid) THEN
      RAISE EXCEPTION 'a visit is completed only with a Finished' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM work.reservations
                    WHERE visit_id = NEW.id AND resource = 'worker' AND kind = 'confirmed' AND ended_at IS NULL)
       OR EXISTS (
         SELECT 1 FROM work.reservations r
          WHERE r.visit_id = NEW.id AND r.resource = 'worker' AND r.kind = 'confirmed' AND r.ended_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM work.time_stamps s
                             WHERE s.visit_id = NEW.id AND s.staff_user_id = r.staff_user_id AND s.kind = 'finished')
            AND NOT EXISTS (SELECT 1 FROM work.time_stamp_corrections c
                             WHERE c.visit_id = NEW.id AND c.staff_user_id = r.staff_user_id AND c.kind = 'finished'))
    THEN
      RAISE EXCEPTION 'a visit is completed when every assigned worker has Finished' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER visits_field_records AFTER UPDATE OF state ON work.visits
  FOR EACH ROW EXECUTE FUNCTION work.visit_field_records();
