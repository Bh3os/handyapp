-- 0083 The job SOP checklist in six ordered stages and active execution (TSK-0075; HH-WORK-11, HH-WORK-05, HH-WORK-12,
-- HH-PKT-03, T47, ENT-Task, ENT-SOPVersion, ENT-WorkPackage, ENT-Photo, OWN-DEC-108, OWN-DEC-109, RULE-SAFETY-GATES,
-- RULE-NO-INVENTED-FACTS). The server decides who may act (apps/server/src/modules/checklist); this migration keeps the
-- records true whatever path writes:
-- - work.checklist_steps: the state of one step of a work package's pinned SOP version (ENT-Task), recorded the first
--   time a worker acts on it; a step with no row has not been started. The step, its stage, whether it is required and
--   the evidence it asks for are the SOP version's own (imported verbatim, TSK-0068): nothing here adds or reorders a
--   step. States: in_progress <-> paused, in_progress -> completed, skipped with a reason, and completed or skipped ->
--   in_progress again when reopened with a reason (the earlier evidence stays on the row and in the history).
--   A step of stage N starts only once every step of the earlier stages is completed or skipped (stage order,
--   HH-WORK-11). Completing records every evidence kind the step asks for: a field photo of the same job and work
--   package (not rejected), a measurement, a note. Every write names the worker, who started work on the job through
--   the Start Work gate; and nothing is written while the job is not in progress, the work package is not in progress
--   (blocked by a hazard report, for example) or a review, job-level or critical safety hold is open on the project
--   (RULE-SAFETY-GATES: the checklist never runs past a hold).
-- - work.checklist_step_events: every change of a step with its worker, evidence, reason and time (append-only).
-- - work.checklist_handoffs: a worker's handoff note on the job (to another worker or to whoever continues), append-only.

-- The step of a pinned SOP version, as imported: its stage, whether it is required and its evidence kinds.
CREATE FUNCTION work.sop_step(p_version uuid, p_step text)
RETURNS TABLE (stage smallint, required boolean, evidence text[]) LANGUAGE sql STABLE AS $$
  SELECT (s ->> 'stage')::smallint,
         COALESCE((i ->> 'required')::boolean, true),
         ARRAY(SELECT jsonb_array_elements_text(COALESCE(i -> 'evidence', '[]'::jsonb)))
    FROM catalog.sop_versions v,
         jsonb_array_elements(v.content -> 'stages') s,
         jsonb_array_elements(s -> 'items') i
   WHERE v.id = p_version AND i ->> 'kind' = 'step' AND i ->> 'id' = p_step
$$;

CREATE TABLE work.checklist_steps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          uuid NOT NULL,
  project_id      uuid NOT NULL,
  work_package_id uuid NOT NULL REFERENCES work.work_packages (id),
  sop_version_id  uuid NOT NULL REFERENCES catalog.sop_versions (id),
  -- `<stage>.<n>` as in the SOP version's content.
  step_id         text NOT NULL CHECK (step_id ~ '^[1-6]\.[0-9]{1,3}$'),
  stage           smallint NOT NULL CHECK (stage BETWEEN 1 AND 6),
  required        boolean NOT NULL,
  evidence        text[] NOT NULL CHECK (evidence <@ ARRAY['photo', 'measurement', 'note']),
  state           text NOT NULL CHECK (state IN ('in_progress', 'paused', 'completed', 'skipped')),
  -- The evidence recorded with the step (kept when it is reopened; the history keeps every earlier value).
  measurement     text CHECK (char_length(btrim(measurement)) BETWEEN 1 AND 200),
  note            text CHECK (char_length(btrim(note)) BETWEEN 1 AND 2000),
  photo_ids       uuid[] NOT NULL DEFAULT '{}' CHECK (cardinality(photo_ids) <= 20),
  skip_reason     text CHECK (char_length(btrim(skip_reason)) BETWEEN 1 AND 1000),
  -- The worker who last acted on the step, and who completed it.
  worker_id       uuid NOT NULL REFERENCES identity.staff_users (id),
  completed_by    uuid REFERENCES identity.staff_users (id),
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (work_package_id, step_id),
  CONSTRAINT checklist_steps_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id),
  CONSTRAINT checklist_steps_completed CHECK (
    (state = 'completed') = (completed_at IS NOT NULL) AND (completed_at IS NULL) = (completed_by IS NULL)),
  CONSTRAINT checklist_steps_skipped CHECK (state <> 'skipped' OR skip_reason IS NOT NULL)
);
CREATE INDEX checklist_steps_job ON work.checklist_steps (job_id, work_package_id, stage);
COMMENT ON TABLE work.checklist_steps IS
  'The job checklist (ENT-Task): the state of each step of a work package''s pinned SOP version, with its evidence.';

