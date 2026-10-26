-- 0109 Estimated versus actual job costs (TSK-0095; HH-FIN-17, HH-DATA-10, HH-QA-08, T73, ENT-Job, ENT-TimeStamp,
-- OWN-DEC-69, OWN-DEC-188, OWN-DEC-189, RULE-MONEY-CENTS, RULE-NO-INVENTED-FACTS, RULE-SERVER-AUTHZ). The server
-- decides who may do what and computes the report (apps/server/src/modules/job-costs, @handyhub/domain job-costs.ts);
-- this migration keeps the records true whatever path writes:
-- - finance.job_costs: the actual direct costs of one job in integer cents, one entry per cost, in one of the PROPOSED
--   categories (materials, approved purchase, subcontractor, rental, disposal, other directly attributable expense).
--   Labor and burden are never entered: labor is the elapsed Arrived-to-Finished time of work.time_stamps, and its cost
--   needs a labor cost rate that is NOT CONFIGURED (TSK-0131). An entry is voided once with a reason, never changed or
--   deleted. Return-work costs stay in quality.return_work_costs (0102), apart from the job's own.
-- - finance.job_cost_events: the history, append-only: every entry recorded or voided, and the Owner's confirmation
--   that a category holds every cost of the job (category_confirmed) or the reopening of that confirmation with a
--   reason (category_reopened). A category is complete exactly while its latest confirmation event is a confirmation;
--   no entry is recorded or voided in a confirmed category (it is reopened first), so a final figure never changes
--   silently. Only a live Owner confirms or reopens.
-- Nothing here holds a margin, a rate, an overhead or a target: none is configured (RULE-NO-INVENTED-FACTS).

CREATE TABLE finance.job_costs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       uuid NOT NULL,
  project_id   uuid NOT NULL,
  category     text NOT NULL CHECK (category IN ('materials', 'purchase', 'subcontractor', 'rental', 'disposal',
                 'other')),
  -- PROPOSED limit per entry: $100,000.00 (as for return-work costs).
  amount_cents bigint NOT NULL CHECK (amount_cents BETWEEN 1 AND 10000000),
  currency     text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  -- The local date the cost was incurred (the business time zone; the server refuses a date after today).
  incurred_on  date NOT NULL,
  note         text NOT NULL CHECK (char_length(btrim(note)) BETWEEN 1 AND 500),
  recorded_by  uuid NOT NULL REFERENCES identity.staff_users (id),
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  void_reason  text CHECK (char_length(btrim(void_reason)) BETWEEN 1 AND 500),
  voided_by    uuid REFERENCES identity.staff_users (id),
  voided_at    timestamptz,
  CONSTRAINT job_costs_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id),
  CONSTRAINT job_costs_void CHECK (
    (voided_at IS NULL) = (voided_by IS NULL) AND (voided_at IS NULL) = (void_reason IS NULL))
);
CREATE INDEX job_costs_job ON finance.job_costs (job_id, recorded_at);
COMMENT ON TABLE finance.job_costs IS
  'Actual direct costs of a job in integer cents (HH-FIN-17); voided once with a reason, never changed or deleted.';

CREATE TABLE finance.job_cost_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq         bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  job_id      uuid NOT NULL,
  project_id  uuid NOT NULL,
  event       text NOT NULL CHECK (event IN ('cost_recorded', 'cost_voided', 'category_confirmed', 'category_reopened')),
  category    text NOT NULL CHECK (category IN ('materials', 'purchase', 'subcontractor', 'rental', 'disposal',
                'other')),
  -- The entry a cost event is about.
  cost_id     uuid REFERENCES finance.job_costs (id),
  actor_id    uuid NOT NULL REFERENCES identity.staff_users (id),
  note        text CHECK (char_length(btrim(note)) BETWEEN 1 AND 1000),
  at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_cost_events_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id),
  CONSTRAINT job_cost_events_subject CHECK ((event IN ('cost_recorded', 'cost_voided')) = (cost_id IS NOT NULL)),
  -- A reopening says why.
  CONSTRAINT job_cost_events_reason CHECK (event <> 'category_reopened' OR note IS NOT NULL)
);
CREATE INDEX job_cost_events_job ON finance.job_cost_events (job_id, category, seq);
CREATE TRIGGER job_cost_events_append_only BEFORE UPDATE OR DELETE ON finance.job_cost_events
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE finance.job_cost_events IS
  'History of a job''s costs (HH-FIN-17): entries recorded and voided, the Owner''s category confirmations.';

