-- 0077 Invoices drafted from the approved scope and issued after the Owner's quality review, and the payment ledger
-- (TSK-0085, TSK-0086; HH-FIN-03, HH-FIN-04, HH-FIN-05, HH-FIN-06, HH-FIN-07, HH-FIN-12, HH-FIN-14, HH-PORT-10, HH-QA-02,
-- HH-DATA-04, T58, T59, ENT-Invoice, ENT-Payment, ENT-PaymentAllocation, ENT-Refund, ENT-DepositRequirement,
-- FACT-BUSINESS-NAME, FACT-BUSINESS-ADDRESS, FACT-PUBLIC-CONTACT, FACT-PAYMENT-DUE, FACT-PAYMENT-INSTRUCTIONS,
-- FACT-TAX-NO-LINE, FACT-PRICING-DISCOUNTS, OWN-DEC-104, OWN-DEC-110, OWN-DEC-111, OWN-DEC-138, OWN-DEC-145,
-- OWN-DEC-152, OWN-DEC-203, RULE-MONEY-CENTS, RULE-SERVER-AUTHZ, RULE-SAFETY-GATES).
-- - invoices: one billing document. A final invoice is drafted from the job's latest scope snapshot (the approved
--   estimate lines and selected options, and later the approved change orders, TSK-0082) with the approved discount
--   as its own totals row; a deposit invoice bills the job's required deposit. Every amount is integer cents and no
--   stored amount is negative (OWN-DEC-203): charge lines and credit lines are positive magnitudes, a credit line
--   lowers the subtotal, and the total is always above $0.00 (a reduction larger than what remains is refused, never a
--   negative charge). There is no tax line (FACT-TAX-NO-LINE). While a draft, the server may replace its lines when it
--   prepares the draft again; once issued nothing but its money-driven state ever changes.
-- - Issuing: the number (the project reference and -I<n>, never reused), the issuer, the public contact, the payment
--   instructions and the deposit credit are pinned. A final invoice is issued only when the Owner's quality review
--   lets it be (finance.invoice_quality_gate: TSK-0084 replaces its body; until then it answers
--   'quality_review_not_recorded' and every final invoice stays a draft). The issuer holds a live Owner or Office role
--   (OWN-DEC-138). A deposit invoice needs no review (HH-QA-02: deposit invoices follow their approved terms) and is
--   issued only while its deposit is still due. One final and one deposit invoice per job (void and reissue are
--   TSK-0089: voided is refused here).
-- - invoice_deposit_credits: the job's verified deposit money credited to its final invoice, exactly once (unique per
--   requirement and per invoice), written in the issuing transaction; the deposit is then 'applied'. Issuing is
--   refused while a deposit check is still pending, so the credit is exactly the verified money (PROPOSED).
-- - payment_allocations now target an invoice or a deposit requirement (exactly one). An allocation to a final invoice
--   never takes the invoice past its total together with its deposit credit and applied credits, and never takes a
--   payment past its amount together with its other allocations and refunds; the remainder of an overpayment stays
--   unallocated for the Owner's credit or refund decision (HH-FIN-07). A deposit invoice is paid through its
--   requirement (the deposit payments of TSK-0059), never allocated to directly (PROPOSED).
-- - An invoice's state is the one its money gives it, refreshed in the statement that changes the money: paid when
--   confirmed payments plus credits reach its total; partially_paid when confirmed payments exist; otherwise issued.
--   Pending money (a check received or deposited) never counts (HH-FIN-12).
-- - refunds (refunds, credits and write-offs), provider_fees and payouts are separate records (HH-FIN-06). Approval is
--   the Owner's only, from the Owner's own live session (the fresh sign-in is read by the server, OWN-DEC-138). The
--   refund, credit and write-off workflows are TSK-0089; fees and payouts are recorded by hand (TSK-0086).
-- - invoice_documents: the issued invoice's English PDF, stored once (like the approval receipt, migration 0047).
-- Every new table is cleared by a staging reset only (TSK-0141).

