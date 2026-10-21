-- 0059 Reschedule, reassign, cancel and customer change requests (TSK-0066; HH-SCH-07, HH-PORT-04, T25, T42, T65,
-- ENT-Visit, ENT-Reservation, ENT-AuditEvent, FACT-CANCELLATION-RULES, FACT-AUTOMATIC-MESSAGES, OWN-DEC-107,
-- OWN-DEC-119, OWN-DEC-134).
-- - work.visits.number: the visit's customer-facing number inside its project (1, 2, ...), assigned by the database
--   when the visit is planned (under a per-project advisory lock) and never changed, so the portal names an appointment
--   without a database ID. Existing visits are numbered in the order they were planned.
-- - work.visit_change_requests: the customer's "Request to Reschedule" and "Request Cancellation" of a confirmed visit
--   (HH-PORT-04, OWN-DEC-107): the customer's intent, an optional reason and preferred times. A request never changes
--   the booking: the visit stays confirmed and in force until staff commit a change. One open request per visit. It
--   ends exactly once: confirmed (staff committed the change it asked for), declined (staff, with a reason; the booking
--   stays as it is) or closed (the visit left 'confirmed' some other way: the database closes it, and its queue item,
--   in the same transaction).
-- - work.visit_changes: the history of committed changes of a booked visit (HH-SCH-07): rescheduled, reassigned or
--   canceled, with the visit versions before and after, the team before and after (the lead first), who made it and
--   why (a reason is required), who initiated it (the customer or HandyHub, with the HandyHub cause) and the change
--   request it confirmed. The visit's window history (work.visit_windows) and its ended reservations stay as they
--   are; this is the change record beside them. A cancellation keeps the outcome of FACT-CANCELLATION-RULES the server
--   computed when it was committed (notice, whether work started, the verified deposit, the amounts kept, refunded or
--   invoiced in integer cents, and the policy version): nothing is refunded or charged here (HH-FIN-14: the Owner
--   applies each outcome). Append-only.

ALTER TABLE work.visits ADD COLUMN number integer NOT NULL DEFAULT 0;
-- The backfill writes only the new column, so the visit guards (which raise the version on every change) stay out.
ALTER TABLE work.visits DISABLE TRIGGER USER;
UPDATE work.visits v
   SET number = n.rn
  FROM (SELECT id, row_number() OVER (PARTITION BY project_id ORDER BY created_at, id) AS rn FROM work.visits) n
 WHERE n.id = v.id;
ALTER TABLE work.visits ENABLE TRIGGER USER;
ALTER TABLE work.visits ADD CONSTRAINT visits_number CHECK (number >= 1);
CREATE UNIQUE INDEX visits_project_number ON work.visits (project_id, number);
COMMENT ON COLUMN work.visits.number IS
  'The visit''s customer-facing number inside its project, assigned by the database and never changed.';

CREATE FUNCTION work.visit_number() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('work.visit_number:' || NEW.project_id::text, 0));
    SELECT coalesce(max(number), 0) + 1 INTO NEW.number FROM work.visits WHERE project_id = NEW.project_id;
    RETURN NEW;
  END IF;
  IF NEW.number IS DISTINCT FROM OLD.number THEN
    RAISE EXCEPTION 'a visit keeps its number' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER visits_number BEFORE INSERT OR UPDATE ON work.visits
  FOR EACH ROW EXECUTE FUNCTION work.visit_number();

