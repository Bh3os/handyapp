-- 0074 The Start Work gate, hard holds and the three owner-approved Start Work exceptions (TSK-0073, TSK-0074;
-- HH-WORK-01, HH-WORK-02, HH-WORK-03, HH-WORK-04, HH-WORK-12, HH-OFF-04, T40, T45, T46, ENT-StartGateEvaluation,
-- ENT-GateException, ENT-Hold, ENT-Photo, OWN-DEC-38, OWN-DEC-68, OWN-DEC-82, OWN-DEC-137, OWN-DEC-195, OWN-DEC-196,
-- RULE-SAFETY-GATES, RULE-HUMAN-REVIEW).
-- The server evaluates every prerequisite itself (apps/server/src/modules/start). This migration records what it
-- decided and is the database's own backstop: whatever code path writes, no role, flag, setting or AI starts work past
-- a failing gate or a hard hold, and no fourth exception kind exists.
-- - work.holds gains the job-level Hold / Ready (kind job_requirement, scope job; set by staff with a note, or raised by
--   a worker's site check that found the site different from the packet, PROPOSED) and the critical safety hold (kind
--   critical_safety, scope job, source hazard_report: written by the hazard report of TSK-0077 in the same
--   transaction). Every job-scoped hold takes the job's row lock when it is written, so a Start Work transaction (which
--   holds the same lock) commits strictly before or after it (RULE-SAFETY-GATES). A critical hold is resolved only
--   with its evidence, the reviewer and the reviewer's qualification, and never by the person who raised it, nor
--   cancelled by them (OWN-DEC-38); the rule is never relaxed for a sole administrator.
-- - work.start_site_checks: a worker's own site checks on arrival (HH-WORK-12 step 2): the property identified, access
--   available, the customer present, hazards and controls reviewed, and the site as the packet describes it or
--   different (with what differs; a difference raises a job-level Hold in the same transaction). Append-only.
-- - work.before_photos: the before photos uploaded for each work package on a visit (HH-WORK-12 step 3), internal,
--   never served by this migration's routes. PROPOSED minimal record until field photos (TSK-0076) add processing,
--   sharing and after photos. Append-only.
-- - work.gate_exceptions: the three administrative exceptions of OWN-DEC-68, and only these. Requested by a worker
--   assigned to the visit, decided by the Owner (never the requester), for one requirement, one job and one visit;
--   they end when the visit ends or a relevant change happens, and are never deleted.
-- - work.start_gate_evaluations: the immutable record of every Start Work attempt (ENT-StartGateEvaluation): each
--   prerequisite with its missing items and resolution owner, the outcome, the packet, scope and SOP versions and the
--   exceptions used. Append-only.
-- - work.work_starts: "actual contracted work started" (OWN-DEC-195 C4), one per worker per visit, naming the passing
--   evaluation of the same transaction, the versions, the acknowledgment and any approved exception, with the
--   server's time. Append-only.
-- - Backstops: a work start needs a ready evaluation written in its own transaction for the same job, visit and
--   worker, the worker's live assignment and an arrived visit, and no blocking review, job-level or critical hold on
--   the project; a job or work package moves to in_progress only in a transaction that recorded such a start.

-- Holds: the job-level Hold / Ready and critical safety holds ---------------------------------------------------------
ALTER TABLE work.holds DROP CONSTRAINT holds_kind_check;
ALTER TABLE work.holds ADD CONSTRAINT holds_kind_check
  CHECK (kind IN ('review', 'task_block', 'job_requirement', 'critical_safety'));
ALTER TABLE work.holds DROP CONSTRAINT holds_scope_type_check;
ALTER TABLE work.holds ADD CONSTRAINT holds_scope_type_check CHECK (scope_type IN ('request', 'work_package', 'job'));
ALTER TABLE work.holds DROP CONSTRAINT holds_category_check;
ALTER TABLE work.holds ADD CONSTRAINT holds_category_check CHECK (category IN ('hazardous_material', 'licensed_trade',
  'structural', 'permit_licensing', 'other', 'critical_resource', 'site_condition', 'gas_leak', 'live_wiring'));
