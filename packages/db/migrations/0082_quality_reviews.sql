-- 0082 The Owner's quality review and punch items (TSK-0084; HH-QA-02, HH-QA-04, HH-QA-09, HH-FIN-05, T55, T56,
-- ENT-QAInspection, ENT-PunchItem, ENT-Job, ENT-Invoice, OWN-DEC-64, OWN-DEC-109, OWN-DEC-110, RULE-SAFETY-GATES,
-- RULE-SERVER-AUTHZ). The server decides who may act (apps/server/src/modules/quality); this migration keeps the records
-- complete and the rules true whatever code path writes:
-- - quality.reviews: the Owner's review of one job (one per job), `pending -> in_review -> passed / punch_required`,
--   `punch_required -> pending_recheck -> passed` (and back to punch_required when a re-check fails or a new item is
--   found). The reviewer is an Owner; the review is marked self-review when the reviewer started work on the job
--   (OWN-DEC-64 "I review it, marked 'self-review'"). The four areas reviewed (scope, checklist, before/after evidence,
--   walkthrough) each get a result when the review is decided; a review passes only with every area ok and no punch
--   item still to re-check; a problem found is a punch item (OWN-DEC-64 "every problem becomes a punch item").
-- - quality.punch_items: one problem, linked to the job and its work package (or a named area), with its kind (the
--   owner's words: finish or cleanup issues are minor; defects, incomplete agreed scope, failed functional checks and
--   safety concerns are major), the assigned person, due date and the required correction evidence. `open ->
--   corrected -> rechecked`, or `corrected -> open` when the re-check fails. A safety concern names the job's open
--   critical safety hold (written by Stop Work / Report Hazard, TSK-0077), so the affected work stays blocked by the
--   hold until it is properly resolved (0074 path), and the item is re-checked only once that hold is resolved
--   (RULE-SAFETY-GATES: nothing here raises, releases or weakens a hold). Items are never deleted and stay linked to the
--   job after an invoice is issued (HH-QA-04).
-- - quality.review_events: every state change of a review or a punch item, who, when and the note given (append-only).
-- - finance.invoice_quality_gate (0077) now answers from the review: 'quality_review_not_recorded' until the review is
--   decided, 'passed' once it passed, 'blocked' while any major item is not re-checked, otherwise 'owner_may_issue'
--   (only minor items open: the Owner may issue, OWN-DEC-64). Deposit invoices never ask it (0077).
-- - work.jobs: a job becomes operationally_complete only from ready_for_qa with its review passed (HH-QA-09), and is
--   closed only with its review passed and every punch item re-checked (HH-QA-02).

CREATE TABLE quality.reviews (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id             uuid NOT NULL UNIQUE,
  project_id         uuid NOT NULL,
  state              text NOT NULL DEFAULT 'pending'
                       CHECK (state IN ('pending', 'in_review', 'passed', 'punch_required', 'pending_recheck')),
  reviewer_id        uuid REFERENCES identity.staff_users (id),
  self_review        boolean NOT NULL DEFAULT false,
  -- The four areas reviewed (HH-QA-02: scope, checklist, before/after evidence and walkthrough), set when decided.
  scope_result       text CHECK (scope_result IN ('ok', 'problem')),
  checklist_result   text CHECK (checklist_result IN ('ok', 'problem')),
  evidence_result    text CHECK (evidence_result IN ('ok', 'problem')),
  walkthrough_result text CHECK (walkthrough_result IN ('ok', 'problem')),
  -- The reviewer's own note on the review (staff only).
  note               text CHECK (char_length(btrim(note)) BETWEEN 1 AND 2000),
  created_at         timestamptz NOT NULL DEFAULT now(),
  started_at         timestamptz,
  decided_at         timestamptz,
  passed_at          timestamptz,
  version            integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT reviews_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id),
  CONSTRAINT reviews_started CHECK (
    (state = 'pending') = (started_at IS NULL) AND (started_at IS NULL) = (reviewer_id IS NULL)),
  CONSTRAINT reviews_decided CHECK (
    (state IN ('pending', 'in_review')) = (decided_at IS NULL)
    AND (decided_at IS NULL) = (scope_result IS NULL) AND (decided_at IS NULL) = (checklist_result IS NULL)
    AND (decided_at IS NULL) = (evidence_result IS NULL) AND (decided_at IS NULL) = (walkthrough_result IS NULL)),
  CONSTRAINT reviews_passed CHECK ((state = 'passed') = (passed_at IS NOT NULL))
);
CREATE INDEX reviews_open ON quality.reviews (state) WHERE state <> 'passed';
COMMENT ON TABLE quality.reviews IS
  'The Owner''s quality review of a job (ENT-QAInspection): one per job; passing is required before completion.';

