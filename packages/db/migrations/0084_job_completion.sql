-- 0084 Completion: the walkthrough and the worker's submission for the Owner's quality review (TSK-0083; HH-QA-01,
-- HH-QA-03, HH-WORK-12, T55, T47, ENT-Walkthrough, ENT-Job, ENT-Photo, FACT-SVC-PHOTO-MINIMUM, OWN-DEC-75, OWN-DEC-109,
-- OWN-DEC-64, RULE-SAFETY-GATES). The server decides who may act (apps/server/src/modules/completion); this migration
-- keeps the records true whatever path writes:
-- - work.walkthroughs: the end-of-job walkthrough, recorded by an assigned worker who started work on the job, with
--   one outcome: accepted ("Everything looks good"), accepted with follow-up items, disputed ("I have a concern") or
--   customer unavailable; the participant and their standing (the customer or an authorized representative) for every
--   outcome but customer unavailable, which never names one and is never acceptance (OWN-DEC-75). A disputed
--   walkthrough names the dispute case it opened for the Owner. Append-only: nobody edits it after.
-- - work.job_completions: the worker's Finished for the job, submitting it for the Owner's quality review. Written only
--   while the job is in progress with no open hold, by a worker who started work on it, with its walkthrough, and only
--   when every work package's checklist is complete (no required step open or skipped, TSK-0075) and every work
--   package has its before and after photos (FACT-SVC-PHOTO-MINIMUM). Append-only.
-- - work.jobs: a job moves to ready_for_qa ("Awaiting quality review") only in the transaction that wrote its
--   completion, and from in_progress only (never complete by itself, OWN-DEC-109).

-- Work packages of a job whose checklist is not complete: a required step not completed (open or skipped).
CREATE FUNCTION work.checklist_incomplete_packages(p_job uuid) RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT count(*)::integer
    FROM work.work_packages w
   WHERE w.job_id = p_job
     AND (w.sop_version_id IS NULL
          OR EXISTS (
            SELECT 1
              FROM catalog.sop_versions v,
                   jsonb_array_elements(v.content -> 'stages') s,
                   jsonb_array_elements(s -> 'items') i
             WHERE v.id = w.sop_version_id AND i ->> 'kind' = 'step' AND COALESCE((i ->> 'required')::boolean, true)
               AND NOT EXISTS (SELECT 1 FROM work.checklist_steps c
                                WHERE c.work_package_id = w.id AND c.step_id = i ->> 'id' AND c.state = 'completed')))
$$;

-- Work packages of a job missing a before or an after photo (one of each at the least, not rejected).
CREATE FUNCTION work.photo_incomplete_packages(p_job uuid) RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT count(*)::integer
    FROM work.work_packages w
   WHERE w.job_id = p_job
     AND (NOT EXISTS (SELECT 1 FROM work.field_photos f WHERE f.work_package_id = w.id AND f.job_id = p_job
                        AND f.phase = 'before' AND f.state <> 'rejected')
          OR NOT EXISTS (SELECT 1 FROM work.field_photos f WHERE f.work_package_id = w.id AND f.job_id = p_job
                           AND f.phase = 'after' AND f.state <> 'rejected'))
$$;

CREATE TABLE work.walkthroughs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           uuid NOT NULL,
  project_id       uuid NOT NULL,
  visit_id         uuid REFERENCES work.visits (id),
  outcome          text NOT NULL CHECK (outcome IN ('accepted', 'accepted_with_follow_up', 'disputed',
                     'customer_unavailable')),
  participant_name text CHECK (char_length(btrim(participant_name)) BETWEEN 1 AND 200),
  participant_role text CHECK (participant_role IN ('customer', 'authorized_representative')),
  comments         text CHECK (char_length(btrim(comments)) BETWEEN 1 AND 2000),
  -- The dispute case a disputed walkthrough opened for the Owner (TSK-0093).
  case_id          uuid REFERENCES quality.cases (id),
  worker_id        uuid NOT NULL REFERENCES identity.staff_users (id),
  recorded_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT walkthroughs_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id),
  -- Customer unavailable names nobody and is never acceptance; every other outcome names who took part.
  CONSTRAINT walkthroughs_participant CHECK (
    (outcome = 'customer_unavailable') = (participant_name IS NULL)
    AND (participant_name IS NULL) = (participant_role IS NULL)),
  CONSTRAINT walkthroughs_dispute CHECK ((outcome = 'disputed') = (case_id IS NOT NULL)),
  -- A concern or follow-up items say what they are.
  CONSTRAINT walkthroughs_comments CHECK (outcome NOT IN ('disputed', 'accepted_with_follow_up') OR comments IS NOT NULL)
);
CREATE INDEX walkthroughs_job ON work.walkthroughs (job_id, recorded_at);
CREATE TRIGGER walkthroughs_append_only BEFORE UPDATE OR DELETE ON work.walkthroughs
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE work.walkthroughs IS
  'End-of-job walkthroughs (ENT-Walkthrough): "customer unavailable" is never acceptance (OWN-DEC-75).';