-- Whether a category of a job is confirmed complete: its latest confirmation event is a confirmation.
CREATE FUNCTION finance.job_cost_category_confirmed(p_job uuid, p_category text) RETURNS boolean
  LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT event = 'category_confirmed' FROM finance.job_cost_events
                    WHERE job_id = p_job AND category = p_category
                      AND event IN ('category_confirmed', 'category_reopened')
                    ORDER BY seq DESC LIMIT 1), false)
$$;

-- An entry is recorded unvoided in an open category; afterwards it is only voided, once, with a reason, while its
-- category is open. Entries are never deleted.
CREATE FUNCTION finance.job_cost_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'job costs are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.voided_at IS NOT NULL THEN
      RAISE EXCEPTION 'a job cost is recorded unvoided' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF OLD.voided_at IS NOT NULL OR NEW.voided_at IS NULL
     OR (NEW.id, NEW.job_id, NEW.project_id, NEW.category, NEW.amount_cents, NEW.currency, NEW.incurred_on, NEW.note,
         NEW.recorded_by, NEW.recorded_at)
        IS DISTINCT FROM (OLD.id, OLD.job_id, OLD.project_id, OLD.category, OLD.amount_cents, OLD.currency,
         OLD.incurred_on, OLD.note, OLD.recorded_by, OLD.recorded_at) THEN
    RAISE EXCEPTION 'a job cost is only voided, once, with a reason' USING ERRCODE = 'restrict_violation';
  END IF;
  -- The job's row lock: a confirmation of the category commits strictly before or after this write.
  PERFORM 1 FROM work.jobs WHERE id = NEW.job_id FOR NO KEY UPDATE;
  IF finance.job_cost_category_confirmed(NEW.job_id, NEW.category) THEN
    RAISE EXCEPTION 'the % costs of this job are confirmed: reopen the category first', NEW.category
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER job_costs_guard BEFORE INSERT OR UPDATE OR DELETE ON finance.job_costs
  FOR EACH ROW EXECUTE FUNCTION finance.job_cost_guard();

-- An event names its entry's job and category; a confirmation and a reopening are a live Owner's, and alternate (a
-- category is confirmed only while open, reopened only while confirmed).
CREATE FUNCTION finance.job_cost_event_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.cost_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM finance.job_costs WHERE id = NEW.cost_id AND job_id = NEW.job_id AND category = NEW.category) THEN
    RAISE EXCEPTION 'a job cost event names its entry''s job and category' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.event IN ('category_confirmed', 'category_reopened') THEN
    IF NOT finance.has_live_role(NEW.actor_id, ARRAY['owner']) THEN
      RAISE EXCEPTION 'only an Owner confirms or reopens a job''s costs' USING ERRCODE = 'check_violation';
    END IF;
    -- The job's row lock serializes a confirmation with the job's entry writes.
    PERFORM 1 FROM work.jobs WHERE id = NEW.job_id FOR NO KEY UPDATE;
    IF finance.job_cost_category_confirmed(NEW.job_id, NEW.category) = (NEW.event = 'category_confirmed') THEN
      RAISE EXCEPTION 'the % costs of this job are already %', NEW.category,
        CASE NEW.event WHEN 'category_confirmed' THEN 'confirmed' ELSE 'open' END USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER job_cost_events_check BEFORE INSERT ON finance.job_cost_events
  FOR EACH ROW EXECUTE FUNCTION finance.job_cost_event_check();

-- Staging reset (TSK-0141): test records with no TRUNCATE guard of their own; only a permitted staging reset clears
-- them.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['finance.job_costs', 'finance.job_cost_events'] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE TRUNCATE ON %s FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) '
      'EXECUTE FUNCTION staging.reject_truncate()',
      split_part(t, '.', 2) || '_reset_only_truncate', t);
  END LOOP;
END;
$$;