CREATE TABLE quality.punch_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id         uuid NOT NULL REFERENCES quality.reviews (id),
  job_id            uuid NOT NULL,
  project_id        uuid NOT NULL,
  -- The task or area: a work package of the job, or an area named by the reviewer (or both).
  work_package_id   uuid REFERENCES work.work_packages (id),
  area              text CHECK (char_length(btrim(area)) BETWEEN 1 AND 120),
  kind              text NOT NULL CHECK (kind IN ('finish', 'cleanup', 'defect', 'incomplete_scope', 'failed_check',
                      'safety_concern')),
  severity          text NOT NULL CHECK (severity IN ('minor', 'major')),
  description       text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 1000),
  -- The correction evidence the reviewer requires (OWN-DEC-64 "required correction evidence").
  required_evidence text NOT NULL CHECK (char_length(btrim(required_evidence)) BETWEEN 1 AND 500),
  assigned_to       uuid NOT NULL REFERENCES identity.staff_users (id),
  due_on            date NOT NULL,
  -- A safety concern: the job's critical safety hold that blocks the affected work until it is resolved.
  hold_id           uuid REFERENCES work.holds (id),
  state             text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'corrected', 'rechecked')),
  created_by        uuid NOT NULL REFERENCES identity.staff_users (id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  -- The correction and its evidence as the corrector recorded it.
  correction_note   text CHECK (char_length(btrim(correction_note)) BETWEEN 1 AND 1000),
  corrected_by      uuid REFERENCES identity.staff_users (id),
  corrected_at      timestamptz,
  -- The reviewer's re-check that passed it.
  recheck_note      text CHECK (char_length(btrim(recheck_note)) BETWEEN 1 AND 1000),
  rechecked_by      uuid REFERENCES identity.staff_users (id),
  rechecked_at      timestamptz,
  version           integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT punch_items_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id),
  CONSTRAINT punch_items_place CHECK (work_package_id IS NOT NULL OR area IS NOT NULL),
  -- The owner's rule (OWN-DEC-64): finish and cleanup issues are minor; everything else listed is major.
  CONSTRAINT punch_items_severity CHECK ((severity = 'minor') = (kind IN ('finish', 'cleanup'))),
  CONSTRAINT punch_items_safety CHECK ((kind = 'safety_concern') = (hold_id IS NOT NULL)),
  CONSTRAINT punch_items_corrected CHECK (
    (state = 'open') = (corrected_at IS NULL) AND (corrected_at IS NULL) = (corrected_by IS NULL)
    AND (corrected_at IS NULL) = (correction_note IS NULL)),
  CONSTRAINT punch_items_rechecked CHECK (
    (state = 'rechecked') = (rechecked_at IS NOT NULL) AND (rechecked_at IS NULL) = (rechecked_by IS NULL)
    AND (rechecked_at IS NULL) = (recheck_note IS NULL))
);
CREATE INDEX punch_items_review ON quality.punch_items (review_id, state);
CREATE INDEX punch_items_job ON quality.punch_items (job_id, state);
COMMENT ON TABLE quality.punch_items IS
  'Punch items (ENT-PunchItem): problems found at review, linked to the job through invoicing until re-checked.';

