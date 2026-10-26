-- 0120 Visit confirmation and window-offer amendments (TSK-0145; OWN-DEC-193 A1, A2, A4; OWN-DEC-194 B1, B3, B4;
-- OWN-DEC-208 reading 2; HH-SCH-06, HH-SCH-11, HH-SCH-05, T38, T40, ENT-Visit, ENT-Hold, ENT-Reservation,
-- RULE-SAFETY-GATES, RULE-HUMAN-REVIEW, RULE-SERVER-AUTHZ). The server decides who may do what and names every unmet
-- item (apps/server/src/modules/visits); this migration keeps the records true whatever path writes:
-- 1. Draft and published offers (B1). An offer is saved as a draft: its windows and team are kept, nothing is held,
--    no number is given and no clock runs. Publishing it to the customer is one transaction: it takes the project's
--    next offer number, its publication instant (the database clock) and its exact expiry (publication plus the hold
--    hours of scheduling.window_offers then in force), and its holds are written. The 24 hours run from that
--    publication, never from the saving of the draft. A draft that is never published never starts a clock; it is
--    discarded (kept as history). Offers made before this migration were published when they were made: their
--    publication is their offer instant.
-- 2. One active offer per visit, no silent change (B3, B4). One open (published) offer per visit (0053) and at most
--    one draft. An offer's windows, team, instructions and visit never change once saved (0053); a published offer
--    changes only by ending once. Staff end an open offer only by withdrawing it with a reason, or by replacing it
--    with a reason: the replacement is the visit's draft, published in the same transaction (a deferred check refuses
--    the commit otherwise), so the customer gets the new offer's notice once. The windows of one offer may not overlap
--    (each holds the same team); every hold of an open offer is a reservation (0052), so capacity stays protected
--    across all its windows until a valid selection keeps one and releases the others (0053).
-- An offer's hold is for one of its windows, until it expires (0053), and for a member of the team its draft named.
CREATE OR REPLACE FUNCTION work.reservation_offer_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
  IF (NEW.staff_user_id IS NOT NULL AND NOT (NEW.staff_user_id = ANY (coalesce(o.worker_ids, ARRAY[NEW.staff_user_id]))))
     OR (NEW.equipment_id IS NOT NULL
         AND NOT (NEW.equipment_id = ANY (coalesce(o.equipment_ids, ARRAY[NEW.equipment_id])))) THEN
    RAISE EXCEPTION 'an offer holds the team its draft named' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- 3. The hazard-evaluation inspection (A1, OWN-DEC-208 reading 2). While an intake review hold is open, the only visit
--    of its project that can be confirmed is one the Owner authorized, with a reason, as a hazard-evaluation
--    inspection naming the qualified person and the safety conditions. PROPOSED (OQ-VISIT-AMENDMENT-DETAILS): the
--    authorization is recorded by a live Owner on a tentative site visit (purpose site_estimate: no work is
--    performed) and covers the intake review holds open on the project at that moment; those holds stay open, keep
--    blocking every other visit and Start Work, and a review hold raised later, a job-level Hold and a critical safety
--    hold still block the inspection visit itself. Append-only.
-- 4. Follow-up visits on a completed job (A4). A work visit of a job that is operationally complete, closed or
--    reopened is confirmed only with a recorded authorization naming its basis: an existing contractual obligation, a
--    warranty, the punch-list process or an approved return-work authorization (with a note saying which). PROPOSED:
--    recorded by a live Owner or Office on the tentative visit; a warranty basis names the job's return work
--    classified as a warranty claim, a return-work basis names the job's return work the Owner decided. New paid work
--    needs an approved estimate or change order instead. Append-only.

