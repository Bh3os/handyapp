-- 0053 Window offers held 24 hours and estimate-visit reservations (TSK-0063; HH-SCH-11, HH-LEAD-07, HH-SCH-04,
-- HH-SCH-05, T37, T38, ENT-Reservation, ENT-Visit, FACT-AUTOMATIC-MESSAGES, OWN-DEC-99, OWN-DEC-105, OWN-DEC-119,
-- OWN-DEC-144).
-- - One window-offer mechanism for estimate visits and work visits (HH-SCH-11): staff offer the windows of one
--   tentative visit (window_offers, with its options in window_offer_options) and every option holds the workers and
--   equipment items it needs (work.reservations, kind 'hold', linked to the offer and its option). The holds are
--   ordinary reservations, so the exclusion constraints of 0052 make a held window impossible to offer or confirm for
--   anyone else (T38), whatever the number of concurrent transactions.
-- - The hold lasts the configured hours from the offer (scheduling.window_offers, OWN-DEC-144: 24 hours): expires_at is
--   offered_at plus hold_hours, written with the offer and never changed; every hold of the offer expires at that same
--   instant. The offer's policy version is kept with it.
-- - An open offer ends exactly once, as one of:
--   * selected: the customer picked one option before expires_at; in the same transaction that option's holds become
--     the confirmed reservations and the other options' holds end ('hold_released'); the visit takes that window and
--     is confirmed by the server in the same transaction (a deferred check refuses the commit otherwise), so the
--     coverage check of 0052 sees exactly the held team for the selected range;
--   * expired: at or after expires_at with no selection; its holds end ('hold_expired') and the tentative visit expires
--     with them (HH-SCH-05, ENT-Visit). Confirmed reservations are never touched: only this offer's active holds end;
--   * withdrawn by staff, or other_times_requested by the customer before expires_at: its holds end ('hold_released')
--     and the visit stays tentative for a new offer.
--   Whichever comes first wins: every ending locks the offer row, and the guard compares with expires_at by the
--   database's own clock, so a selection and the expiry never both happen.
-- - While a visit has an open offer its window, planning facts and state change only through the offer (the offer's
--   selection or expiry), so the holds always match the visit's reserved range rule of 0052.
-- - Options are written with their offer and are append-only; each one's reserved range is the visit's rule (the
--   travel buffer before the arrival window, the preparation buffer and the expected work after it, PROPOSED in 0052).
-- - number: the offer's customer-facing number inside its project (1, 2, ...); the customer never sees a database ID.

CREATE TABLE work.window_offers (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id                 uuid NOT NULL REFERENCES work.visits (id),
  project_id               uuid NOT NULL REFERENCES crm.projects (id),
  number                   integer NOT NULL CHECK (number >= 1),
  state                    text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'selected', 'expired', 'withdrawn',
                             'other_times_requested')),
  version                  integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  -- The hold of scheduling.window_offers when the offer was made (OWN-DEC-144) and the policy version it came from.
  hold_hours               integer NOT NULL CHECK (hold_hours BETWEEN 1 AND 8784),
  policy_version           integer NOT NULL CHECK (policy_version >= 1),
  offered_by               uuid NOT NULL REFERENCES identity.staff_users (id),
  offered_at               timestamptz NOT NULL DEFAULT now(),
  expires_at               timestamptz NOT NULL,
  -- Customer-facing preparation instructions staff wrote with the offer; shown with the confirmed visit.
  preparation_instructions text CHECK (char_length(btrim(preparation_instructions)) BETWEEN 1 AND 1000),
  selected_position        smallint,
  -- The verified contact reference of the customer session that selected (never a staff user).
  selected_by_contact      text CHECK (char_length(selected_by_contact) BETWEEN 1 AND 100),
  closed_at                timestamptz,
  -- A staff withdrawal: who and why (PROPOSED: a withdrawal needs its reason).
  closed_by                uuid REFERENCES identity.staff_users (id),
  closed_reason            text CHECK (char_length(btrim(closed_reason)) BETWEEN 1 AND 500),
  -- The customer's optional words with a request for other times.
  customer_note            text CHECK (char_length(btrim(customer_note)) BETWEEN 1 AND 500),
  UNIQUE (project_id, number),
  CHECK ((state = 'open') = (closed_at IS NULL)),
  CHECK ((state = 'selected') = (selected_position IS NOT NULL)),
  CHECK ((state = 'selected') = (selected_by_contact IS NOT NULL)),
  CHECK ((state = 'withdrawn') = (closed_by IS NOT NULL)),
  CHECK ((state = 'withdrawn') = (closed_reason IS NOT NULL)),
  CHECK (customer_note IS NULL OR state = 'other_times_requested'),
  CHECK (expires_at > offered_at)
);
-- One open offer per visit.
CREATE UNIQUE INDEX window_offers_one_open ON work.window_offers (visit_id) WHERE state = 'open';
CREATE INDEX window_offers_visit ON work.window_offers (visit_id, number);
CREATE INDEX window_offers_open_expiry ON work.window_offers (expires_at) WHERE state = 'open';
COMMENT ON TABLE work.window_offers IS
  'Window offers of a visit (HH-SCH-11, OWN-DEC-144): held for the configured hours, ended exactly once.';