CREATE TABLE quality.review_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The order of events: several are written in one transaction, at the same time.
  seq           bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  review_id     uuid NOT NULL REFERENCES quality.reviews (id),
  punch_item_id uuid REFERENCES quality.punch_items (id),
  event         text NOT NULL CHECK (event ~ '^[a-z_]{1,40}$'),
  from_state    text,
  to_state      text NOT NULL,
  actor_id      uuid NOT NULL REFERENCES identity.staff_users (id),
  note          text CHECK (char_length(btrim(note)) BETWEEN 1 AND 2000),
  at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX review_events_review ON quality.review_events (review_id, seq);
CREATE TRIGGER review_events_append_only BEFORE UPDATE OR DELETE ON quality.review_events
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();

-- Punch items of a review that are not re-checked yet, and those still open.
CREATE FUNCTION quality.unrechecked_items(p_review uuid) RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT count(*)::integer FROM quality.punch_items WHERE review_id = p_review AND state <> 'rechecked'
$$;
CREATE FUNCTION quality.open_items(p_review uuid) RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT count(*)::integer FROM quality.punch_items WHERE review_id = p_review AND state = 'open'
$$;

-- A review is created pending on a job awaiting quality review, moves only along its lifecycle, is started and
-- decided by an Owner, and passes or asks for punch work only as its items allow.
CREATE FUNCTION quality.review_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  items integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'quality reviews are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'pending' OR NEW.version <> 1 OR NEW.self_review THEN
      RAISE EXCEPTION 'a quality review is created pending' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM work.jobs WHERE id = NEW.job_id AND operational_state = 'ready_for_qa') THEN
      RAISE EXCEPTION 'a quality review is opened for a job awaiting quality review' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.job_id, NEW.project_id, NEW.created_at) IS DISTINCT FROM (OLD.id, OLD.job_id, OLD.project_id,
     OLD.created_at) THEN
    RAISE EXCEPTION 'a quality review keeps its job' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'a quality review change takes the next version' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.state = 'passed' THEN
    RAISE EXCEPTION 'a passed quality review is final' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NOT ((OLD.state, NEW.state) IN (('pending', 'in_review'), ('in_review', 'in_review'), ('in_review', 'passed'),
          ('in_review', 'punch_required'), ('punch_required', 'punch_required'),
          ('punch_required', 'pending_recheck'), ('pending_recheck', 'punch_required'),
          ('pending_recheck', 'passed'))) THEN
    RAISE EXCEPTION 'a quality review moves % -> % only along its lifecycle', OLD.state, NEW.state
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id AND NOT work.has_live_role(NEW.reviewer_id, 'owner') THEN
    RAISE EXCEPTION 'the quality reviewer is an Owner' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.state = 'pending' THEN
    -- Self-review: the reviewer started work on this job (OWN-DEC-64); decided here, never by the caller.
    NEW.self_review := EXISTS (SELECT 1 FROM work.work_starts WHERE job_id = NEW.job_id
                                AND staff_user_id = NEW.reviewer_id);
  ELSIF NEW.self_review IS DISTINCT FROM OLD.self_review AND NEW.reviewer_id IS NOT DISTINCT FROM OLD.reviewer_id THEN
    RAISE EXCEPTION 'self-review follows the reviewer' USING ERRCODE = 'check_violation';
  ELSIF NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id THEN
    NEW.self_review := EXISTS (SELECT 1 FROM work.work_starts WHERE job_id = NEW.job_id
                                AND staff_user_id = NEW.reviewer_id);
  END IF;
  IF OLD.decided_at IS NOT NULL AND (NEW.decided_at, NEW.scope_result, NEW.checklist_result, NEW.evidence_result,
     NEW.walkthrough_result) IS DISTINCT FROM (OLD.decided_at, OLD.scope_result, OLD.checklist_result,
     OLD.evidence_result, OLD.walkthrough_result) THEN
    RAISE EXCEPTION 'the review''s area results are recorded once' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.state = OLD.state THEN
    RETURN NEW;
  END IF;
  items := quality.unrechecked_items(NEW.id);
  IF NEW.state = 'passed' AND items > 0 THEN
    RAISE EXCEPTION 'a quality review passes only with every punch item re-checked' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.state = 'passed' AND OLD.state = 'in_review'
     AND (EXISTS (SELECT 1 FROM quality.punch_items WHERE review_id = NEW.id)
          OR 'problem' IN (NEW.scope_result, NEW.checklist_result, NEW.evidence_result, NEW.walkthrough_result)) THEN
    RAISE EXCEPTION 'a review that found a problem passes after its punch items are re-checked'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.state = 'punch_required' AND items = 0 THEN
    RAISE EXCEPTION 'punch work is required only with a punch item' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.state = 'pending_recheck' AND quality.open_items(NEW.id) > 0 THEN
    RAISE EXCEPTION 'a re-check waits until every punch item is corrected' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.state = 'passed' AND NOT EXISTS (SELECT 1 FROM work.jobs WHERE id = NEW.job_id
                                            AND operational_state = 'ready_for_qa') THEN
    RAISE EXCEPTION 'a quality review passes a job awaiting quality review' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reviews_guard BEFORE INSERT OR UPDATE OR DELETE ON quality.reviews
  FOR EACH ROW EXECUTE FUNCTION quality.review_guard();

