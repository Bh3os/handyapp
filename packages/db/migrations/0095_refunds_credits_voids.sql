-- 0095 Refunds, credits, write-offs and invoice voids (TSK-0089 part 2; HH-FIN-14, HH-FIN-03, HH-FIN-07, T63, T64,
-- ENT-Refund, ENT-Invoice, OWN-DEC-76, OWN-DEC-134, OWN-DEC-138, RULE-MONEY-CENTS, RULE-SERVER-AUTHZ, RULE-HUMAN-REVIEW).
-- The server decides who may do what (apps/server/src/modules/finance/adjustments.ts); this migration keeps the
-- records true whatever path writes.
-- - finance.refunds (0077) gains the Owner's decision reason and a declined refund (a request the Owner turns down;
--   a declined credit or write-off is voided, as 0077 allows). A declined or failed refund gives its money back.
-- - Write-offs count: an approved write-off lowers what an issued final invoice still asks for (never automatic,
--   never beyond it), so payments, credits and write-offs together never exceed the invoice. Paid still means
--   confirmed payments and credits reach the total: a written-off invoice is never Paid.
-- - finance.invoice_voids: the Owner's void of an issued invoice, with the reason and the Owner's session, once. An
--   invoice is voided only with its void record and only while no payment (confirmed or pending), credit or write-off
--   is on it; it is never deleted, and the job may then have a new one (its reissue). A voided final invoice gives
--   back its deposit credit: the deposit is credited again by the reissue, once per invoice that is not voided.

ALTER TABLE finance.refunds
  ADD COLUMN decision_reason text CHECK (char_length(decision_reason) BETWEEN 1 AND 2000
    AND decision_reason = btrim(decision_reason)),
  DROP CONSTRAINT refunds_state_check,
  ADD CONSTRAINT refunds_state_check CHECK (state IN ('requested', 'approved', 'processing', 'succeeded', 'failed',
    'needs_review', 'issued', 'applied', 'voided', 'declined')),
  DROP CONSTRAINT refunds_states,
  ADD CONSTRAINT refunds_states CHECK (
    (type = 'refund' AND state IN ('requested', 'approved', 'processing', 'succeeded', 'failed', 'needs_review',
      'declined'))
    OR (type = 'credit' AND state IN ('requested', 'issued', 'applied', 'voided'))
    OR (type = 'write_off' AND state IN ('requested', 'approved', 'voided')));
CREATE INDEX refunds_job ON finance.refunds (job_id, created_at);

-- What an approved write-off takes off an invoice.
CREATE FUNCTION finance.invoice_written_off_cents(p_invoice uuid) RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT COALESCE(sum(amount_cents), 0)::bigint FROM finance.refunds
   WHERE invoice_id = p_invoice AND type = 'write_off' AND state = 'approved'
$$;

-- Money a payment can still give: a declined refund, like a failed one, gives its money back.
CREATE OR REPLACE FUNCTION finance.payment_used_cents(p_payment uuid) RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT (SELECT COALESCE(sum(amount_cents), 0) FROM finance.payment_allocations
           WHERE payment_id = p_payment AND reverses_allocation_id IS NULL)
       + (SELECT COALESCE(sum(amount_cents), 0) FROM finance.refunds
           WHERE payment_id = p_payment AND type = 'refund' AND state NOT IN ('failed', 'declined'))
$$;

