-- 0096 The reconciliation queue for unmatched and uncertain money (TSK-0090; HH-FIN-15, HH-FIN-09, HH-FIN-08, T61,
-- ENT-Payment, ENT-Refund, OWN-DEC-111, RULE-SERVER-AUTHZ). The server decides who may do what
-- (apps/server/src/modules/finance/reconciliation.ts); this migration keeps the records true whatever path writes.
-- - finance.reconciliation_items: money staff cannot match yet, reported by the Owner or Office: an uncertain outcome
--   (a customer says a Square payment failed midway and it is not in Square yet), money received that matches no
--   payment, an amount or currency mismatch, a duplicate entry, or a Square payment whose reference does not match.
--   Each keeps what was seen: the source, method, amount, currency, reference, the job or payment it concerns and a
--   description. Reporting it records nothing and changes no balance (HH-FIN-09).
-- - It never resolves itself: a person resolves it once, with the resolution and its evidence. Matched and recorded
--   name the verified payment (one item per payment, so a retry recorded once never makes a double entry); routine
--   matching may be Office's, every other resolution is the Owner's (PROPOSED). Never changed afterwards, never deleted.
-- Checks still pending, returned payments, open disputes and refunds whose outcome is not certain are listed in the
-- same queue from their own records (no copy here).

CREATE TABLE finance.reconciliation_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                text NOT NULL CHECK (kind IN ('uncertain_outcome', 'unmatched_payment', 'amount_mismatch',
                        'currency_mismatch', 'duplicate_entry', 'reference_mismatch')),
  -- Where it was seen: the customer's word, Square, the bank, or staff's own records.
  source              text NOT NULL CHECK (source IN ('customer', 'square', 'bank', 'staff')),
  project_id          uuid REFERENCES crm.projects (id),
  job_id              uuid,
  -- The recorded payment it concerns (an amount mismatch, a duplicate entry, a reference that does not match).
  payment_id          uuid REFERENCES finance.payments (id),
  method              text CHECK (method IN ('square_payment_link', 'square_tap_to_pay', 'cash', 'check', 'zelle',
                        'cash_app', 'chime')),
  amount_cents        bigint CHECK (amount_cents > 0),
  currency            text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  reference           text CHECK (char_length(reference) BETWEEN 1 AND 120 AND reference = btrim(reference)),
  description         text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 2000
                        AND description = btrim(description)),
  reported_by         uuid NOT NULL REFERENCES identity.staff_users (id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  state               text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'resolved')),
  resolution          text CHECK (resolution IN ('matched', 'recorded', 'not_received', 'duplicate', 'corrected',
                        'refunded', 'no_action')),
  -- The evidence of the resolution, in the resolver's words.
  evidence            text CHECK (char_length(evidence) BETWEEN 1 AND 2000 AND evidence = btrim(evidence)),
  resolved_payment_id uuid REFERENCES finance.payments (id),
  resolved_by         uuid REFERENCES identity.staff_users (id),
  resolved_at         timestamptz,
  version             integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT reconciliation_items_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id),
  CONSTRAINT reconciliation_items_job_project CHECK (job_id IS NULL OR project_id IS NOT NULL),
  CONSTRAINT reconciliation_items_resolved CHECK (
    (state = 'resolved') = (resolution IS NOT NULL) AND (resolution IS NULL) = (evidence IS NULL)
    AND (resolution IS NULL) = (resolved_by IS NULL) AND (resolved_by IS NULL) = (resolved_at IS NULL)),
  CONSTRAINT reconciliation_items_payment_named CHECK (
    (resolution IN ('matched', 'recorded')) = (resolved_payment_id IS NOT NULL))
);
-- One item per verified payment it was resolved by (HH-FIN-07: never a double entry).
CREATE UNIQUE INDEX reconciliation_items_one_per_payment ON finance.reconciliation_items (resolved_payment_id)
  WHERE resolved_payment_id IS NOT NULL;
CREATE INDEX reconciliation_items_open ON finance.reconciliation_items (created_at) WHERE state = 'open';
CREATE INDEX reconciliation_items_project ON finance.reconciliation_items (project_id) WHERE project_id IS NOT NULL;
COMMENT ON TABLE finance.reconciliation_items IS
  'Unmatched or uncertain money for a person to resolve with evidence (HH-FIN-15): never resolved by itself.';

-- Reported open by the Owner or Office; resolved once, with evidence, by the Owner (matched or recorded: also Office),
-- naming a verified payment of the item's own project for matched or recorded; never changed afterwards or deleted.
CREATE FUNCTION finance.reconciliation_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  p record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'reconciliation items are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'open' OR NEW.version <> 1 OR NEW.resolution IS NOT NULL THEN
      RAISE EXCEPTION 'a reconciliation item is reported open' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT finance.has_live_role(NEW.reported_by, ARRAY['owner', 'office']) THEN
      RAISE EXCEPTION 'the Owner or Office reports a reconciliation item' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.payment_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM finance.payments x WHERE x.id = NEW.payment_id
         AND x.project_id IS NOT DISTINCT FROM COALESCE(NEW.project_id, x.project_id)) THEN
      RAISE EXCEPTION 'a reconciliation item names a payment of its own project' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.state <> 'open' THEN
    RAISE EXCEPTION 'a resolved reconciliation item never changes' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (to_jsonb(NEW) - 'state' - 'resolution' - 'evidence' - 'resolved_payment_id' - 'resolved_by' - 'resolved_at'
      - 'version')
     IS DISTINCT FROM (to_jsonb(OLD) - 'state' - 'resolution' - 'evidence' - 'resolved_payment_id' - 'resolved_by'
      - 'resolved_at' - 'version') THEN
    RAISE EXCEPTION 'a reconciliation item keeps what was seen' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.state <> 'resolved' THEN
    RAISE EXCEPTION 'this reconciliation change is not available' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT finance.has_live_role(NEW.resolved_by,
       (CASE WHEN NEW.resolution IN ('matched', 'recorded') THEN ARRAY['owner', 'office'] ELSE ARRAY['owner'] END)) THEN
    RAISE EXCEPTION 'only the Owner (routine matching: also Office) resolves a reconciliation item'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.resolved_payment_id IS NOT NULL THEN
    SELECT id, project_id, state INTO p FROM finance.payments WHERE id = NEW.resolved_payment_id;
    IF NOT FOUND OR (NEW.project_id IS NOT NULL AND p.project_id <> NEW.project_id) THEN
      RAISE EXCEPTION 'a reconciliation item is matched to a payment of its own project'
        USING ERRCODE = 'check_violation';
    END IF;
    IF p.state NOT IN ('recorded', 'reconciled', 'received', 'deposited', 'cleared') THEN
      RAISE EXCEPTION 'a reconciliation item is matched to a payment that stands' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.resolved_at := now();
  NEW.version := OLD.version + 1;
  RETURN NEW;
END $$;
CREATE TRIGGER reconciliation_items_guard BEFORE INSERT OR UPDATE OR DELETE ON finance.reconciliation_items
  FOR EACH ROW EXECUTE FUNCTION finance.reconciliation_item_guard();

-- A staging reset is the only path that empties this table (TSK-0141).
CREATE TRIGGER reconciliation_items_reset_only_truncate BEFORE TRUNCATE ON finance.reconciliation_items
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();
