-- 0086 Change orders: worker proposals and staff drafts (TSK-0081; HH-CHG-01, HH-WORK-07, T53, ENT-ChangeOrder,
-- ENT-Job, ENT-JobScopeSnapshot, ENT-Task, OWN-DEC-108, OWN-DEC-145, OWN-DEC-168, OWN-DEC-169, OWN-DEC-203,
-- FACT-NO-MINIMUM, FACT-TAX-NO-LINE, RULE-MONEY-CENTS). The server decides who may act
-- (apps/server/src/modules/change-orders); this migration keeps the records true whatever path writes.
-- - work.change_orders: one change to a job's approved scope, numbered per project (the project reference and
--   -C<n>, never reused), with its origin: a worker's proposal, a customer request, the estimator, or an emergency
--   follow-up. Never deleted.
-- - work.change_order_versions: the versions of a change order (ENT-ChangeOrder). Each holds the reason, the
--   proposed scope, the schedule impact, the affected hazards and resources, the evidence (field photos of the job and
--   measurements), the checklist steps that depend on it, the scope snapshot it changes (the job's current approved
--   scope: the original job and the approved estimate it came from) with that snapshot's total, and the totals of its
--   own lines: charges, credits and the revised project total. States: draft -> reviewed (an Estimator or the Owner
--   checked pricing and eligibility) -> issued -> approved / rejected / expired / superseded / withdrawn; publishing,
--   approval and expiry are TSK-0082, so only draft, reviewed and withdrawn are written here. A draft binds nothing:
--   no version here changes the job's scope snapshot, its packet or any total (HH-CHG-02). Only a draft's content and
--   lines change; a reviewed version is reopened to a draft before it changes again.
-- - work.change_order_lines: price lines in integer cents. A charge line is added work; a credit line is removed work
--   or a credit, stored as a positive magnitude with a negative financial effect (OWN-DEC-203): no stored amount is
--   negative and every priced line is above $0.00, rounded once half-up (OWN-DEC-145). No tax line, no minimum
--   (FACT-TAX-NO-LINE, FACT-NO-MINIMUM). A draft may hold an incomplete line (unknown quantity or price); a reviewed
--   version has every line priced, totals equal to the sums of its lines and a revised total above $0.00.
-- Every new table is cleared by a staging reset only (TSK-0141).

CREATE TABLE work.change_orders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL,
  job_id      uuid NOT NULL,
  number      integer NOT NULL CHECK (number >= 1),
  origin      text NOT NULL CHECK (origin IN ('worker_proposal', 'customer_request', 'estimator', 'emergency_follow_up')),
  created_by  uuid NOT NULL REFERENCES identity.staff_users (id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, number),
  UNIQUE (id, job_id),
  CONSTRAINT change_orders_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id)
);
CREATE TRIGGER change_orders_append_only BEFORE UPDATE OR DELETE ON work.change_orders
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE work.change_orders IS
  'Changes to a job''s approved scope, numbered per project (ENT-ChangeOrder); versions in change_order_versions.';