-- As 0077, plus: a declined refund (the Owner turned the request down); the decision reason; write-offs counted.
CREATE OR REPLACE FUNCTION finance.refund_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  p record;
  i record;
  used_invoice bigint;
  moves constant text[] := ARRAY[
    'refund:requested>approved', 'refund:approved>processing', 'refund:processing>succeeded',
    'refund:processing>failed', 'refund:processing>needs_review', 'refund:needs_review>succeeded',
    'refund:needs_review>failed', 'credit:requested>issued', 'credit:issued>applied', 'credit:requested>voided',
    'credit:issued>voided', 'write_off:requested>approved', 'write_off:requested>voided',
    'refund:requested>declined'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'refunds, credits and write-offs are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'requested' OR NEW.version <> 1 OR NEW.approved_by IS NOT NULL THEN
      RAISE EXCEPTION 'a refund, credit or write-off starts requested' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.payment_id IS NOT NULL THEN
      SELECT job_id, project_id INTO p FROM finance.payments WHERE id = NEW.payment_id;
      IF (p.job_id, p.project_id) IS DISTINCT FROM (NEW.job_id, NEW.project_id) THEN
        RAISE EXCEPTION 'a refund names a payment of its own job' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'state' - 'version' - 'approved_by' - 'approved_at' - 'staff_session_id' - 'authenticated_at'
      - 'decision_reason'
      - 'provider_confirmation') IS DISTINCT FROM (to_jsonb(OLD) - 'state' - 'version' - 'approved_by' - 'approved_at'
      - 'staff_session_id' - 'authenticated_at' - 'provider_confirmation' - 'decision_reason') THEN
    RAISE EXCEPTION 'a refund, credit or write-off keeps its type, target, amount and reason'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NOT ((NEW.type || ':' || OLD.state || '>' || NEW.state) = ANY (moves)) THEN
    RAISE EXCEPTION 'this refund, credit or write-off state change is not available' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.approved_by IS NOT NULL AND (NEW.approved_by, NEW.approved_at, NEW.staff_session_id, NEW.authenticated_at)
     IS DISTINCT FROM (OLD.approved_by, OLD.approved_at, OLD.staff_session_id, OLD.authenticated_at) THEN
    RAISE EXCEPTION 'an approval is recorded once' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.approved_by IS NULL AND NEW.approved_by IS NOT NULL THEN
    IF NOT finance.has_live_role(NEW.approved_by, ARRAY['owner']) THEN
      RAISE EXCEPTION 'only the Owner approves a refund, credit or write-off' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT s.authenticated_at INTO NEW.authenticated_at FROM identity.staff_sessions s
     WHERE s.id = NEW.staff_session_id AND s.staff_user_id = NEW.approved_by AND s.revoked_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'an approval names the Owner''s own live session' USING ERRCODE = 'check_violation';
    END IF;
    NEW.approved_at := now();
  END IF;
  IF NEW.type = 'refund' AND OLD.state = 'requested' AND NEW.state = 'approved' THEN
    SELECT id, amount_cents INTO p FROM finance.payments WHERE id = NEW.payment_id FOR UPDATE;
    IF finance.payment_used_cents(p.id) > p.amount_cents THEN
      RAISE EXCEPTION 'a refund never exceeds what its payment can still give' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.type = 'credit' AND NEW.state = 'applied' THEN
    SELECT id, kind, state, total_cents INTO i FROM finance.invoices WHERE id = NEW.invoice_id FOR UPDATE;
    IF i.kind <> 'final' OR i.state NOT IN ('issued', 'partially_paid') THEN
      RAISE EXCEPTION 'a credit is applied to an issued final invoice with a balance' USING ERRCODE = 'check_violation';
    END IF;
    SELECT COALESCE(sum(a.amount_cents), 0) INTO used_invoice
      FROM finance.payment_allocations a JOIN finance.payments x ON x.id = a.payment_id
     WHERE a.invoice_id = i.id AND x.state NOT IN ('returned', 'voided');
    IF finance.invoice_credits_cents(i.id) + finance.invoice_written_off_cents(i.id) + used_invoice + NEW.amount_cents
       > i.total_cents THEN
      RAISE EXCEPTION 'credits never exceed the invoice' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  -- TSK-0089: a write-off never exceeds what the invoice still asks for (pending checks included).
  IF NEW.type = 'write_off' AND OLD.state = 'requested' AND NEW.state = 'approved' THEN
    SELECT id, kind, state, total_cents INTO i FROM finance.invoices WHERE id = NEW.invoice_id FOR UPDATE;
    IF i.kind <> 'final' OR i.state NOT IN ('issued', 'partially_paid') THEN
      RAISE EXCEPTION 'a write-off is of an issued final invoice with a balance' USING ERRCODE = 'check_violation';
    END IF;
    SELECT COALESCE(sum(a.amount_cents), 0) INTO used_invoice
      FROM finance.payment_allocations a JOIN finance.payments x ON x.id = a.payment_id
     WHERE a.invoice_id = i.id AND x.state NOT IN ('returned', 'voided');
    IF finance.invoice_credits_cents(i.id) + finance.invoice_written_off_cents(i.id) + used_invoice + NEW.amount_cents
       > i.total_cents THEN
      RAISE EXCEPTION 'a write-off never exceeds what the invoice still asks for' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.version := OLD.version + 1;
  RETURN NEW;
END $function$;

-- As 0094, plus: approved write-offs count with credits and allocations.
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
  IF finance.invoice_credits_cents(i.id) + finance.invoice_written_off_cents(i.id) + used_invoice + NEW.amount_cents
     > i.total_cents THEN
    RAISE EXCEPTION 'allocations never exceed the invoice' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- The Owner's void of an issued invoice (HH-FIN-14): once, with the reason and the Owner's own live session.