-- A punch item is created open by an Owner on a review being worked, names a work package of its own project and a
-- worker to correct it, and a safety concern names the job's unresolved critical safety hold. It moves open ->
-- corrected -> rechecked (or back to open) and keeps everything it said.
CREATE FUNCTION quality.punch_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  r record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'punch items are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  SELECT id, job_id, project_id, state, self_review INTO r FROM quality.reviews WHERE id = NEW.review_id;
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'open' OR NEW.version <> 1 THEN
      RAISE EXCEPTION 'a punch item is created open' USING ERRCODE = 'check_violation';
    END IF;
    IF (r.job_id, r.project_id) IS DISTINCT FROM (NEW.job_id, NEW.project_id) THEN
      RAISE EXCEPTION 'a punch item names its review''s job' USING ERRCODE = 'check_violation';
    END IF;
    IF r.state NOT IN ('in_review', 'punch_required', 'pending_recheck') THEN
      RAISE EXCEPTION 'a punch item is added while the review is worked' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT work.has_live_role(NEW.created_by, 'owner') THEN
      RAISE EXCEPTION 'only an Owner records a punch item' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT work.has_live_role(NEW.assigned_to, 'worker')
       OR NOT EXISTS (SELECT 1 FROM identity.staff_users WHERE id = NEW.assigned_to AND status = 'active') THEN
      RAISE EXCEPTION 'a punch item is assigned to an active worker' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.work_package_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM work.work_packages WHERE id = NEW.work_package_id AND project_id = NEW.project_id) THEN
      RAISE EXCEPTION 'a punch item names a work package of its own project' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.hold_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM work.holds WHERE id = NEW.hold_id AND kind = 'critical_safety' AND scope_type = 'job'
            AND scope_id = NEW.job_id AND state IN ('open', 'under_review')) THEN
      RAISE EXCEPTION 'a safety concern names the job''s unresolved critical safety hold'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.review_id, NEW.job_id, NEW.project_id, NEW.work_package_id, NEW.area, NEW.kind, NEW.severity,
      NEW.description, NEW.required_evidence, NEW.assigned_to, NEW.due_on, NEW.hold_id, NEW.created_by, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.review_id, OLD.job_id, OLD.project_id, OLD.work_package_id, OLD.area, OLD.kind, OLD.severity,
      OLD.description, OLD.required_evidence, OLD.assigned_to, OLD.due_on, OLD.hold_id, OLD.created_by, OLD.created_at)
  THEN
    RAISE EXCEPTION 'a punch item keeps what it says' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'a punch item change takes the next version' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT ((OLD.state, NEW.state) IN (('open', 'corrected'), ('corrected', 'rechecked'), ('corrected', 'open'))) THEN
    RAISE EXCEPTION 'a punch item moves % -> % only along its lifecycle', OLD.state, NEW.state
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.state = 'rechecked' THEN
    IF NOT work.has_live_role(NEW.rechecked_by, 'owner') THEN
      RAISE EXCEPTION 'only an Owner re-checks a punch item' USING ERRCODE = 'check_violation';
    END IF;
    -- The verifier is never the corrector (OWN-DEC-28), except on the Owner's own job (self-review, OWN-DEC-64).
    IF NEW.rechecked_by = OLD.corrected_by AND NOT r.self_review THEN
      RAISE EXCEPTION 'the re-check is not made by the person who corrected it' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.hold_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM work.holds WHERE id = NEW.hold_id AND state = 'resolved')
    THEN
      RAISE EXCEPTION 'a safety concern is re-checked once its safety hold is resolved' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER punch_items_guard BEFORE INSERT OR UPDATE OR DELETE ON quality.punch_items
  FOR EACH ROW EXECUTE FUNCTION quality.punch_item_guard();

