-- 0026 Estimates, estimate versions and estimate lines (TSK-0052; HH-DATA-02, HH-EST-02, HH-EST-03, HH-BASE-02,
-- ENT-Estimate, ENT-EstimateVersion, ENT-PolicyVersion, RULE-MONEY-CENTS, OWN-DEC-83, OWN-DEC-102, OWN-DEC-145).
-- - Every amount is integer cents (bigint) with its currency stored beside it; USD is the only currency (HH-DATA-02).
--   A line amount is quantity (thousandths of the unit) times unit price, rounded once half-up to the cent, and the
--   database checks the stored amount against that rule; the subtotal is the sum of the displayed base lines; a
--   discount is a totals row computed on the subtotal, half-up, never a line (OWN-DEC-145); total = subtotal - discount.
-- - There is no minimum-charge column, rule, adjustment or top-up (FACT-NO-MINIMUM, HH-BASE-02), no tax column and no
--   tax line (FACT-TAX-NO-LINE), no surcharge (FACT-NO-SURCHARGE) and no other fee. Only the tax-mode policy version
--   the totals were computed under is pinned (HH-EST-03); no amount is derived from it.
-- - Lines must be above $0.00 to publish; a draft can hold incomplete lines (unknown quantity, missing price), but a
--   negative quantity or a $0 or negative unit price is refused (HH-DATA-02: nothing is clamped).
-- - Each version pins the policy versions it was computed with (deposit rule, discount rule, tax mode; the estimate
--   validity and terms at publishing; the project's payment term). Later policy changes never recalculate it.
-- - Published and later versions are immutable (ENT-EstimateVersion, HH-DATA-03): their content, lines and internal
--   costs refuse every change; only the lifecycle state moves forward (TSK-0055 owns the transitions) and the first
--   customer view is recorded once (OWN-DEC-39). Versions and estimates are never deleted. Edits create a new version.
-- - Internal costs, wages, markup assumptions and confidential estimator notes live in their own tables, apart from
--   every customer-facing field (HH-EST-03, HH-ARC-04); the customer projection never reads them.
CREATE SCHEMA IF NOT EXISTS estimating;
COMMENT ON SCHEMA estimating IS 'Estimates, their versions and price lines; internal costs in separate tables (TSK-0052).';

-- Composite keys so a line can only point at a work package of its own project (HH-SVC-04).
ALTER TABLE work.work_packages ADD CONSTRAINT work_packages_id_project UNIQUE (id, project_id);

-- The container of the versions for a project (ENT-Estimate). The current version and the overall state are derived
-- from the versions. Number: PROPOSED "<project reference>-E<sequence>".
CREATE TABLE estimating.estimates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES crm.projects (id),
  sequence    integer NOT NULL CHECK (sequence >= 1),
  number      text NOT NULL UNIQUE CHECK (number ~ '^HH-[0-9A-HJKMNP-TV-Z]{8}-E[1-9][0-9]*$'),
  created_by  uuid NOT NULL REFERENCES identity.staff_users (id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, sequence),
  UNIQUE (id, project_id)
);
CREATE TRIGGER estimates_append_only BEFORE UPDATE OR DELETE ON estimating.estimates
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE estimating.estimates IS 'One estimate of a project; its numbered versions hold the offer (ENT-Estimate).';