CREATE TABLE finance.invoice_voids (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       uuid NOT NULL UNIQUE,
  job_id           uuid NOT NULL,
  reason           text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 2000 AND reason = btrim(reason)),
  voided_by        uuid NOT NULL REFERENCES identity.staff_users (id),
  staff_session_id uuid NOT NULL REFERENCES identity.staff_sessions (id),
  authenticated_at timestamptz NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_voids_invoice FOREIGN KEY (invoice_id, job_id) REFERENCES finance.invoices (id, job_id)
);
COMMENT ON TABLE finance.invoice_voids IS
  'The Owner''s void of an issued invoice (HH-FIN-14): reason and fresh sign-in, once, never changed or deleted.';

CREATE FUNCTION finance.invoice_void_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'APPEND_ONLY: an invoice void is never changed or deleted' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM finance.invoices i WHERE i.id = NEW.invoice_id
                    AND i.state IN ('issued', 'partially_paid', 'paid')) THEN
    RAISE EXCEPTION 'only an issued invoice is voided' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT finance.has_live_role(NEW.voided_by, ARRAY['owner']) THEN
    RAISE EXCEPTION 'only the Owner voids an invoice' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT s.authenticated_at INTO NEW.authenticated_at FROM identity.staff_sessions s
   WHERE s.id = NEW.staff_session_id AND s.staff_user_id = NEW.voided_by AND s.revoked_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a void names the Owner''s own live session' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invoice_voids_guard BEFORE INSERT OR UPDATE OR DELETE ON finance.invoice_voids
  FOR EACH ROW EXECUTE FUNCTION finance.invoice_void_guard();

-- At commit: a void record's invoice is voided.
CREATE FUNCTION finance.invoice_void_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM finance.invoices i WHERE i.id = NEW.invoice_id AND i.state = 'voided') THEN
    RAISE EXCEPTION 'a void record voids its invoice' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER invoice_voids_check AFTER INSERT ON finance.invoice_voids
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance.invoice_void_check();

-- A deposit is credited once per final invoice that is not voided: the reissue credits it again.
ALTER TABLE finance.invoice_deposit_credits DROP CONSTRAINT invoice_deposit_credits_deposit_requirement_id_key;
CREATE INDEX invoice_deposit_credits_requirement ON finance.invoice_deposit_credits (deposit_requirement_id);

-- A deposit is 'applied' while credited to a final invoice that is not voided; otherwise as 0077.
CREATE OR REPLACE FUNCTION finance.deposit_state_of(p_requirement uuid) RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE
  r record;
  verified bigint;
BEGIN
  SELECT id, required, amount_cents INTO r FROM finance.deposit_requirements WHERE id = p_requirement;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT r.required THEN RETURN 'not_required'; END IF;
  IF EXISTS (SELECT 1 FROM finance.invoice_deposit_credits c JOIN finance.invoices i ON i.id = c.invoice_id
              WHERE c.deposit_requirement_id = r.id AND i.state <> 'voided') THEN
    RETURN 'applied';
  END IF;
  IF EXISTS (SELECT 1 FROM finance.deposit_waivers w WHERE w.deposit_requirement_id = r.id) THEN RETURN 'waived'; END IF;
  verified := finance.deposit_verified_cents(r.id);
  IF verified >= r.amount_cents THEN RETURN 'satisfied'; END IF;
  IF verified > 0 THEN RETURN 'partly_satisfied'; END IF;
  RETURN 'required';
END $$;

-- A voided invoice's deposit follows at once (a voided final invoice gives back its deposit credit).
CREATE FUNCTION finance.invoice_void_refresh() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.deposit_requirement_id IS NOT NULL THEN
    PERFORM finance.refresh_deposit_state(NEW.deposit_requirement_id);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER invoices_void_refresh AFTER UPDATE OF state ON finance.invoices
  FOR EACH ROW WHEN (NEW.state = 'voided' AND OLD.state <> 'voided')
  EXECUTE FUNCTION finance.invoice_void_refresh();