-- The Owner's quality review gate of a final invoice (HH-QA-02, HH-FIN-05). TSK-0084 (the review and punch items) is
-- not built: no review is recorded anywhere, so nothing passes. TSK-0084 replaces this function's body with the
-- review's outcome: 'passed' (anyone with invoice.issue may issue), 'owner_may_issue' (only minor punch items: the
-- Owner may issue if the payment terms allow) or 'blocked' (major defects). Never a flag, never a bypass.
CREATE FUNCTION finance.invoice_quality_gate(p_job uuid) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT 'quality_review_not_recorded'::text
$$;
COMMENT ON FUNCTION finance.invoice_quality_gate(uuid) IS
  'Quality-review gate of a final invoice (HH-QA-02): quality_review_not_recorded until TSK-0084 replaces it.';

-- Whether a staff user holds a live role grant of one of these roles now.
CREATE FUNCTION finance.has_live_role(p_staff uuid, p_roles text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM identity.role_grants g WHERE g.staff_user_id = p_staff AND g.kind = 'role'
                  AND g.name = ANY (p_roles) AND g.ended_at IS NULL AND g.effective_from <= now())
$$;

CREATE TABLE finance.invoices (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id             uuid NOT NULL,
  job_id                 uuid NOT NULL,
  kind                   text NOT NULL CHECK (kind IN ('deposit', 'progress', 'final')),
  state                  text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'issued', 'partially_paid', 'paid',
                           'voided')),
  approval_id            uuid NOT NULL REFERENCES estimating.approvals (id),
  -- A final invoice: the job scope snapshot it was prepared from (its version is the scope's).
  scope_snapshot_id      uuid REFERENCES work.job_scope_snapshots (id),
  scope_version          integer CHECK (scope_version >= 1),
  -- The job's deposit requirement: what a deposit invoice bills, or where a final invoice's deposit credit comes from.
  deposit_requirement_id uuid REFERENCES finance.deposit_requirements (id),
  currency               text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  -- Positive magnitudes only (OWN-DEC-203): subtotal = charges - credit lines; total = subtotal - discount row.
  charges_cents          bigint NOT NULL CHECK (charges_cents > 0),
  credit_lines_cents     bigint NOT NULL DEFAULT 0 CHECK (credit_lines_cents >= 0),
  subtotal_cents         bigint NOT NULL CHECK (subtotal_cents > 0),
  discount_cents         bigint NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  discount_category      text CHECK (discount_category ~ '^[a-z][a-z_]{0,39}$'),
  discount_percent_bps   integer CHECK (discount_percent_bps BETWEEN 1 AND 10000),
  total_cents            bigint NOT NULL CHECK (total_cents > 0),
  -- Pinned at issue: the verified deposit money credited to a final invoice (0 before issue and for other kinds).
  deposit_credit_cents   bigint NOT NULL DEFAULT 0 CHECK (deposit_credit_cents >= 0),
  -- The payment term the approval recorded (FACT-PAYMENT-DUE), in the words shown.
  payment_term           text NOT NULL CHECK (payment_term IN ('due_on_receipt')),
  payment_term_text      text NOT NULL CHECK (char_length(payment_term_text) BETWEEN 1 AND 500),
  -- Outside production every invoice carries "TEST — not a real invoice or estimate" (OWN-DEC-126).
  test_mark              boolean NOT NULL,
  prepared_by            uuid REFERENCES identity.staff_users (id),
  prepared_at            timestamptz NOT NULL DEFAULT now(),
  -- Set when issued, never before (all NULL while a draft).
  sequence               integer CHECK (sequence >= 1),
  number                 text UNIQUE CHECK (number ~ '^HH-[0-9A-HJKMNP-TV-Z]{8}-I[1-9][0-9]*$'),
  issued_at              timestamptz,
  issued_by              uuid REFERENCES identity.staff_users (id),
  -- The issuer and contact as configured at issue (business.name, business.mailing_address, business.public_contact):
  -- a missing mailing address is NULL (the line is left out); a missing phone or email is NULL (a labelled
  -- placeholder is shown, FACT-PUBLIC-CONTACT); the payment instructions as configured (FACT-PAYMENT-INSTRUCTIONS).
  issuer_name            text CHECK (char_length(issuer_name) BETWEEN 1 AND 200),
  issuer_mailing_address text[],
  public_phone           text CHECK (char_length(public_phone) BETWEEN 1 AND 60),
  public_email           text CHECK (char_length(public_email) BETWEEN 1 AND 200),
  payment_instructions   jsonb CHECK (payment_instructions IS NULL OR jsonb_typeof(payment_instructions) = 'object'),
  -- The configuration versions the issued invoice used (key -> version, NULL while a key was NOT CONFIGURED).
  policy_versions        jsonb CHECK (policy_versions IS NULL OR jsonb_typeof(policy_versions) = 'object'),
  created_at             timestamptz NOT NULL DEFAULT now(),
  version                integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (id, job_id),
  UNIQUE (project_id, sequence),
  CONSTRAINT invoices_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id),
  CONSTRAINT invoices_subtotal CHECK (subtotal_cents = charges_cents - credit_lines_cents),
  CONSTRAINT invoices_total CHECK (total_cents = subtotal_cents - discount_cents),
  CONSTRAINT invoices_deposit_credit CHECK (deposit_credit_cents <= total_cents),
  CONSTRAINT invoices_discount CHECK (
    (discount_cents > 0) = (discount_category IS NOT NULL) AND (discount_category IS NULL) = (discount_percent_bps IS NULL)),
  CONSTRAINT invoices_issued CHECK (
    (state = 'draft') = (number IS NULL) AND (number IS NULL) = (sequence IS NULL)
    AND (number IS NULL) = (issued_at IS NULL) AND (number IS NULL) = (issued_by IS NULL)
    AND (number IS NULL) = (issuer_name IS NULL) AND (number IS NULL) = (policy_versions IS NULL)
    AND (state <> 'draft' OR deposit_credit_cents = 0)),
  CONSTRAINT invoices_final CHECK (
    kind <> 'final' OR (scope_snapshot_id IS NOT NULL AND scope_version IS NOT NULL)),
  CONSTRAINT invoices_deposit CHECK (
    kind <> 'deposit' OR (deposit_requirement_id IS NOT NULL AND scope_snapshot_id IS NULL AND scope_version IS NULL
      AND credit_lines_cents = 0 AND discount_cents = 0 AND deposit_credit_cents = 0)),
  -- No progress-billing terms are configured: a progress invoice is not created yet.
  CONSTRAINT invoices_no_progress CHECK (kind <> 'progress')
);
-- HH-FIN-05: one invoice of each kind per job (a deliberate, audited void and reissue is TSK-0089).
CREATE UNIQUE INDEX invoices_one_final_per_job ON finance.invoices (job_id) WHERE kind = 'final' AND state <> 'voided';
CREATE UNIQUE INDEX invoices_one_deposit_per_job ON finance.invoices (job_id)
  WHERE kind = 'deposit' AND state <> 'voided';
