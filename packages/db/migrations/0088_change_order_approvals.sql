-- 0088 The customer's decision on an issued change order, and what an approval binds (TSK-0082 part 2; HH-CHG-02,
-- HH-CHG-03, HH-PORT-05, HH-ID-07, HH-OFF-04, HH-DATA-03, HH-DATA-08, T44, T53, ENT-ChangeOrder, ENT-Approval,
-- ENT-JobScopeSnapshot, OWN-DEC-108, OWN-DEC-168, OWN-DEC-169, OWN-DEC-203, RULE-MONEY-CENTS, RULE-SERVER-AUTHZ).
-- The server decides who may act (apps/server/src/modules/change-orders/approve.ts); this migration keeps the records
-- true whatever path writes.
-- - work.change_order_versions: an issued version is approved or rejected by the identified customer, once, before
--   its valid-until time and only while it still changes the job's current approved scope (its base snapshot is the
--   latest one). decided_at is when; it never changes. Expired, withdrawn and superseded versions are final, so they
--   can never be approved (OWN-DEC-168).
-- - work.change_order_decisions: the evidence of the decision (append-only, one per version): the exact version and
--   the digest of its customer content, the totals in integer cents, the verified contact and how the customer was
--   identified: through the portal (a session with fresh verification and the access it came through) or in person
--   on the worker's phone with a one-time code sent to the contact's verified email or phone (the code, its channel
--   and the worker who captured it). An approval also pins the estimate terms the job was accepted under, the ticked
--   box and the typed full name, and the scope snapshot it created; a rejection may keep the customer's reason. A
--   signature is never identification and is not recorded as approval.
-- - work.job_scope_snapshots: an approved change adds the next version (source change_order): the previous lines and
--   texts plus the change, the subtotal and total moved by the change's charges and credits (OWN-DEC-203), the
--   discount and terms unchanged. Version 1 and every earlier snapshot stay as they are (append-only since 0044).
-- - identity.verification_codes: the purpose change_order_approval (the code of the in-person approval).

ALTER TABLE identity.verification_codes
  DROP CONSTRAINT verification_codes_purpose_check,
  ADD CONSTRAINT verification_codes_purpose_check
    CHECK (purpose IN ('contact_verification', 'project_access', 'account_sign_in', 'change_order_approval'));

ALTER TABLE work.change_order_versions
  ADD COLUMN decided_at timestamptz,
  ADD CONSTRAINT change_order_versions_decided CHECK ((state IN ('approved', 'rejected')) = (decided_at IS NOT NULL));

-- The guard of 0087, with the customer's decision: issued -> approved or rejected, before the valid-until time and
-- against the job's current approved scope.
CREATE OR REPLACE FUNCTION work.change_order_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  t record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'change-order versions are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'draft' OR NEW.reviewed_at IS NOT NULL OR NEW.withdrawn_at IS NOT NULL OR NEW.row_version <> 1
       OR NEW.issued_at IS NOT NULL OR NEW.decided_at IS NOT NULL THEN
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
  IF OLD.issued_at IS NOT NULL
     AND (NEW.issued_by, NEW.issued_at, NEW.content_sha256, NEW.valid_until, NEW.validity_days, NEW.validity_reason)
         IS DISTINCT FROM (OLD.issued_by, OLD.issued_at, OLD.content_sha256, OLD.valid_until, OLD.validity_days,
                           OLD.validity_reason) THEN
    RAISE EXCEPTION 'an issued change-order version never changes' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.decided_at IS NOT NULL AND NEW.decided_at IS DISTINCT FROM OLD.decided_at THEN
    RAISE EXCEPTION 'a customer''s decision on a change order never changes' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.state IS DISTINCT FROM OLD.state AND NOT (
       (OLD.state = 'draft' AND NEW.state IN ('reviewed', 'withdrawn'))
    OR (OLD.state = 'reviewed' AND NEW.state IN ('draft', 'issued', 'withdrawn'))
    OR (OLD.state = 'issued' AND NEW.state IN ('approved', 'rejected', 'superseded', 'expired', 'withdrawn'))) THEN
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
  -- Issued and approved against the job's current approved scope: an older base would bind a stale total.
  IF (NEW.state = 'issued' AND OLD.state = 'reviewed') OR (NEW.state = 'approved' AND OLD.state = 'issued') THEN
    IF NEW.base_snapshot_id IS DISTINCT FROM (SELECT s.id FROM work.job_scope_snapshots s WHERE s.job_id = NEW.job_id
                                                ORDER BY s.version DESC LIMIT 1) THEN
      RAISE EXCEPTION 'a change order is issued and approved against the current approved scope'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.state IN ('approved', 'rejected') AND OLD.state = 'issued' AND NEW.decided_at >= OLD.valid_until THEN
    RAISE EXCEPTION 'a change order is decided only before its validity ended (OWN-DEC-168)'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.state = 'expired' AND OLD.state = 'issued' AND NEW.expired_at < OLD.valid_until THEN
    RAISE EXCEPTION 'a change order expires only once its validity ended' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.state = 'draft' AND OLD.state = 'reviewed' THEN
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
  END IF;
  RETURN NEW;
