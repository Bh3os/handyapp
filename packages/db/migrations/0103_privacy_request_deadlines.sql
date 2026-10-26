-- 0103 Privacy request acknowledgment, targets and deadlines (TSK-0136; OWN-DEC-175, OWN-DEC-205, HH-PRIV-07,
-- HH-PRIV-03, FACT-PRIVACY-REQUEST-TARGETS, FACT-BUSINESS-CALENDAR, FACT-TIMEZONE, ENT-PrivacyRequest,
-- ENT-PolicyVersion, ENT-QueueItem, RULE-HUMAN-REVIEW, RULE-DECIDED-VALUES-ACTIVE). The server computes the dates and
-- decides who may do what (apps/server/src/modules/privacy/deadlines.ts); this migration seeds the decided values and
-- keeps the records true whatever path writes.
-- 1. business.calendar version 1 (OWN-DEC-205): Monday to Friday in the business time zone, excluding the 11 US federal
--    holidays on their observed dates, no further closed dates. The Owner changes it as an audited version. Internal
--    service targets only; never a statutory deadline.
-- 2. privacy.request_targets version 1 (OWN-DEC-175): acknowledged on submission, substantively within 3 business days,
--    an internal completion target of 30 calendar days from receipt; the legal deadline is tracked separately and
--    nothing closes automatically.
-- 3. privacy_requests: the dates each request carries, counted once when it is received and never changed afterwards:
--    the receipt's local date, the zone and the configuration versions they were counted with, the automatic
--    acknowledgment (shown in the portal: its message wording is not given, OQ-MESSAGES-OUTSIDE-THE-21), the
--    substantive acknowledgment due date and the internal target date. The legal deadline is a separate field, empty
--    until the Owner records the date the attorney defines (with a note); it is never derived from the others.
-- 4. privacy_request_extensions: the Owner's extensions of a request's internal target, each with the new date and the
--    reason the customer is told (the notice is shown in the portal). Append-only; recorded by a live Owner on an open
--    request, each from the target then in force to a later date.
-- 5. Every open request gets one deadline job, which records its dates (requests received before this migration are
--    counted from their receipt with the versions above) and keeps its Owner Decisions item in line. A decided request
--    is final (migration 0058) and keeps no dates.

-- 1. The business-day calendar.
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by, change_reason)
VALUES ('business.calendar', 1, 'configured',
  '{"workdays": ["monday", "tuesday", "wednesday", "thursday", "friday"], "holidays": ["new_years_day", "martin_luther_king_jr_birthday", "washingtons_birthday", "memorial_day", "juneteenth", "independence_day", "labor_day", "columbus_day", "veterans_day", "thanksgiving_day", "christmas_day"], "observance": "federal_weekend_rule", "closedDates": []}',
  false, ARRAY['FACT-BUSINESS-CALENDAR', 'OWN-DEC-205'], 'migration:0103',
  'OWN-DEC-205: Monday to Friday, excluding the 11 US federal holidays with their observed dates; configurable');

-- 2. The privacy request targets.
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by, change_reason)
VALUES ('privacy.request_targets', 1, 'configured',
  '{"acknowledgment": "on_submission", "substantiveAcknowledgmentBusinessDays": 3, "completionCalendarDays": 30, "legalDeadline": "tracked_separately", "automaticClosure": false}',
  false, ARRAY['FACT-PRIVACY-REQUEST-TARGETS', 'OWN-DEC-175', 'OWN-DEC-205'], 'migration:0103',
  'OWN-DEC-175: acknowledged at once, substantively within 3 business days, an internal 30-day target');

-- 3. The dates of each request.
ALTER TABLE privacy.privacy_requests
  -- The receipt's calendar date in the business zone, the zone, and the versions the dates were counted with.
  ADD COLUMN received_on                date,
  ADD COLUMN time_zone                  text CHECK (char_length(time_zone) BETWEEN 1 AND 64),
  ADD COLUMN calendar_version           integer CHECK (calendar_version >= 1),
  ADD COLUMN targets_version            integer CHECK (targets_version >= 1),
  -- The automatic acknowledgment (the portal shows it from submission).
  ADD COLUMN acknowledged_at            timestamptz,
  -- The substantive acknowledgment is due by the end of this business day; the internal target by the end of this date.
  ADD COLUMN acknowledgment_due_on      date,
  ADD COLUMN target_due_on              date,
  -- The applicable legal deadline, as the Owner records it from the attorney's definition; never computed here.
  ADD COLUMN legal_deadline_on          date,
  ADD COLUMN legal_deadline_note        text CHECK (char_length(btrim(legal_deadline_note)) BETWEEN 1 AND 1000),
  ADD COLUMN legal_deadline_recorded_at timestamptz,
  ADD COLUMN legal_deadline_recorded_by uuid REFERENCES identity.staff_users (id),
  ADD CONSTRAINT privacy_requests_dates CHECK (
    (received_on IS NULL AND time_zone IS NULL AND calendar_version IS NULL AND targets_version IS NULL
      AND acknowledgment_due_on IS NULL AND target_due_on IS NULL)
    OR (received_on IS NOT NULL AND time_zone IS NOT NULL AND calendar_version IS NOT NULL
      AND targets_version IS NOT NULL AND acknowledgment_due_on > received_on AND target_due_on > received_on)),
  ADD CONSTRAINT privacy_requests_acknowledged CHECK (acknowledged_at IS NULL OR acknowledged_at >= submitted_at),
  ADD CONSTRAINT privacy_requests_legal_deadline CHECK (
    (legal_deadline_recorded_at IS NULL) = (legal_deadline_recorded_by IS NULL)
    AND (legal_deadline_recorded_at IS NULL) = (legal_deadline_note IS NULL)
    AND (legal_deadline_on IS NULL OR legal_deadline_recorded_at IS NOT NULL));
