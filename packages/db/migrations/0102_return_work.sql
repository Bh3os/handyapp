-- 0102 Return work and resuming after an incident (TSK-0094; HH-QA-07, HH-QA-08, HH-INC-03, HH-FIN-17, T54, T56,
-- ENT-Case, ENT-Visit, ENT-Job, ENT-Hold, ENT-JobPacket, ENT-Acknowledgment, FACT-WARRANTY, OWN-DEC-38, OWN-DEC-124,
-- OWN-DEC-135, RULE-HUMAN-REVIEW, RULE-MONEY-CENTS, RULE-SAFETY-GATES). The server decides who may do what
-- (apps/server/src/modules/return-work and apps/server/src/modules/start); this migration keeps the records true
-- whatever path writes:
-- - quality.return_work: the classification of one case's return work (HH-QA-07's seven classes), on the case's own
--   project and job. The warranty window is stored as the server computed it from the reviewed completion date (the
--   local date the Owner's quality review passed) and the report date, and the database checks the one decided rule:
--   inside 90 days (FACT-WARRANTY, OWN-DEC-135) a workmanship problem is a warranty claim, after it a workmanship
--   callback. Coverage and price are the Owner's decision (RULE-HUMAN-REVIEW): no column holds an exclusion, an amount
--   or a coverage the software applied. A linked return job is a job of another project of the same customer.
-- - quality.return_work_visits: the return visits (purpose return_work) of the case's job linked to its return work.
-- - quality.return_work_items: the return-visit punch items, `open -> corrected -> rechecked` (and back to open when a
--   re-check fails); re-checked by an Owner who did not correct the item. They are never punch items of the job's
--   passed quality review, which stays as it was.
-- - quality.return_work_costs: return-work costs in integer cents, apart from the original job's (HH-FIN-17); an entry
--   is voided once with a reason, never changed or deleted.
-- - quality.return_work_events: the history of every change, append-only.
-- - Closing a case with return work needs the Owner's coverage and price decision and every item re-checked.
-- - work.work_resumptions: resuming after an incident (HH-INC-03): one per worker per pause, naming a ready Start Work
--   evaluation of the same transaction (purpose resume), on an arrived visit the worker is assigned to, with no
--   blocking hold, by a worker who started work on the job before the pause. work.job_start_guard() now accepts a
--   resumption as well as a start, so a paused job moves back to in_progress only through the gate. After a pause, the
--   checklist, the walkthrough and Finished are written only by a worker who started or resumed since.
-- Nothing here raises, releases or weakens a hold (RULE-SAFETY-GATES): the hold is released through its own path (0074).

-- Return work ------------------------------------------------------------------------------------------------------
CREATE TABLE quality.return_work (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id                uuid NOT NULL UNIQUE REFERENCES quality.cases (id),
  project_id             uuid NOT NULL,
  -- The original job: its completion evidence, review and costs are never changed by return work (HH-QA-08).
  job_id                 uuid NOT NULL,
  classification         text NOT NULL CHECK (classification IN ('open_punch', 'workmanship_callback', 'warranty_claim',
                           'new_scope', 'customer_change_or_damage', 'product_issue', 'unresolved')),
  -- The warranty window as the server computed it in the business time zone (FACT-WARRANTY).
  reviewed_completion_on date,
  reported_on            date NOT NULL,
  within_warranty        boolean,
  classification_note    text CHECK (char_length(btrim(classification_note)) BETWEEN 1 AND 1000),
  classified_by          uuid NOT NULL REFERENCES identity.staff_users (id),
  classified_at          timestamptz NOT NULL DEFAULT now(),
  -- The Owner's decision (RULE-HUMAN-REVIEW): coverage and price, with the note saying why. No amount: chargeable
  -- work is priced through its own estimate or change order (RULE-NO-INVENTED-FACTS).
  coverage               text CHECK (coverage IN ('covered', 'not_covered')),
  price                  text CHECK (price IN ('no_charge', 'chargeable')),
  decision_note          text CHECK (char_length(btrim(decision_note)) BETWEEN 1 AND 1000),
  decided_by             uuid REFERENCES identity.staff_users (id),
  decided_at             timestamptz,
  return_job_id          uuid REFERENCES work.jobs (id),
  version                integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT return_work_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id),
  -- FACT-WARRANTY: inside the 90 days after the reviewed completion date (inclusive), a workmanship problem is a
  -- warranty claim; after them, a workmanship callback; with no reviewed completion, neither.
  CONSTRAINT return_work_window CHECK (
    within_warranty IS NOT DISTINCT FROM (CASE WHEN reviewed_completion_on IS NULL THEN NULL
      ELSE reported_on BETWEEN reviewed_completion_on AND reviewed_completion_on + 90 END)),
  CONSTRAINT return_work_warranty CHECK (
    (classification <> 'warranty_claim' OR within_warranty IS TRUE)
    AND (classification <> 'workmanship_callback' OR within_warranty IS FALSE)),
  CONSTRAINT return_work_decision CHECK (
    (decided_at IS NULL) = (decided_by IS NULL) AND (decided_at IS NULL) = (coverage IS NULL)
    AND (decided_at IS NULL) = (price IS NULL) AND (decided_at IS NULL) = (decision_note IS NULL)),
  CONSTRAINT return_work_other_job CHECK (return_job_id IS DISTINCT FROM job_id)
);
CREATE INDEX return_work_job_idx ON quality.return_work (job_id);
COMMENT ON TABLE quality.return_work IS
  'Return work of a case (HH-QA-07): classified by people; coverage and price decided by the Owner, never applied.';