ALTER TABLE work.holds DROP CONSTRAINT holds_source_check;
ALTER TABLE work.holds ADD CONSTRAINT holds_source_check
  CHECK (source IN ('qualification', 'loadout', 'job_hold', 'site_check', 'hazard_report'));
ALTER TABLE work.holds
  -- A critical safety hold's resolution evidence and the reviewer's qualification (HH-WORK-02).
  ADD COLUMN resolution_evidence    text CHECK (char_length(btrim(resolution_evidence)) BETWEEN 1 AND 2000),
  ADD COLUMN reviewer_qualification text CHECK (char_length(btrim(reviewer_qualification)) BETWEEN 1 AND 200),
  ADD CONSTRAINT holds_job_scope CHECK (
    (kind IN ('job_requirement', 'critical_safety')) = (scope_type = 'job')),
  ADD CONSTRAINT holds_job_requirement CHECK (
    (kind = 'job_requirement') = (source IN ('job_hold', 'site_check'))),
  ADD CONSTRAINT holds_critical_safety CHECK ((kind = 'critical_safety') = (source = 'hazard_report')),
  ADD CONSTRAINT holds_critical_categories CHECK (
    kind <> 'critical_safety'
    OR category IN ('gas_leak', 'live_wiring', 'hazardous_material', 'structural', 'licensed_trade', 'other')),
  ADD CONSTRAINT holds_critical_resolution CHECK (
    kind <> 'critical_safety' OR state <> 'resolved'
    OR (resolution_evidence IS NOT NULL AND reviewer_qualification IS NOT NULL)),
  ADD CONSTRAINT holds_critical_not_self CHECK (
    kind <> 'critical_safety'
    OR ((resolved_by IS NULL OR resolved_by <> raised_by) AND (canceled_by IS NULL OR canceled_by <> raised_by)
        AND (review_started_by IS NULL OR review_started_by <> raised_by)));

-- A job-scoped hold names a job of its own project and is written under that job's row lock.
CREATE FUNCTION work.job_hold_scope_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.scope_type = 'job' THEN
    PERFORM 1 FROM work.jobs WHERE id = NEW.scope_id AND project_id = NEW.project_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'a job-level or critical hold names a job of its own project' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER holds_job_scope BEFORE INSERT ON work.holds
  FOR EACH ROW EXECUTE FUNCTION work.job_hold_scope_check();

-- How many holds of a project block Start Work of its jobs: review, job-level and critical safety holds that are open
-- or under review (the same kinds that block confirmation, 0057).
CREATE FUNCTION work.start_blocking_holds(p_project uuid) RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT count(*)::integer
  FROM work.holds
  WHERE project_id = p_project
    AND kind IN ('review', 'job_requirement', 'critical_safety')
    AND state IN ('open', 'under_review')
$$;

-- A staff member's live grant of a role.
CREATE FUNCTION work.has_live_role(p_staff uuid, p_role text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM identity.role_grants
                 WHERE staff_user_id = p_staff AND kind = 'role' AND name = p_role AND ended_at IS NULL)
$$;

-- Rows written for a visit (work.assigned_to_visit: migration 0062) name the visit's own job and project, by a worker assigned to it.
CREATE FUNCTION work.visit_record_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  who uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM work.visits WHERE id = NEW.visit_id AND job_id = NEW.job_id
                 AND project_id = NEW.project_id) THEN
    RAISE EXCEPTION 'a % row names its visit''s own job and project', TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END IF;
  who := (to_jsonb(NEW) ->> CASE TG_TABLE_NAME WHEN 'gate_exceptions' THEN 'requested_by' ELSE 'staff_user_id' END)::uuid;
  IF NOT work.assigned_to_visit(NEW.visit_id, who) THEN
    RAISE EXCEPTION 'only a worker assigned to the visit writes a % row', TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- Site checks ----------------------------------------------------------------------------------------------------------