-- 1. Draft and published offers -------------------------------------------------------------------------------------
ALTER TABLE work.window_offers ADD COLUMN published_at timestamptz;
ALTER TABLE work.window_offers ADD COLUMN published_by uuid REFERENCES identity.staff_users (id);
-- The offer that replaced this one (state replaced), published in the same transaction.
ALTER TABLE work.window_offers ADD COLUMN replaced_by uuid REFERENCES work.window_offers (id);
-- The team the draft names (the workers, the lead first, and the equipment items), held for every window when it is
-- published. Offers made before this migration held their team at once (their holds name it): null.
ALTER TABLE work.window_offers ADD COLUMN worker_ids uuid[] CHECK (cardinality(worker_ids) BETWEEN 1 AND 20);
ALTER TABLE work.window_offers ADD COLUMN equipment_ids uuid[] CHECK (cardinality(equipment_ids) <= 50);

-- Offers made before this migration were published at the instant they were made.
ALTER TABLE work.window_offers DISABLE TRIGGER window_offers_guard;
ALTER TABLE work.window_offers DISABLE TRIGGER window_offers_selected_confirms;
UPDATE work.window_offers SET published_at = offered_at, published_by = offered_by;
ALTER TABLE work.window_offers ENABLE TRIGGER window_offers_guard;
ALTER TABLE work.window_offers ENABLE TRIGGER window_offers_selected_confirms;

ALTER TABLE work.window_offers DROP CONSTRAINT window_offers_state_check;
ALTER TABLE work.window_offers ADD CONSTRAINT window_offers_state_check CHECK (state IN ('draft', 'discarded', 'open',
  'selected', 'expired', 'withdrawn', 'replaced', 'other_times_requested'));
ALTER TABLE work.window_offers ALTER COLUMN state SET DEFAULT 'draft';
ALTER TABLE work.window_offers ALTER COLUMN number DROP NOT NULL;
ALTER TABLE work.window_offers ALTER COLUMN expires_at DROP NOT NULL;
-- open: (state = 'open') = (closed_at IS NULL), now for drafts too.
ALTER TABLE work.window_offers DROP CONSTRAINT window_offers_check;
ALTER TABLE work.window_offers ADD CONSTRAINT window_offers_closed CHECK ((state IN ('draft', 'open')) = (closed_at IS NULL));
-- withdrawn: closed_by and closed_reason, now also for a replaced offer (by and why) and a discarded draft (by whom).
ALTER TABLE work.window_offers DROP CONSTRAINT window_offers_check3;
ALTER TABLE work.window_offers DROP CONSTRAINT window_offers_check4;
ALTER TABLE work.window_offers ADD CONSTRAINT window_offers_closed_by
  CHECK ((state IN ('withdrawn', 'replaced', 'discarded')) = (closed_by IS NOT NULL));
ALTER TABLE work.window_offers ADD CONSTRAINT window_offers_closed_reason
  CHECK ((state IN ('withdrawn', 'replaced')) = (closed_reason IS NOT NULL));
ALTER TABLE work.window_offers ADD CONSTRAINT window_offers_replaced
  CHECK ((state = 'replaced') = (replaced_by IS NOT NULL) AND replaced_by IS DISTINCT FROM id);
-- A draft (and a discarded draft) was never published: no number, publication or expiry; everything else was.
ALTER TABLE work.window_offers ADD CONSTRAINT window_offers_published CHECK (
  (state IN ('draft', 'discarded')) = (published_at IS NULL)
  AND (published_at IS NULL) = (published_by IS NULL)
  AND (published_at IS NULL) = (expires_at IS NULL)
  AND (published_at IS NULL) = (number IS NULL));
-- At most one draft per visit (and one open offer, 0053).
CREATE UNIQUE INDEX window_offers_one_draft ON work.window_offers (visit_id) WHERE state = 'draft';
COMMENT ON TABLE work.window_offers IS
  'Window offers of a visit (HH-SCH-11, OWN-DEC-144, OWN-DEC-194): saved as drafts, held for the configured hours '
  'from their publication, ended exactly once.';