END $$;

-- An approved change adds the job's next scope snapshot (see the header): one per approved version.
ALTER TABLE work.job_scope_snapshots
  ADD COLUMN change_order_version_id uuid UNIQUE REFERENCES work.change_order_versions (id),
  ADD CONSTRAINT job_scope_snapshots_change_order
    CHECK ((source = 'change_order') = (change_order_version_id IS NOT NULL));

CREATE FUNCTION work.job_scope_snapshot_change_order_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v    record;
  base record;
BEGIN
  IF NEW.source <> 'change_order' THEN
    RETURN NEW;
  END IF;
  SELECT job_id, state, base_snapshot_id, revised_total_cents, charges_cents, credits_cents INTO v
    FROM work.change_order_versions WHERE id = NEW.change_order_version_id;
  IF v.state IS DISTINCT FROM 'approved' OR v.job_id IS DISTINCT FROM NEW.job_id THEN
    RAISE EXCEPTION 'a change-order snapshot follows the approval of a change order of the same job'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT id, version, subtotal_cents, discount_cents, terms_document_id, terms_sha256 INTO base
    FROM work.job_scope_snapshots WHERE job_id = NEW.job_id ORDER BY version DESC LIMIT 1;
  IF base.id IS DISTINCT FROM v.base_snapshot_id OR NEW.version <> base.version + 1 THEN
    RAISE EXCEPTION 'a change-order snapshot is the next version after the scope the change was priced against'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.total_cents <> v.revised_total_cents OR NEW.discount_cents <> base.discount_cents
     OR NEW.subtotal_cents <> base.subtotal_cents + v.charges_cents - v.credits_cents
     OR (NEW.terms_document_id, NEW.terms_sha256) IS DISTINCT FROM (base.terms_document_id, base.terms_sha256) THEN
    RAISE EXCEPTION 'a change-order snapshot moves the totals by the change only (OWN-DEC-203)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER job_scope_snapshots_change_order BEFORE INSERT ON work.job_scope_snapshots
  FOR EACH ROW EXECUTE FUNCTION work.job_scope_snapshot_change_order_check();