CREATE TABLE work.change_order_versions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id     uuid NOT NULL,
  job_id              uuid NOT NULL,
  project_id          uuid NOT NULL,
  version             integer NOT NULL CHECK (version >= 1),
  state               text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'reviewed', 'issued', 'approved',
                        'rejected', 'expired', 'superseded', 'withdrawn')),
  reason              text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 2000),
  scope               text NOT NULL CHECK (char_length(btrim(scope)) BETWEEN 1 AND 4000),
  schedule_impact     text CHECK (char_length(btrim(schedule_impact)) BETWEEN 1 AND 2000),
  hazards             text CHECK (char_length(btrim(hazards)) BETWEEN 1 AND 2000),
  resources           text CHECK (char_length(btrim(resources)) BETWEEN 1 AND 2000),
  measurements        text CHECK (char_length(btrim(measurements)) BETWEEN 1 AND 2000),
  photo_ids           uuid[] NOT NULL DEFAULT '{}',
  -- The checklist steps that wait for this change: [{"workPackageId": uuid, "stepId": "3.2"}, ...].
  affected_steps      jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(affected_steps) = 'array'),
  -- The approved scope this version changes: the job's latest scope snapshot when the version was last saved.
  base_snapshot_id    uuid NOT NULL REFERENCES work.job_scope_snapshots (id),
  base_total_cents    bigint NOT NULL CHECK (base_total_cents > 0),
  -- Totals of the lines; NULL while a line is incomplete. Every amount is a non-negative magnitude (OWN-DEC-203).
  charges_cents       bigint CHECK (charges_cents >= 0),
  credits_cents       bigint CHECK (credits_cents >= 0),
  revised_total_cents bigint CHECK (revised_total_cents > 0),
  drafted_by          uuid NOT NULL REFERENCES identity.staff_users (id),
  drafted_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid NOT NULL REFERENCES identity.staff_users (id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  reviewed_by         uuid REFERENCES identity.staff_users (id),
  reviewed_at         timestamptz,
  withdrawn_by        uuid REFERENCES identity.staff_users (id),
  withdrawn_at        timestamptz,
  withdraw_reason     text CHECK (char_length(btrim(withdraw_reason)) BETWEEN 1 AND 1000),
  row_version         integer NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  UNIQUE (change_order_id, version),
  UNIQUE (id, change_order_id),
  CONSTRAINT change_order_versions_order FOREIGN KEY (change_order_id, job_id) REFERENCES work.change_orders (id, job_id),
  CONSTRAINT change_order_versions_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id),
  CONSTRAINT change_order_versions_totals CHECK (
    (charges_cents IS NULL) = (credits_cents IS NULL) AND (charges_cents IS NULL) = (revised_total_cents IS NULL)
    AND (revised_total_cents IS NULL OR revised_total_cents = base_total_cents + charges_cents - credits_cents)),
  CONSTRAINT change_order_versions_reviewed CHECK (
    (state = 'draft' OR state = 'withdrawn') OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND revised_total_cents IS NOT NULL AND (charges_cents > 0 OR credits_cents > 0))),
  CONSTRAINT change_order_versions_withdrawn CHECK (
    (state = 'withdrawn') = (withdrawn_at IS NOT NULL) AND (withdrawn_at IS NULL) = (withdrawn_by IS NULL)
    AND (withdrawn_at IS NULL) = (withdraw_reason IS NULL))
);
-- One open version per change order (the latest; earlier ones are superseded or final).
CREATE UNIQUE INDEX change_order_versions_one_open ON work.change_order_versions (change_order_id)
  WHERE state IN ('draft', 'reviewed', 'issued');
CREATE INDEX change_order_versions_job ON work.change_order_versions (job_id, state);
COMMENT ON TABLE work.change_order_versions IS
  'Versions of a change order (HH-CHG-01): content, evidence, affected steps and totals; a draft binds nothing.';

CREATE TABLE work.change_order_lines (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id       uuid NOT NULL REFERENCES work.change_order_versions (id),
  position         smallint NOT NULL CHECK (position >= 1),
  kind             text NOT NULL CHECK (kind IN ('charge', 'credit')),
  description      text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 2000),
  work_package_id  uuid REFERENCES work.work_packages (id),
  quantity_milli   bigint CHECK (quantity_milli > 0),
  unit             text CHECK (char_length(btrim(unit)) BETWEEN 1 AND 40),
  unit_price_cents bigint CHECK (unit_price_cents > 0),
  amount_cents     bigint,
  currency         text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  UNIQUE (version_id, position),
  -- The amount exists exactly when quantity and unit price are known, and is their product rounded once half-up.
  CONSTRAINT change_order_lines_amount_exact CHECK (
    (amount_cents IS NULL) = (quantity_milli IS NULL OR unit_price_cents IS NULL)
    AND (amount_cents IS NULL OR (amount_cents > 0
      AND amount_cents = div(quantity_milli::numeric * unit_price_cents + 500, 1000))))
);
COMMENT ON TABLE work.change_order_lines IS
  'Change-order price lines in integer cents: charges, and credits as positive magnitudes (OWN-DEC-203).';