CREATE TABLE work.start_site_checks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id             uuid NOT NULL,
  project_id         uuid NOT NULL,
  visit_id           uuid NOT NULL REFERENCES work.visits (id),
  staff_user_id      uuid NOT NULL REFERENCES identity.staff_users (id),
  property_confirmed boolean NOT NULL,
  access_available   boolean NOT NULL,
  customer_present   boolean NOT NULL,
  hazards_reviewed   boolean NOT NULL,
  site_condition     text NOT NULL CHECK (site_condition IN ('as_described', 'differs')),
  -- What differs, as the worker wrote it (staff only).
  note               text CHECK (char_length(btrim(note)) BETWEEN 1 AND 1000),
  -- The job-level Hold a difference raised in the same transaction.
  hold_id            uuid REFERENCES work.holds (id),
  packet_version     integer NOT NULL CHECK (packet_version >= 1),
  recorded_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT start_site_checks_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id),
  CONSTRAINT start_site_checks_difference CHECK (
    (site_condition = 'differs') = (hold_id IS NOT NULL) AND (site_condition = 'as_described' OR note IS NOT NULL))
);
CREATE INDEX start_site_checks_visit ON work.start_site_checks (visit_id, staff_user_id, recorded_at);
CREATE TRIGGER start_site_checks_append_only BEFORE UPDATE OR DELETE ON work.start_site_checks
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
CREATE TRIGGER start_site_checks_check BEFORE INSERT ON work.start_site_checks
  FOR EACH ROW EXECUTE FUNCTION work.visit_record_check();
COMMENT ON TABLE work.start_site_checks IS
  'A worker''s own site checks before Start Work (HH-WORK-12 step 2); the latest per worker and visit counts.';

-- Before photos --------------------------------------------------------------------------------------------------------
CREATE TABLE work.before_photos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          uuid NOT NULL,
  project_id      uuid NOT NULL,
  visit_id        uuid NOT NULL REFERENCES work.visits (id),
  work_package_id uuid NOT NULL,
  staff_user_id   uuid NOT NULL REFERENCES identity.staff_users (id),
  object_key      text NOT NULL UNIQUE CHECK (char_length(object_key) BETWEEN 1 AND 300),
  content_type    text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size       integer NOT NULL CHECK (byte_size > 0),
  sha256          text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  -- The device's capture time when sent, kept beside the server's upload time.
  device_captured_at timestamptz,
  uploaded_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT before_photos_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id),
  CONSTRAINT before_photos_package FOREIGN KEY (work_package_id, project_id)
    REFERENCES work.work_packages (id, project_id)
);
CREATE INDEX before_photos_visit ON work.before_photos (visit_id, work_package_id);
CREATE TRIGGER before_photos_append_only BEFORE UPDATE OR DELETE ON work.before_photos
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
CREATE TRIGGER before_photos_check BEFORE INSERT ON work.before_photos
  FOR EACH ROW EXECUTE FUNCTION work.visit_record_check();
CREATE FUNCTION work.before_photo_package_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM work.work_packages WHERE id = NEW.work_package_id AND job_id = NEW.job_id) THEN
    RAISE EXCEPTION 'a before photo names a work package of its own job' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER before_photos_package BEFORE INSERT ON work.before_photos
  FOR EACH ROW EXECUTE FUNCTION work.before_photo_package_check();
COMMENT ON TABLE work.before_photos IS
  'Before photos per work package and visit (HH-WORK-12 step 3), internal; field photos (TSK-0076) extend them.';