-- How many steps of the version's stages before p_stage there are, and how many of them the work package has
-- completed or skipped.
CREATE FUNCTION work.earlier_steps_open(p_package uuid, p_version uuid, p_stage smallint) RETURNS integer
LANGUAGE sql STABLE AS $$
  SELECT (SELECT count(*)::integer
            FROM catalog.sop_versions v,
                 jsonb_array_elements(v.content -> 'stages') s,
                 jsonb_array_elements(s -> 'items') i
           WHERE v.id = p_version AND i ->> 'kind' = 'step' AND (s ->> 'stage')::smallint < p_stage)
       - (SELECT count(*)::integer FROM work.checklist_steps
           WHERE work_package_id = p_package AND stage < p_stage AND state IN ('completed', 'skipped'))
$$;

CREATE FUNCTION work.checklist_step_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  wp record;
  def record;
  job_state text;
  bad integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'checklist steps are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.version <> 1 OR NEW.state = 'paused' THEN
      RAISE EXCEPTION 'a checklist step is first recorded started, completed or skipped' USING ERRCODE = 'check_violation';
    END IF;
    SELECT job_id, project_id, sop_version_id INTO wp FROM work.work_packages WHERE id = NEW.work_package_id;
    IF (wp.job_id, wp.project_id, wp.sop_version_id) IS DISTINCT FROM (NEW.job_id, NEW.project_id, NEW.sop_version_id)
    THEN
      RAISE EXCEPTION 'a checklist step is a step of its work package''s pinned SOP version'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO def FROM work.sop_step(NEW.sop_version_id, NEW.step_id);
    IF NOT FOUND OR (def.stage, def.required, def.evidence) IS DISTINCT FROM (NEW.stage, NEW.required, NEW.evidence) THEN
      RAISE EXCEPTION 'a checklist step keeps its SOP step''s stage, requirement and evidence'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF (NEW.id, NEW.job_id, NEW.project_id, NEW.work_package_id, NEW.sop_version_id, NEW.step_id, NEW.stage,
        NEW.required, NEW.evidence, NEW.created_at)
       IS DISTINCT FROM (OLD.id, OLD.job_id, OLD.project_id, OLD.work_package_id, OLD.sop_version_id, OLD.step_id,
        OLD.stage, OLD.required, OLD.evidence, OLD.created_at) THEN
      RAISE EXCEPTION 'a checklist step keeps its step' USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.version <> OLD.version + 1 THEN
      RAISE EXCEPTION 'a checklist step change takes the next version' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT ((OLD.state, NEW.state) IN (('in_progress', 'paused'), ('paused', 'in_progress'),
            ('in_progress', 'completed'), ('in_progress', 'skipped'), ('paused', 'skipped'),
            ('completed', 'in_progress'), ('skipped', 'in_progress'))) THEN
      RAISE EXCEPTION 'a checklist step moves % -> % only along its lifecycle', OLD.state, NEW.state
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  -- The checklist runs only on a job in progress, a work package in progress, with no hold that stops work.
  SELECT operational_state INTO job_state FROM work.jobs WHERE id = NEW.job_id FOR SHARE;
  IF job_state IS DISTINCT FROM 'in_progress'
     OR NOT EXISTS (SELECT 1 FROM work.work_packages WHERE id = NEW.work_package_id AND state = 'in_progress')
     OR work.start_blocking_holds(NEW.project_id) > 0 THEN
    RAISE EXCEPTION 'the checklist runs only while the job and its work package are in progress and no hold is open'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM work.work_starts WHERE job_id = NEW.job_id AND staff_user_id = NEW.worker_id) THEN
    RAISE EXCEPTION 'a checklist step is recorded by a worker who started work on the job' USING ERRCODE = 'check_violation';
  END IF;
  -- Stage order: a step moves forward only once every step of the earlier stages is completed or skipped.
  IF NEW.state IN ('in_progress', 'completed') AND work.earlier_steps_open(NEW.work_package_id, NEW.sop_version_id,
                                                                           NEW.stage) > 0 THEN
    RAISE EXCEPTION 'stage % opens once every step of the earlier stages is completed or skipped', NEW.stage
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.state = 'completed' THEN
    IF ('photo' = ANY (NEW.evidence) AND cardinality(NEW.photo_ids) = 0)
       OR ('measurement' = ANY (NEW.evidence) AND NEW.measurement IS NULL)
       OR ('note' = ANY (NEW.evidence) AND NEW.note IS NULL) THEN
      RAISE EXCEPTION 'a step is completed with every evidence it asks for' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF cardinality(NEW.photo_ids) > 0 THEN
    SELECT count(*) INTO bad FROM unnest(NEW.photo_ids) AS p(id)
     WHERE NOT EXISTS (SELECT 1 FROM work.field_photos f WHERE f.id = p.id AND f.job_id = NEW.job_id
                         AND f.work_package_id = NEW.work_package_id AND f.state <> 'rejected');
    IF bad > 0 THEN
      RAISE EXCEPTION 'a step''s photos are field photos of its own job and work package' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER checklist_steps_guard BEFORE INSERT OR UPDATE OR DELETE ON work.checklist_steps
  FOR EACH ROW EXECUTE FUNCTION work.checklist_step_guard();