-- One complete, numbered offer (ENT-EstimateVersion, HH-EST-01). Totals are written by the server only, from the
-- stored lines and the active configuration (client-supplied totals are never read, HH-EST-03).
CREATE TABLE estimating.estimate_versions (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id               uuid NOT NULL,
  project_id                uuid NOT NULL,
  version                   integer NOT NULL CHECK (version >= 1),
  state                     text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'in_review', 'published',
                              'accepted', 'declined', 'expired', 'withdrawn', 'superseded')),
  state_changed_at          timestamptz NOT NULL DEFAULT now(),
  -- Written in the staff app, or an uploaded PDF/Word estimate with structured amounts (HH-EST-11, TSK-0054).
  authoring_method          text NOT NULL CHECK (authoring_method IN ('written', 'uploaded')),
  currency                  text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  -- Customer-facing content besides the lines (HH-EST-01).
  assumptions               text[] NOT NULL DEFAULT '{}',
  exclusions                text[] NOT NULL DEFAULT '{}',
  customer_responsibilities text[] NOT NULL DEFAULT '{}',
  dependencies              text[] NOT NULL DEFAULT '{}',
  schedule_assumptions      text[] NOT NULL DEFAULT '{}',
  -- The one discount of the job (FACT-PRICING-DISCOUNTS): its category, and the share copied from the pinned
  -- discount.rule version. The category list itself lives in that policy version.
  discount_category         text CHECK (discount_category ~ '^[a-z][a-z_]{0,39}$'),
  discount_percent_bps      integer CHECK (discount_percent_bps BETWEEN 1 AND 10000),
  discount_rule_version     integer CHECK (discount_rule_version >= 1),
  -- Server-computed totals of the base lines; NULL while a line is incomplete or invalid (nothing is guessed).
  subtotal_cents            bigint,
  discount_cents            bigint,
  total_cents               bigint,
  -- The deposit on the total after the discount (FACT-DEPOSIT-RULE), from the pinned deposit.rule version;
  -- 'not_configured' when that rule is NOT CONFIGURED (never read as "no deposit").
  deposit_state             text CHECK (deposit_state IN ('not_required', 'required', 'not_configured')),
  deposit_cents             bigint,
  deposit_rule_version      integer CHECK (deposit_rule_version >= 1),
  -- The tax-mode policy version in force when the totals were computed (pinned only; no tax amount exists).
  tax_mode_version          integer CHECK (tax_mode_version >= 1),
  totals_computed_at        timestamptz,
  -- The project's payment term, copied when the version is created (FACT-PAYMENT-DUE; never overwritten).
  payment_term              text NOT NULL CHECK (payment_term IN ('due_on_receipt')),
  payment_term_version      integer NOT NULL CHECK (payment_term_version >= 1),
  -- Set when publishing (TSK-0055, HH-EST-13): validity counted from publishing, and the terms version shown.
  validity_policy_version   integer CHECK (validity_policy_version >= 1),
  valid_until               timestamptz,
  terms_version             text CHECK (char_length(terms_version) BETWEEN 1 AND 60),
  prepared_by               uuid NOT NULL REFERENCES identity.staff_users (id),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_by                uuid NOT NULL REFERENCES identity.staff_users (id),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  published_by              uuid REFERENCES identity.staff_users (id),
  published_at              timestamptz,
  -- Date and time only (OWN-DEC-39).
  first_viewed_at           timestamptz,
  row_version               integer NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  FOREIGN KEY (estimate_id, project_id) REFERENCES estimating.estimates (id, project_id),
  UNIQUE (estimate_id, version),
  UNIQUE (id, project_id),
  CONSTRAINT estimate_versions_discount_complete CHECK (
    (discount_category IS NULL) = (discount_percent_bps IS NULL)
    AND (discount_category IS NULL) = (discount_rule_version IS NULL)),
  CONSTRAINT estimate_versions_totals_complete CHECK (
    (subtotal_cents IS NULL) = (discount_cents IS NULL)
    AND (subtotal_cents IS NULL) = (total_cents IS NULL)
    AND (subtotal_cents IS NULL) = (deposit_state IS NULL)
    AND (subtotal_cents IS NULL) = (totals_computed_at IS NULL)),
  -- Every displayed amount is above $0.00; the discount row is the half-up share of the subtotal; total = subtotal -
  -- discount. No other row (minimum, tax, surcharge, rounding adjustment) exists.
  CONSTRAINT estimate_versions_totals_exact CHECK (
    subtotal_cents IS NULL OR (
      subtotal_cents > 0 AND total_cents > 0 AND discount_cents >= 0
      AND discount_cents = div(subtotal_cents::numeric * COALESCE(discount_percent_bps, 0) + 5000, 10000)
      AND total_cents = subtotal_cents - discount_cents)),
  CONSTRAINT estimate_versions_deposit_shape CHECK (
    (deposit_state = 'required') = (deposit_cents IS NOT NULL)
    AND (deposit_cents IS NULL OR (deposit_cents > 0 AND deposit_cents <= total_cents))
    AND (deposit_state IS NULL OR (deposit_state = 'not_configured') = (deposit_rule_version IS NULL))),
  -- A version past review carries its totals and the policy versions they were computed with.
  CONSTRAINT estimate_versions_published_complete CHECK (
    state IN ('draft', 'in_review') OR (
      total_cents IS NOT NULL AND tax_mode_version IS NOT NULL AND published_at IS NOT NULL
      AND published_by IS NOT NULL AND deposit_state <> 'not_configured'))
);
CREATE INDEX estimate_versions_project ON estimating.estimate_versions (project_id, created_at);
COMMENT ON TABLE estimating.estimate_versions IS
  'Numbered estimate versions with server-computed totals and pinned policy versions; immutable once published.';

