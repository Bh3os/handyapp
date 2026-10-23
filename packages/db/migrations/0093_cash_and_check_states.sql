-- 0093 Cash collection and checks pending until cleared (TSK-0088; HH-FIN-11, HH-FIN-12, T59, T62, OWN-DEC-138,
-- OWN-DEC-200). The server decides who may move a payment (apps/server/src/modules/finance/payment-states.ts); this
-- migration keeps the records true whatever path writes.
-- - finance.payments gains an optional memo (cash, HH-FIN-11), and who marked a check deposited and who reconciled a
--   payment, with when. A payment is still never edited: only its state moves forward.
-- - The moves: a check received -> deposited (the Owner or Office) -> cleared (the Owner only, never one they collected,
--   as before); any other payment recorded -> reconciled (the Owner or Office, never one they collected). Returned and
--   voided stay TSK-0089's.

ALTER TABLE finance.payments
  ADD COLUMN memo          text CHECK (char_length(btrim(memo)) BETWEEN 1 AND 500),
  ADD COLUMN deposited_by  uuid REFERENCES identity.staff_users (id),
  ADD COLUMN deposited_at  timestamptz,
  ADD COLUMN reconciled_by uuid REFERENCES identity.staff_users (id),
  ADD COLUMN reconciled_at timestamptz,
  ADD CONSTRAINT payments_deposited CHECK ((deposited_by IS NULL) = (deposited_at IS NULL)),
  ADD CONSTRAINT payments_reconciled CHECK ((reconciled_by IS NULL) = (reconciled_at IS NULL));

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
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'state' - 'cleared_by' - 'cleared_at' - 'deposited_by' - 'deposited_at' - 'reconciled_by'
        - 'reconciled_at' - 'version')
     IS DISTINCT FROM (to_jsonb(OLD) - 'state' - 'cleared_by' - 'cleared_at' - 'deposited_by' - 'deposited_at'
        - 'reconciled_by' - 'reconciled_at' - 'version') THEN
    RAISE EXCEPTION 'a recorded payment is never edited' USING ERRCODE = 'restrict_violation';
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
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'this payment state change is not available' USING ERRCODE = 'check_violation';
END $$;