-- A draft is saved now for a tentative visit of its project whose expected work and team size are entered. Publishing
-- it gives it the project's next number, its publication instant and its expiry; discarding it ends it. An open offer
-- ends once (0053), by a withdrawal or a replacement with staff's reason among them. Nothing else ever changes and
-- offers are never deleted.
CREATE OR REPLACE FUNCTION work.window_offer_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v work.visits;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'window offers are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'draft' OR NEW.version <> 1 OR NEW.number IS NOT NULL OR NEW.published_at IS NOT NULL
       OR NEW.published_by IS NOT NULL OR NEW.expires_at IS NOT NULL THEN
      RAISE EXCEPTION 'a window offer is saved as a draft and published afterwards' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.worker_ids IS NULL OR NEW.equipment_ids IS NULL THEN
      RAISE EXCEPTION 'a draft names the team it holds' USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO v FROM work.visits WHERE id = NEW.visit_id;
    IF v.id IS NULL OR v.state <> 'tentative' OR v.project_id <> NEW.project_id THEN
      RAISE EXCEPTION 'windows are offered for a tentative visit of the project' USING ERRCODE = 'check_violation';
    END IF;
    IF v.expected_duration_minutes IS NULL OR v.required_workers IS NULL THEN
      RAISE EXCEPTION 'the expected work and the number of workers are entered before windows are offered'
        USING ERRCODE = 'check_violation';
    END IF;
    -- Saved now, by the database's clock (to the millisecond, as the server reads instants).
    NEW.offered_at := date_trunc('milliseconds', now());
    RETURN NEW;
  END IF;
  IF OLD.state NOT IN ('draft', 'open') THEN
    RAISE EXCEPTION 'an ended window offer never changes' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW.id, NEW.visit_id, NEW.project_id, NEW.offered_by, NEW.offered_at, NEW.preparation_instructions,
      NEW.worker_ids, NEW.equipment_ids)
     IS DISTINCT FROM (OLD.id, OLD.visit_id, OLD.project_id, OLD.offered_by, OLD.offered_at,
      OLD.preparation_instructions, OLD.worker_ids, OLD.equipment_ids) THEN
    RAISE EXCEPTION 'an offer keeps its visit, windows, team and instructions' USING ERRCODE = 'restrict_violation';
  END IF;
  -- B4: no silent change to a published offer.
  IF OLD.state = 'open'
     AND (NEW.number, NEW.hold_hours, NEW.policy_version, NEW.published_at, NEW.published_by, NEW.expires_at)
     IS DISTINCT FROM (OLD.number, OLD.hold_hours, OLD.policy_version, OLD.published_at, OLD.published_by,
      OLD.expires_at) THEN
    RAISE EXCEPTION 'a published offer keeps its visit, windows and hold: it is withdrawn or replaced, never changed'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.version <> OLD.version + 1 OR NEW.state = OLD.state THEN
    RAISE EXCEPTION 'an offer changes once per state, as its next version' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.state = 'draft' THEN
    IF NEW.state = 'discarded' THEN
      IF (NEW.number, NEW.published_at, NEW.published_by, NEW.expires_at, NEW.hold_hours, NEW.policy_version)
         IS DISTINCT FROM (OLD.number, OLD.published_at, OLD.published_by, OLD.expires_at, OLD.hold_hours,
          OLD.policy_version) THEN
        RAISE EXCEPTION 'a discarded draft was never published' USING ERRCODE = 'check_violation';
      END IF;
      NEW.closed_at := now();
      RETURN NEW;
    END IF;
    IF NEW.state <> 'open' THEN
      RAISE EXCEPTION 'a draft is published or discarded' USING ERRCODE = 'check_violation';
    END IF;
    -- B1: published now, held for its hold hours from then.
    SELECT * INTO v FROM work.visits WHERE id = NEW.visit_id;
    IF v.state <> 'tentative' THEN
      RAISE EXCEPTION 'windows are published for a tentative visit' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.published_by IS NULL THEN
      RAISE EXCEPTION 'a published offer names who published it' USING ERRCODE = 'check_violation';
    END IF;
    NEW.published_at := date_trunc('milliseconds', now());
    NEW.expires_at := NEW.published_at + make_interval(hours => NEW.hold_hours);
    IF NEW.number IS DISTINCT FROM
       coalesce((SELECT max(number) FROM work.window_offers WHERE project_id = NEW.project_id), 0) + 1 THEN
      RAISE EXCEPTION 'an offer takes the next number of its project' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  -- OLD.state = 'open': it ends once (0053).
  IF NEW.state IN ('open', 'draft', 'discarded') THEN
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
  IF NEW.state = 'replaced' AND NOT EXISTS (SELECT 1 FROM work.window_offers
                                             WHERE id = NEW.replaced_by AND visit_id = NEW.visit_id) THEN
    RAISE EXCEPTION 'an offer is replaced by an offer of the same visit' USING ERRCODE = 'check_violation';
  END IF;
  NEW.closed_at := now();
  RETURN NEW;