-- A return work record names its case's project and job; keeps them; takes the next version; is decided only by an
-- Owner; links a return job only of another project of the same customer; changes only while its case is open.
CREATE FUNCTION quality.return_work_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  c record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'return work is kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  SELECT project_id, job_id, state INTO c FROM quality.cases WHERE id = NEW.case_id;
  IF NOT FOUND OR c.project_id <> NEW.project_id OR (c.job_id IS NOT NULL AND c.job_id <> NEW.job_id) THEN
    RAISE EXCEPTION 'return work is on its case''s project and job' USING ERRCODE = 'check_violation';
  END IF;
  IF c.state = 'closed' THEN
    RAISE EXCEPTION 'the return work of a closed case does not change' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.version <> 1 THEN
      RAISE EXCEPTION 'return work starts at version 1' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF (NEW.id, NEW.case_id, NEW.project_id, NEW.job_id) IS DISTINCT FROM (OLD.id, OLD.case_id, OLD.project_id, OLD.job_id)
    THEN
      RAISE EXCEPTION 'return work keeps its case and job' USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.version <> OLD.version + 1 THEN
      RAISE EXCEPTION 'a return work change takes the next version' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.decided_by IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.decided_at IS DISTINCT FROM OLD.decided_at)
     AND NOT work.has_live_role(NEW.decided_by, 'owner') THEN
    RAISE EXCEPTION 'only an Owner decides coverage and price' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.return_job_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM work.jobs j
       JOIN crm.projects p ON p.id = j.project_id
       JOIN crm.projects o ON o.id = NEW.project_id
       WHERE j.id = NEW.return_job_id AND p.id <> o.id AND p.customer_id = o.customer_id) THEN
    RAISE EXCEPTION 'a return job is a job of another project of the same customer' USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER return_work_guard BEFORE INSERT OR UPDATE OR DELETE ON quality.return_work
  FOR EACH ROW EXECUTE FUNCTION quality.return_work_guard();

-- Return visits ------------------------------------------------------------------------------------------------------
CREATE TABLE quality.return_work_visits (
  visit_id       uuid PRIMARY KEY REFERENCES work.visits (id),
  return_work_id uuid NOT NULL REFERENCES quality.return_work (id),
  linked_by      uuid NOT NULL REFERENCES identity.staff_users (id),
  linked_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX return_work_visits_work ON quality.return_work_visits (return_work_id, linked_at);
CREATE TRIGGER return_work_visits_append_only BEFORE UPDATE OR DELETE ON quality.return_work_visits
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
CREATE FUNCTION quality.return_work_visit_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM work.visits v JOIN quality.return_work r ON r.id = NEW.return_work_id
                 WHERE v.id = NEW.visit_id AND v.purpose = 'return_work' AND v.job_id = r.job_id) THEN
    RAISE EXCEPTION 'a return visit is a return_work visit of the original job' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER return_work_visits_check BEFORE INSERT ON quality.return_work_visits
  FOR EACH ROW EXECUTE FUNCTION quality.return_work_visit_check();
