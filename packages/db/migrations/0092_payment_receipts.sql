-- 0092 Payment receipts (TSK-0087 part 2; HH-FIN-11, HH-FIN-09, HH-PORT-12, FACT-AUTOMATIC-MESSAGES #20, T59, T62,
-- OWN-DEC-111, OWN-DEC-152). The server issues them (apps/server/src/modules/finance/receipts.ts); this migration keeps
-- the records true whatever path writes.
-- - finance.payment_receipts: one receipt per confirmed recorded payment (recorded, reconciled or cleared: a check only
--   once the Owner cleared it), numbered per project (<reference>-R<n>, with its payment number <reference>-P<n>), with
--   what it paid, what remained after it and whether that makes it a partial payment. Never on initiation, never for
--   a payment still pending; once per payment whatever retries; never changed or deleted.
-- - The receipt message (payment.receipt) is the committed payment.receipt_issued event's: once per receipt.

CREATE TABLE finance.payment_receipts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id          uuid NOT NULL UNIQUE REFERENCES finance.payments (id),
  project_id          uuid NOT NULL REFERENCES crm.projects (id),
  job_id              uuid NOT NULL REFERENCES work.jobs (id),
  -- The invoice the payment paid (a deposit payment: the deposit invoice once one is issued), if any.
  invoice_id          uuid REFERENCES finance.invoices (id),
  sequence            integer NOT NULL CHECK (sequence >= 1),
  number              text NOT NULL,
  payment_number      text NOT NULL,
  amount_cents        bigint NOT NULL CHECK (amount_cents > 0),
  applied_cents       bigint NOT NULL CHECK (applied_cents >= 0 AND applied_cents <= amount_cents),
  -- What the invoice (or the deposit) still asked for once this payment counted.
  balance_after_cents bigint NOT NULL CHECK (balance_after_cents >= 0),
  partial             boolean NOT NULL,
  issued_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, sequence),
  CONSTRAINT payment_receipts_partial CHECK (partial = (balance_after_cents > 0))
);
CREATE INDEX payment_receipts_project ON finance.payment_receipts (project_id, sequence);
COMMENT ON TABLE finance.payment_receipts IS
  'One receipt per confirmed recorded payment (HH-FIN-11, OWN-DEC-152); numbered per project; never changed.';

CREATE FUNCTION finance.payment_receipt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  p record;
  ref text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'payment receipts are kept as issued, never changed or deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  SELECT project_id, job_id, state, amount_cents INTO p FROM finance.payments WHERE id = NEW.payment_id;
  IF (p.project_id, p.job_id, p.amount_cents) IS DISTINCT FROM (NEW.project_id, NEW.job_id, NEW.amount_cents) THEN
    RAISE EXCEPTION 'a receipt names its payment''s own project, job and amount' USING ERRCODE = 'check_violation';
  END IF;
  IF p.state NOT IN ('recorded', 'reconciled', 'cleared') THEN
    RAISE EXCEPTION 'a receipt is issued only for a confirmed payment (a check once cleared)'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.invoice_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM finance.invoices i WHERE i.id = NEW.invoice_id AND i.job_id = NEW.job_id) THEN
    RAISE EXCEPTION 'a receipt names its own job''s invoice' USING ERRCODE = 'check_violation';
  END IF;
  SELECT reference INTO ref FROM crm.projects WHERE id = NEW.project_id;
  IF NEW.number IS DISTINCT FROM (ref || '-R' || NEW.sequence)
     OR NEW.payment_number IS DISTINCT FROM (ref || '-P' || NEW.sequence) THEN
    RAISE EXCEPTION 'a receipt number is its project reference and sequence' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payment_receipts_guard BEFORE INSERT OR UPDATE OR DELETE ON finance.payment_receipts
  FOR EACH ROW EXECUTE FUNCTION finance.payment_receipt_guard();

-- A staging reset is the only path that empties this table (TSK-0141).
CREATE TRIGGER payment_receipts_reset_only_truncate BEFORE TRUNCATE ON finance.payment_receipts
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();
