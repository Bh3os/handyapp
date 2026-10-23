-- 0094 Payment exceptions: returned checks, failed and disputed payments, voids and corrections (TSK-0089 part 1;
-- HH-FIN-13, HH-FIN-14, HH-FIN-03, T63, ENT-Payment, ENT-PaymentAllocation, OWN-DEC-111, OWN-DEC-138,
-- RULE-MONEY-CENTS, RULE-SERVER-AUTHZ). The server decides who may record what
-- (apps/server/src/modules/finance/exceptions.ts); this migration keeps the records true whatever path writes.
-- - finance.payment_adjustments: what happened to a recorded payment afterwards, appended and never changed: a check
--   returned by the bank, a card or digital payment that failed, a dispute opened and its outcome (won or lost), or a
--   payment voided because it was recorded wrongly. Each has a reason, optional evidence (the bank notice, the Square
--   dispute ID), who recorded it and, for the Owner's own actions, the Owner's session and its last sign-in.
-- - A payment is still never edited or deleted. Returned, failed and a dispute lost move it to returned; a void moves
--   it to voided; the move is allowed only with its adjustment written in the same transaction. Every allocation of
--   that payment then gets its reversing allocation (positive magnitude, OWN-DEC-203), appended with the adjustment.
--   Money functions already count only payments still confirmed or pending, so the balance reopens and a deposit it
--   satisfied reverts to required; the receipt is kept as issued and shows voided.
-- - A deposit already credited to the final invoice: the final invoice's deposit credit now follows the deposit's
--   verified money, so a returned or voided deposit payment reopens the final invoice's balance instead.
-- - A correction is a new payment naming the voided one it corrects (once); the same method and reference may then
--   be recorded again (a voided payment no longer holds its reference).
-- - A dispute: while open the payment still counts (PROPOSED, OQ-PAYMENT-EXCEPTION-DETAILS) and nothing else may
--   happen to the payment; won closes it with no money change; lost returns the payment.

CREATE TABLE finance.payment_adjustments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id       uuid NOT NULL REFERENCES finance.payments (id),
  project_id       uuid NOT NULL,
  job_id           uuid NOT NULL,
  kind             text NOT NULL CHECK (kind IN ('returned', 'failed', 'dispute_opened', 'dispute_won', 'dispute_lost',
                     'voided')),
  -- The payment's state before and after (the same for a dispute opened or won).
  from_state       text NOT NULL,
  to_state         text NOT NULL,
  reason           text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 2000 AND reason = btrim(reason)),
  evidence         text CHECK (char_length(evidence) BETWEEN 1 AND 500 AND evidence = btrim(evidence)),
  recorded_by      uuid NOT NULL REFERENCES identity.staff_users (id),
  -- The Owner's session and its last password or second-factor entry (every kind but a returned check).
  staff_session_id uuid REFERENCES identity.staff_sessions (id),
  authenticated_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_adjustments_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id),
  CONSTRAINT payment_adjustments_moves CHECK (
    (kind IN ('returned', 'failed', 'dispute_lost') AND to_state = 'returned')
    OR (kind = 'voided' AND to_state = 'voided')
    OR (kind IN ('dispute_opened', 'dispute_won') AND to_state = from_state)),
  CONSTRAINT payment_adjustments_step_up CHECK (
    (staff_session_id IS NULL) = (authenticated_at IS NULL) AND (kind = 'returned' OR staff_session_id IS NOT NULL))
);
CREATE INDEX payment_adjustments_payment ON finance.payment_adjustments (payment_id, created_at);
CREATE INDEX payment_adjustments_job ON finance.payment_adjustments (job_id);
COMMENT ON TABLE finance.payment_adjustments IS
  'What happened to a recorded payment afterwards (HH-FIN-13): returned, failed, disputed, voided; append-only.';