CREATE TABLE work.window_offer_options (
  offer_id             uuid NOT NULL REFERENCES work.window_offers (id),
  position             smallint NOT NULL CHECK (position BETWEEN 1 AND 10),
  local_date           date NOT NULL,
  window_start         time NOT NULL,
  window_end           time NOT NULL,
  time_zone            text NOT NULL CHECK (time_zone ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+)+$' AND char_length(time_zone) <= 64),
  start_offset_minutes smallint NOT NULL CHECK (start_offset_minutes BETWEEN -720 AND 840),
  end_offset_minutes   smallint NOT NULL CHECK (end_offset_minutes BETWEEN -720 AND 840),
  starts_at            timestamptz NOT NULL,
  ends_at              timestamptz NOT NULL,
  -- The range the option holds its team for (the visit's reserved-range rule).
  reserved_starts_at   timestamptz NOT NULL,
  reserved_ends_at     timestamptz NOT NULL,
  PRIMARY KEY (offer_id, position),
  CHECK (window_end > window_start AND ends_at > starts_at),
  CHECK (reserved_starts_at <= starts_at AND reserved_ends_at > ends_at)
);
CREATE TRIGGER window_offer_options_append_only BEFORE UPDATE OR DELETE ON work.window_offer_options
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE work.window_offer_options IS 'The windows of one offer (append-only), each with its reserved range.';

-- A local window agrees with its zone, offsets and instants by the database's own time-zone data (as 0049 checks a
-- visit's window).
CREATE FUNCTION work.local_window_check(d date, ws time, we time, zone text, so smallint, eo smallint,
                                        s timestamptz, e timestamptz) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    PERFORM now() AT TIME ZONE zone;
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE EXCEPTION 'unknown time zone %', zone USING ERRCODE = 'check_violation';
  END;
  IF (s AT TIME ZONE zone) IS DISTINCT FROM (d + ws) OR (e AT TIME ZONE zone) IS DISTINCT FROM (d + we) THEN
    RAISE EXCEPTION 'a window''s instants show its local date and times in its zone' USING ERRCODE = 'check_violation';
  END IF;
  IF s IS DISTINCT FROM ((d + ws) AT TIME ZONE 'UTC') - make_interval(mins => so)
     OR e IS DISTINCT FROM ((d + we) AT TIME ZONE 'UTC') - make_interval(mins => eo) THEN
    RAISE EXCEPTION 'a window''s offsets give its instants' USING ERRCODE = 'check_violation';
  END IF;
END $$;

-- An offer is made open, now, for a tentative visit of its project whose expected work and team size are entered, as
-- the next number of the project, expiring hold_hours after it was made (both instants set here). Afterwards it ends once (see the header) and
-- nothing else changes; offers are never deleted.
CREATE FUNCTION work.window_offer_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v work.visits;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'window offers are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'open' OR NEW.version <> 1 THEN
      RAISE EXCEPTION 'a window offer is created open' USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO v FROM work.visits WHERE id = NEW.visit_id;
    IF v.id IS NULL OR v.state <> 'tentative' OR v.project_id <> NEW.project_id THEN
      RAISE EXCEPTION 'windows are offered for a tentative visit of the project' USING ERRCODE = 'check_violation';
    END IF;
    IF v.expected_duration_minutes IS NULL OR v.required_workers IS NULL THEN
      RAISE EXCEPTION 'the expected work and the number of workers are entered before windows are offered'
        USING ERRCODE = 'check_violation';
    END IF;
    -- Made now, by the database's clock (to the millisecond, as the server reads instants), and held for its hold
    -- hours from then.
    NEW.offered_at := date_trunc('milliseconds', now());
    NEW.expires_at := NEW.offered_at + make_interval(hours => NEW.hold_hours);
    IF NEW.number <> coalesce((SELECT max(number) FROM work.window_offers WHERE project_id = NEW.project_id), 0) + 1 THEN
      RAISE EXCEPTION 'an offer takes the next number of its project' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.state <> 'open' THEN
    RAISE EXCEPTION 'an ended window offer never changes' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW.id, NEW.visit_id, NEW.project_id, NEW.number, NEW.hold_hours, NEW.policy_version, NEW.offered_by,
      NEW.offered_at, NEW.expires_at, NEW.preparation_instructions)
     IS DISTINCT FROM (OLD.id, OLD.visit_id, OLD.project_id, OLD.number, OLD.hold_hours, OLD.policy_version,
      OLD.offered_by, OLD.offered_at, OLD.expires_at, OLD.preparation_instructions) THEN
    RAISE EXCEPTION 'an offer keeps its visit, windows and hold' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.version <> OLD.version + 1 OR NEW.state = 'open' THEN
    RAISE EXCEPTION 'an open offer ends once, as its next version' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.state = 'expired' AND now() < OLD.expires_at THEN
    RAISE EXCEPTION 'an offer expires only when its hold has ended' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.state IN ('selected', 'other_times_requested') AND now() >= OLD.expires_at THEN
    RAISE EXCEPTION 'the customer answers an offer only while it is held' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.state = 'selected' AND NOT EXISTS (SELECT 1 FROM work.window_offer_options
                                             WHERE offer_id = NEW.id AND position = NEW.selected_position) THEN
    RAISE EXCEPTION 'the selected window is one of the offer''s windows' USING ERRCODE = 'check_violation';
  END IF;
  NEW.closed_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER window_offers_guard BEFORE INSERT OR UPDATE OR DELETE ON work.window_offers
  FOR EACH ROW EXECUTE FUNCTION work.window_offer_guard();