COMMENT ON TABLE quality.return_work_visits IS
  'Return visits (purpose return_work) of the original job, linked to their return work (HH-QA-08).';

-- Return-visit punch items -------------------------------------------------------------------------------------------
CREATE TABLE quality.return_work_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_work_id    uuid NOT NULL REFERENCES quality.return_work (id),
  job_id            uuid NOT NULL,
  project_id        uuid NOT NULL,
  work_package_id   uuid REFERENCES work.work_packages (id),
  area              text CHECK (char_length(btrim(area)) BETWEEN 1 AND 120),
  description       text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 1000),
  required_evidence text NOT NULL CHECK (char_length(btrim(required_evidence)) BETWEEN 1 AND 500),
  assigned_to       uuid NOT NULL REFERENCES identity.staff_users (id),
  due_on            date NOT NULL,
  state             text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'corrected', 'rechecked')),
  created_by        uuid NOT NULL REFERENCES identity.staff_users (id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  correction_note   text CHECK (char_length(btrim(correction_note)) BETWEEN 1 AND 1000),
  corrected_by      uuid REFERENCES identity.staff_users (id),
  corrected_at      timestamptz,
  -- The return visit the correction was recorded on.
  corrected_on_visit uuid REFERENCES work.visits (id),
  recheck_note      text CHECK (char_length(btrim(recheck_note)) BETWEEN 1 AND 1000),
  rechecked_by      uuid REFERENCES identity.staff_users (id),
  rechecked_at      timestamptz,
  version           integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT return_work_items_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id),
  CONSTRAINT return_work_items_place CHECK (work_package_id IS NOT NULL OR area IS NOT NULL),
  CONSTRAINT return_work_items_corrected CHECK (
    (state = 'open') = (corrected_at IS NULL) AND (corrected_at IS NULL) = (corrected_by IS NULL)
    AND (corrected_at IS NULL) = (correction_note IS NULL) AND (corrected_at IS NULL) = (corrected_on_visit IS NULL)),
  CONSTRAINT return_work_items_rechecked CHECK (
    (state = 'rechecked') = (rechecked_at IS NOT NULL) AND (rechecked_at IS NULL) = (rechecked_by IS NULL)
    AND (rechecked_at IS NULL) = (recheck_note IS NULL)),
  CONSTRAINT return_work_items_verifier CHECK (rechecked_by IS DISTINCT FROM corrected_by OR rechecked_by IS NULL)
);
CREATE INDEX return_work_items_work ON quality.return_work_items (return_work_id, state);
CREATE INDEX return_work_items_assignee ON quality.return_work_items (assigned_to, state);
COMMENT ON TABLE quality.return_work_items IS
  'Return-visit punch items (OWN-DEC-135, OWN-DEC-124): corrected on a return visit, re-checked by an Owner.';