CREATE INDEX invoices_project ON finance.invoices (project_id, created_at);
COMMENT ON TABLE finance.invoices IS
  'Billing documents (ENT-Invoice): drafted from the approved scope, immutable once issued, never deleted.';

CREATE TABLE finance.invoice_lines (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       uuid NOT NULL REFERENCES finance.invoices (id),
  position         smallint NOT NULL CHECK (position >= 1),
  -- A charge, or a credit (a reduction shown as a positive magnitude, OWN-DEC-203).
  kind             text NOT NULL CHECK (kind IN ('charge', 'credit')),
  -- Where the line comes from: an approved estimate line (base or selected option), an approved change order line
  -- (TSK-0082), or the deposit a deposit invoice bills.
  source           text NOT NULL CHECK (source IN ('estimate_line', 'change_order', 'deposit')),
  source_position  smallint CHECK (source_position >= 1),
  line_kind        text CHECK (line_kind IN ('base', 'alternate', 'add_on')),
  service_code     text CHECK (char_length(service_code) BETWEEN 1 AND 20),
  description      text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 2000),
  quantity         text CHECK (char_length(quantity) BETWEEN 1 AND 40),
  unit             text CHECK (char_length(unit) BETWEEN 1 AND 40),
  unit_price_cents bigint CHECK (unit_price_cents > 0),
  -- Every line is above $0.00 (OWN-DEC-145); a credit line's effect is negative.
  amount_cents     bigint NOT NULL CHECK (amount_cents > 0),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, position)
);
COMMENT ON TABLE finance.invoice_lines IS
  'Lines of an invoice in integer cents (charges and credit lines, positive magnitudes); fixed once issued.';

-- Lines change only while their invoice is a draft (preparing the draft again replaces them).
CREATE FUNCTION finance.invoice_line_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  st text;
BEGIN
  SELECT state INTO st FROM finance.invoices WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF st IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'the lines of an issued invoice never change' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.invoice_id IS DISTINCT FROM OLD.invoice_id THEN
    RAISE EXCEPTION 'a line keeps its invoice' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER invoice_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON finance.invoice_lines
  FOR EACH ROW EXECUTE FUNCTION finance.invoice_line_guard();