-- Price lines (HH-EST-01, HH-EST-02). kind: base scope, or an option the customer may select (alternate, optional
-- add-on; PROPOSED). Quantities are thousandths of the unit (QUANTITY_SCALE 3 of @handyhub/money); an unknown
-- quantity stays NULL, never zero.
CREATE TABLE estimating.estimate_lines (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id       uuid NOT NULL,
  project_id       uuid NOT NULL,
  position         smallint NOT NULL CHECK (position >= 1),
  kind             text NOT NULL DEFAULT 'base' CHECK (kind IN ('base', 'alternate', 'add_on')),
  work_package_id  uuid,
  description      text CHECK (char_length(btrim(description)) BETWEEN 1 AND 2000),
  quantity_milli   bigint CHECK (quantity_milli > 0),
  unit             text CHECK (char_length(btrim(unit)) BETWEEN 1 AND 40),
  quantity_source  text CHECK (quantity_source IN ('measured_on_site', 'reported_by_customer')),
  unit_price_cents bigint CHECK (unit_price_cents > 0),
  amount_cents     bigint,
  currency         text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (version_id, project_id) REFERENCES estimating.estimate_versions (id, project_id),
  FOREIGN KEY (work_package_id, project_id) REFERENCES work.work_packages (id, project_id),
  UNIQUE (id, version_id),
  CONSTRAINT estimate_lines_position UNIQUE (version_id, position) DEFERRABLE INITIALLY DEFERRED,
  -- The amount exists exactly when quantity and unit price are known, and is their product rounded once half-up.
  CONSTRAINT estimate_lines_amount_exact CHECK (
    (amount_cents IS NULL) = (quantity_milli IS NULL OR unit_price_cents IS NULL)
    AND (amount_cents IS NULL OR amount_cents = div(quantity_milli::numeric * unit_price_cents + 500, 1000))),
  CONSTRAINT estimate_lines_source_needs_quantity CHECK (quantity_source IS NULL OR quantity_milli IS NOT NULL)
);
CREATE INDEX estimate_lines_version ON estimating.estimate_lines (version_id, position);
COMMENT ON TABLE estimating.estimate_lines IS 'Customer-facing price lines of an estimate version, integer cents.';

-- Internal cost of a line: material and labor (wages) cost, staff-only (HH-EST-03). Never in a customer projection.
CREATE TABLE estimating.estimate_line_costs (
  line_id             uuid PRIMARY KEY,
  version_id          uuid NOT NULL,
  material_cost_cents bigint CHECK (material_cost_cents >= 0),
  labor_cost_cents    bigint CHECK (labor_cost_cents >= 0),
  currency            text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  note                text CHECK (char_length(note) <= 2000),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (line_id, version_id) REFERENCES estimating.estimate_lines (id, version_id) ON DELETE CASCADE
);
COMMENT ON TABLE estimating.estimate_line_costs IS 'Internal line costs (staff only, HH-EST-03).';

