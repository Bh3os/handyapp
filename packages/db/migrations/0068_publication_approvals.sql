-- 0068 Owner approval before publishing over the threshold (TSK-0130; HH-EST-16, HH-EST-04, OWN-DEC-173,
-- FACT-OWNER-APPROVAL-THRESHOLD, ENT-EstimateVersion, ENT-ChangeOrder, ENT-QueueItem, ENT-PolicyVersion,
-- RULE-SERVER-AUTHZ, RULE-MONEY-CENTS).
-- - owner_approval.threshold: the Owner's threshold, 250000 cents, compared "greater than" (exactly $2,500.00 needs no
--   approval). The Owner changes it as a new audited configuration version (PUT /staff/settings/approval-threshold).
-- - owner_approval.discretionary_credit: the final owner amendments of 2026-10-22 to OWN-DEC-173 require the Owner's
--   approval for "material discretionary credits" without naming an amount: PROPOSED 1 cent (every discretionary
--   credit), marked proposed.
-- - estimating.publication_approvals: one record per approval asked for (or given by the Owner's own publication,
--   final owner amendments 2026-10-22 to OWN-DEC-173) for one exact document version: an estimate version now, a
--   change order version with TSK-0082. Under the final owner amendments of 2026-10-22 the Owner's own publication
--   counts as approval only through an authenticated publication that writes this record and its audit event in the
--   same transaction. It keeps what the Owner was shown (the reasons and flags, the proposed and
--   highest totals, the discount, the threshold and its version, the linked documents of the project, the known costs)
--   and the decision (who, when, the comment). content_digest is the SHA-256 of the version's customer price and scope
--   when it was asked for: any later change of either invalidates the approval (the application compares the digest
--   on every save and again when publishing). States: pending -> approved / rejected / invalidated; approved ->
--   invalidated (before it was used). used_at records the publication it allowed. Nothing is deleted; an ended record
--   never changes.
-- - The database's backstop: an estimate version over the active threshold (or any version while the threshold is NOT
--   CONFIGURED) becomes published only with an approved record of that version that the same publication used. The
--   application applies the full policy first (options, the project's linked documents, the flags).

INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by) VALUES
  ('owner_approval.threshold', 1, 'configured', '{"thresholdCents": 250000, "comparison": "greater_than"}', false,
   ARRAY['FACT-OWNER-APPROVAL-THRESHOLD', 'OWN-DEC-173'], 'migration:0068'),
  ('owner_approval.discretionary_credit', 1, 'configured', '{"materialFromCents": 1}', true,
   ARRAY['OWN-DEC-173', 'OQ-READINGS-2026-10-21'], 'migration:0068');

CREATE TABLE estimating.publication_approvals (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type                text NOT NULL CHECK (subject_type IN ('estimate_version', 'change_order_version')),
  subject_id                  uuid NOT NULL,
  estimate_version_id         uuid REFERENCES estimating.estimate_versions (id),
  project_id                  uuid NOT NULL REFERENCES crm.projects (id),
  -- The document's staff reference (estimate number, later the change-order reference) and its version number.
  reference                   text NOT NULL CHECK (char_length(reference) BETWEEN 1 AND 100),
  document_version            integer NOT NULL CHECK (document_version >= 1),
  content_digest              text NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
  state                       text NOT NULL CHECK (state IN ('pending', 'approved', 'rejected', 'invalidated')),
  basis                       text NOT NULL CHECK (basis IN ('request', 'owner_publication')),
  reasons                     text[] NOT NULL CHECK (cardinality(reasons) >= 1),
  flags                       text[] NOT NULL DEFAULT '{}',
  proposed_total_cents        bigint NOT NULL,
  highest_total_cents         bigint,
  subtotal_cents              bigint,
  discount_cents              bigint CHECK (discount_cents >= 0),
  discount_category           text,
  -- Change orders (TSK-0082): the price adjustment and the revised total authorized project value.
  adjustment_cents            bigint,
  revised_project_value_cents bigint,
  combined_project_cents      bigint NOT NULL,
  -- The threshold compared and its configuration version; null while it was NOT CONFIGURED.
  threshold_cents             bigint CHECK (threshold_cents >= 1),
  threshold_version           integer CHECK (threshold_version >= 1),
  -- The known internal costs of the offer (staff-only; never invented: null when none were entered).
  labor_cost_cents            bigint CHECK (labor_cost_cents >= 0),
  material_cost_cents         bigint CHECK (material_cost_cents >= 0),
  costs_complete              boolean,
  -- The project's other documents the splitting check counted: [{kind, id, reference, version, state, valueCents}].
  linked                      jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(linked) = 'array'),
  requested_by                uuid NOT NULL REFERENCES identity.staff_users (id),
  requested_at                timestamptz NOT NULL DEFAULT now(),
  decided_by                  uuid REFERENCES identity.staff_users (id),
  decided_at                  timestamptz,
  decision_comment            text CHECK (char_length(btrim(decision_comment)) BETWEEN 1 AND 2000),
  invalidated_at              timestamptz,
  invalidated_reason          text CHECK (invalidated_reason IN ('content_changed', 'not_required')),
  used_at                     timestamptz,
  row_version                 integer NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  CHECK ((subject_type = 'estimate_version') = (estimate_version_id IS NOT NULL)),
  CHECK (estimate_version_id IS NULL OR estimate_version_id = subject_id),
  CHECK ((threshold_cents IS NULL) = (threshold_version IS NULL)),
  CHECK (state NOT IN ('approved', 'rejected') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CHECK (state <> 'pending' OR (decided_by IS NULL AND decided_at IS NULL AND decision_comment IS NULL)),
  CHECK (state <> 'rejected' OR decision_comment IS NOT NULL),
  CHECK ((state = 'invalidated') = (invalidated_at IS NOT NULL AND invalidated_reason IS NOT NULL)),
  CHECK (used_at IS NULL OR state = 'approved'),
  CHECK (basis = 'request' OR (state = 'approved' AND decided_by = requested_by))
);
CREATE UNIQUE INDEX publication_approvals_one_pending ON estimating.publication_approvals (subject_type, subject_id)
  WHERE state = 'pending';