CREATE TABLE finance.invoice_deposit_credits (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id             uuid NOT NULL UNIQUE,
  job_id                 uuid NOT NULL,
  -- HH-FIN-05: the deposit is credited exactly once.
  deposit_requirement_id uuid NOT NULL UNIQUE REFERENCES finance.deposit_requirements (id),
  amount_cents           bigint NOT NULL CHECK (amount_cents > 0),
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_deposit_credits_invoice FOREIGN KEY (invoice_id, job_id) REFERENCES finance.invoices (id, job_id)
);
COMMENT ON TABLE finance.invoice_deposit_credits IS
  'The verified deposit money credited to a final invoice (HH-FIN-05): once per deposit, append-only.';

CREATE TABLE finance.invoice_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       uuid NOT NULL UNIQUE REFERENCES finance.invoices (id),
  project_id       uuid NOT NULL REFERENCES crm.projects (id),
  object_key       text NOT NULL UNIQUE CHECK (char_length(object_key) BETWEEN 1 AND 300),
  content_type     text NOT NULL CHECK (content_type = 'application/pdf'),
  byte_size        integer NOT NULL CHECK (byte_size > 0),
  sha256           text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  test_mark        boolean NOT NULL,
  renderer_version integer NOT NULL CHECK (renderer_version >= 1),
  issued_at        timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER invoice_documents_append_only BEFORE UPDATE OR DELETE ON finance.invoice_documents
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE finance.invoice_documents IS 'The issued invoice''s English PDF, stored once (ENT-Document).';

-- Refunds, credits and write-offs (ENT-Refund, HH-FIN-14): separate records. Staff request; the Owner approves.
CREATE TABLE finance.refunds (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            uuid NOT NULL,
  job_id                uuid NOT NULL,
  type                  text NOT NULL CHECK (type IN ('refund', 'credit', 'write_off')),
  -- A refund pays back (part of) one payment; a credit or write-off reduces what one invoice asks for.
  payment_id            uuid REFERENCES finance.payments (id),
  invoice_id            uuid,
  amount_cents          bigint NOT NULL CHECK (amount_cents > 0),
  reason                text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 2000 AND reason = btrim(reason)),
  requested_by          uuid NOT NULL REFERENCES identity.staff_users (id),
  state                 text NOT NULL CHECK (state IN ('requested', 'approved', 'processing', 'succeeded', 'failed',
                          'needs_review', 'issued', 'applied', 'voided')),
  approved_by           uuid REFERENCES identity.staff_users (id),
  approved_at           timestamptz,
  -- The Owner's session and its last password or second-factor entry when approving (the fresh sign-in).
  staff_session_id      uuid REFERENCES identity.staff_sessions (id),
  authenticated_at      timestamptz,
  -- The Square refund ID once staff record its confirmation (a refund completes only then, HH-FIN-14).
  provider_confirmation text CHECK (char_length(provider_confirmation) BETWEEN 1 AND 120),
  created_at            timestamptz NOT NULL DEFAULT now(),
  version               integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT refunds_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id),
  CONSTRAINT refunds_invoice FOREIGN KEY (invoice_id, job_id) REFERENCES finance.invoices (id, job_id),
  CONSTRAINT refunds_target CHECK (
    (type = 'refund') = (payment_id IS NOT NULL) AND (type = 'refund') = (invoice_id IS NULL)),
  CONSTRAINT refunds_states CHECK (
    (type = 'refund' AND state IN ('requested', 'approved', 'processing', 'succeeded', 'failed', 'needs_review'))
    OR (type = 'credit' AND state IN ('requested', 'issued', 'applied', 'voided'))
    OR (type = 'write_off' AND state IN ('requested', 'approved', 'voided'))),
  CONSTRAINT refunds_approval CHECK (
    (approved_by IS NULL) = (approved_at IS NULL) AND (approved_by IS NULL) = (staff_session_id IS NULL)
    AND (approved_by IS NULL) = (authenticated_at IS NULL)
    AND (state IN ('requested', 'voided') OR approved_by IS NOT NULL)),
  CONSTRAINT refunds_confirmed CHECK (state <> 'succeeded' OR provider_confirmation IS NOT NULL)
);
CREATE INDEX refunds_invoice ON finance.refunds (invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX refunds_payment ON finance.refunds (payment_id) WHERE payment_id IS NOT NULL;
COMMENT ON TABLE finance.refunds IS
  'Refunds, credits and write-offs (ENT-Refund): requested by staff, approved by the Owner only, never deleted.';

-- Square payouts and provider fees, recorded by hand (HH-FIN-06): never part of a customer payment.
CREATE TABLE finance.payouts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider     text NOT NULL CHECK (provider = 'square'),
  -- The Square payout ID.
  reference    text NOT NULL CHECK (char_length(reference) BETWEEN 1 AND 120 AND reference = btrim(reference)),
  -- The net amount Square paid out to the bank.
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  currency     text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  paid_out_on  date NOT NULL,
  recorded_by  uuid NOT NULL REFERENCES identity.staff_users (id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, reference)
);
CREATE TRIGGER payouts_append_only BEFORE UPDATE OR DELETE ON finance.payouts
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE finance.payouts IS 'Square payouts recorded by hand (HH-FIN-06): separate from customer payments.';