-- Administrative exceptions -------------------------------------------------------------------------------------------
CREATE TABLE work.gate_exceptions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                 uuid NOT NULL,
  project_id             uuid NOT NULL,
  visit_id               uuid NOT NULL REFERENCES work.visits (id),
  -- The three exceptions of OWN-DEC-68, and nothing else.
  kind                   text NOT NULL CHECK (kind IN ('customer_not_present', 'before_photo_upload_failed',
                           'deposit_bookkeeping_pending')),
  -- The one prerequisite it covers.
  requirement            text NOT NULL,
  reason                 text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000),
  evidence               jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  requested_by           uuid NOT NULL REFERENCES identity.staff_users (id),
  requested_at           timestamptz NOT NULL DEFAULT now(),
  -- The packet version the request was made against (relevant changes since it end the exception).
  packet_version         integer NOT NULL CHECK (packet_version >= 1),
  -- The end of the visit's service day in its zone: the exception never carries over.
  expires_at             timestamptz NOT NULL,
  state                  text NOT NULL DEFAULT 'requested'
                           CHECK (state IN ('requested', 'approved', 'declined', 'invalidated', 'expired')),
  decided_by             uuid REFERENCES identity.staff_users (id),
  decided_at             timestamptz,
  decision_note          text CHECK (char_length(btrim(decision_note)) BETWEEN 1 AND 1000),
  provider_verified      boolean,
  follow_up_owner        uuid REFERENCES identity.staff_users (id),
  follow_up_due          date,
  ended_at               timestamptz,
  ended_reason           text CHECK (ended_reason IN ('visit_ended', 'scope_changed', 'site_changed', 'access_changed',
                           'assignment_changed')),
  version                integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT gate_exceptions_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id),
  CONSTRAINT gate_exceptions_requirement CHECK (
    (kind = 'customer_not_present' AND requirement = 'site_identity')
    OR (kind = 'before_photo_upload_failed' AND requirement = 'before_photos')
    OR (kind = 'deposit_bookkeeping_pending' AND requirement = 'deposit')),
  CONSTRAINT gate_exceptions_decided CHECK ((decided_at IS NULL) = (decided_by IS NULL)),
  CONSTRAINT gate_exceptions_approved CHECK (
    state NOT IN ('approved') OR (decided_at IS NOT NULL AND follow_up_owner IS NOT NULL AND follow_up_due IS NOT NULL
                                  AND (kind <> 'deposit_bookkeeping_pending' OR provider_verified IS TRUE))),
  CONSTRAINT gate_exceptions_declined CHECK (state <> 'declined' OR (decided_at IS NOT NULL AND decision_note IS NOT NULL)),
  CONSTRAINT gate_exceptions_ended CHECK (
    (state IN ('invalidated', 'expired')) = (ended_at IS NOT NULL) AND (ended_at IS NULL) = (ended_reason IS NULL)),
  CONSTRAINT gate_exceptions_not_self CHECK (decided_by IS NULL OR decided_by <> requested_by)
);
-- One live request or approval per visit and kind.
CREATE UNIQUE INDEX gate_exceptions_live ON work.gate_exceptions (visit_id, kind)
  WHERE state IN ('requested', 'approved');
CREATE INDEX gate_exceptions_job ON work.gate_exceptions (job_id, requested_at);
CREATE TRIGGER gate_exceptions_check BEFORE INSERT ON work.gate_exceptions
  FOR EACH ROW EXECUTE FUNCTION work.visit_record_check();

-- Requested by a worker, decided only by the Owner; it moves only forward and keeps what was requested.
CREATE FUNCTION work.gate_exception_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'exceptions are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'requested' OR NEW.version <> 1 OR NEW.decided_by IS NOT NULL OR NEW.ended_at IS NOT NULL THEN
      RAISE EXCEPTION 'an exception is created as a request' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT work.has_live_role(NEW.requested_by, 'worker') THEN
      RAISE EXCEPTION 'an exception is requested by an assigned worker' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.job_id, NEW.project_id, NEW.visit_id, NEW.kind, NEW.requirement, NEW.reason, NEW.evidence,
      NEW.requested_by, NEW.requested_at, NEW.packet_version, NEW.expires_at)
     IS DISTINCT FROM (OLD.id, OLD.job_id, OLD.project_id, OLD.visit_id, OLD.kind, OLD.requirement, OLD.reason,
                       OLD.evidence, OLD.requested_by, OLD.requested_at, OLD.packet_version, OLD.expires_at) THEN
    RAISE EXCEPTION 'an exception keeps what was requested' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NOT ((OLD.state = 'requested' AND NEW.state IN ('approved', 'declined', 'invalidated', 'expired'))
          OR (OLD.state = 'approved' AND NEW.state IN ('invalidated', 'expired'))) THEN
    RAISE EXCEPTION 'exception % cannot move from % to %', OLD.id, OLD.state, NEW.state
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.state IN ('approved', 'declined') AND NOT work.has_live_role(NEW.decided_by, 'owner') THEN
    RAISE EXCEPTION 'only the Owner decides an exception' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.decided_at IS NOT NULL AND (NEW.decided_by, NEW.decided_at, NEW.decision_note, NEW.provider_verified,
      NEW.follow_up_owner, NEW.follow_up_due) IS DISTINCT FROM (OLD.decided_by, OLD.decided_at, OLD.decision_note,
      OLD.provider_verified, OLD.follow_up_owner, OLD.follow_up_due) THEN
    RAISE EXCEPTION 'an exception keeps its decision' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'an exception change takes the next version' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER gate_exceptions_guard BEFORE INSERT OR UPDATE OR DELETE ON work.gate_exceptions
  FOR EACH ROW EXECUTE FUNCTION work.gate_exception_guard();
