-- 0116 Job gross margin and the advisory target flag (TSK-0131; HH-FIN-20, HH-FIN-17, OWN-DEC-189, OWN-DEC-188,
-- FACT-MARGIN-TARGET, RULE-MONEY-CENTS, RULE-NO-INVENTED-FACTS, RULE-SERVER-AUTHZ). The server computes the margin
-- (@handyhub/domain job-margin.ts, apps/server/src/modules/job-margin); this migration keeps the records true whatever
-- path writes:
-- - job_margin.target: the target gross margin per job, 3000 basis points (30%), FACT-MARGIN-TARGET and OWN-DEC-189.
--   An advisory flag, never a block; the Owner changes it as a new audited configuration version
--   (PUT /staff/settings/margin-target).
-- - finance.labor_cost_rates: the labor cost rate per hour the Owner enters per worker (OWN-DEC-189: "a cost rate the
--   Owner enters per worker"), in integer cents, from a local date, with the employee burden per hour where the Owner
--   knows it (null: not known). No rate exists until the Owner enters one: no default, no payroll (OWN-DEC-69,
--   OWN-DEC-188). A rate is never changed or deleted: a later entry for a later (or the same) date replaces it from
--   that date. Only a live Owner enters one.
-- - finance.job_margin_reviews: the reason the Owner records for a job below the target (OWN-DEC-189 item 13), with the
--   margin it was recorded against. Append-only; only a live Owner records one.

INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by) VALUES
  ('job_margin.target', 1, 'configured', '{"targetBps": 3000}', false,
   ARRAY['FACT-MARGIN-TARGET', 'OWN-DEC-189'], 'migration:0116');

CREATE TABLE finance.labor_cost_rates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq           bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  staff_user_id uuid NOT NULL REFERENCES identity.staff_users (id),
  -- The first local date (business time zone) the rate applies to.
  effective_on  date NOT NULL,
  -- PROPOSED limit: $1,000.00 per hour. 0 is allowed: the Owner states the time carries no labor cost (a
  -- subcontractor whose cost is entered as a direct job cost, OWN-DEC-188).
  rate_cents    integer NOT NULL CHECK (rate_cents BETWEEN 0 AND 100000),
  burden_cents  integer CHECK (burden_cents BETWEEN 0 AND 100000),
  currency      text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  reason        text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
  entered_by    uuid NOT NULL REFERENCES identity.staff_users (id),
  entered_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX labor_cost_rates_worker ON finance.labor_cost_rates (staff_user_id, effective_on, seq);
CREATE TRIGGER labor_cost_rates_append_only BEFORE UPDATE OR DELETE ON finance.labor_cost_rates
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE finance.labor_cost_rates IS
  'Owner-entered labor cost and burden rates per worker per hour, in cents, from a date (OWN-DEC-189); append-only.';

CREATE TABLE finance.job_margin_reviews (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq                bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  job_id             uuid NOT NULL,
  project_id         uuid NOT NULL,
  reason             text NOT NULL CHECK (reason IN ('underpricing', 'material_overrun', 'additional_labor',
                       'site_conditions', 'other')),
  note               text CHECK (char_length(btrim(note)) BETWEEN 1 AND 1000),
  -- The final margin the reason was recorded against (integer cents; basis points null for no revenue).
  revenue_cents      bigint NOT NULL,
  cost_cents         bigint NOT NULL CHECK (cost_cents >= 0),
  gross_profit_cents bigint NOT NULL,
  margin_bps         integer,
  target_bps         integer NOT NULL CHECK (target_bps BETWEEN 1 AND 9999),
  recorded_by        uuid NOT NULL REFERENCES identity.staff_users (id),
  recorded_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_margin_reviews_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id),
  CONSTRAINT job_margin_reviews_profit CHECK (gross_profit_cents = revenue_cents - cost_cents),
  CONSTRAINT job_margin_reviews_other CHECK (reason <> 'other' OR note IS NOT NULL)
);
CREATE INDEX job_margin_reviews_job ON finance.job_margin_reviews (job_id, seq);
CREATE TRIGGER job_margin_reviews_append_only BEFORE UPDATE OR DELETE ON finance.job_margin_reviews
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE finance.job_margin_reviews IS
  'The Owner''s reasons for a job below the target gross margin (OWN-DEC-189 item 13); append-only.';

-- Rates and reasons are a live Owner's.
CREATE FUNCTION finance.job_margin_owner_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  actor uuid := COALESCE(to_jsonb(NEW) ->> 'entered_by', to_jsonb(NEW) ->> 'recorded_by')::uuid;
BEGIN
  IF NOT finance.has_live_role(actor, ARRAY['owner']) THEN
    RAISE EXCEPTION 'only an Owner records %', TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER labor_cost_rates_owner BEFORE INSERT ON finance.labor_cost_rates
  FOR EACH ROW EXECUTE FUNCTION finance.job_margin_owner_check();
CREATE TRIGGER job_margin_reviews_owner BEFORE INSERT ON finance.job_margin_reviews
  FOR EACH ROW EXECUTE FUNCTION finance.job_margin_owner_check();

-- Staging reset (TSK-0141): the reasons are test records that only a permitted staging reset clears; the rates are
-- kept with the staff accounts they belong to.
CREATE TRIGGER job_margin_reviews_reset_only_truncate BEFORE TRUNCATE ON finance.job_margin_reviews
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();
