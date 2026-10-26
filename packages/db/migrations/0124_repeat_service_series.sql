-- 0124 Customer-agreed repeat-service schedules and their reminders (TSK-0114; HH-SCH-10, C11, T67, OWN-DEC-113,
-- OWN-DEC-148, FACT-REMINDER-CADENCES, FACT-SVC-RECURRING-SERVICE, ENT-Visit, ENT-Message, RULE-SERVER-AUTHZ,
-- RULE-NO-INVENTED-FACTS). The server decides who records, changes and stops a schedule and when its reminders are
-- prepared (apps/server/src/modules/repeat-service); this migration keeps the records true whatever path writes.
-- - service_series: a schedule the customer agreed to, on one project (its property, its customer and the request's
--   contact): the agreed next service date (the anchor, a local date of the property's zone) and, when they agreed to
--   a repeat, every N days, weeks or months; whether they want reminders; how staff heard the agreement. No interval
--   is ever proposed by the software: a schedule exists only because staff recorded the customer's agreement. One
--   active schedule per project; a stopped one stays stopped (a new agreement is a new schedule).
-- - service_series_changes: the append-only history of a schedule: recorded, changed, reminders on or off, stopped, an
--   occurrence skipped or linked to its request, each with who did it (staff or the customer) and the values then.
-- - service_series_occurrences: the dates of a schedule that are recorded on it: kept (inside the change notice when
--   the schedule changed, OWN-DEC-148), skipped, or requested (linked to the new request that carries it). Each
--   occurrence is its own request with its own records, prices, discounts, verification and consent, passing every
--   gate of a new request; nothing of the earlier project is copied.
-- - repeat_service.change_notice (OWN-DEC-148, "24 hours"): a change applies to occurrences more than 24 hours away;
--   one within it keeps its date and follows the cancellation rules (FACT-CANCELLATION-RULES).
-- The reminder's wording is NOT CONFIGURED (no released template of reminder.repeat_service): staff may see a prepared
-- draft but never release it until the Owner releases the wording.

CREATE TABLE work.service_series (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES crm.projects (id),
  state          text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'stopped')),
  -- The agreed next service date: occurrence k is this date plus k intervals (calendar arithmetic).
  anchor_date    date NOT NULL,
  interval_unit  text CHECK (interval_unit IN ('day', 'week', 'month')),
  interval_count integer,
  reminders      boolean NOT NULL,
  agreed_via     text NOT NULL CHECK (agreed_via IN ('phone', 'in_person', 'email', 'message')),
  recorded_by    uuid NOT NULL REFERENCES identity.staff_users (id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  stopped_at     timestamptz,
  stopped_by     text CHECK (stopped_by IN ('staff', 'customer')),
  version        integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT service_series_interval CHECK ((interval_unit IS NULL) = (interval_count IS NULL)),
  CONSTRAINT service_series_interval_limits CHECK (
    interval_count IS NULL OR interval_count BETWEEN 1 AND
      CASE interval_unit WHEN 'day' THEN 366 WHEN 'week' THEN 52 ELSE 24 END),
  CONSTRAINT service_series_stopped CHECK ((state = 'stopped') = (stopped_at IS NOT NULL AND stopped_by IS NOT NULL))
);
CREATE UNIQUE INDEX service_series_one_active ON work.service_series (project_id) WHERE state = 'active';
COMMENT ON TABLE work.service_series IS
  'Customer-agreed repeat-service schedules: the next service date and the agreed interval (TSK-0114, HH-SCH-10).';

-- What a schedule is about never changes, and a stopped schedule is never started again.
CREATE FUNCTION work.service_series_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id, NEW.project_id, NEW.recorded_by, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.project_id, OLD.recorded_by, OLD.created_at) THEN
    RAISE EXCEPTION 'a repeat-service schedule keeps its project' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.state = 'stopped' AND (NEW.state, NEW.anchor_date, NEW.interval_unit, NEW.interval_count, NEW.reminders,
                                NEW.stopped_at, NEW.stopped_by)
     IS DISTINCT FROM (OLD.state, OLD.anchor_date, OLD.interval_unit, OLD.interval_count, OLD.reminders,
                       OLD.stopped_at, OLD.stopped_by) THEN
    RAISE EXCEPTION 'a stopped repeat-service schedule stays stopped' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER service_series_guard BEFORE UPDATE ON work.service_series
  FOR EACH ROW EXECUTE FUNCTION work.service_series_guard();