-- Whether a payment has a dispute opened and not yet won or lost.
CREATE FUNCTION finance.payment_dispute_open(p_payment uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT count(*) FILTER (WHERE kind = 'dispute_opened') > count(*) FILTER (WHERE kind IN ('dispute_won', 'dispute_lost'))
    FROM finance.payment_adjustments WHERE payment_id = p_payment
$$;

-- An adjustment names its payment's job and current state, is one the payment's method and state allow, and is
-- recorded by the Owner (a returned check: the Owner or Office) from their own live session where one is named.
CREATE FUNCTION finance.payment_adjustment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  p record;
  disputed boolean;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'payment adjustments are kept as recorded, never changed or deleted'
      USING ERRCODE = 'restrict_violation';
  END IF;
  SELECT id, project_id, job_id, method, state INTO p FROM finance.payments WHERE id = NEW.payment_id FOR UPDATE;
  IF (p.project_id, p.job_id) IS DISTINCT FROM (NEW.project_id, NEW.job_id) THEN
    RAISE EXCEPTION 'an adjustment names its payment''s own project and job' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.from_state IS DISTINCT FROM p.state THEN
    RAISE EXCEPTION 'an adjustment starts from its payment''s current state' USING ERRCODE = 'check_violation';
  END IF;
  disputed := finance.payment_dispute_open(p.id);
  IF NOT (CASE NEW.kind
    WHEN 'returned' THEN p.method = 'check' AND p.state IN ('received', 'deposited', 'cleared')
    WHEN 'failed' THEN p.method <> 'check' AND p.state IN ('recorded', 'reconciled') AND NOT disputed
    WHEN 'dispute_opened' THEN p.method <> 'check' AND p.state IN ('recorded', 'reconciled') AND NOT disputed
    WHEN 'dispute_won' THEN disputed
    WHEN 'dispute_lost' THEN disputed
    WHEN 'voided' THEN p.state NOT IN ('returned', 'voided') AND NOT disputed
    ELSE false END) THEN
    RAISE EXCEPTION 'this payment adjustment is not available' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT finance.has_live_role(NEW.recorded_by,
       (CASE WHEN NEW.kind = 'returned' THEN ARRAY['owner', 'office'] ELSE ARRAY['owner'] END)) THEN
    RAISE EXCEPTION 'only the Owner (a returned check: the Owner or Office) records a payment adjustment'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.staff_session_id IS NOT NULL THEN
    SELECT s.authenticated_at INTO NEW.authenticated_at FROM identity.staff_sessions s
     WHERE s.id = NEW.staff_session_id AND s.staff_user_id = NEW.recorded_by AND s.revoked_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'an adjustment names its recorder''s own live session' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payment_adjustments_guard BEFORE INSERT OR UPDATE OR DELETE ON finance.payment_adjustments
  FOR EACH ROW EXECUTE FUNCTION finance.payment_adjustment_guard();

-- Payments: a returned or voided payment of any method; a cleared check may later be returned (its clearing kept);
-- a correction names the voided payment it corrects; a voided payment no longer holds its method and reference.
ALTER TABLE finance.payments
  ADD COLUMN corrects_payment_id uuid UNIQUE REFERENCES finance.payments (id),
  DROP CONSTRAINT payments_check_states,
  ADD CONSTRAINT payments_check_states CHECK (
    state IN ('returned', 'voided') OR (method = 'check') = (state IN ('received', 'deposited', 'cleared'))),
  DROP CONSTRAINT payments_cleared,
  ADD CONSTRAINT payments_cleared CHECK (
    (state <> 'cleared' OR cleared_by IS NOT NULL) AND (cleared_by IS NULL) = (cleared_at IS NULL)
    AND (cleared_by IS NULL OR state IN ('cleared', 'returned', 'voided'))),
  ADD CONSTRAINT payments_correction CHECK (corrects_payment_id IS DISTINCT FROM id);
DROP INDEX finance.payments_method_reference;
CREATE UNIQUE INDEX payments_method_reference ON finance.payments (method, reference)
  WHERE reference IS NOT NULL AND state <> 'voided';

-- As 0093, plus: a payment inserted as a correction names a voided payment of its own job; a payment moves to
-- returned or voided only with its adjustment written in this transaction, changing nothing else.
CREATE OR REPLACE FUNCTION finance.payment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'payments are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.state NOT IN ('recorded', 'received') OR NEW.version <> 1 OR NEW.cleared_by IS NOT NULL
       OR NEW.deposited_by IS NOT NULL OR NEW.reconciled_by IS NOT NULL THEN
      RAISE EXCEPTION 'a payment is recorded as received (a check) or recorded' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.corrects_payment_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM finance.payments o WHERE o.id = NEW.corrects_payment_id AND o.state = 'voided'
         AND o.job_id = NEW.job_id AND o.project_id = NEW.project_id) THEN
      RAISE EXCEPTION 'a correction names a voided payment of its own job' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'state' - 'cleared_by' - 'cleared_at' - 'deposited_by' - 'deposited_at' - 'reconciled_by'
        - 'reconciled_at' - 'version')
     IS DISTINCT FROM (to_jsonb(OLD) - 'state' - 'cleared_by' - 'cleared_at' - 'deposited_by' - 'deposited_at'
        - 'reconciled_by' - 'reconciled_at' - 'version') THEN
    RAISE EXCEPTION 'a recorded payment is never edited' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.state IN ('returned', 'voided') AND OLD.state NOT IN ('returned', 'voided') THEN
    IF (NEW.cleared_by, NEW.cleared_at, NEW.deposited_by, NEW.deposited_at, NEW.reconciled_by, NEW.reconciled_at)
       IS DISTINCT FROM
       (OLD.cleared_by, OLD.cleared_at, OLD.deposited_by, OLD.deposited_at, OLD.reconciled_by, OLD.reconciled_at) THEN
      RAISE EXCEPTION 'returning or voiding a payment changes nothing else' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM finance.payment_adjustments a
                    WHERE a.payment_id = NEW.id AND a.from_state = OLD.state AND a.to_state = NEW.state
                      AND a.xmin = pg_current_xact_id()::xid) THEN
      RAISE EXCEPTION 'a payment is returned or voided only with its adjustment' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.method = 'check' AND OLD.state = 'received' AND NEW.state = 'deposited' THEN
    IF NEW.deposited_by IS NULL OR OLD.deposited_by IS NOT NULL OR NEW.cleared_by IS DISTINCT FROM OLD.cleared_by
       OR NEW.reconciled_by IS DISTINCT FROM OLD.reconciled_by THEN
      RAISE EXCEPTION 'marking a check deposited records who and when, once' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT finance.has_live_role(NEW.deposited_by, ARRAY['owner', 'office']) THEN
      RAISE EXCEPTION 'the Owner or Office marks a check deposited' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.method = 'check' AND OLD.state IN ('received', 'deposited') AND NEW.state = 'cleared' THEN
    IF NEW.deposited_by IS DISTINCT FROM OLD.deposited_by OR NEW.reconciled_by IS DISTINCT FROM OLD.reconciled_by THEN
      RAISE EXCEPTION 'clearing a check changes nothing else' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT finance.has_live_role(NEW.cleared_by, ARRAY['owner']) THEN
      RAISE EXCEPTION 'only the Owner marks a check cleared' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.method <> 'check' AND OLD.state = 'recorded' AND NEW.state = 'reconciled' THEN
    IF NEW.reconciled_by IS NULL OR NEW.cleared_by IS DISTINCT FROM OLD.cleared_by
       OR NEW.deposited_by IS DISTINCT FROM OLD.deposited_by THEN
      RAISE EXCEPTION 'reconciling a payment records who and when, once' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT finance.has_live_role(NEW.reconciled_by, ARRAY['owner', 'office'])
       OR NEW.reconciled_by = OLD.collector_staff_id THEN
      RAISE EXCEPTION 'the Owner or Office reconciles a payment they did not collect'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF finance.payment_dispute_open(NEW.id) THEN
      RAISE EXCEPTION 'a disputed payment waits for its outcome' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'this payment state change is not available' USING ERRCODE = 'check_violation';