-- An item is created open on its return work's job (a work package of that job, if named); afterwards it keeps what
-- it says and moves only open -> corrected -> rechecked, or corrected -> open when its re-check fails. The re-check is
-- an Owner's. Items are never deleted.
CREATE FUNCTION quality.return_work_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'return-visit punch items are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'open' OR NEW.version <> 1 THEN
      RAISE EXCEPTION 'a return-visit punch item is created open' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM quality.return_work r JOIN quality.cases c ON c.id = r.case_id
                   WHERE r.id = NEW.return_work_id AND r.job_id = NEW.job_id AND c.state <> 'closed') THEN
      RAISE EXCEPTION 'a return-visit punch item is on its open return work''s job' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.work_package_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM work.work_packages WHERE id = NEW.work_package_id AND job_id = NEW.job_id) THEN
      RAISE EXCEPTION 'a return-visit punch item names a work package of its job' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.return_work_id, NEW.job_id, NEW.project_id, NEW.work_package_id, NEW.area, NEW.description,
      NEW.required_evidence, NEW.assigned_to, NEW.due_on, NEW.created_by, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.return_work_id, OLD.job_id, OLD.project_id, OLD.work_package_id, OLD.area,
      OLD.description, OLD.required_evidence, OLD.assigned_to, OLD.due_on, OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'a return-visit punch item keeps what it says' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.version <> OLD.version + 1
     OR NOT ((OLD.state, NEW.state) IN (('open', 'corrected'), ('corrected', 'rechecked'), ('corrected', 'open'))) THEN
    RAISE EXCEPTION 'a return-visit punch item moves % -> % only along its lifecycle', OLD.state, NEW.state
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.state = 'corrected' AND NOT EXISTS (
       SELECT 1 FROM quality.return_work_visits l JOIN work.visits v ON v.id = l.visit_id
       WHERE l.visit_id = NEW.corrected_on_visit AND l.return_work_id = NEW.return_work_id) THEN
    RAISE EXCEPTION 'a correction is recorded on a linked return visit' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.state = 'rechecked' AND NOT work.has_live_role(NEW.rechecked_by, 'owner') THEN
    RAISE EXCEPTION 'an Owner re-checks a return-visit punch item' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER return_work_items_guard BEFORE INSERT OR UPDATE OR DELETE ON quality.return_work_items
  FOR EACH ROW EXECUTE FUNCTION quality.return_work_item_guard();

-- Return-work costs (integer cents, RULE-MONEY-CENTS) ----------------------------------------------------------------
CREATE TABLE quality.return_work_costs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_work_id uuid NOT NULL REFERENCES quality.return_work (id),
  kind           text NOT NULL CHECK (kind IN ('materials', 'purchase', 'rental', 'other')),
  amount_cents   integer NOT NULL CHECK (amount_cents BETWEEN 1 AND 10000000),
  note           text NOT NULL CHECK (char_length(btrim(note)) BETWEEN 1 AND 500),
  recorded_by    uuid NOT NULL REFERENCES identity.staff_users (id),
  recorded_at    timestamptz NOT NULL DEFAULT now(),
  void_reason    text CHECK (char_length(btrim(void_reason)) BETWEEN 1 AND 500),
  voided_by      uuid REFERENCES identity.staff_users (id),
  voided_at      timestamptz,
  CONSTRAINT return_work_costs_void CHECK (
    (voided_at IS NULL) = (voided_by IS NULL) AND (voided_at IS NULL) = (void_reason IS NULL))
);
CREATE INDEX return_work_costs_work ON quality.return_work_costs (return_work_id, recorded_at);
CREATE FUNCTION quality.return_work_cost_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'return-work costs are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.voided_at IS NOT NULL THEN
      RAISE EXCEPTION 'a return-work cost is recorded unvoided' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.voided_at IS NOT NULL OR NEW.voided_at IS NULL
     OR (NEW.id, NEW.return_work_id, NEW.kind, NEW.amount_cents, NEW.note, NEW.recorded_by, NEW.recorded_at)
        IS DISTINCT FROM (OLD.id, OLD.return_work_id, OLD.kind, OLD.amount_cents, OLD.note, OLD.recorded_by,
        OLD.recorded_at) THEN
    RAISE EXCEPTION 'a return-work cost is only voided, once, with a reason' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER return_work_costs_guard BEFORE INSERT OR UPDATE OR DELETE ON quality.return_work_costs
  FOR EACH ROW EXECUTE FUNCTION quality.return_work_cost_guard();
COMMENT ON TABLE quality.return_work_costs IS
  'Return-work costs in integer cents, apart from the original job''s (HH-FIN-17); voided once, never changed.';

-- History ------------------------------------------------------------------------------------------------------------
CREATE TABLE quality.return_work_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq            bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  return_work_id uuid NOT NULL REFERENCES quality.return_work (id),
  event          text NOT NULL CHECK (event ~ '^[a-z_]{1,40}$'),
  -- The item, visit, job or cost the event is about, when it is about one.
  subject_id     uuid,
  actor_id       uuid NOT NULL REFERENCES identity.staff_users (id),
  note           text CHECK (char_length(btrim(note)) BETWEEN 1 AND 1000),
  at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX return_work_events_work ON quality.return_work_events (return_work_id, seq);
CREATE TRIGGER return_work_events_append_only BEFORE UPDATE OR DELETE ON quality.return_work_events
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();