CREATE TABLE work.service_series_changes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq             bigint GENERATED ALWAYS AS IDENTITY,
  series_id       uuid NOT NULL REFERENCES work.service_series (id),
  version         integer NOT NULL CHECK (version >= 1),
  change          text NOT NULL CHECK (change IN ('recorded', 'changed', 'reminders_on', 'reminders_off', 'stopped',
                                                  'occurrence_skipped', 'occurrence_linked')),
  actor_kind      text NOT NULL CHECK (actor_kind IN ('staff', 'customer')),
  staff_id        uuid REFERENCES identity.staff_users (id),
  -- The schedule as it reads after the change.
  anchor_date     date NOT NULL,
  interval_unit   text CHECK (interval_unit IN ('day', 'week', 'month')),
  interval_count  integer,
  reminders       boolean NOT NULL,
  -- The occurrence a skip or a link is about; the dates a change kept inside the notice.
  occurrence_date date,
  kept_dates      date[] NOT NULL DEFAULT '{}',
  -- How staff heard the customer's agreement to a change they record; staff's own note (never shown to the customer).
  agreed_via      text CHECK (agreed_via IN ('phone', 'in_person', 'email', 'message')),
  note            text CHECK (char_length(btrim(note)) BETWEEN 1 AND 2000),
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (series_id, version),
  CONSTRAINT service_series_changes_actor CHECK ((actor_kind = 'staff') = (staff_id IS NOT NULL)),
  CONSTRAINT service_series_changes_interval CHECK ((interval_unit IS NULL) = (interval_count IS NULL)),
  CONSTRAINT service_series_changes_occurrence CHECK (
    (change IN ('occurrence_skipped', 'occurrence_linked')) = (occurrence_date IS NOT NULL)),
  -- A customer's own change carries no staff account of how it was agreed.
  CONSTRAINT service_series_changes_agreed CHECK (actor_kind = 'staff' OR (agreed_via IS NULL AND note IS NULL))
);
CREATE INDEX service_series_changes_series ON work.service_series_changes (series_id, seq);
COMMENT ON TABLE work.service_series_changes IS
  'The append-only history of each repeat-service schedule, by staff or the customer (TSK-0114, OWN-DEC-148).';

CREATE TABLE work.service_series_occurrences (
  series_id       uuid NOT NULL REFERENCES work.service_series (id),
  occurrence_date date NOT NULL,
  state           text NOT NULL CHECK (state IN ('kept', 'skipped', 'requested')),
  request_id      uuid UNIQUE REFERENCES intake.requests (id),
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (series_id, occurrence_date),
  CONSTRAINT service_series_occurrences_request CHECK ((state = 'requested') = (request_id IS NOT NULL))
);
COMMENT ON TABLE work.service_series_occurrences IS
  'Dates of a repeat-service schedule kept by a change, skipped, or linked to their own new request (TSK-0114).';

-- A kept date may be skipped or requested; a skipped or requested one stays as it is; a request stays linked.
CREATE FUNCTION work.service_series_occurrence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.series_id, NEW.occurrence_date) IS DISTINCT FROM (OLD.series_id, OLD.occurrence_date)
     OR OLD.state <> 'kept' THEN
    RAISE EXCEPTION 'a skipped or requested occurrence stays as it is' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER service_series_occurrences_guard BEFORE UPDATE ON work.service_series_occurrences
  FOR EACH ROW EXECUTE FUNCTION work.service_series_occurrence_guard();

-- The history is append-only.
CREATE FUNCTION work.service_series_change_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'the history of a repeat-service schedule is append-only' USING ERRCODE = 'restrict_violation';
END;
$$;
CREATE TRIGGER service_series_changes_append_only BEFORE UPDATE ON work.service_series_changes
  FOR EACH ROW EXECUTE FUNCTION work.service_series_change_append_only();
-- Deleted only by the Owner's request erasure (0112), with the request a schedule or an occurrence belongs to.
CREATE TRIGGER service_series_changes_erasure_only BEFORE DELETE ON work.service_series_changes
  FOR EACH ROW WHEN (NOT privacy.request_erasure_permitted()) EXECUTE FUNCTION work.service_series_change_append_only();
CREATE TRIGGER service_series_erasure_only BEFORE DELETE ON work.service_series
  FOR EACH ROW WHEN (NOT privacy.request_erasure_permitted()) EXECUTE FUNCTION work.service_series_change_append_only();
CREATE TRIGGER service_series_occurrences_erasure_only BEFORE DELETE ON work.service_series_occurrences
  FOR EACH ROW WHEN (NOT privacy.request_erasure_permitted()) EXECUTE FUNCTION work.service_series_change_append_only();

-- A staging test-data reset (TSK-0141) clears all three; outside a permitted reset TRUNCATE is refused.
CREATE TRIGGER service_series_reset_only_truncate BEFORE TRUNCATE ON work.service_series
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();
CREATE TRIGGER service_series_changes_reset_only_truncate BEFORE TRUNCATE ON work.service_series_changes
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();
CREATE TRIGGER service_series_occurrences_reset_only_truncate BEFORE TRUNCATE ON work.service_series_occurrences
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();

-- The decided notice for changing or stopping a recurring schedule (OWN-DEC-148).
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by, change_reason) VALUES
  ('repeat_service.change_notice', 1, 'configured', '{"hours": 24, "withinNotice": "cancellation_rules"}', false,
   ARRAY['OWN-DEC-148', 'HH-SCH-10', 'FACT-CANCELLATION-RULES'], 'migration:0124',
   'OWN-DEC-148: a change applies to occurrences more than 24 hours away; one within it follows the cancellation rules');