COMMENT ON TABLE work.gate_exceptions IS
  'The three Start Work administrative exceptions of OWN-DEC-68: one requirement, one job, one visit; Owner-approved.';

-- Start-gate evaluations -----------------------------------------------------------------------------------------------
CREATE TABLE work.start_gate_evaluations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          uuid NOT NULL,
  project_id      uuid NOT NULL,
  visit_id        uuid NOT NULL REFERENCES work.visits (id),
  staff_user_id   uuid NOT NULL REFERENCES identity.staff_users (id),
  outcome         text NOT NULL CHECK (outcome IN ('ready', 'needs_attention', 'requires_review', 'blocked')),
  -- Each prerequisite of HH-WORK-01 with its state, missing items and their resolution owners.
  items           jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) = 10),
  packet_version  integer CHECK (packet_version >= 1),
  packet_sha256   text CHECK (packet_sha256 ~ '^[0-9a-f]{64}$'),
  scope_version   integer,
  sop_version_ids jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(sop_version_ids) = 'array'),
  acknowledgment_id uuid REFERENCES work.job_packet_acknowledgments (id),
  exception_ids   uuid[] NOT NULL DEFAULT '{}',
  request_id      text CHECK (char_length(request_id) <= 200),
  evaluated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT start_gate_evaluations_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id),
  CONSTRAINT start_gate_evaluations_ready CHECK (
    outcome <> 'ready' OR (packet_version IS NOT NULL AND acknowledgment_id IS NOT NULL))
);
CREATE INDEX start_gate_evaluations_visit ON work.start_gate_evaluations (visit_id, evaluated_at);
CREATE TRIGGER start_gate_evaluations_append_only BEFORE UPDATE OR DELETE ON work.start_gate_evaluations
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE work.start_gate_evaluations IS
  'The immutable record of each Start Work attempt (ENT-StartGateEvaluation), written by the server.';

-- Work starts ----------------------------------------------------------------------------------------------------------
CREATE TABLE work.work_starts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            uuid NOT NULL,
  project_id        uuid NOT NULL,
  visit_id          uuid NOT NULL REFERENCES work.visits (id),
  staff_user_id     uuid NOT NULL REFERENCES identity.staff_users (id),
  evaluation_id     uuid NOT NULL UNIQUE REFERENCES work.start_gate_evaluations (id),
  packet_version    integer NOT NULL CHECK (packet_version >= 1),
  scope_version     integer,
  sop_version_ids   jsonb NOT NULL CHECK (jsonb_typeof(sop_version_ids) = 'array'),
  acknowledgment_id uuid NOT NULL REFERENCES work.job_packet_acknowledgments (id),
  exception_ids     uuid[] NOT NULL DEFAULT '{}',
  job_state_before  text NOT NULL,
  started_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (visit_id, staff_user_id),
  CONSTRAINT work_starts_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id)
);
CREATE INDEX work_starts_job ON work.work_starts (job_id, started_at);
CREATE TRIGGER work_starts_append_only BEFORE UPDATE OR DELETE ON work.work_starts
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();