-- What an offer's ending does to its holds and its visit, in the same transaction.
CREATE FUNCTION work.window_offer_settle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state = 'selected' THEN
    UPDATE work.reservations SET kind = 'confirmed', hold_expires_at = NULL
     WHERE offer_id = NEW.id AND offer_position = NEW.selected_position AND kind = 'hold' AND ended_at IS NULL;
    UPDATE work.reservations SET ended_at = now(), ended_reason = 'hold_released'
     WHERE offer_id = NEW.id AND offer_position <> NEW.selected_position AND kind = 'hold' AND ended_at IS NULL;
  ELSIF NEW.state = 'expired' THEN
    UPDATE work.reservations SET ended_at = now(), ended_reason = 'hold_expired'
     WHERE offer_id = NEW.id AND kind = 'hold' AND ended_at IS NULL;
    UPDATE work.visits SET state = 'expired', version = version + 1, updated_at = now()
     WHERE id = NEW.visit_id AND state = 'tentative';
  ELSE
    UPDATE work.reservations SET ended_at = now(), ended_by = NEW.closed_by, ended_reason = 'hold_released'
     WHERE offer_id = NEW.id AND kind = 'hold' AND ended_at IS NULL;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER window_offers_settle AFTER UPDATE OF state ON work.window_offers
  FOR EACH ROW EXECUTE FUNCTION work.window_offer_settle();

-- A selected offer's visit is confirmed when the transaction commits (the selection and the confirmation are one).
CREATE FUNCTION work.window_offer_selected_confirms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state = 'selected' AND NOT EXISTS (SELECT 1 FROM work.visits WHERE id = NEW.visit_id AND state = 'confirmed')
  THEN
    RAISE EXCEPTION 'a selected window confirms its visit in the same transaction' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER window_offers_selected_confirms AFTER UPDATE ON work.window_offers
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION work.window_offer_selected_confirms();