END $$;

-- Reversing allocations: appended once per allocation of a returned or voided payment, with its adjustment.
ALTER TABLE finance.payment_allocations
  ADD COLUMN reverses_allocation_id uuid UNIQUE REFERENCES finance.payment_allocations (id),
  ADD COLUMN adjustment_id uuid REFERENCES finance.payment_adjustments (id),
  ADD CONSTRAINT payment_allocations_reversal CHECK ((reverses_allocation_id IS NULL) = (adjustment_id IS NULL)),
  DROP CONSTRAINT payment_allocations_payment_id_deposit_requirement_id_key,
  DROP CONSTRAINT payment_allocations_once_per_invoice;
-- HH-FIN-07: a payment is applied to a deposit or an invoice once (its reversal aside).
CREATE UNIQUE INDEX payment_allocations_once_per_deposit ON finance.payment_allocations (payment_id,
  deposit_requirement_id) WHERE deposit_requirement_id IS NOT NULL AND reverses_allocation_id IS NULL;
CREATE UNIQUE INDEX payment_allocations_once_per_invoice ON finance.payment_allocations (payment_id, invoice_id)
  WHERE invoice_id IS NOT NULL AND reverses_allocation_id IS NULL;

-- As 0077, plus: a reversing allocation mirrors one original allocation of its own payment (same target and amount),
-- once, for a payment returned or voided by its adjustment.
CREATE OR REPLACE FUNCTION finance.payment_allocation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  r record;
  i record;
  p record;
  o record;
  adj record;
  used_deposit bigint;
  used_invoice bigint;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'allocations are append-only: a reversal is a new allocation' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.reverses_allocation_id IS NOT NULL THEN
    SELECT payment_id, deposit_requirement_id, invoice_id, amount_cents, reverses_allocation_id INTO o
      FROM finance.payment_allocations WHERE id = NEW.reverses_allocation_id;
    SELECT payment_id, to_state INTO adj FROM finance.payment_adjustments WHERE id = NEW.adjustment_id;
    SELECT state INTO p FROM finance.payments WHERE id = NEW.payment_id;
    IF o.reverses_allocation_id IS NOT NULL
       OR (o.payment_id, o.deposit_requirement_id, o.invoice_id, o.amount_cents)
          IS DISTINCT FROM (NEW.payment_id, NEW.deposit_requirement_id, NEW.invoice_id, NEW.amount_cents)
       OR adj.payment_id IS DISTINCT FROM NEW.payment_id OR adj.to_state NOT IN ('returned', 'voided')
       OR p.state IS DISTINCT FROM adj.to_state THEN
      RAISE EXCEPTION 'a reversing allocation mirrors an allocation of its returned or voided payment'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.deposit_requirement_id IS NOT NULL THEN
    SELECT id, job_id, required, amount_cents INTO r
      FROM finance.deposit_requirements WHERE id = NEW.deposit_requirement_id FOR UPDATE;
  ELSE
    SELECT id, job_id, kind, state, total_cents INTO i FROM finance.invoices WHERE id = NEW.invoice_id FOR UPDATE;
  END IF;
  SELECT id, job_id, amount_cents, state INTO p FROM finance.payments WHERE id = NEW.payment_id FOR SHARE;
  IF p.state IN ('returned', 'voided') THEN
    RAISE EXCEPTION 'a returned or voided payment is not applied' USING ERRCODE = 'check_violation';
  END IF;
  IF finance.payment_used_cents(p.id) + NEW.amount_cents > p.amount_cents THEN
    RAISE EXCEPTION 'allocations never exceed the payment' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.deposit_requirement_id IS NOT NULL THEN
    IF r.job_id IS DISTINCT FROM p.job_id THEN
      RAISE EXCEPTION 'a payment is applied to the deposit of its own job' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT r.required THEN
      RAISE EXCEPTION 'this job needs no deposit' USING ERRCODE = 'check_violation';
    END IF;
    SELECT COALESCE(sum(a.amount_cents), 0) INTO used_deposit
      FROM finance.payment_allocations a JOIN finance.payments x ON x.id = a.payment_id
     WHERE a.deposit_requirement_id = r.id AND x.state NOT IN ('returned', 'voided');
    IF used_deposit + NEW.amount_cents > r.amount_cents THEN
      RAISE EXCEPTION 'allocations never exceed the deposit' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF i.job_id IS DISTINCT FROM p.job_id THEN
    RAISE EXCEPTION 'a payment is applied to an invoice of its own job' USING ERRCODE = 'check_violation';
  END IF;
  IF i.kind <> 'final' THEN
    RAISE EXCEPTION 'a deposit invoice is paid through its deposit' USING ERRCODE = 'check_violation';
  END IF;
  IF i.state NOT IN ('issued', 'partially_paid') THEN
    RAISE EXCEPTION 'a payment is applied to an issued invoice with a balance' USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(sum(a.amount_cents), 0) INTO used_invoice
    FROM finance.payment_allocations a JOIN finance.payments x ON x.id = a.payment_id
   WHERE a.invoice_id = i.id AND x.state NOT IN ('returned', 'voided');
  IF finance.invoice_credits_cents(i.id) + used_invoice + NEW.amount_cents > i.total_cents THEN
    RAISE EXCEPTION 'allocations never exceed the invoice' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- At commit: a payment returned or voided by an adjustment is in that state, and each of its allocations is reversed.