CREATE TABLE work.checklist_step_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The order of events: several may be written in one transaction, at the same time.
  seq         bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  step_row_id uuid NOT NULL REFERENCES work.checklist_steps (id),
  event       text NOT NULL CHECK (event IN ('start', 'pause', 'resume', 'complete', 'skip', 'reopen')),
  from_state  text,
  to_state    text NOT NULL,
  worker_id   uuid NOT NULL REFERENCES identity.staff_users (id),
  measurement text,
  note        text,
  photo_ids   uuid[] NOT NULL DEFAULT '{}',
  reason      text CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000),
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX checklist_step_events_step ON work.checklist_step_events (step_row_id, seq);
CREATE TRIGGER checklist_step_events_append_only BEFORE UPDATE OR DELETE ON work.checklist_step_events
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();

CREATE TABLE work.checklist_handoffs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          uuid NOT NULL,
  project_id      uuid NOT NULL,
  work_package_id uuid REFERENCES work.work_packages (id),
  from_worker     uuid NOT NULL REFERENCES identity.staff_users (id),
  -- The worker who continues, when known.
  to_worker       uuid REFERENCES identity.staff_users (id),
  note            text NOT NULL CHECK (char_length(btrim(note)) BETWEEN 1 AND 2000),
  at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT checklist_handoffs_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id),
  CONSTRAINT checklist_handoffs_other CHECK (to_worker IS DISTINCT FROM from_worker)
);
CREATE INDEX checklist_handoffs_job ON work.checklist_handoffs (job_id, at);
CREATE TRIGGER checklist_handoffs_append_only BEFORE UPDATE OR DELETE ON work.checklist_handoffs
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
CREATE FUNCTION work.checklist_handoff_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM work.work_starts WHERE job_id = NEW.job_id AND staff_user_id = NEW.from_worker) THEN
    RAISE EXCEPTION 'a handoff is written by a worker who started work on the job' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.work_package_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM work.work_packages WHERE id = NEW.work_package_id AND job_id = NEW.job_id) THEN
    RAISE EXCEPTION 'a handoff names a work package of its own job' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.to_worker IS NOT NULL AND NOT work.has_live_role(NEW.to_worker, 'worker') THEN
    RAISE EXCEPTION 'a handoff goes to a worker' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER checklist_handoffs_check BEFORE INSERT ON work.checklist_handoffs
  FOR EACH ROW EXECUTE FUNCTION work.checklist_handoff_check();

-- Staging reset (TSK-0141): test records cleared only by a permitted staging reset.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['work.checklist_steps', 'work.checklist_step_events', 'work.checklist_handoffs'] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE TRUNCATE ON %s FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) '
      'EXECUTE FUNCTION staging.reject_truncate()',
      split_part(t, '.', 2) || '_reset_only_truncate', t);
  END LOOP;
END;
$$;
