-- 0048 The deposit requirement, staff-recorded deposit payments, the owner-only waiver and the work-scheduling gate
-- (TSK-0059; HH-FIN-02, HH-SCH-06, HH-SCH-05, HH-FIN-03, HH-FIN-07, HH-FIN-09, HH-FIN-12, T36, T59, T64,
-- ENT-DepositRequirement, ENT-Payment, ENT-PaymentAllocation, FACT-DEPOSIT-RULE, FACT-PAYMENT-METHODS, INT-Square,
-- OWN-DEC-42, OWN-DEC-66, OWN-DEC-76, OWN-DEC-104, OWN-DEC-111, OWN-DEC-119, OWN-DEC-138, RULE-MONEY-CENTS,
-- RULE-SAFETY-GATES, RULE-SERVER-AUTHZ).
-- - deposit_requirements: the job's deposit obligation, one per job, written in the approval's own transaction (the
--   trigger on work.jobs below) from what the approval pinned: the deposit rule version, the final approved total
--   after any discount it was computed on, and required with its amount in cents or not required. The amount is never
--   recomputed here: the approval already computed it from the rule's policy data (strictly over the threshold, the
--   rule's share, half-up). Its state follows its money and waiver and is checked against them on every change:
--   not_required; required -> partly_satisfied -> satisfied (verified money only); required -> waived (the Owner).
--   'applied' (credited to the final invoice, HH-FIN-05) belongs to the invoicing phase and is refused until then.
--   The staff-pasted Square payment link of the deposit request is kept on it (INT-Square: https, a Square host).
-- - payments: money received and recorded by hand after staff verified it (no provider callback, HH-FIN-09): method,
--   amount in cents, the date received, the collector, who recorded it, the transaction reference (the Square payment
--   ID, the check number) and the payer for a check. Never edited or deleted; only a check's state moves, and only
--   to cleared here (received or deposited -> cleared, by an Owner who did not collect it, HH-FIN-12, OWN-DEC-138).
--   The same method and reference cannot be recorded twice. Cash and digital payments are verified when recorded;
--   a check stays pending until cleared and does not satisfy a deposit.
-- - payment_allocations: a payment's application to the deposit requirement of its own job, append-only. Allocations
--   never exceed the payment or the deposit amount, and a payment is applied to a requirement once (no double
--   credit, HH-FIN-07); a remainder stays unallocated for the Owner's decision (the full ledger is TSK-0086).
-- - deposit_waivers: the Owner's job-specific waiver with its written reason, the session and when it was freshly
--   authenticated; append-only, one per requirement, and only by a staff user holding a live Owner role grant
--   (OWN-DEC-76). A waiver never marks the deposit paid and never changes the price (no amount is touched).
-- - finance.work_visit_deposit_gate(job): the gate every work-visit confirmation calls in its own transaction
--   (HH-SCH-06; TSK-0061/TSK-0064 call it): it share-locks the requirement, so a waiver, a payment or a check move
--   commits before or after the confirmation, never beside it, and answers from the money and waiver themselves.
--   Estimate visits never call it (OWN-DEC-119).
-- Nothing here refunds, credits an invoice or talks to a payment provider.

CREATE SCHEMA IF NOT EXISTS finance;
COMMENT ON SCHEMA finance IS 'Deposits, recorded payments and their allocations (HH-ARC-02 finance module).';

CREATE TABLE finance.deposit_requirements (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              uuid NOT NULL UNIQUE,
  project_id          uuid NOT NULL,
  approval_id         uuid NOT NULL UNIQUE REFERENCES estimating.approvals (id),
  rule_version        integer NOT NULL CHECK (rule_version >= 1),
  -- The final approved total including the selected options, after any discount: the rule's base.
  base_total_cents    bigint NOT NULL CHECK (base_total_cents > 0),
  required            boolean NOT NULL,
  amount_cents        bigint,
  state               text NOT NULL CHECK (state IN ('not_required', 'required', 'partly_satisfied', 'satisfied',
                        'applied', 'waived')),
  payment_link        text CHECK (char_length(payment_link) BETWEEN 9 AND 500 AND payment_link ~ '^https://'),
  payment_link_set_by uuid REFERENCES identity.staff_users (id),
  payment_link_set_at timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  version             integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (id, job_id),
  CONSTRAINT deposit_requirements_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id),
  CONSTRAINT deposit_requirements_amount CHECK (
    required = (amount_cents IS NOT NULL)
    AND (amount_cents IS NULL OR (amount_cents > 0 AND amount_cents <= base_total_cents))),
  CONSTRAINT deposit_requirements_state CHECK ((state = 'not_required') = (NOT required)),
  CONSTRAINT deposit_requirements_link CHECK (
    (payment_link IS NULL) = (payment_link_set_by IS NULL) AND (payment_link IS NULL) = (payment_link_set_at IS NULL)
    AND (payment_link IS NULL OR required))
);
CREATE INDEX deposit_requirements_project ON finance.deposit_requirements (project_id);
COMMENT ON TABLE finance.deposit_requirements IS
  'A job''s deposit obligation from its approval (ENT-DepositRequirement): one per job, never deleted.';