-- The totals of a version's lines: charges and credits, or NULL while a line is not priced.
CREATE FUNCTION work.change_order_line_totals(p_version uuid, OUT charges bigint, OUT credits bigint, OUT complete boolean)
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(sum(amount_cents) FILTER (WHERE kind = 'charge'), 0)::bigint,
         COALESCE(sum(amount_cents) FILTER (WHERE kind = 'credit'), 0)::bigint,
         bool_and(amount_cents IS NOT NULL) IS NOT FALSE
    FROM work.change_order_lines WHERE version_id = p_version
$$;

-- What may change on a version: only a draft's content; the state moves along the machine's transitions; the
-- reviewed totals are the sums of the lines; nothing is deleted.
CREATE FUNCTION work.change_order_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  t record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'change-order versions are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'draft' OR NEW.reviewed_at IS NOT NULL OR NEW.withdrawn_at IS NOT NULL OR NEW.row_version <> 1 THEN
      RAISE EXCEPTION 'a change-order version starts as a draft' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.change_order_id, NEW.job_id, NEW.project_id, NEW.version, NEW.drafted_by, NEW.drafted_at)
     IS DISTINCT FROM (OLD.id, OLD.change_order_id, OLD.job_id, OLD.project_id, OLD.version, OLD.drafted_by,
                       OLD.drafted_at) THEN
    RAISE EXCEPTION 'a change-order version keeps its identity' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.row_version <> OLD.row_version + 1 THEN
    RAISE EXCEPTION 'a change-order version change advances its row version by one' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.state <> 'draft'
     AND (NEW.reason, NEW.scope, NEW.schedule_impact, NEW.hazards, NEW.resources, NEW.measurements, NEW.photo_ids,
          NEW.affected_steps, NEW.base_snapshot_id, NEW.base_total_cents, NEW.charges_cents, NEW.credits_cents,
          NEW.revised_total_cents)
         IS DISTINCT FROM (OLD.reason, OLD.scope, OLD.schedule_impact, OLD.hazards, OLD.resources, OLD.measurements,
                           OLD.photo_ids, OLD.affected_steps, OLD.base_snapshot_id, OLD.base_total_cents,
                           OLD.charges_cents, OLD.credits_cents, OLD.revised_total_cents) THEN
    RAISE EXCEPTION 'only a draft change-order version is edited' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.state IS DISTINCT FROM OLD.state AND NOT (
       (OLD.state = 'draft' AND NEW.state IN ('reviewed', 'withdrawn'))
    OR (OLD.state = 'reviewed' AND NEW.state IN ('draft', 'withdrawn'))) THEN
    RAISE EXCEPTION 'change-order version % -> % is not a transition', OLD.state, NEW.state
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.state = 'reviewed' AND OLD.state = 'draft' THEN
    SELECT * INTO t FROM work.change_order_line_totals(NEW.id);
    IF NOT t.complete OR (t.charges, t.credits) IS DISTINCT FROM (NEW.charges_cents, NEW.credits_cents) THEN
      RAISE EXCEPTION 'a reviewed change order has every line priced and totals equal to its lines'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.state = 'draft' AND OLD.state = 'reviewed' THEN
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER change_order_versions_guard BEFORE INSERT OR UPDATE OR DELETE ON work.change_order_versions
  FOR EACH ROW EXECUTE FUNCTION work.change_order_version_guard();

-- Lines change only while their version is a draft.
CREATE FUNCTION work.change_order_line_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_state text;
BEGIN
  SELECT state INTO v_state FROM work.change_order_versions
   WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.version_id ELSE NEW.version_id END;
  IF v_state IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'change-order lines change only on a draft' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.version_id <> OLD.version_id THEN
    RAISE EXCEPTION 'a change-order line stays on its version' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER change_order_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON work.change_order_lines
  FOR EACH ROW EXECUTE FUNCTION work.change_order_line_guard();

-- A staging reset is the only path that empties these tables (TSK-0141).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['work.change_orders', 'work.change_order_versions', 'work.change_order_lines'] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE TRUNCATE ON %s FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) '
      'EXECUTE FUNCTION staging.reject_truncate()',
      split_part(t, '.', 2) || '_reset_only_truncate', t);
  END LOOP;
END;
$$;