COMMENT ON COLUMN privacy.privacy_requests.target_due_on IS
  'The internal completion target (30 calendar days, OWN-DEC-175): not a statement of the law; never closes the request.';
COMMENT ON COLUMN privacy.privacy_requests.legal_deadline_on IS
  'The applicable legal deadline as the Owner records it from the attorney (OQ-ATTORNEY-PRIVACY); never computed.';

-- The dates are counted once: set from empty, never changed afterwards (a decided request is final anyway, 0058).
CREATE FUNCTION privacy.privacy_request_dates_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.received_on IS NOT NULL AND (NEW.received_on, NEW.time_zone, NEW.calendar_version, NEW.targets_version,
      NEW.acknowledgment_due_on, NEW.target_due_on)
     IS DISTINCT FROM (OLD.received_on, OLD.time_zone, OLD.calendar_version, OLD.targets_version,
      OLD.acknowledgment_due_on, OLD.target_due_on) THEN
    RAISE EXCEPTION 'a privacy request''s dates are counted once and kept' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.acknowledged_at IS NOT NULL AND NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at THEN
    RAISE EXCEPTION 'the acknowledgment of a privacy request is recorded once' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER privacy_requests_dates_guard BEFORE UPDATE ON privacy.privacy_requests
  FOR EACH ROW EXECUTE FUNCTION privacy.privacy_request_dates_guard();
CREATE INDEX privacy_requests_open_target ON privacy.privacy_requests (target_due_on)
  WHERE state IN ('received', 'under_review');

-- 4. The Owner's extensions of the internal target.
CREATE TABLE privacy.privacy_request_extensions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq                bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  privacy_request_id uuid NOT NULL REFERENCES privacy.privacy_requests (id),
  -- The target in force when the Owner extended it, and the new one.
  previous_target_on date NOT NULL,
  target_on          date NOT NULL,
  -- Why more time is needed, in the Owner's words: the customer is told it with the new date.
  reason             text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 1000 AND reason = btrim(reason)),
  decided_by         uuid NOT NULL REFERENCES identity.staff_users (id),
  decided_at         timestamptz NOT NULL DEFAULT now(),
  request_id         text NOT NULL CHECK (char_length(request_id) BETWEEN 1 AND 100),
  CHECK (target_on > previous_target_on),
  -- Each extension starts from the target then in force: two concurrent ones cannot both start from it.
  UNIQUE (privacy_request_id, previous_target_on)
);
CREATE INDEX privacy_request_extensions_request ON privacy.privacy_request_extensions (privacy_request_id, seq);
COMMENT ON TABLE privacy.privacy_request_extensions IS
  'The Owner''s extensions of a privacy request''s internal target, with the reason the customer is told (OWN-DEC-175). '
  'Append-only.';

-- Recorded by a live Owner on an open request whose dates are counted, from the target in force; never changed.
CREATE FUNCTION privacy.privacy_request_extension_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  r record;
  current_target date;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'extensions are kept as recorded, never changed or deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  SELECT state, target_due_on INTO r FROM privacy.privacy_requests WHERE id = NEW.privacy_request_id;
  IF NOT FOUND OR r.state NOT IN ('received', 'under_review') OR r.target_due_on IS NULL THEN
    RAISE EXCEPTION 'an extension is recorded on an open privacy request with its dates'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT coalesce((SELECT e.target_on FROM privacy.privacy_request_extensions e
                    WHERE e.privacy_request_id = NEW.privacy_request_id ORDER BY e.seq DESC LIMIT 1), r.target_due_on)
    INTO current_target;
  IF NEW.previous_target_on <> current_target THEN
    RAISE EXCEPTION 'an extension starts from the target in force' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT finance.has_live_role(NEW.decided_by, ARRAY['owner']) THEN
    RAISE EXCEPTION 'the Owner extends a privacy request''s target' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.decided_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER privacy_request_extensions_guard BEFORE INSERT OR UPDATE OR DELETE
  ON privacy.privacy_request_extensions
  FOR EACH ROW EXECUTE FUNCTION privacy.privacy_request_extension_guard();

-- A staging reset is the only path that empties this table (TSK-0141).
CREATE TRIGGER privacy_request_extensions_reset_only_truncate BEFORE TRUNCATE ON privacy.privacy_request_extensions
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();

-- 5. The open requests: one deadline job each.
INSERT INTO platform.jobs (automation, job_key, target_type, target_id, payload, request_id, run_at, max_attempts)
SELECT 'privacy.request_deadlines', 'privacy.request_deadlines:' || r.id || ':0103', 'privacy_request', r.id::text,
       '{}', 'migration:0103', now(), 5
  FROM privacy.privacy_requests r
 WHERE r.state IN ('received', 'under_review')
ON CONFLICT (job_key) DO NOTHING;