END $$;

-- What an offer's ending does to its holds and its visit (0053); publishing or discarding a draft holds nothing yet.
CREATE OR REPLACE FUNCTION work.window_offer_settle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state = 'draft' THEN
    RETURN NULL;
  END IF;
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

-- B4: a replaced offer's replacement is published (open) in the same transaction (the customer is never left without
-- it).
CREATE FUNCTION work.window_offer_replacement_published() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state = 'replaced' AND NOT EXISTS (SELECT 1 FROM work.window_offers
                                             WHERE id = NEW.replaced_by AND state = 'open') THEN
    RAISE EXCEPTION 'a replaced offer''s replacement is published in the same transaction'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER window_offers_replacement_published AFTER UPDATE ON work.window_offers
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION work.window_offer_replacement_published();

-- An offer's windows are written with its draft, in its transaction, in its visit's zone, with the visit's reserved
-- range (0053), and (B4) none overlaps another window of the same offer.
CREATE OR REPLACE FUNCTION work.window_offer_option_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  o work.window_offers;
  v work.visits;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM work.window_offers
                  WHERE id = NEW.offer_id AND state = 'draft' AND xmin = pg_current_xact_id()::xid) THEN
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
  IF EXISTS (SELECT 1 FROM work.window_offer_options
              WHERE offer_id = NEW.offer_id AND position <> NEW.position
                AND tstzrange(reserved_starts_at, reserved_ends_at, '[)')
                    && tstzrange(NEW.reserved_starts_at, NEW.reserved_ends_at, '[)')) THEN
    RAISE EXCEPTION 'the windows of one offer do not overlap' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- 3. The hazard-evaluation inspection ---------------------------------------------------------------------------------
CREATE TABLE work.hazard_inspection_authorizations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id          uuid NOT NULL UNIQUE REFERENCES work.visits (id),
  project_id        uuid NOT NULL REFERENCES crm.projects (id),
  -- The qualified person who performs the inspection and their qualification (recorded, never judged by the software).
  qualified_person  text NOT NULL CHECK (char_length(btrim(qualified_person)) BETWEEN 1 AND 200),
  qualification     text NOT NULL CHECK (char_length(btrim(qualification)) BETWEEN 1 AND 500),
  -- The safety conditions the inspection is held under.
  safety_conditions text NOT NULL CHECK (char_length(btrim(safety_conditions)) BETWEEN 1 AND 2000),
  reason            text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000),
  authorized_by     uuid NOT NULL REFERENCES identity.staff_users (id),
  authorized_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hazard_inspection_authorizations_project ON work.hazard_inspection_authorizations (project_id);
COMMENT ON TABLE work.hazard_inspection_authorizations IS
  'The Owner''s authorization of a hazard-evaluation inspection visit while intake review holds stay open (OWN-DEC-193 '
  'A1, OWN-DEC-208): the qualified person, the safety conditions and the reason. Append-only.';

-- The intake review holds an inspection evaluates (open on the project when it was authorized).
CREATE TABLE work.hazard_inspection_holds (
  authorization_id uuid NOT NULL REFERENCES work.hazard_inspection_authorizations (id),
  hold_id          uuid NOT NULL REFERENCES work.holds (id),
  PRIMARY KEY (authorization_id, hold_id)
);
CREATE INDEX hazard_inspection_holds_hold ON work.hazard_inspection_holds (hold_id);
COMMENT ON TABLE work.hazard_inspection_holds IS
  'The intake review holds a hazard-evaluation inspection evaluates; they stay open (OWN-DEC-208). Append-only.';