-- A case with return work closes only with the Owner's decision and every return-visit punch item re-checked.
CREATE FUNCTION quality.case_return_work_close_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM quality.return_work WHERE case_id = NEW.id AND decided_at IS NULL) THEN
    RAISE EXCEPTION 'a case closes only once the Owner decided its return work''s coverage and price'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM quality.return_work r JOIN quality.return_work_items i ON i.return_work_id = r.id
             WHERE r.case_id = NEW.id AND i.state <> 'rechecked') THEN
    RAISE EXCEPTION 'a case closes only with every return-visit punch item re-checked' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cases_return_work_close BEFORE UPDATE OF state ON quality.cases
  FOR EACH ROW WHEN (NEW.state = 'closed' AND OLD.state IS DISTINCT FROM 'closed')
  EXECUTE FUNCTION quality.case_return_work_close_check();

-- Resuming after an incident -----------------------------------------------------------------------------------------
ALTER TABLE work.start_gate_evaluations
  ADD COLUMN purpose text NOT NULL DEFAULT 'start' CHECK (purpose IN ('start', 'resume'));

-- The latest pause of a job by a hazard report (null: never paused).
CREATE FUNCTION work.latest_pause(p_job uuid) RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT max(reported_at) FROM work.issue_reports WHERE job_id = p_job AND job_paused
$$;

CREATE TABLE work.work_resumptions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            uuid NOT NULL,
  project_id        uuid NOT NULL,
  visit_id          uuid NOT NULL REFERENCES work.visits (id),
  staff_user_id     uuid NOT NULL REFERENCES identity.staff_users (id),
  evaluation_id     uuid NOT NULL UNIQUE REFERENCES work.start_gate_evaluations (id),
  packet_version    integer NOT NULL CHECK (packet_version >= 1),
  acknowledgment_id uuid NOT NULL REFERENCES work.job_packet_acknowledgments (id),
  exception_ids     uuid[] NOT NULL DEFAULT '{}',
  job_state_before  text NOT NULL CHECK (job_state_before IN ('paused', 'in_progress')),
  -- The pause this resumes from: the latest hazard report that paused the job.
  paused_at         timestamptz NOT NULL,
  resumed_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_user_id, job_id, paused_at),
  CONSTRAINT work_resumptions_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id)
);
CREATE INDEX work_resumptions_job ON work.work_resumptions (job_id, resumed_at);
CREATE TRIGGER work_resumptions_append_only BEFORE UPDATE OR DELETE ON work.work_resumptions
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE work.work_resumptions IS
  'Resuming after an incident (HH-INC-03): one per worker per pause, through a passing Start Work gate.';

-- A resumption names a ready resume evaluation of its own transaction, job, visit and worker; resumes from the job's
-- latest pause; the worker is assigned to the arrived visit and started work on the job before the pause; no hard hold
-- blocks; every exception it names is approved for this visit.
CREATE FUNCTION work.work_resumption_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  job_state text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM work.start_gate_evaluations e
                 WHERE e.id = NEW.evaluation_id AND e.outcome = 'ready' AND e.purpose = 'resume'
                   AND e.job_id = NEW.job_id AND e.visit_id = NEW.visit_id AND e.staff_user_id = NEW.staff_user_id
                   AND e.packet_version = NEW.packet_version AND e.acknowledgment_id = NEW.acknowledgment_id
                   AND e.exception_ids = NEW.exception_ids
                   AND e.xmin = pg_current_xact_id()::xid) THEN
    RAISE EXCEPTION 'work resumes only with a passing resume evaluation of the same transaction'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM work.visits WHERE id = NEW.visit_id AND job_id = NEW.job_id AND state = 'arrived') THEN
    RAISE EXCEPTION 'work resumes on an arrived visit of its own job' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT work.assigned_to_visit(NEW.visit_id, NEW.staff_user_id) THEN
    RAISE EXCEPTION 'only a worker assigned to the visit resumes work' USING ERRCODE = 'check_violation';
  END IF;
  -- The job's row lock: a hazard report and its critical hold commit strictly before or after this resumption.
  SELECT operational_state INTO job_state FROM work.jobs WHERE id = NEW.job_id FOR UPDATE;
  IF job_state IS DISTINCT FROM NEW.job_state_before OR job_state NOT IN ('paused', 'in_progress') THEN
    RAISE EXCEPTION 'work resumes on a paused job or one already resumed' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.paused_at IS DISTINCT FROM work.latest_pause(NEW.job_id) THEN
    RAISE EXCEPTION 'work resumes from the job''s latest pause' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM work.work_starts WHERE job_id = NEW.job_id AND staff_user_id = NEW.staff_user_id
                   AND started_at < NEW.paused_at) THEN
    RAISE EXCEPTION 'work resumes by a worker who started work on the job before the pause'
      USING ERRCODE = 'check_violation';
  END IF;
  IF work.start_blocking_holds(NEW.project_id) > 0 THEN
    RAISE EXCEPTION 'work cannot resume while a review, job-level or critical safety hold is open on its project'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(NEW.exception_ids) x
             WHERE NOT EXISTS (SELECT 1 FROM work.gate_exceptions g
                               WHERE g.id = x AND g.state = 'approved' AND g.visit_id = NEW.visit_id
                                 AND g.expires_at > now())) THEN
    RAISE EXCEPTION 'a resumption names only exceptions approved for its visit' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER work_resumptions_check BEFORE INSERT ON work.work_resumptions
  FOR EACH ROW EXECUTE FUNCTION work.work_resumption_check();