CREATE TABLE finance.provider_fees (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider     text NOT NULL CHECK (provider = 'square'),
  -- The Square card payment the fee was taken from, and/or the payout it was deducted in.
  payment_id   uuid REFERENCES finance.payments (id),
  payout_id    uuid REFERENCES finance.payouts (id),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  currency     text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  incurred_on  date NOT NULL,
  reference    text CHECK (char_length(reference) BETWEEN 1 AND 120 AND reference = btrim(reference)),
  recorded_by  uuid NOT NULL REFERENCES identity.staff_users (id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_fees_link CHECK (payment_id IS NOT NULL OR payout_id IS NOT NULL)
);
CREATE INDEX provider_fees_payment ON finance.provider_fees (payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX provider_fees_payout ON finance.provider_fees (payout_id) WHERE payout_id IS NOT NULL;
COMMENT ON TABLE finance.provider_fees IS 'Square fees recorded by hand (HH-FIN-06): never deducted from a payment.';

-- A fee belongs to a Square card payment (never cash, a check or another method).
CREATE FUNCTION finance.provider_fee_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'APPEND_ONLY: provider fees are never changed or deleted' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.payment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM finance.payments p WHERE p.id = NEW.payment_id
       AND p.method IN ('square_payment_link', 'square_tap_to_pay')) THEN
    RAISE EXCEPTION 'a Square fee belongs to a Square card payment' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER provider_fees_guard BEFORE INSERT OR UPDATE OR DELETE ON finance.provider_fees
  FOR EACH ROW EXECUTE FUNCTION finance.provider_fee_guard();

-- Allocations target an invoice or a deposit requirement, exactly one.
ALTER TABLE finance.payment_allocations
  ALTER COLUMN deposit_requirement_id DROP NOT NULL,
  ADD COLUMN invoice_id uuid REFERENCES finance.invoices (id),
  ADD CONSTRAINT payment_allocations_one_target CHECK ((deposit_requirement_id IS NULL) <> (invoice_id IS NULL)),
  -- A payment is applied to an invoice once (HH-FIN-07: no double credit).
  ADD CONSTRAINT payment_allocations_once_per_invoice UNIQUE (payment_id, invoice_id);
CREATE INDEX payment_allocations_invoice ON finance.payment_allocations (invoice_id) WHERE invoice_id IS NOT NULL;
COMMENT ON TABLE finance.payment_allocations IS
  'A payment applied to an invoice or its job''s deposit requirement (ENT-PaymentAllocation): append-only.';

-- Money a payment can still give: its amount less its allocations and its refunds that are not failed.
CREATE FUNCTION finance.payment_used_cents(p_payment uuid) RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT (SELECT COALESCE(sum(amount_cents), 0) FROM finance.payment_allocations WHERE payment_id = p_payment)
       + (SELECT COALESCE(sum(amount_cents), 0) FROM finance.refunds
           WHERE payment_id = p_payment AND type = 'refund' AND state NOT IN ('failed'))
$$;

-- An invoice's money: credits (the pinned deposit credit and applied credits), confirmed payments (recorded,
-- reconciled, or a check once cleared) and pending payments (checks received or deposited). A deposit invoice is
-- paid through its requirement: its confirmed and pending money is the requirement's.
CREATE FUNCTION finance.invoice_credits_cents(p_invoice uuid) RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT (SELECT COALESCE(deposit_credit_cents, 0) FROM finance.invoices WHERE id = p_invoice)
       + (SELECT COALESCE(sum(amount_cents), 0) FROM finance.refunds
           WHERE invoice_id = p_invoice AND type = 'credit' AND state = 'applied')