CREATE TABLE work.change_order_decisions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id       uuid NOT NULL,
  version_id            uuid NOT NULL UNIQUE,
  job_id                uuid NOT NULL,
  project_id            uuid NOT NULL,
  version               integer NOT NULL CHECK (version >= 1),
  decision              text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  -- The exact content the customer viewed: the version's own digest (0087).
  content_sha256        text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  base_snapshot_id      uuid NOT NULL REFERENCES work.job_scope_snapshots (id),
  charges_cents         bigint NOT NULL CHECK (charges_cents >= 0),
  credits_cents         bigint NOT NULL CHECK (credits_cents >= 0),
  revised_total_cents   bigint NOT NULL CHECK (revised_total_cents > 0),
  -- An approval: the estimate terms the job was accepted under, the ticked box, the typed name and the new snapshot.
  terms_document_id     text CHECK (char_length(terms_document_id) BETWEEN 1 AND 60),
  terms_sha256          text CHECK (terms_sha256 ~ '^[0-9a-f]{64}$'),
  terms_accepted        boolean,
  full_name             text CHECK (char_length(btrim(full_name)) BETWEEN 1 AND 200 AND full_name = btrim(full_name)),
  scope_snapshot_id     uuid UNIQUE REFERENCES work.job_scope_snapshots (id),
  -- A rejection: the customer's optional reason.
  reason                text CHECK (char_length(btrim(reason)) BETWEEN 1 AND 2000),
  -- Who decided: the verified contact, and how they were identified.
  contact_ref           text NOT NULL CHECK (char_length(contact_ref) BETWEEN 1 AND 200),
  method                text NOT NULL CHECK (method IN ('portal', 'in_person_code')),
  access_via            text CHECK (access_via IN ('grant', 'account')),
  grant_id              uuid REFERENCES identity.project_access_grants (id),
  account_id            uuid REFERENCES identity.customer_accounts (id),
  customer_session_id   uuid REFERENCES identity.customer_sessions (id),
  verified_at           timestamptz NOT NULL,
  verification_code_id  uuid UNIQUE REFERENCES identity.verification_codes (id),
  code_channel          text CHECK (code_channel IN ('email', 'sms')),
  captured_by           uuid REFERENCES identity.staff_users (id),
  test_mark             boolean NOT NULL,
  client_address        text CHECK (char_length(client_address) BETWEEN 1 AND 100),
  user_agent            text CHECK (char_length(user_agent) BETWEEN 1 AND 400),
  idempotency_key       text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 128),
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT change_order_decisions_version FOREIGN KEY (version_id, change_order_id)
    REFERENCES work.change_order_versions (id, change_order_id),
  CONSTRAINT change_order_decisions_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id),
  CONSTRAINT change_order_decisions_totals CHECK (revised_total_cents > 0 AND (charges_cents > 0 OR credits_cents > 0)),
  CONSTRAINT change_order_decisions_approval CHECK (
    (decision = 'approved') = (terms_accepted IS TRUE AND full_name IS NOT NULL AND terms_document_id IS NOT NULL
                               AND terms_sha256 IS NOT NULL AND scope_snapshot_id IS NOT NULL)
    AND (decision = 'rejected' OR reason IS NULL)
    AND (decision = 'approved' OR (terms_accepted IS NULL AND full_name IS NULL AND terms_document_id IS NULL
                                   AND terms_sha256 IS NULL))),
  CONSTRAINT change_order_decisions_portal CHECK (
    method <> 'portal' OR (customer_session_id IS NOT NULL AND access_via IS NOT NULL
      AND (access_via = 'grant') = (grant_id IS NOT NULL) AND (access_via = 'account') = (account_id IS NOT NULL)
      AND verification_code_id IS NULL AND code_channel IS NULL AND captured_by IS NULL)),
  -- In person the customer is identified by a one-time code to their verified contact; only an approval is captured.
  CONSTRAINT change_order_decisions_in_person CHECK (
    method <> 'in_person_code' OR (decision = 'approved' AND verification_code_id IS NOT NULL
      AND code_channel IS NOT NULL AND captured_by IS NOT NULL AND access_via IS NULL AND grant_id IS NULL
      AND account_id IS NULL AND customer_session_id IS NULL))
);
CREATE INDEX change_order_decisions_job ON work.change_order_decisions (job_id, created_at);
COMMENT ON TABLE work.change_order_decisions IS
  'The identified customer''s approval or rejection of one exact issued change-order version: append-only, one each.';

-- A decision is written in its version's own move to approved or rejected, naming the version's job, number, digest
-- and totals; it is never changed or deleted.
CREATE FUNCTION work.change_order_decision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v record;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'change-order decisions are append-only: never changed or deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  SELECT job_id, project_id, version, state, content_sha256, base_snapshot_id, charges_cents, credits_cents,
         revised_total_cents
    INTO v FROM work.change_order_versions WHERE id = NEW.version_id;
  IF v.state IS DISTINCT FROM NEW.decision THEN
    RAISE EXCEPTION 'a decision is recorded with its version''s move to approved or rejected'
      USING ERRCODE = 'check_violation';
  END IF;
  IF (v.job_id, v.project_id, v.version, v.content_sha256, v.base_snapshot_id, v.charges_cents, v.credits_cents,
      v.revised_total_cents)
     IS DISTINCT FROM (NEW.job_id, NEW.project_id, NEW.version, NEW.content_sha256, NEW.base_snapshot_id,
                       NEW.charges_cents, NEW.credits_cents, NEW.revised_total_cents) THEN
    RAISE EXCEPTION 'a decision names its version''s job, number, content and totals' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.scope_snapshot_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM work.job_scope_snapshots
        WHERE id = NEW.scope_snapshot_id AND change_order_version_id = NEW.version_id) THEN
    RAISE EXCEPTION 'an approval names the scope snapshot of its own version' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER change_order_decisions_guard BEFORE INSERT OR UPDATE OR DELETE ON work.change_order_decisions
  FOR EACH ROW EXECUTE FUNCTION work.change_order_decision_guard();

-- A staging reset is the only path that empties this table (TSK-0141).
CREATE TRIGGER change_order_decisions_reset_only_truncate BEFORE TRUNCATE ON work.change_order_decisions
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();