CREATE TABLE work.visit_change_requests (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id             uuid NOT NULL REFERENCES work.visits (id),
  project_id           uuid NOT NULL REFERENCES crm.projects (id),
  kind                 text NOT NULL CHECK (kind IN ('reschedule', 'cancellation')),
  state                text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'confirmed', 'declined', 'closed')),
  version              integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  requested_by_contact uuid NOT NULL REFERENCES crm.contacts (id),
  -- The customer's own words, kept as written (never sent in a message or written to the audit log).
  reason               text CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000),
  preferred_times      text CHECK (char_length(btrim(preferred_times)) BETWEEN 1 AND 1000),
  requested_at         timestamptz NOT NULL DEFAULT now(),
  decided_by           uuid REFERENCES identity.staff_users (id),
  decided_at           timestamptz,
  decision_reason      text CHECK (char_length(btrim(decision_reason)) BETWEEN 1 AND 1000),
  closed_reason        text CHECK (closed_reason IN ('visit_en_route', 'visit_arrived', 'visit_completed',
                         'visit_expired', 'visit_canceled', 'visit_no_access')),
  CHECK (kind = 'reschedule' OR preferred_times IS NULL),
  CHECK ((state = 'open') = (decided_at IS NULL)),
  CHECK ((state IN ('confirmed', 'declined')) = (decided_by IS NOT NULL)),
  CHECK (state <> 'declined' OR decision_reason IS NOT NULL),
  CHECK ((state = 'closed') = (closed_reason IS NOT NULL))
);
CREATE UNIQUE INDEX visit_change_requests_one_open ON work.visit_change_requests (visit_id) WHERE state = 'open';
CREATE INDEX visit_change_requests_visit ON work.visit_change_requests (visit_id, requested_at);
COMMENT ON TABLE work.visit_change_requests IS
  'Customer reschedule and cancellation requests of a confirmed visit (HH-PORT-04): never a change by themselves.';

-- A request is made open, for a confirmed visit of its project; afterwards it ends once (confirmed, declined or
-- closed) and nothing else changes. Nothing is deleted.
CREATE FUNCTION work.visit_change_request_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'change requests are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'open' OR NEW.version <> 1 THEN
      RAISE EXCEPTION 'a change request is made open' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM work.visits WHERE id = NEW.visit_id AND project_id = NEW.project_id
                    AND state = 'confirmed') THEN
      RAISE EXCEPTION 'a change request is made for a confirmed visit of its project' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.state <> 'open' THEN
    RAISE EXCEPTION 'an ended change request is history and never changes' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (to_jsonb(NEW) - 'state' - 'version' - 'decided_by' - 'decided_at' - 'decision_reason' - 'closed_reason')
     IS DISTINCT FROM (to_jsonb(OLD) - 'state' - 'version' - 'decided_by' - 'decided_at' - 'decision_reason'
       - 'closed_reason') OR NEW.version <> OLD.version + 1 OR NEW.state = 'open' THEN
    RAISE EXCEPTION 'a change request ends once and changes nothing else' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER visit_change_requests_guard BEFORE INSERT OR UPDATE OR DELETE ON work.visit_change_requests
  FOR EACH ROW EXECUTE FUNCTION work.visit_change_request_guard();

-- A visit that leaves 'confirmed' any other way (on the way, no access, expired, canceled without the request) closes
-- its open request and resolves the request's queue item, in the same transaction.
CREATE FUNCTION work.visit_state_closes_requests() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state IS DISTINCT FROM OLD.state AND NEW.state NOT IN ('tentative', 'confirmed') THEN
    UPDATE work.visit_change_requests
       SET state = 'closed', version = version + 1, decided_at = now(), closed_reason = 'visit_' || NEW.state
     WHERE visit_id = NEW.id AND state = 'open';
    UPDATE ops.queue_items
       SET resolved_at = now(), updated_at = now(), resolution = 'visit_' || NEW.state, version = version + 1
     WHERE type IN ('visit_change_request', 'visit_cancellation_review') AND subject_type = 'visit'
       AND subject_id = NEW.id::text AND resolved_at IS NULL;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER visits_close_change_requests AFTER UPDATE OF state ON work.visits
  FOR EACH ROW EXECUTE FUNCTION work.visit_state_closes_requests();