-- Options are written with their open offer, in its transaction, in its visit's zone, with the visit's reserved range.
CREATE FUNCTION work.window_offer_option_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  o work.window_offers;
  v work.visits;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM work.window_offers
                  WHERE id = NEW.offer_id AND state = 'open' AND xmin = pg_current_xact_id()::xid) THEN
    RAISE EXCEPTION 'an offer''s windows are written with it' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO o FROM work.window_offers WHERE id = NEW.offer_id;
  SELECT * INTO v FROM work.visits WHERE id = o.visit_id;
  IF NEW.time_zone <> v.time_zone THEN
    RAISE EXCEPTION 'an offered window is in its visit''s zone' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM work.local_window_check(NEW.local_date, NEW.window_start, NEW.window_end, NEW.time_zone,
    NEW.start_offset_minutes, NEW.end_offset_minutes, NEW.starts_at, NEW.ends_at);
  IF NEW.reserved_starts_at IS DISTINCT FROM NEW.starts_at - make_interval(mins => coalesce(v.travel_buffer_minutes, 0))
     OR NEW.reserved_ends_at IS DISTINCT FROM NEW.ends_at
          + make_interval(mins => coalesce(v.preparation_buffer_minutes, 0) + v.expected_duration_minutes) THEN
    RAISE EXCEPTION 'an offered window holds the visit''s reserved range' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER window_offer_options_guard BEFORE INSERT ON work.window_offer_options
  FOR EACH ROW EXECUTE FUNCTION work.window_offer_option_guard();

-- Holds of an offer: linked to one of its windows, for that window's reserved range, expiring with the offer.
ALTER TABLE work.reservations ADD COLUMN offer_id uuid;
ALTER TABLE work.reservations ADD COLUMN offer_position smallint;
ALTER TABLE work.reservations
  ADD CONSTRAINT reservations_offer_option FOREIGN KEY (offer_id, offer_position)
    REFERENCES work.window_offer_options (offer_id, position);
ALTER TABLE work.reservations ADD CONSTRAINT reservations_offer_link CHECK ((offer_id IS NULL) = (offer_position IS NULL));
CREATE INDEX reservations_offer ON work.reservations (offer_id) WHERE offer_id IS NOT NULL;
-- One lead per visit (0052), now per offered window too: while an offer is open each of its windows holds its own
-- team, lead included; after the selection only the selected window's team is active.
DROP INDEX work.reservations_one_lead;
CREATE UNIQUE INDEX reservations_one_lead ON work.reservations (visit_id, (coalesce(offer_position, 0)))
  WHERE role = 'lead' AND ended_at IS NULL;

CREATE FUNCTION work.reservation_offer_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  o  work.window_offers;
  op work.window_offer_options;
BEGIN
  IF NEW.offer_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO o FROM work.window_offers WHERE id = NEW.offer_id;
  SELECT * INTO op FROM work.window_offer_options WHERE offer_id = NEW.offer_id AND position = NEW.offer_position;
  IF NEW.kind <> 'hold' OR o.state <> 'open' OR o.visit_id <> NEW.visit_id
     OR NEW.hold_expires_at IS DISTINCT FROM o.expires_at
     OR (NEW.starts_at, NEW.ends_at) IS DISTINCT FROM (op.reserved_starts_at, op.reserved_ends_at) THEN
    RAISE EXCEPTION 'an offer''s hold is for one of its windows, until the offer expires' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reservations_offer_guard BEFORE INSERT ON work.reservations
  FOR EACH ROW EXECUTE FUNCTION work.reservation_offer_guard();

-- While a visit has an open offer, its window, planning facts and state change only through the offer.
CREATE FUNCTION work.visit_offer_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ((NEW.local_date, NEW.window_start, NEW.window_end, NEW.starts_at, NEW.ends_at, NEW.state,
       NEW.expected_duration_minutes, NEW.preparation_buffer_minutes, NEW.travel_buffer_minutes, NEW.required_workers,
       NEW.equipment)
      IS DISTINCT FROM (OLD.local_date, OLD.window_start, OLD.window_end, OLD.starts_at, OLD.ends_at, OLD.state,
       OLD.expected_duration_minutes, OLD.preparation_buffer_minutes, OLD.travel_buffer_minutes, OLD.required_workers,
       OLD.equipment))
     AND EXISTS (SELECT 1 FROM work.window_offers WHERE visit_id = NEW.id AND state = 'open') THEN
    RAISE EXCEPTION 'a visit with open offered windows changes only through its offer' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER visits_offer_guard BEFORE UPDATE ON work.visits
  FOR EACH ROW EXECUTE FUNCTION work.visit_offer_guard();

-- OWN-DEC-144 (hold for 24 hours) and OWN-DEC-99 / OWN-DEC-105 (offer 2-3 windows): decided values, active
-- (RULE-DECIDED-VALUES-ACTIVE).
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by) VALUES
  ('scheduling.window_offers', 1, 'configured', '{"holdHours": 24, "minWindows": 2, "maxWindows": 3}', false,
   ARRAY['OWN-DEC-144', 'OWN-DEC-99', 'OWN-DEC-105', 'HH-SCH-11'], 'migration:0053');