CREATE TABLE finance.payments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid NOT NULL,
  job_id             uuid NOT NULL,
  method             text NOT NULL CHECK (method IN ('square_payment_link', 'square_tap_to_pay', 'cash', 'check',
                       'zelle', 'cash_app', 'chime')),
  amount_cents       bigint NOT NULL CHECK (amount_cents > 0),
  currency           text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  received_on        date NOT NULL,
  collector_staff_id uuid NOT NULL REFERENCES identity.staff_users (id),
  recorded_by        uuid NOT NULL REFERENCES identity.staff_users (id),
  -- The transaction reference: the Square payment ID for card payments, the check number for a check.
  reference          text CHECK (char_length(reference) BETWEEN 1 AND 120 AND reference = btrim(reference)),
  payer_name         text CHECK (char_length(payer_name) BETWEEN 1 AND 200 AND payer_name = btrim(payer_name)),
  state              text NOT NULL CHECK (state IN ('recorded', 'reconciled', 'received', 'deposited', 'cleared',
                       'returned', 'voided')),
  cleared_by         uuid REFERENCES identity.staff_users (id),
  cleared_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  version            integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT payments_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id),
  CONSTRAINT payments_check_states CHECK (
    (method = 'check') = (state IN ('received', 'deposited', 'cleared', 'returned', 'voided'))),
  CONSTRAINT payments_reference CHECK (
    method NOT IN ('square_payment_link', 'square_tap_to_pay', 'check') OR reference IS NOT NULL),
  CONSTRAINT payments_check_payer CHECK (method <> 'check' OR payer_name IS NOT NULL),
  CONSTRAINT payments_cleared CHECK (
    (state = 'cleared') = (cleared_by IS NOT NULL) AND (cleared_by IS NULL) = (cleared_at IS NULL)),
  CONSTRAINT payments_clearer CHECK (cleared_by IS NULL OR cleared_by <> collector_staff_id)
);
-- HH-FIN-09: the same method and reference are recorded once.
CREATE UNIQUE INDEX payments_method_reference ON finance.payments (method, reference) WHERE reference IS NOT NULL;
CREATE INDEX payments_job ON finance.payments (job_id, created_at);
COMMENT ON TABLE finance.payments IS
  'Money received and recorded by staff after verifying it (ENT-Payment): never edited or deleted.';

-- A payment is written once and never deleted; only a check's state moves, here only to cleared, by an Owner who did
-- not collect it. Returned, voided, deposited and reconciled moves belong to their own tasks (TSK-0088, TSK-0089).
CREATE FUNCTION finance.payment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'payments are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.state NOT IN ('recorded', 'received') OR NEW.version <> 1 OR NEW.cleared_by IS NOT NULL THEN
      RAISE EXCEPTION 'a payment is recorded as received (a check) or recorded' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'state' - 'cleared_by' - 'cleared_at' - 'version')
     IS DISTINCT FROM (to_jsonb(OLD) - 'state' - 'cleared_by' - 'cleared_at' - 'version') THEN
    RAISE EXCEPTION 'a recorded payment is never edited' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NOT (OLD.method = 'check' AND OLD.state IN ('received', 'deposited') AND NEW.state = 'cleared') THEN
    RAISE EXCEPTION 'this payment state change is not available' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.role_grants g WHERE g.staff_user_id = NEW.cleared_by AND g.kind = 'role'
                 AND g.name = 'owner' AND g.ended_at IS NULL AND g.effective_from <= now()) THEN
    RAISE EXCEPTION 'only the Owner marks a check cleared' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payments_guard BEFORE INSERT OR UPDATE OR DELETE ON finance.payments
  FOR EACH ROW EXECUTE FUNCTION finance.payment_guard();