-- Completion and closing follow the review (HH-QA-09, HH-QA-02).
CREATE FUNCTION quality.job_completion_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  r record;
BEGIN
  SELECT id, state INTO r FROM quality.reviews WHERE job_id = NEW.id;
  IF NEW.operational_state = 'operationally_complete' THEN
    IF OLD.operational_state <> 'ready_for_qa' OR r.state IS DISTINCT FROM 'passed' THEN
      RAISE EXCEPTION 'a job is operationally complete only when the Owner''s quality review passed'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.operational_state = 'closed' THEN
    IF r.state IS DISTINCT FROM 'passed' OR quality.unrechecked_items(r.id) > 0 THEN
      RAISE EXCEPTION 'a job closes only when every punch item passed re-check' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER jobs_completion_guard BEFORE UPDATE OF operational_state ON work.jobs
  FOR EACH ROW WHEN (NEW.operational_state IN ('operationally_complete', 'closed')
                     AND OLD.operational_state IS DISTINCT FROM NEW.operational_state)
  EXECUTE FUNCTION quality.job_completion_guard();

-- The review's answer for the final invoice (HH-QA-02, HH-FIN-05), and the gate of 0077 now giving it.
CREATE FUNCTION quality.review_gate(p_job uuid) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE
           WHEN r.id IS NULL OR r.state IN ('pending', 'in_review') THEN 'quality_review_not_recorded'
           WHEN r.state = 'passed' THEN 'passed'
           WHEN EXISTS (SELECT 1 FROM quality.punch_items p
                         WHERE p.review_id = r.id AND p.severity = 'major' AND p.state <> 'rechecked') THEN 'blocked'
           ELSE 'owner_may_issue'
         END
    FROM (SELECT 1) AS one LEFT JOIN quality.reviews r ON r.job_id = p_job
$$;
CREATE OR REPLACE FUNCTION finance.invoice_quality_gate(p_job uuid) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT quality.review_gate(p_job)
$$;
COMMENT ON FUNCTION finance.invoice_quality_gate(uuid) IS
  'Quality-review gate of a final invoice (HH-QA-02): quality.review_gate, the Owner''s review of the job.';

-- Staging reset (TSK-0141): test records cleared only by a permitted staging reset.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['quality.reviews', 'quality.punch_items', 'quality.review_events'] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE TRUNCATE ON %s FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) '
      'EXECUTE FUNCTION staging.reject_truncate()',
      split_part(t, '.', 2) || '_reset_only_truncate', t);
  END LOOP;
END;
$$;