CREATE FUNCTION work.walkthrough_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM work.work_starts WHERE job_id = NEW.job_id AND staff_user_id = NEW.worker_id) THEN
    RAISE EXCEPTION 'a walkthrough is recorded by a worker who started work on the job' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.visit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM work.visits WHERE id = NEW.visit_id AND job_id = NEW.job_id)
  THEN
    RAISE EXCEPTION 'a walkthrough names a visit of its own job' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.case_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM quality.cases WHERE id = NEW.case_id
                                               AND project_id = NEW.project_id AND kind = 'dispute') THEN
    RAISE EXCEPTION 'a disputed walkthrough names a dispute case of its own project' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER walkthroughs_check BEFORE INSERT ON work.walkthroughs
  FOR EACH ROW EXECUTE FUNCTION work.walkthrough_check();

CREATE TABLE work.job_completions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         uuid NOT NULL,
  project_id     uuid NOT NULL,
  walkthrough_id uuid NOT NULL UNIQUE REFERENCES work.walkthroughs (id),
  worker_id      uuid NOT NULL REFERENCES identity.staff_users (id),
  submitted_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_completions_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id)
);
CREATE INDEX job_completions_job ON work.job_completions (job_id, submitted_at);
CREATE TRIGGER job_completions_append_only BEFORE UPDATE OR DELETE ON work.job_completions
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE work.job_completions IS
  'The worker''s Finished for a job: submitted for the Owner''s quality review with its walkthrough (OWN-DEC-109).';

CREATE FUNCTION work.job_completion_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM work.jobs WHERE id = NEW.job_id AND operational_state = 'in_progress' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a job is submitted for quality review from in progress' USING ERRCODE = 'check_violation';
  END IF;
  IF work.start_blocking_holds(NEW.project_id) > 0 THEN
    RAISE EXCEPTION 'a job is not submitted while a hold is open' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM work.work_starts WHERE job_id = NEW.job_id AND staff_user_id = NEW.worker_id) THEN
    RAISE EXCEPTION 'a job is submitted by a worker who started work on it' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM work.walkthroughs WHERE id = NEW.walkthrough_id AND job_id = NEW.job_id) THEN
    RAISE EXCEPTION 'a job is submitted with its own walkthrough' USING ERRCODE = 'check_violation';
  END IF;
  IF work.checklist_incomplete_packages(NEW.job_id) > 0 THEN
    RAISE EXCEPTION 'a job is submitted with every required checklist step completed' USING ERRCODE = 'check_violation';
  END IF;
  IF work.photo_incomplete_packages(NEW.job_id) > 0 THEN
    RAISE EXCEPTION 'a job is submitted with before and after photos of every work package'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER job_completions_check BEFORE INSERT ON work.job_completions
  FOR EACH ROW EXECUTE FUNCTION work.job_completion_check();

-- Awaiting quality review only through a completion written in the same transaction, from in progress.
CREATE FUNCTION work.job_ready_for_qa_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.operational_state <> 'in_progress'
     OR NOT EXISTS (SELECT 1 FROM work.job_completions WHERE job_id = NEW.id AND xmin = pg_current_xact_id()::xid) THEN
    RAISE EXCEPTION 'a job awaits quality review only through the worker''s completion of it'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER jobs_ready_for_qa_guard BEFORE UPDATE OF operational_state ON work.jobs
  FOR EACH ROW WHEN (NEW.operational_state = 'ready_for_qa' AND OLD.operational_state IS DISTINCT FROM 'ready_for_qa')
  EXECUTE FUNCTION work.job_ready_for_qa_guard();

-- Staging reset (TSK-0141): test records cleared only by a permitted staging reset.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['work.walkthroughs', 'work.job_completions'] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE TRUNCATE ON %s FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) '
      'EXECUTE FUNCTION staging.reject_truncate()',
      split_part(t, '.', 2) || '_reset_only_truncate', t);
  END LOOP;
END;
$$;