CREATE TABLE work.visit_changes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id              uuid NOT NULL REFERENCES work.visits (id),
  project_id            uuid NOT NULL REFERENCES crm.projects (id),
  kind                  text NOT NULL CHECK (kind IN ('rescheduled', 'reassigned', 'canceled')),
  from_version          integer NOT NULL CHECK (from_version >= 1),
  to_version            integer NOT NULL,
  from_window_version   integer NOT NULL CHECK (from_window_version >= 1),
  to_window_version     integer NOT NULL,
  -- The team before and after (workers, the lead first); an emptied team after a cancellation.
  from_workers          uuid[] NOT NULL,
  to_workers            uuid[] NOT NULL,
  initiator             text CHECK (initiator IN ('customer', 'handyhub')),
  handyhub_cause        text CHECK (handyhub_cause IN ('weather', 'safety_stop', 'sick_worker', 'other')),
  reason                text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000),
  change_request_id     uuid REFERENCES work.visit_change_requests (id),
  changed_by            uuid NOT NULL REFERENCES identity.staff_users (id),
  changed_at            timestamptz NOT NULL DEFAULT now(),
  -- FACT-CANCELLATION-RULES as computed when the cancellation was committed (kind 'canceled' only).
  notice_minutes        integer,
  work_started          boolean,
  deposit_paid_cents    bigint CHECK (deposit_paid_cents >= 0),
  deposit_pending_cents bigint CHECK (deposit_pending_cents >= 0),
  outcome               text CHECK (outcome IN ('full_refund_no_charge', 'late_cancellation', 'work_started',
                          'customer_chooses', 'owner_review')),
  kept_cents            bigint CHECK (kept_cents >= 0),
  refund_cents          bigint CHECK (refund_cents >= 0),
  invoice_cents         bigint CHECK (invoice_cents >= 0),
  rules_version         integer CHECK (rules_version >= 1),
  CHECK (to_version > from_version),
  CHECK (to_window_version >= from_window_version),
  CHECK ((initiator = 'handyhub') = (handyhub_cause IS NOT NULL)),
  CHECK ((kind = 'canceled') = (outcome IS NOT NULL)),
  CHECK (kind <> 'canceled' OR (initiator IS NOT NULL AND notice_minutes IS NOT NULL AND work_started IS NOT NULL
         AND deposit_paid_cents IS NOT NULL AND deposit_pending_cents IS NOT NULL AND rules_version IS NOT NULL)),
  CHECK (kind = 'canceled' OR (notice_minutes IS NULL AND work_started IS NULL AND deposit_paid_cents IS NULL
         AND deposit_pending_cents IS NULL AND kept_cents IS NULL AND refund_cents IS NULL AND invoice_cents IS NULL
         AND rules_version IS NULL))
);
CREATE INDEX visit_changes_visit ON work.visit_changes (visit_id, changed_at);
CREATE TRIGGER visit_changes_append_only BEFORE UPDATE OR DELETE ON work.visit_changes
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE work.visit_changes IS
  'Committed reschedules, reassignments and cancellations of booked visits (HH-SCH-07): actor, reason, before and '
  'after; a cancellation keeps its FACT-CANCELLATION-RULES outcome. Append-only.';

-- A change record names the visit as it now is: the version it reached, and a cancellation only of a canceled visit.
CREATE FUNCTION work.visit_change_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v record;
BEGIN
  SELECT project_id, state, version, window_version INTO v FROM work.visits WHERE id = NEW.visit_id;
  IF v IS NULL OR v.project_id <> NEW.project_id OR v.version <> NEW.to_version
     OR v.window_version <> NEW.to_window_version THEN
    RAISE EXCEPTION 'a change record names the visit''s current version' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.kind = 'canceled') <> (v.state = 'canceled') THEN
    RAISE EXCEPTION 'a cancellation is recorded for a canceled visit only' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.change_request_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM work.visit_change_requests
        WHERE id = NEW.change_request_id AND visit_id = NEW.visit_id AND state = 'confirmed'
          AND kind = CASE NEW.kind WHEN 'canceled' THEN 'cancellation' ELSE 'reschedule' END) THEN
    RAISE EXCEPTION 'a change confirms a request of its own visit and kind' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER visit_changes_check BEFORE INSERT ON work.visit_changes
  FOR EACH ROW EXECUTE FUNCTION work.visit_change_check();