$$;
CREATE FUNCTION finance.invoice_paid_cents(p_invoice uuid, p_states text[]) RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT CASE i.kind
    WHEN 'deposit' THEN (SELECT COALESCE(sum(a.amount_cents), 0) FROM finance.payment_allocations a
                           JOIN finance.payments p ON p.id = a.payment_id
                          WHERE a.deposit_requirement_id = i.deposit_requirement_id AND p.state = ANY (p_states))
    ELSE (SELECT COALESCE(sum(a.amount_cents), 0) FROM finance.payment_allocations a
            JOIN finance.payments p ON p.id = a.payment_id
           WHERE a.invoice_id = i.id AND p.state = ANY (p_states)) END::bigint
    FROM finance.invoices i WHERE i.id = p_invoice
$$;

-- The state an issued invoice's money gives it (drafts and voided invoices keep theirs).
CREATE FUNCTION finance.invoice_state_of(p_invoice uuid) RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE
  i record;
  confirmed bigint;
  credits bigint;
BEGIN
  SELECT id, state, total_cents INTO i FROM finance.invoices WHERE id = p_invoice;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF i.state IN ('draft', 'voided') THEN RETURN i.state; END IF;
  confirmed := finance.invoice_paid_cents(i.id, ARRAY['recorded', 'reconciled', 'cleared']);
  credits := finance.invoice_credits_cents(i.id);
  IF confirmed + credits >= i.total_cents THEN RETURN 'paid'; END IF;
  IF confirmed > 0 THEN RETURN 'partially_paid'; END IF;
  RETURN 'issued';
END $$;

CREATE FUNCTION finance.refresh_invoice_state(p_invoice uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  next_state text := finance.invoice_state_of(p_invoice);
BEGIN
  UPDATE finance.invoices SET state = next_state, version = version + 1
   WHERE id = p_invoice AND state IS DISTINCT FROM next_state AND state NOT IN ('draft', 'voided');
END $$;

-- The invoice guard: identity never changes; a draft may be prepared again; issuing pins the number, issuer and
-- deposit credit after the gates; an issued invoice never changes except the state its money gives it.
CREATE FUNCTION finance.invoice_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
        IF EXISTS (SELECT 1 FROM finance.invoice_deposit_credits c
                    WHERE c.deposit_requirement_id = NEW.deposit_requirement_id) THEN
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

  -- Issued: nothing changes but the state its money gives it (void and corrections are TSK-0089).
  IF (to_jsonb(NEW) - 'state' - 'version') IS DISTINCT FROM (to_jsonb(OLD) - 'state' - 'version') THEN
    RAISE EXCEPTION 'an issued invoice never changes' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.state = 'voided' OR NEW.state = 'draft' THEN
    RAISE EXCEPTION 'this invoice state change is not available' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.state IS DISTINCT FROM finance.invoice_state_of(NEW.id) THEN
    RAISE EXCEPTION 'an invoice''s state follows its confirmed payments and credits' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invoices_guard BEFORE INSERT OR UPDATE OR DELETE ON finance.invoices
  FOR EACH ROW EXECUTE FUNCTION finance.invoice_guard();

-- At commit: an issued final invoice with a deposit credit has exactly that credit recorded, and every credit is its
-- invoice's (a credit is never written apart from its invoice's issue).
CREATE FUNCTION finance.invoice_credit_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  i record;
  c record;
BEGIN
  SELECT id, kind, state, deposit_credit_cents, deposit_requirement_id INTO i FROM finance.invoices WHERE id = NEW.id;
  SELECT amount_cents, deposit_requirement_id INTO c FROM finance.invoice_deposit_credits WHERE invoice_id = NEW.id;
  IF i.state <> 'draft' AND i.deposit_credit_cents > 0 AND (c.amount_cents IS DISTINCT FROM i.deposit_credit_cents
     OR c.deposit_requirement_id IS DISTINCT FROM i.deposit_requirement_id) THEN
    RAISE EXCEPTION 'an issued invoice''s deposit credit is recorded once' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER invoices_credit_check AFTER UPDATE ON finance.invoices
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance.invoice_credit_check();