-- As 0077, plus: the deposit is credited once among the invoices that are not voided; an issued invoice is voided
-- only with its void record and only with no payment, credit or write-off on it.
CREATE OR REPLACE FUNCTION finance.invoice_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  j record;
  latest record;
  r record;
  gate text;
  line_charges numeric;
  line_credits numeric;
  bad_lines integer;
  ref text;
  verified bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'invoices are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'draft' OR NEW.version <> 1 THEN
      RAISE EXCEPTION 'an invoice starts as a draft' USING ERRCODE = 'check_violation';
    END IF;
    SELECT id, project_id, approval_id INTO j FROM work.jobs WHERE id = NEW.job_id;
    IF j.approval_id IS DISTINCT FROM NEW.approval_id OR j.project_id IS DISTINCT FROM NEW.project_id THEN
      RAISE EXCEPTION 'an invoice belongs to its job''s approval' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.scope_snapshot_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM work.job_scope_snapshots s WHERE s.id = NEW.scope_snapshot_id AND s.job_id = NEW.job_id
         AND s.version = NEW.scope_version) THEN
      RAISE EXCEPTION 'an invoice is prepared from its own job''s scope' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.deposit_requirement_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM finance.deposit_requirements d WHERE d.id = NEW.deposit_requirement_id AND d.job_id = NEW.job_id)
    THEN
      RAISE EXCEPTION 'an invoice names its own job''s deposit' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF (NEW.id, NEW.project_id, NEW.job_id, NEW.kind, NEW.approval_id, NEW.test_mark, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.project_id, OLD.job_id, OLD.kind, OLD.approval_id, OLD.test_mark, OLD.created_at)
  THEN
    RAISE EXCEPTION 'an invoice keeps its job, kind and approval' USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.state = 'draft' THEN
    IF NEW.state = 'draft' THEN
      -- Prepared again from the job's records: the scope and deposit stay the job's own.
      IF NEW.scope_snapshot_id IS DISTINCT FROM OLD.scope_snapshot_id AND NOT EXISTS (
        SELECT 1 FROM work.job_scope_snapshots s WHERE s.id = NEW.scope_snapshot_id AND s.job_id = NEW.job_id
           AND s.version = NEW.scope_version) THEN
        RAISE EXCEPTION 'an invoice is prepared from its own job''s scope' USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.deposit_requirement_id IS DISTINCT FROM OLD.deposit_requirement_id THEN
        RAISE EXCEPTION 'an invoice keeps its job''s deposit' USING ERRCODE = 'restrict_violation';
      END IF;
      RETURN NEW;
    END IF;
    IF NEW.state <> 'issued' THEN
      RAISE EXCEPTION 'a draft invoice is issued before anything else' USING ERRCODE = 'check_violation';
    END IF;
    -- Issuing. The issuer holds a live Owner or Office role (OWN-DEC-138); the server decided invoice.issue already.
    IF NOT finance.has_live_role(NEW.issued_by, ARRAY['owner', 'office']) THEN
      RAISE EXCEPTION 'only the Owner or Office issues an invoice' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.issued_at IS DISTINCT FROM now() THEN
      RAISE EXCEPTION 'an invoice is issued at the database time' USING ERRCODE = 'check_violation';
    END IF;
    IF (NEW.scope_snapshot_id, NEW.scope_version, NEW.deposit_requirement_id, NEW.charges_cents,
        NEW.credit_lines_cents, NEW.subtotal_cents, NEW.discount_cents, NEW.discount_category,
        NEW.discount_percent_bps, NEW.total_cents, NEW.payment_term, NEW.payment_term_text, NEW.prepared_at)
       IS DISTINCT FROM
       (OLD.scope_snapshot_id, OLD.scope_version, OLD.deposit_requirement_id, OLD.charges_cents,
        OLD.credit_lines_cents, OLD.subtotal_cents, OLD.discount_cents, OLD.discount_category,
        OLD.discount_percent_bps, OLD.total_cents, OLD.payment_term, OLD.payment_term_text, OLD.prepared_at) THEN
      RAISE EXCEPTION 'an invoice is issued exactly as drafted' USING ERRCODE = 'check_violation';
    END IF;
    SELECT COALESCE(sum(amount_cents) FILTER (WHERE kind = 'charge'), 0),
           COALESCE(sum(amount_cents) FILTER (WHERE kind = 'credit'), 0),
           count(*) FILTER (WHERE amount_cents <= 0)
      INTO line_charges, line_credits, bad_lines
      FROM finance.invoice_lines WHERE invoice_id = NEW.id;
    IF bad_lines > 0 OR line_charges <> NEW.charges_cents OR line_credits <> NEW.credit_lines_cents THEN
      RAISE EXCEPTION 'an invoice is issued only with its totals equal to its lines' USING ERRCODE = 'check_violation';
    END IF;
    SELECT reference INTO ref FROM crm.projects WHERE id = NEW.project_id;
    IF NEW.number IS DISTINCT FROM (ref || '-I' || NEW.sequence) THEN
      RAISE EXCEPTION 'an invoice number is its project reference and sequence' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.kind = 'final' THEN
      gate := finance.invoice_quality_gate(NEW.job_id);
      IF NOT (gate = 'passed' OR (gate = 'owner_may_issue' AND finance.has_live_role(NEW.issued_by, ARRAY['owner'])))
      THEN
        RAISE EXCEPTION 'a final invoice is issued only after the Owner''s quality review (%)', COALESCE(gate, 'none')
          USING ERRCODE = 'check_violation';
      END IF;
      SELECT version INTO latest FROM work.job_scope_snapshots WHERE job_id = NEW.job_id
       ORDER BY version DESC LIMIT 1;
      IF latest.version IS DISTINCT FROM NEW.scope_version THEN
        RAISE EXCEPTION 'a final invoice is issued from the job''s current approved scope' USING ERRCODE = 'check_violation';
      END IF;
      -- The deposit credit is the deposit's verified money, with no deposit check still pending.
      IF NEW.deposit_requirement_id IS NOT NULL THEN
        PERFORM 1 FROM finance.deposit_requirements WHERE id = NEW.deposit_requirement_id FOR UPDATE;
        IF finance.deposit_pending_cents(NEW.deposit_requirement_id) > 0 THEN
          RAISE EXCEPTION 'a final invoice waits while a deposit check is pending' USING ERRCODE = 'check_violation';
        END IF;
        IF EXISTS (SELECT 1 FROM finance.invoice_deposit_credits c JOIN finance.invoices x ON x.id = c.invoice_id
                    WHERE c.deposit_requirement_id = NEW.deposit_requirement_id AND x.state <> 'voided') THEN
          RAISE EXCEPTION 'the deposit is credited once' USING ERRCODE = 'unique_violation';
        END IF;
        verified := finance.deposit_verified_cents(NEW.deposit_requirement_id);
      ELSE
        verified := 0;
      END IF;
      IF NEW.deposit_credit_cents IS DISTINCT FROM verified THEN
        RAISE EXCEPTION 'the deposit credit is the deposit''s verified money' USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      SELECT id, required, amount_cents INTO r FROM finance.deposit_requirements
       WHERE id = NEW.deposit_requirement_id FOR UPDATE;
      IF NOT r.required OR finance.deposit_state_of(r.id) NOT IN ('required', 'partly_satisfied')
         OR NEW.total_cents IS DISTINCT FROM r.amount_cents THEN
        RAISE EXCEPTION 'a deposit invoice bills a deposit still due' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    NEW.version := OLD.version + 1;
    RETURN NEW;
  END IF;

  -- Issued: nothing changes but the state its money gives it, or its void (TSK-0089).
  IF (to_jsonb(NEW) - 'state' - 'version') IS DISTINCT FROM (to_jsonb(OLD) - 'state' - 'version') THEN
    RAISE EXCEPTION 'an issued invoice never changes' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.state = 'voided' AND OLD.state <> 'voided' THEN
    IF NOT EXISTS (SELECT 1 FROM finance.invoice_voids v
                    WHERE v.invoice_id = NEW.id AND v.xmin = pg_current_xact_id()::xid) THEN
      RAISE EXCEPTION 'an invoice is voided only with its void record' USING ERRCODE = 'check_violation';
    END IF;
    IF finance.invoice_paid_cents(NEW.id, ARRAY['recorded', 'reconciled', 'received', 'deposited', 'cleared']) > 0
       OR EXISTS (SELECT 1 FROM finance.refunds f WHERE f.invoice_id = NEW.id
                     AND ((f.type = 'credit' AND f.state IN ('issued', 'applied'))
                          OR (f.type = 'write_off' AND f.state = 'approved'))) THEN
      RAISE EXCEPTION 'an invoice with money, credits or write-offs on it is not voided'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.version := OLD.version + 1;
    RETURN NEW;
  END IF;
  IF NEW.state = 'voided' OR NEW.state = 'draft' THEN
    RAISE EXCEPTION 'this invoice state change is not available' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.state IS DISTINCT FROM finance.invoice_state_of(NEW.id) THEN
    RAISE EXCEPTION 'an invoice''s state follows its confirmed payments and credits' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $function$;

-- A staging reset is the only path that empties the new table (TSK-0141).
CREATE TRIGGER invoice_voids_reset_only_truncate BEFORE TRUNCATE ON finance.invoice_voids
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();