CREATE TABLE finance.payment_allocations (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id             uuid NOT NULL REFERENCES finance.payments (id),
  deposit_requirement_id uuid NOT NULL REFERENCES finance.deposit_requirements (id),
  amount_cents           bigint NOT NULL CHECK (amount_cents > 0),
  allocated_by           uuid NOT NULL REFERENCES identity.staff_users (id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  -- A payment is applied to a deposit requirement once (HH-FIN-07: no double credit).
  UNIQUE (payment_id, deposit_requirement_id)
);
CREATE INDEX payment_allocations_requirement ON finance.payment_allocations (deposit_requirement_id);
COMMENT ON TABLE finance.payment_allocations IS
  'A payment applied to its job''s deposit requirement (ENT-PaymentAllocation): append-only, never over-allocated.';

-- An allocation applies a payment to the required deposit of the payment's own job, under the requirement's lock,
-- never beyond the payment's amount or the deposit's (payments returned or voided no longer count).
CREATE FUNCTION finance.payment_allocation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  r record;
  p record;
  used_payment bigint;
  used_deposit bigint;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'allocations are append-only: a reversal is a new allocation' USING ERRCODE = 'restrict_violation';
  END IF;
  SELECT id, job_id, required, amount_cents INTO r
    FROM finance.deposit_requirements WHERE id = NEW.deposit_requirement_id FOR UPDATE;
  SELECT id, job_id, amount_cents, state INTO p FROM finance.payments WHERE id = NEW.payment_id FOR SHARE;
  IF r.job_id IS DISTINCT FROM p.job_id THEN
    RAISE EXCEPTION 'a payment is applied to the deposit of its own job' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT r.required THEN
    RAISE EXCEPTION 'this job needs no deposit' USING ERRCODE = 'check_violation';
  END IF;
  IF p.state IN ('returned', 'voided') THEN
    RAISE EXCEPTION 'a returned or voided payment is not applied' USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(sum(amount_cents), 0) INTO used_payment
    FROM finance.payment_allocations WHERE payment_id = NEW.payment_id;
  IF used_payment + NEW.amount_cents > p.amount_cents THEN
    RAISE EXCEPTION 'allocations never exceed the payment' USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(sum(a.amount_cents), 0) INTO used_deposit
    FROM finance.payment_allocations a JOIN finance.payments x ON x.id = a.payment_id
   WHERE a.deposit_requirement_id = r.id AND x.state NOT IN ('returned', 'voided');
  IF used_deposit + NEW.amount_cents > r.amount_cents THEN
    RAISE EXCEPTION 'allocations never exceed the deposit' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payment_allocations_guard BEFORE INSERT OR UPDATE OR DELETE ON finance.payment_allocations
  FOR EACH ROW EXECUTE FUNCTION finance.payment_allocation_guard();

CREATE TABLE finance.deposit_waivers (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_requirement_id uuid NOT NULL UNIQUE,
  job_id                 uuid NOT NULL,
  waived_by              uuid NOT NULL REFERENCES identity.staff_users (id),
  reason                 text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 2000 AND reason = btrim(reason)),
  -- The Owner's session and its last password or second-factor entry (the fresh sign-in, OWN-DEC-76).
  staff_session_id       uuid NOT NULL REFERENCES identity.staff_sessions (id),
  authenticated_at       timestamptz NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deposit_waivers_requirement FOREIGN KEY (deposit_requirement_id, job_id)
    REFERENCES finance.deposit_requirements (id, job_id),
  CONSTRAINT deposit_waivers_fresh CHECK (authenticated_at <= created_at)
);
COMMENT ON TABLE finance.deposit_waivers IS
  'The Owner''s job-specific deposit waiver with its reason (OWN-DEC-76): append-only, one per requirement.';

-- A waiver is the Owner's, for a deposit still required (not satisfied, applied or not required), recorded once.
CREATE FUNCTION finance.deposit_waiver_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'deposit waivers are append-only: they are never changed or deleted'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.role_grants g WHERE g.staff_user_id = NEW.waived_by AND g.kind = 'role'
                 AND g.name = 'owner' AND g.ended_at IS NULL AND g.effective_from <= now()) THEN
    RAISE EXCEPTION 'only the Owner waives a required deposit' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- The session's own last password or second-factor entry is what the waiver keeps (never a client value).
  SELECT s.authenticated_at INTO NEW.authenticated_at FROM identity.staff_sessions s
   WHERE s.id = NEW.staff_session_id AND s.staff_user_id = NEW.waived_by AND s.revoked_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a waiver names the Owner''s own live session' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM 1 FROM finance.deposit_requirements WHERE id = NEW.deposit_requirement_id FOR UPDATE;
  IF finance.deposit_state_of(NEW.deposit_requirement_id) NOT IN ('required', 'partly_satisfied') THEN
    RAISE EXCEPTION 'only a deposit still required is waived' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER deposit_waivers_guard BEFORE INSERT OR UPDATE OR DELETE ON finance.deposit_waivers
  FOR EACH ROW EXECUTE FUNCTION finance.deposit_waiver_guard();