-- By a live Owner, on a tentative site visit of its project that has an open intake review hold; kept as recorded.
CREATE FUNCTION work.hazard_inspection_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'APPEND_ONLY: an inspection authorization is kept as recorded' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM work.visits WHERE id = NEW.visit_id AND project_id = NEW.project_id
                   AND state = 'tentative' AND purpose = 'site_estimate') THEN
    RAISE EXCEPTION 'a hazard-evaluation inspection is a tentative site visit of the project'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT work.has_live_role(NEW.authorized_by, 'owner') THEN
    RAISE EXCEPTION 'only the Owner authorizes a hazard-evaluation inspection' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.authorized_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER hazard_inspection_authorizations_guard BEFORE INSERT OR UPDATE OR DELETE
  ON work.hazard_inspection_authorizations FOR EACH ROW EXECUTE FUNCTION work.hazard_inspection_guard();

-- Written with the authorization, in its transaction: open intake review holds of its project.
CREATE FUNCTION work.hazard_inspection_hold_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'APPEND_ONLY: an inspection''s holds are kept as recorded' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM work.hazard_inspection_authorizations
                  WHERE id = NEW.authorization_id AND xmin = pg_current_xact_id()::xid) THEN
    RAISE EXCEPTION 'an inspection''s holds are recorded with it' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM work.holds h JOIN work.hazard_inspection_authorizations a ON a.project_id = h.project_id
                  WHERE h.id = NEW.hold_id AND a.id = NEW.authorization_id AND h.kind = 'review'
                    AND h.state IN ('open', 'under_review')) THEN
    RAISE EXCEPTION 'an inspection evaluates an open intake review hold of its project' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER hazard_inspection_holds_guard BEFORE INSERT OR UPDATE OR DELETE ON work.hazard_inspection_holds
  FOR EACH ROW EXECUTE FUNCTION work.hazard_inspection_hold_guard();

-- An authorization names at least one hold (checked at commit).
CREATE FUNCTION work.hazard_inspection_names_holds() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM work.hazard_inspection_holds WHERE authorization_id = NEW.id) THEN
    RAISE EXCEPTION 'an inspection authorization names the intake review holds it evaluates'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER hazard_inspection_authorizations_holds AFTER INSERT ON work.hazard_inspection_authorizations
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION work.hazard_inspection_names_holds();

-- The holds that block confirming one visit: those of 0057, except the intake review holds the visit's own
-- hazard-evaluation inspection evaluates. A job-level Hold and a critical safety hold always block.
CREATE FUNCTION work.visit_blocking_holds(p_visit uuid, p_project uuid) RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT count(*)::integer
  FROM work.holds h
  WHERE h.project_id = p_project
    AND h.kind IN ('review', 'job_requirement', 'critical_safety')
    AND h.state IN ('open', 'under_review')
    AND NOT (h.kind = 'review' AND EXISTS (
      SELECT 1 FROM work.hazard_inspection_holds ih
      JOIN work.hazard_inspection_authorizations a ON a.id = ih.authorization_id
      WHERE a.visit_id = p_visit AND ih.hold_id = h.id))
$$;
COMMENT ON FUNCTION work.visit_blocking_holds(uuid, uuid) IS
  'How many holds block confirming this visit (HH-SCH-06, OWN-DEC-208): 0057''s, less the intake review holds its '
  'Owner-authorized hazard-evaluation inspection evaluates.';

CREATE OR REPLACE FUNCTION work.visit_confirmation_hold_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF work.visit_blocking_holds(NEW.id, NEW.project_id) > 0 THEN
    RAISE EXCEPTION 'visit % cannot be confirmed while a blocking hold is open on its project', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- 4. Follow-up visits on a completed job ------------------------------------------------------------------------------