-- A deposit credit is written in its final invoice's issuing transaction, with the amount the invoice pinned.
CREATE FUNCTION finance.invoice_deposit_credit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'APPEND_ONLY: a deposit credit is never changed or deleted' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM finance.invoices i WHERE i.id = NEW.invoice_id AND i.kind = 'final'
                   AND i.state = 'issued' AND i.issued_at = now() AND i.deposit_credit_cents = NEW.amount_cents
                   AND i.deposit_requirement_id = NEW.deposit_requirement_id) THEN
    RAISE EXCEPTION 'a deposit credit is written with its final invoice''s issue' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invoice_deposit_credits_guard BEFORE INSERT OR UPDATE OR DELETE ON finance.invoice_deposit_credits
  FOR EACH ROW EXECUTE FUNCTION finance.invoice_deposit_credit_guard();
CREATE FUNCTION finance.deposit_credit_refresh() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM finance.refresh_deposit_state(NEW.deposit_requirement_id);
  PERFORM finance.refresh_invoice_state(NEW.invoice_id);
  RETURN NULL;
END $$;
CREATE TRIGGER invoice_deposit_credits_refresh AFTER INSERT ON finance.invoice_deposit_credits
  FOR EACH ROW EXECUTE FUNCTION finance.deposit_credit_refresh();

-- A deposit is 'applied' once credited to its final invoice (ENT-DepositRequirement); otherwise as before (0048).
CREATE OR REPLACE FUNCTION finance.deposit_state_of(p_requirement uuid) RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE
  r record;
  verified bigint;
BEGIN
  SELECT id, required, amount_cents INTO r FROM finance.deposit_requirements WHERE id = p_requirement;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT r.required THEN RETURN 'not_required'; END IF;
  IF EXISTS (SELECT 1 FROM finance.invoice_deposit_credits c WHERE c.deposit_requirement_id = r.id) THEN
    RETURN 'applied';
  END IF;
  IF EXISTS (SELECT 1 FROM finance.deposit_waivers w WHERE w.deposit_requirement_id = r.id) THEN RETURN 'waived'; END IF;
  verified := finance.deposit_verified_cents(r.id);
  IF verified >= r.amount_cents THEN RETURN 'satisfied'; END IF;
  IF verified > 0 THEN RETURN 'partly_satisfied'; END IF;
  RETURN 'required';
END $$;

-- As in 0048, except that 'applied' is now reached through the deposit credit (and only that way).
CREATE OR REPLACE FUNCTION finance.deposit_requirement_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
  IF NEW.state IS DISTINCT FROM finance.deposit_state_of(NEW.id) THEN
    RAISE EXCEPTION 'a deposit''s state follows its verified money, waiver and invoice credit'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- The work-visit gate opens for an applied deposit too (it was satisfied or waived before it was credited).
CREATE OR REPLACE FUNCTION finance.work_visit_deposit_gate(p_job uuid) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  r record;
  state text;
BEGIN
  SELECT id INTO r FROM finance.deposit_requirements WHERE job_id = p_job FOR SHARE;
  IF NOT FOUND THEN RETURN 'missing'; END IF;
  state := finance.deposit_state_of(r.id);
  RETURN CASE WHEN state IN ('not_required', 'satisfied', 'waived', 'applied') THEN state ELSE 'required' END;
END $$;

-- An allocation applies a payment to the required deposit of its own job (as in 0048) or to an issued final invoice
-- of its own job, under the target's lock: never beyond what the payment can still give (its other allocations and
-- refunds), never beyond what the deposit or the invoice still asks for.
CREATE OR REPLACE FUNCTION finance.payment_allocation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  r record;
  i record;
  p record;
  used_deposit bigint;
  used_invoice bigint;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'allocations are append-only: a reversal is a new allocation' USING ERRCODE = 'restrict_violation';
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

-- The deposit's and the invoices' stored states follow the money in the statement that changes it.
CREATE OR REPLACE FUNCTION finance.allocation_refresh() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.deposit_requirement_id IS NOT NULL THEN
    PERFORM finance.refresh_deposit_state(NEW.deposit_requirement_id);
    PERFORM finance.refresh_invoice_state(i.id) FROM finance.invoices i
      WHERE i.deposit_requirement_id = NEW.deposit_requirement_id AND i.kind = 'deposit';
  END IF;
  IF TG_TABLE_NAME = 'payment_allocations' AND NEW.invoice_id IS NOT NULL THEN
    PERFORM finance.refresh_invoice_state(NEW.invoice_id);
  END IF;
  RETURN NULL;