-- Verified money applied to a requirement: payments recorded (cash, card, Zelle, Cash App, Chime: verified before
-- they are recorded) or reconciled, and checks only once cleared. Pending: checks received or deposited.
CREATE FUNCTION finance.deposit_verified_cents(p_requirement uuid) RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT COALESCE(sum(a.amount_cents), 0)::bigint
    FROM finance.payment_allocations a JOIN finance.payments p ON p.id = a.payment_id
   WHERE a.deposit_requirement_id = p_requirement AND p.state IN ('recorded', 'reconciled', 'cleared')
$$;
CREATE FUNCTION finance.deposit_pending_cents(p_requirement uuid) RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT COALESCE(sum(a.amount_cents), 0)::bigint
    FROM finance.payment_allocations a JOIN finance.payments p ON p.id = a.payment_id
   WHERE a.deposit_requirement_id = p_requirement AND p.state IN ('received', 'deposited')
$$;

-- The state a requirement's money and waiver give it.
CREATE FUNCTION finance.deposit_state_of(p_requirement uuid) RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE
  r record;
  verified bigint;
BEGIN
  SELECT id, required, amount_cents INTO r FROM finance.deposit_requirements WHERE id = p_requirement;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT r.required THEN RETURN 'not_required'; END IF;
  IF EXISTS (SELECT 1 FROM finance.deposit_waivers w WHERE w.deposit_requirement_id = r.id) THEN RETURN 'waived'; END IF;
  verified := finance.deposit_verified_cents(r.id);
  IF verified >= r.amount_cents THEN RETURN 'satisfied'; END IF;
  IF verified > 0 THEN RETURN 'partly_satisfied'; END IF;
  RETURN 'required';
END $$;

-- A requirement keeps its job, approval and amounts; its state is always the one its money and waiver give it; the
-- payment link is set only by staff (with who and when); it is never deleted.
CREATE FUNCTION finance.deposit_requirement_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'deposit requirements are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> (CASE WHEN NEW.required THEN 'required' ELSE 'not_required' END) OR NEW.version <> 1
       OR NEW.payment_link IS NOT NULL THEN
      RAISE EXCEPTION 'a deposit requirement starts required or not required' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM estimating.approvals a JOIN work.jobs j ON j.approval_id = a.id
       WHERE a.id = NEW.approval_id AND j.id = NEW.job_id AND a.project_id = NEW.project_id
         AND a.deposit_rule_version = NEW.rule_version AND a.total_cents = NEW.base_total_cents
         AND (a.deposit_state = 'required') = NEW.required AND a.deposit_cents IS NOT DISTINCT FROM NEW.amount_cents)
    THEN
      RAISE EXCEPTION 'a deposit requirement is the one its job''s approval pinned' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.job_id, NEW.project_id, NEW.approval_id, NEW.rule_version, NEW.base_total_cents, NEW.required,
      NEW.amount_cents, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.job_id, OLD.project_id, OLD.approval_id, OLD.rule_version, OLD.base_total_cents,
      OLD.required, OLD.amount_cents, OLD.created_at) THEN
    RAISE EXCEPTION 'a deposit requirement keeps its job, approval and amounts' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.state = 'applied' THEN
    RAISE EXCEPTION 'a deposit is applied with the final invoice''s credit' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.state IS DISTINCT FROM finance.deposit_state_of(NEW.id) THEN
    RAISE EXCEPTION 'a deposit''s state follows its verified money and waiver' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER deposit_requirements_guard BEFORE INSERT OR UPDATE OR DELETE ON finance.deposit_requirements
  FOR EACH ROW EXECUTE FUNCTION finance.deposit_requirement_guard();