CREATE FUNCTION finance.payment_adjustment_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.to_state IN ('returned', 'voided') AND NEW.to_state <> NEW.from_state THEN
    IF NOT EXISTS (SELECT 1 FROM finance.payments p WHERE p.id = NEW.payment_id AND p.state = NEW.to_state) THEN
      RAISE EXCEPTION 'an adjustment moves its payment' USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM finance.payment_allocations a
                WHERE a.payment_id = NEW.payment_id AND a.reverses_allocation_id IS NULL
                  AND NOT EXISTS (SELECT 1 FROM finance.payment_allocations x WHERE x.reverses_allocation_id = a.id))
    THEN
      RAISE EXCEPTION 'every allocation of a returned or voided payment is reversed' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER payment_adjustments_check AFTER INSERT ON finance.payment_adjustments
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance.payment_adjustment_check();

-- Money a payment can still give: its amount less its allocations (reversals aside) and its refunds not failed.
CREATE OR REPLACE FUNCTION finance.payment_used_cents(p_payment uuid) RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT (SELECT COALESCE(sum(amount_cents), 0) FROM finance.payment_allocations
           WHERE payment_id = p_payment AND reverses_allocation_id IS NULL)
       + (SELECT COALESCE(sum(amount_cents), 0) FROM finance.refunds
           WHERE payment_id = p_payment AND type = 'refund' AND state NOT IN ('failed'))