END $$;
-- deposit_waivers has no invoice_id: its refresh is its own function now.
CREATE FUNCTION finance.waiver_refresh() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM finance.refresh_deposit_state(NEW.deposit_requirement_id);
  RETURN NULL;
END $$;
DROP TRIGGER deposit_waivers_refresh ON finance.deposit_waivers;
CREATE TRIGGER deposit_waivers_refresh AFTER INSERT ON finance.deposit_waivers
  FOR EACH ROW EXECUTE FUNCTION finance.waiver_refresh();

CREATE OR REPLACE FUNCTION finance.payment_refresh() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM finance.refresh_deposit_state(a.deposit_requirement_id)
     FROM finance.payment_allocations a WHERE a.payment_id = NEW.id AND a.deposit_requirement_id IS NOT NULL;
  PERFORM finance.refresh_invoice_state(i.id)
     FROM finance.invoices i
    WHERE (i.kind = 'deposit' AND i.deposit_requirement_id IN (
             SELECT a.deposit_requirement_id FROM finance.payment_allocations a WHERE a.payment_id = NEW.id))
       OR i.id IN (SELECT a.invoice_id FROM finance.payment_allocations a WHERE a.payment_id = NEW.id);
  RETURN NULL;
END $$;

-- Refunds, credits and write-offs: requested by active staff; approved, processed and recorded only as below. The
-- approval is the Owner's own (a live Owner grant, the Owner's own live session, OWN-DEC-138); a refund never exceeds
-- what its payment can still give; a credit never exceeds what its invoice still asks for.
CREATE FUNCTION finance.refund_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  p record;
  i record;
  used_invoice bigint;
  moves constant text[] := ARRAY[
    'refund:requested>approved', 'refund:approved>processing', 'refund:processing>succeeded',
    'refund:processing>failed', 'refund:processing>needs_review', 'refund:needs_review>succeeded',
    'refund:needs_review>failed', 'credit:requested>issued', 'credit:issued>applied', 'credit:requested>voided',
    'credit:issued>voided', 'write_off:requested>approved', 'write_off:requested>voided'];
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
      - 'provider_confirmation') IS DISTINCT FROM (to_jsonb(OLD) - 'state' - 'version' - 'approved_by' - 'approved_at'
      - 'staff_session_id' - 'authenticated_at' - 'provider_confirmation') THEN
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
    IF finance.invoice_credits_cents(i.id) + used_invoice + NEW.amount_cents > i.total_cents THEN
      RAISE EXCEPTION 'credits never exceed the invoice' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.version := OLD.version + 1;
  RETURN NEW;
END $$;
CREATE TRIGGER refunds_guard BEFORE INSERT OR UPDATE OR DELETE ON finance.refunds
  FOR EACH ROW EXECUTE FUNCTION finance.refund_guard();

-- A refund requested beyond what its payment can still give is refused when written (approval checks it again).
CREATE FUNCTION finance.refund_amount_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  p record;
BEGIN
  IF NEW.type = 'refund' THEN
    SELECT id, amount_cents INTO p FROM finance.payments WHERE id = NEW.payment_id;
    IF finance.payment_used_cents(p.id) > p.amount_cents THEN
      RAISE EXCEPTION 'a refund never exceeds what its payment can still give' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.type = 'credit' THEN
    PERFORM finance.refresh_invoice_state(NEW.invoice_id);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER refunds_amount_check AFTER INSERT OR UPDATE ON finance.refunds
  FOR EACH ROW EXECUTE FUNCTION finance.refund_amount_check();

-- Staging reset (TSK-0141): the new test-data tables are cleared by a permitted reset only.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'finance.invoices', 'finance.invoice_lines', 'finance.invoice_deposit_credits', 'finance.invoice_documents',
    'finance.refunds', 'finance.payouts', 'finance.provider_fees'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE TRUNCATE ON %s FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) '
      'EXECUTE FUNCTION staging.reject_truncate()',
      split_part(t, '.', 2) || '_reset_only_truncate', t);
  END LOOP;
END;
$$;