-- A job and a work package move to in_progress only in a transaction that recorded a work start or a resumption of the
-- job, and never while a hard hold blocks (0074, now with the resumption).
CREATE OR REPLACE FUNCTION work.job_start_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  j uuid := (to_jsonb(NEW) ->> CASE TG_TABLE_NAME WHEN 'jobs' THEN 'id' ELSE 'job_id' END)::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM work.work_starts WHERE job_id = j AND xmin = pg_current_xact_id()::xid)
     AND NOT EXISTS (SELECT 1 FROM work.work_resumptions WHERE job_id = j AND xmin = pg_current_xact_id()::xid) THEN
    RAISE EXCEPTION '% % moves to in_progress only through the Start Work gate', TG_TABLE_NAME, NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF work.start_blocking_holds(NEW.project_id) > 0 THEN
    RAISE EXCEPTION '% % cannot start while a review, job-level or critical safety hold is open', TG_TABLE_NAME, NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- After a pause, a worker acts on the job again only once they started or resumed through the gate since it.
CREATE FUNCTION work.worker_current_on_job(p_job uuid, p_staff uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT work.latest_pause(p_job) IS NULL
    OR EXISTS (SELECT 1 FROM work.work_starts WHERE job_id = p_job AND staff_user_id = p_staff
                 AND started_at > work.latest_pause(p_job))
    OR EXISTS (SELECT 1 FROM work.work_resumptions WHERE job_id = p_job AND staff_user_id = p_staff
                 AND resumed_at > work.latest_pause(p_job))
$$;
CREATE FUNCTION work.worker_current_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT work.worker_current_on_job(NEW.job_id, NEW.worker_id) THEN
    RAISE EXCEPTION 'after a pause, % is written only by a worker who resumed through the Start Work gate',
      TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER checklist_steps_worker_current BEFORE INSERT OR UPDATE ON work.checklist_steps
  FOR EACH ROW EXECUTE FUNCTION work.worker_current_check();
CREATE TRIGGER walkthroughs_worker_current BEFORE INSERT ON work.walkthroughs
  FOR EACH ROW EXECUTE FUNCTION work.worker_current_check();
CREATE TRIGGER job_completions_worker_current BEFORE INSERT ON work.job_completions
  FOR EACH ROW EXECUTE FUNCTION work.worker_current_check();

-- Staging reset (TSK-0141): these are test records with no TRUNCATE guard of their own; only a permitted staging reset
-- clears them.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['quality.return_work', 'quality.return_work_visits', 'quality.return_work_items',
                           'quality.return_work_costs', 'quality.return_work_events', 'work.work_resumptions'] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE TRUNCATE ON %s FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) '
      'EXECUTE FUNCTION staging.reject_truncate()',
      split_part(t, '.', 2) || '_reset_only_truncate', t);
  END LOOP;
END;
$$;