-- Internal notes of a version: markup assumptions and confidential estimator notes (HH-EST-03). Staff only.
CREATE TABLE estimating.estimate_version_internals (
  version_id         uuid PRIMARY KEY REFERENCES estimating.estimate_versions (id),
  markup_assumptions text CHECK (char_length(markup_assumptions) <= 5000),
  estimator_notes    text CHECK (char_length(estimator_notes) <= 5000),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE estimating.estimate_version_internals IS 'Markup assumptions and estimator notes (staff only).';

-- Version guard: identity never changes; a version is never deleted; once past review only the lifecycle state
-- (forward, never back to editing) and the first customer view (once) may change. Publishing checks the stored
-- totals against the stored lines: every line is priced and above $0.00, and the subtotal is the sum of the base
-- lines (HH-EST-02, HH-EST-03).
CREATE FUNCTION estimating.estimate_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  editable constant text[] := ARRAY['draft', 'in_review'];
  mutable constant text[] := ARRAY['state', 'state_changed_at', 'first_viewed_at', 'row_version'];
  base_sum numeric;
  bad_lines integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'estimate versions are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW.id, NEW.estimate_id, NEW.project_id, NEW.version, NEW.authoring_method, NEW.prepared_by, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.estimate_id, OLD.project_id, OLD.version, OLD.authoring_method, OLD.prepared_by,
                       OLD.created_at) THEN
    RAISE EXCEPTION 'an estimate version keeps its estimate, number, method and preparer'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.state = ANY (editable) THEN
    IF NOT (NEW.state = ANY (editable)) THEN
      SELECT COALESCE(sum(amount_cents) FILTER (WHERE kind = 'base'), 0),
             count(*) FILTER (WHERE amount_cents IS NULL OR amount_cents <= 0 OR description IS NULL)
        INTO base_sum, bad_lines
        FROM estimating.estimate_lines WHERE version_id = NEW.id;
      IF bad_lines > 0 OR NEW.subtotal_cents IS NULL OR base_sum <> NEW.subtotal_cents THEN
        RAISE EXCEPTION 'a version is published only with every line priced above $0.00 and totals equal to its lines'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.state = ANY (editable) THEN
    RAISE EXCEPTION 'a published estimate version never returns to editing; revise it as a new version'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.first_viewed_at IS NOT NULL AND NEW.first_viewed_at IS DISTINCT FROM OLD.first_viewed_at THEN
    RAISE EXCEPTION 'the first customer view is recorded once' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (to_jsonb(NEW) - mutable) IS DISTINCT FROM (to_jsonb(OLD) - mutable) THEN
    RAISE EXCEPTION 'a published estimate version is immutable; revise it as a new version'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER estimate_versions_guard BEFORE UPDATE OR DELETE ON estimating.estimate_versions
  FOR EACH ROW EXECUTE FUNCTION estimating.estimate_version_guard();

-- Content guard for lines, line costs and version internals: written only while the version is a draft or in review.
-- The version row is share-locked so a concurrent publish (which updates it) and a content edit serialize.
CREATE FUNCTION estimating.estimate_content_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_state text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.version_id IS DISTINCT FROM OLD.version_id THEN
    RAISE EXCEPTION 'estimate content keeps its version' USING ERRCODE = 'restrict_violation';
  END IF;
  SELECT state INTO v_state FROM estimating.estimate_versions
   WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.version_id ELSE NEW.version_id END
   FOR SHARE;
  IF v_state IS NOT NULL AND v_state NOT IN ('draft', 'in_review') THEN
    RAISE EXCEPTION 'the content of a published estimate version is immutable; revise it as a new version'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER estimate_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON estimating.estimate_lines
  FOR EACH ROW EXECUTE FUNCTION estimating.estimate_content_guard();
CREATE TRIGGER estimate_line_costs_guard BEFORE INSERT OR UPDATE OR DELETE ON estimating.estimate_line_costs
  FOR EACH ROW EXECUTE FUNCTION estimating.estimate_content_guard();
CREATE TRIGGER estimate_version_internals_guard BEFORE INSERT OR UPDATE OR DELETE
  ON estimating.estimate_version_internals
  FOR EACH ROW EXECUTE FUNCTION estimating.estimate_content_guard();