CREATE TABLE work.follow_up_authorizations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id       uuid NOT NULL UNIQUE REFERENCES work.visits (id),
  job_id         uuid NOT NULL,
  project_id     uuid NOT NULL,
  basis          text NOT NULL CHECK (basis IN ('contractual_obligation', 'warranty', 'punch_list', 'return_work')),
  -- The job's return work the basis rests on (a warranty claim, or return work the Owner decided).
  return_work_id uuid REFERENCES quality.return_work (id),
  -- Which obligation, warranty, punch item or authorization it is.
  note           text NOT NULL CHECK (char_length(btrim(note)) BETWEEN 1 AND 1000),
  authorized_by  uuid NOT NULL REFERENCES identity.staff_users (id),
  authorized_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT follow_up_authorizations_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id),
  CONSTRAINT follow_up_authorizations_return_work
    CHECK ((basis IN ('warranty', 'return_work')) = (return_work_id IS NOT NULL))
);
CREATE INDEX follow_up_authorizations_job ON work.follow_up_authorizations (job_id);
COMMENT ON TABLE work.follow_up_authorizations IS
  'The recorded basis of a follow-up visit on a completed job (OWN-DEC-193 A4): a contractual obligation, a warranty, '
  'the punch-list process or an approved return-work authorization. Append-only.';

-- PROPOSED: the job states of a completed job (the Owner's quality review passed; closed or reopened since).
CREATE FUNCTION work.job_completed(p_job uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM work.jobs WHERE id = p_job
                   AND operational_state IN ('operationally_complete', 'closed', 'reopened'))
$$;

-- By a live Owner or Office, on a tentative work visit of its job; a warranty is the job's warranty claim, a
-- return-work authorization the job's return work with the Owner's decision; kept as recorded.
CREATE FUNCTION work.follow_up_authorization_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  r quality.return_work;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'APPEND_ONLY: a follow-up authorization is kept as recorded' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM work.visits WHERE id = NEW.visit_id AND job_id = NEW.job_id
                   AND project_id = NEW.project_id AND state = 'tentative' AND purpose <> 'site_estimate') THEN
    RAISE EXCEPTION 'a follow-up authorization is recorded on a tentative work visit of the job'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT (work.has_live_role(NEW.authorized_by, 'owner') OR work.has_live_role(NEW.authorized_by, 'office')) THEN
    RAISE EXCEPTION 'the Owner or Office records a follow-up authorization' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.return_work_id IS NOT NULL THEN
    SELECT * INTO r FROM quality.return_work WHERE id = NEW.return_work_id;
    IF r.job_id IS DISTINCT FROM NEW.job_id THEN
      RAISE EXCEPTION 'the return work is the job''s own' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.basis = 'warranty' AND r.classification <> 'warranty_claim' THEN
      RAISE EXCEPTION 'a warranty basis is a warranty claim of the job' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.basis = 'return_work' AND r.decided_at IS NULL THEN
      RAISE EXCEPTION 'a return-work basis is return work the Owner decided' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.authorized_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER follow_up_authorizations_guard BEFORE INSERT OR UPDATE OR DELETE ON work.follow_up_authorizations
  FOR EACH ROW EXECUTE FUNCTION work.follow_up_authorization_guard();

-- A work visit of a completed job is confirmed only with its follow-up authorization.
CREATE FUNCTION work.visit_follow_up_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.job_id IS NOT NULL AND work.job_completed(NEW.job_id)
     AND NOT EXISTS (SELECT 1 FROM work.follow_up_authorizations WHERE visit_id = NEW.id) THEN
    RAISE EXCEPTION 'visit % of a completed job is confirmed only with a recorded follow-up authorization', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER visits_follow_up_guard BEFORE UPDATE OF state ON work.visits
  FOR EACH ROW WHEN (NEW.state = 'confirmed' AND OLD.state IS DISTINCT FROM 'confirmed')
  EXECUTE FUNCTION work.visit_follow_up_guard();

-- A staging reset is the only path that empties these tables (TSK-0141).
CREATE TRIGGER hazard_inspection_authorizations_reset_only_truncate BEFORE TRUNCATE
  ON work.hazard_inspection_authorizations
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();
CREATE TRIGGER hazard_inspection_holds_reset_only_truncate BEFORE TRUNCATE ON work.hazard_inspection_holds
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();
CREATE TRIGGER follow_up_authorizations_reset_only_truncate BEFORE TRUNCATE ON work.follow_up_authorizations
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();