-- The approval's job carries its deposit requirement from the moment it exists: written in the same transaction as
-- the job, from the approval's pinned deposit (RULE-MONEY-CENTS: never recomputed here).
CREATE FUNCTION finance.job_deposit_requirement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO finance.deposit_requirements (job_id, project_id, approval_id, rule_version, base_total_cents, required,
                                            amount_cents, state, created_at)
  SELECT NEW.id, NEW.project_id, a.id, a.deposit_rule_version, a.total_cents, a.deposit_state = 'required',
         a.deposit_cents, CASE WHEN a.deposit_state = 'required' THEN 'required' ELSE 'not_required' END, NEW.created_at
    FROM estimating.approvals a WHERE a.id = NEW.approval_id;
  RETURN NULL;
END $$;
CREATE TRIGGER jobs_deposit_requirement AFTER INSERT ON work.jobs
  FOR EACH ROW EXECUTE FUNCTION finance.job_deposit_requirement();

-- The stored state follows the money and the waiver in the same statement that changes them: an allocation, a
-- payment's move (a check cleared) or a waiver refreshes the requirements it touches.
CREATE FUNCTION finance.refresh_deposit_state(p_requirement uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  next_state text := finance.deposit_state_of(p_requirement);
BEGIN
  UPDATE finance.deposit_requirements SET state = next_state, version = version + 1
   WHERE id = p_requirement AND state IS DISTINCT FROM next_state;
END $$;
CREATE FUNCTION finance.allocation_refresh() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM finance.refresh_deposit_state(NEW.deposit_requirement_id);
  RETURN NULL;
END $$;
CREATE TRIGGER payment_allocations_refresh AFTER INSERT ON finance.payment_allocations
  FOR EACH ROW EXECUTE FUNCTION finance.allocation_refresh();
CREATE TRIGGER deposit_waivers_refresh AFTER INSERT ON finance.deposit_waivers
  FOR EACH ROW EXECUTE FUNCTION finance.allocation_refresh();
CREATE FUNCTION finance.payment_refresh() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM finance.refresh_deposit_state(a.deposit_requirement_id)
     FROM finance.payment_allocations a WHERE a.payment_id = NEW.id;
  RETURN NULL;
END $$;
CREATE TRIGGER payments_refresh AFTER UPDATE OF state ON finance.payments
  FOR EACH ROW EXECUTE FUNCTION finance.payment_refresh();

-- Jobs approved before this migration get theirs now.
INSERT INTO finance.deposit_requirements (job_id, project_id, approval_id, rule_version, base_total_cents, required,
                                          amount_cents, state, created_at)
SELECT j.id, j.project_id, a.id, a.deposit_rule_version, a.total_cents, a.deposit_state = 'required', a.deposit_cents,
       CASE WHEN a.deposit_state = 'required' THEN 'required' ELSE 'not_required' END, j.created_at
  FROM work.jobs j JOIN estimating.approvals a ON a.id = j.approval_id
 WHERE NOT EXISTS (SELECT 1 FROM finance.deposit_requirements r WHERE r.job_id = j.id);

-- The work-scheduling gate (HH-SCH-06, HH-FIN-02): whether a work visit of this job may be confirmed, as far as the
-- deposit goes. It share-locks the requirement, so it must run in the confirming transaction. Answers:
-- 'not_required', 'satisfied' (verified money covers the amount; an uncleared check never does) or 'waived' (the
-- Owner's waiver) open the gate; 'required' or 'missing' (no requirement: the job has no approval yet) keep it shut.
CREATE FUNCTION finance.work_visit_deposit_gate(p_job uuid) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  r record;
  state text;
BEGIN
  SELECT id INTO r FROM finance.deposit_requirements WHERE job_id = p_job FOR SHARE;
  IF NOT FOUND THEN RETURN 'missing'; END IF;
  -- From the money and the waiver themselves, never only the stored state.
  state := finance.deposit_state_of(r.id);
  RETURN CASE WHEN state IN ('not_required', 'satisfied', 'waived') THEN state ELSE 'required' END;
END $$;
COMMENT ON FUNCTION finance.work_visit_deposit_gate(uuid) IS
  'Deposit gate of work-visit confirmation (HH-SCH-06): open when not_required, satisfied or waived.';

-- INT-Square: a staff-pasted payment link is https on a Square host. The graph names no host list, so the hosts of
-- Square's own payment-link and checkout pages are PROPOSED (proposed = true) until the Owner or Office confirms them.
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by) VALUES
  ('payment.square_link_hosts', 1, 'configured', '{"hosts": ["square.link", "checkout.square.site", "squareup.com"]}',
   true, ARRAY['INT-Square', 'OWN-DEC-67', 'OWN-DEC-138'], 'migration:0048');
