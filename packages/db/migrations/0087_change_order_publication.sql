-- 0087 Change-order publication: issued to the customer, valid 7 days, the Owner's approval over the threshold, revised
-- and reissued (TSK-0082 part 1; HH-CHG-02, OWN-DEC-168, OWN-DEC-169, OWN-DEC-173, OWN-DEC-203, OWN-DEC-204,
-- FACT-CHANGE-ORDER-VALIDITY, FACT-OWNER-APPROVAL-THRESHOLD, RULE-MONEY-CENTS). The server decides who may act
-- (apps/server/src/modules/change-orders); this migration keeps the records true whatever path writes.
-- - change_order.validity: a published change order is valid 7 calendar days (OWN-DEC-168), stored as an exact
--   timestamp computed in the business time zone. The Owner may set a shorter period for one change order, with a
--   written reason; nothing ever extends it.
-- - work.change_order_versions gains its publication: who issued it and when, the customer content digest (the exact
--   version the customer approves, part 2), the valid-until time and, when shorter, the Owner's period and reason; and
--   the times it was superseded (a later version replaced it) or expired. States now move draft -> reviewed -> issued
--   -> superseded / expired / withdrawn; the customer's approval and rejection are part 2. An issued version never
--   changes; a change is a new version (revise), and an expired, withdrawn or superseded one is reissued as a new
--   version after the staff review the current pricing, materials, schedule and scope (OWN-DEC-168 item 6).
-- - The backstop: over the active Owner approval threshold (the change itself or the revised project value), with no
--   threshold configured, or with a credit at or above the configured materiality (every credit while it is 1 cent,
--   OWN-DEC-204), a version becomes issued only with an approved Owner approval of that version that the same
--   publication used. The application applies the full policy first (the project's linked documents, the flags).

INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by) VALUES
  ('change_order.validity', 1, 'configured', '{"days": 7, "from": "published"}', false,
   ARRAY['FACT-CHANGE-ORDER-VALIDITY', 'OWN-DEC-168'], 'migration:0087');

ALTER TABLE work.change_order_versions
  ADD COLUMN issued_by       uuid REFERENCES identity.staff_users (id),
  ADD COLUMN issued_at       timestamptz,
  ADD COLUMN content_sha256  text CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  ADD COLUMN valid_until     timestamptz,
  -- A shorter validity the Owner set for this change order (days), with the written reason (OWN-DEC-168 item 8).
  ADD COLUMN validity_days   smallint CHECK (validity_days BETWEEN 1 AND 7),
  ADD COLUMN validity_reason text CHECK (char_length(btrim(validity_reason)) BETWEEN 1 AND 1000),
  ADD COLUMN superseded_at   timestamptz,
  ADD COLUMN expired_at      timestamptz,
  ADD CONSTRAINT change_order_versions_issued CHECK (
    (issued_at IS NULL) = (issued_by IS NULL) AND (issued_at IS NULL) = (content_sha256 IS NULL)
    AND (issued_at IS NULL) = (valid_until IS NULL)
    AND (valid_until IS NULL OR valid_until > issued_at)
    AND (state NOT IN ('issued', 'approved', 'rejected', 'expired', 'superseded') OR issued_at IS NOT NULL)
    AND (state <> 'draft' OR issued_at IS NULL)),
  ADD CONSTRAINT change_order_versions_short_validity CHECK ((validity_days IS NULL) = (validity_reason IS NULL)),
  ADD CONSTRAINT change_order_versions_superseded CHECK ((state = 'superseded') = (superseded_at IS NOT NULL)),
  ADD CONSTRAINT change_order_versions_expired CHECK ((state = 'expired') = (expired_at IS NOT NULL));
CREATE INDEX change_order_versions_valid_until ON work.change_order_versions (valid_until) WHERE state = 'issued';

-- The guard of 0086, with the publication's transitions: a draft's content only; issued once, with its digest and
-- validity; an issued version is superseded, expires (only once its validity ended) or is withdrawn.
CREATE OR REPLACE FUNCTION work.change_order_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  t record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'change-order versions are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'draft' OR NEW.reviewed_at IS NOT NULL OR NEW.withdrawn_at IS NOT NULL OR NEW.row_version <> 1
       OR NEW.issued_at IS NOT NULL THEN
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
  IF NEW.state IS DISTINCT FROM OLD.state AND NOT (
       (OLD.state = 'draft' AND NEW.state IN ('reviewed', 'withdrawn'))
    OR (OLD.state = 'reviewed' AND NEW.state IN ('draft', 'issued', 'withdrawn'))
    OR (OLD.state = 'issued' AND NEW.state IN ('superseded', 'expired', 'withdrawn'))) THEN
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
  IF NEW.state = 'issued' AND OLD.state = 'reviewed' THEN
    -- Issued against the job's current approved scope: an older base would show the customer a stale total.
    IF NEW.base_snapshot_id IS DISTINCT FROM (SELECT s.id FROM work.job_scope_snapshots s WHERE s.job_id = NEW.job_id
                                                ORDER BY s.version DESC LIMIT 1) THEN
      RAISE EXCEPTION 'a change order is issued against the current approved scope' USING ERRCODE = 'check_violation';
    END IF;
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

-- The backstop at publication (HH-CHG-02, OWN-DEC-173, OWN-DEC-204): see the header.
CREATE FUNCTION work.change_order_publication_approval_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  threshold bigint;
  material  bigint;
BEGIN
  IF NEW.state = 'issued' AND OLD.state IS DISTINCT FROM 'issued' THEN
    SELECT CASE WHEN state = 'configured' THEN (value ->> 'thresholdCents')::bigint END INTO threshold
      FROM platform.policy_version WHERE key = 'owner_approval.threshold' AND status = 'active';
    SELECT CASE WHEN state = 'configured' THEN (value ->> 'materialFromCents')::bigint END INTO material
      FROM platform.policy_version WHERE key = 'owner_approval.discretionary_credit' AND status = 'active';
    IF (threshold IS NULL OR NEW.revised_total_cents > threshold
        OR abs(NEW.charges_cents - NEW.credits_cents) > threshold
        OR (NEW.credits_cents > 0 AND (material IS NULL OR NEW.credits_cents >= material)))
       AND NOT EXISTS (
         SELECT 1 FROM estimating.publication_approvals
          WHERE subject_type = 'change_order_version' AND subject_id = NEW.id AND state = 'approved'
            AND used_at IS NOT NULL) THEN
      RAISE EXCEPTION 'issuing this change order needs the Owner''s approval (OWN-DEC-173)'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER change_order_versions_publication_approval BEFORE UPDATE OF state ON work.change_order_versions
  FOR EACH ROW EXECUTE FUNCTION work.change_order_publication_approval_check();
COMMENT ON FUNCTION work.change_order_publication_approval_check() IS
  'Over the owner approval threshold, or with a credit, a change order is issued only with the Owner''s used approval.';