$$;

-- A final invoice's deposit credit follows the deposit's verified money: never more than was pinned at issue, and
-- less once a deposit payment is returned or voided.
CREATE OR REPLACE FUNCTION finance.invoice_credits_cents(p_invoice uuid) RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT (SELECT CASE WHEN i.deposit_credit_cents > 0
                      THEN LEAST(i.deposit_credit_cents, finance.deposit_verified_cents(i.deposit_requirement_id))
                      ELSE 0 END
            FROM finance.invoices i WHERE i.id = p_invoice)
       + (SELECT COALESCE(sum(amount_cents), 0) FROM finance.refunds
           WHERE invoice_id = p_invoice AND type = 'credit' AND state = 'applied')
$$;

-- A payment's state change refreshes the deposits it was applied to and every invoice of those deposits (the deposit
-- invoice, and a final invoice crediting the deposit), and the invoices it was applied to.
CREATE OR REPLACE FUNCTION finance.payment_refresh() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM finance.refresh_deposit_state(a.deposit_requirement_id)
     FROM finance.payment_allocations a
    WHERE a.payment_id = NEW.id AND a.deposit_requirement_id IS NOT NULL AND a.reverses_allocation_id IS NULL;
  PERFORM finance.refresh_invoice_state(i.id)
     FROM finance.invoices i
    WHERE i.deposit_requirement_id IN (
            SELECT a.deposit_requirement_id FROM finance.payment_allocations a WHERE a.payment_id = NEW.id)
       OR i.id IN (SELECT a.invoice_id FROM finance.payment_allocations a WHERE a.payment_id = NEW.id);
  RETURN NULL;
END $$;

-- A staging reset is the only path that empties this table (TSK-0141).
CREATE TRIGGER payment_adjustments_reset_only_truncate BEFORE TRUNCATE ON finance.payment_adjustments
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();