CREATE UNIQUE INDEX publication_approvals_one_approved ON estimating.publication_approvals (subject_type, subject_id)
  WHERE state = 'approved';
CREATE INDEX publication_approvals_subject ON estimating.publication_approvals (subject_type, subject_id, requested_at);
CREATE INDEX publication_approvals_pending ON estimating.publication_approvals (requested_at) WHERE state = 'pending';
CREATE INDEX publication_approvals_project ON estimating.publication_approvals (project_id);
COMMENT ON TABLE estimating.publication_approvals IS
  'Owner approvals of one exact document version before publishing over the threshold (HH-EST-16, OWN-DEC-173).';

-- Made pending (asked for) or approved by the Owner's own publication; afterwards a pending record is decided or
-- invalidated once, an approved one is used or invalidated once, and nothing else changes. Nothing is deleted.
CREATE FUNCTION estimating.publication_approval_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'publication approvals are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.row_version <> 1 OR NEW.used_at IS NOT NULL AND NEW.basis <> 'owner_publication'
       OR NEW.invalidated_at IS NOT NULL
       OR (NEW.basis = 'request' AND NEW.state <> 'pending')
       OR (NEW.basis = 'owner_publication' AND NEW.state <> 'approved') THEN
      RAISE EXCEPTION 'an approval is asked for (pending) or given by the Owner''s publication (approved)'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.estimate_version_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM estimating.estimate_versions
          WHERE id = NEW.estimate_version_id AND project_id = NEW.project_id AND state IN ('draft', 'in_review')) THEN
      RAISE EXCEPTION 'an approval is for an estimate version of its project still being prepared'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.state IN ('rejected', 'invalidated') OR OLD.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'an ended approval is history and never changes' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (to_jsonb(NEW) - 'state' - 'decided_by' - 'decided_at' - 'decision_comment' - 'invalidated_at'
        - 'invalidated_reason' - 'used_at' - 'row_version')
     IS DISTINCT FROM (to_jsonb(OLD) - 'state' - 'decided_by' - 'decided_at' - 'decision_comment' - 'invalidated_at'
        - 'invalidated_reason' - 'used_at' - 'row_version')
     OR NEW.row_version <> OLD.row_version + 1 THEN
    RAISE EXCEPTION 'an approval keeps what the Owner was shown' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.state = 'pending' AND NEW.state IN ('approved', 'rejected', 'invalidated') THEN
    IF NEW.state <> 'approved' AND NEW.used_at IS NOT NULL THEN
      RAISE EXCEPTION 'only an approval is used' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.state = 'approved' AND (
       (NEW.state = 'approved' AND NEW.used_at IS NOT NULL
        AND (NEW.decided_by, NEW.decided_at, NEW.decision_comment)
            IS NOT DISTINCT FROM (OLD.decided_by, OLD.decided_at, OLD.decision_comment))
       OR (NEW.state = 'invalidated' AND NEW.used_at IS NULL
        AND (NEW.decided_by, NEW.decided_at, NEW.decision_comment)
            IS NOT DISTINCT FROM (OLD.decided_by, OLD.decided_at, OLD.decision_comment))) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'an approval moves pending -> approved / rejected / invalidated, approved -> used / invalidated'
    USING ERRCODE = 'check_violation';
END $$;
CREATE TRIGGER publication_approvals_guard BEFORE INSERT OR UPDATE OR DELETE ON estimating.publication_approvals
  FOR EACH ROW EXECUTE FUNCTION estimating.publication_approval_guard();

-- The backstop at publishing: over the active threshold (or with none configured) an estimate version is published
-- only with an approved record of that version used by this publication.
CREATE FUNCTION estimating.estimate_publication_approval_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  threshold bigint;
BEGIN
  IF NEW.state = 'published' AND OLD.state IS DISTINCT FROM 'published' THEN
    SELECT CASE WHEN state = 'configured' THEN (value ->> 'thresholdCents')::bigint END INTO threshold
      FROM platform.policy_version WHERE key = 'owner_approval.threshold' AND status = 'active';
    IF (threshold IS NULL OR NEW.total_cents IS NULL OR NEW.total_cents > threshold) AND NOT EXISTS (
         SELECT 1 FROM estimating.publication_approvals
          WHERE subject_type = 'estimate_version' AND subject_id = NEW.id AND state = 'approved'
            AND used_at IS NOT NULL) THEN
      RAISE EXCEPTION 'publishing this estimate version needs the Owner''s approval (HH-EST-16)'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER estimate_versions_publication_approval BEFORE UPDATE OF state ON estimating.estimate_versions
  FOR EACH ROW EXECUTE FUNCTION estimating.estimate_publication_approval_check();
COMMENT ON FUNCTION estimating.estimate_publication_approval_check() IS
  'Over the owner approval threshold an estimate version is published only with the Owner''s used approval.';