-- A start names a ready evaluation of its own transaction, job, visit and worker; the worker is assigned to the
-- arrived visit; no hard hold blocks; every exception it names is approved for this visit.
CREATE FUNCTION work.work_start_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM work.start_gate_evaluations e
                 WHERE e.id = NEW.evaluation_id AND e.outcome = 'ready' AND e.job_id = NEW.job_id
                   AND e.visit_id = NEW.visit_id AND e.staff_user_id = NEW.staff_user_id
                   AND e.packet_version = NEW.packet_version AND e.acknowledgment_id = NEW.acknowledgment_id
                   AND e.exception_ids = NEW.exception_ids
                   AND e.xmin = pg_current_xact_id()::xid) THEN
    RAISE EXCEPTION 'work starts only with a passing Start Work evaluation of the same transaction'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM work.visits WHERE id = NEW.visit_id AND job_id = NEW.job_id AND state = 'arrived') THEN
    RAISE EXCEPTION 'work starts on an arrived visit of its own job' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT work.assigned_to_visit(NEW.visit_id, NEW.staff_user_id) THEN
    RAISE EXCEPTION 'only a worker assigned to the visit starts work' USING ERRCODE = 'check_violation';
  END IF;
  -- The job's row lock: a hazard report and its critical hold commit strictly before or after this start.
  PERFORM 1 FROM work.jobs WHERE id = NEW.job_id FOR UPDATE;
  IF work.start_blocking_holds(NEW.project_id) > 0 THEN
    RAISE EXCEPTION 'work cannot start while a review, job-level or critical safety hold is open on its project'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(NEW.exception_ids) x
             WHERE NOT EXISTS (SELECT 1 FROM work.gate_exceptions g
                               WHERE g.id = x AND g.state = 'approved' AND g.visit_id = NEW.visit_id
                                 AND g.expires_at > now())) THEN
    RAISE EXCEPTION 'a start names only exceptions approved for its visit' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER work_starts_check BEFORE INSERT ON work.work_starts
  FOR EACH ROW EXECUTE FUNCTION work.work_start_check();
COMMENT ON TABLE work.work_starts IS
  'Actual contracted work started (OWN-DEC-195 C4): one per worker and visit, through a passing Start Work gate.';

-- A job and a work package move to in_progress only in a transaction that recorded a work start of the job, and never
-- while a hard hold blocks. Pausing and resuming (TSK-0075, TSK-0094) pass the same gate.
CREATE FUNCTION work.job_start_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  j uuid := (to_jsonb(NEW) ->> CASE TG_TABLE_NAME WHEN 'jobs' THEN 'id' ELSE 'job_id' END)::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM work.work_starts WHERE job_id = j AND xmin = pg_current_xact_id()::xid) THEN
    RAISE EXCEPTION '% % moves to in_progress only through the Start Work gate', TG_TABLE_NAME, NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF work.start_blocking_holds(NEW.project_id) > 0 THEN
    RAISE EXCEPTION '% % cannot start while a review, job-level or critical safety hold is open', TG_TABLE_NAME, NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER jobs_start_guard BEFORE UPDATE OF operational_state ON work.jobs
  FOR EACH ROW WHEN (NEW.operational_state = 'in_progress' AND OLD.operational_state IS DISTINCT FROM 'in_progress')
  EXECUTE FUNCTION work.job_start_guard();
CREATE TRIGGER work_packages_start_guard BEFORE UPDATE OF state ON work.work_packages
  FOR EACH ROW WHEN (NEW.state = 'in_progress' AND OLD.state IS DISTINCT FROM 'in_progress')
  EXECUTE FUNCTION work.job_start_guard();

-- Staging reset (TSK-0141): these are test records with no TRUNCATE guard of their own; only a permitted staging reset
-- clears them.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['work.start_site_checks', 'work.before_photos', 'work.gate_exceptions',
                           'work.start_gate_evaluations', 'work.work_starts'] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE TRUNCATE ON %s FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) '
      'EXECUTE FUNCTION staging.reject_truncate()',
      split_part(t, '.', 2) || '_reset_only_truncate', t);
  END LOOP;
END;
$$;
