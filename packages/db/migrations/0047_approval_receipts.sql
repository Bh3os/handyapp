-- 0047 The approval receipt and immutable accepted versions (TSK-0058; HH-EST-12, HH-EST-10, HH-DATA-03, HH-BASE-06,
-- ENT-Document, ENT-Approval, ENT-EstimateVersion, ENT-JobScopeSnapshot, OWN-DEC-105, OWN-DEC-126, T33, T35,
-- RULE-SERVER-AUTHZ, RULE-NO-INVENTED-FACTS).
-- - approval_receipts: the issued approval receipt of one approval (ENT-Document, kind approval_receipt): one combined
--   English PDF (PROPOSED: OWN-DEC-105 allows "one combined PDF") holding the receipt, the approved scope and amounts
--   exactly as the approval and its job scope snapshot recorded them, and the full wording of the estimate terms the
--   customer accepted. Stored once in private object storage under an opaque key with its SHA-256 and size; the TEST
--   mark and the terms are the approval's own. One per approval, so a retried job never issues a second one. Issued
--   documents are immutable: rows are never changed or deleted, and a correction is a new superseding record of its
--   own task (HH-DATA-03), never an edit.
-- - Accepted estimate versions refuse every change (HH-DATA-03, HH-BASE-06): the version guard of migration 0032 still
--   lets an accepted row's bookkeeping columns (state_changed_at, row_version, first_viewed_at) move; an accepted
--   version now keeps every column exactly as accepted. Its lines, costs, internals and documents were already frozen
--   from publishing (migrations 0026, 0030). Corrections are new versions or change orders, never edits (HH-EST-10).
-- - The evidence tables refuse TRUNCATE as well as UPDATE and DELETE: approvals, job scope snapshots, approval
--   receipts, jobs, estimate versions and their lines.
-- Nothing here sends a message: the receipt's delivery is the automatic message approval.receipt, whose wording is NOT
-- CONFIGURED until the owner approves it (each delivery records template_not_configured, never sent).

CREATE TABLE estimating.approval_receipts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id       uuid NOT NULL UNIQUE,
  project_id        uuid NOT NULL,
  kind              text NOT NULL DEFAULT 'approval_receipt' CHECK (kind IN ('approval_receipt')),
  -- The PDF as issued, in private object storage; the stored bytes are checked against the hash when read.
  object_key        text NOT NULL UNIQUE CHECK (object_key ~ '^[a-z0-9]+(?:[/-][a-z0-9]+)*$'),
  content_type      text NOT NULL CHECK (content_type = 'application/pdf'),
  byte_size         integer NOT NULL CHECK (byte_size > 0),
  sha256            text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  -- The approval's own terms and TEST mark, repeated so the document names what it holds (checked below).
  terms_document_id text NOT NULL CHECK (char_length(terms_document_id) BETWEEN 1 AND 60),
  terms_sha256      text NOT NULL CHECK (terms_sha256 ~ '^[0-9a-f]{64}$'),
  test_mark         boolean NOT NULL,
  -- The version of the receipt layout that rendered it (the bytes never change once issued).
  renderer_version  integer NOT NULL CHECK (renderer_version >= 1),
  visibility        text NOT NULL DEFAULT 'customer' CHECK (visibility IN ('customer')),
  issued_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT approval_receipts_approval FOREIGN KEY (approval_id, project_id)
    REFERENCES estimating.approvals (id, project_id)
);
COMMENT ON TABLE estimating.approval_receipts IS
  'The issued approval receipt PDF of one approval (ENT-Document): append-only, one per approval, immutable.';

-- An issued receipt names its approval's terms and TEST mark; it is never changed or deleted.
CREATE FUNCTION estimating.approval_receipt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  a record;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'ISSUED_DOCUMENT_IMMUTABLE: an issued approval receipt is never changed or deleted'
      USING ERRCODE = 'restrict_violation';
  END IF;
  SELECT terms_document_id, terms_sha256, test_mark INTO a FROM estimating.approvals WHERE id = NEW.approval_id;
  IF (a.terms_document_id, a.terms_sha256, a.test_mark)
     IS DISTINCT FROM (NEW.terms_document_id, NEW.terms_sha256, NEW.test_mark) THEN
    RAISE EXCEPTION 'an approval receipt names its approval''s terms and TEST mark' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER approval_receipts_guard BEFORE INSERT OR UPDATE OR DELETE ON estimating.approval_receipts
  FOR EACH ROW EXECUTE FUNCTION estimating.approval_receipt_guard();

-- An accepted version keeps every column as accepted: no state, bookkeeping or first-view change after acceptance.
CREATE FUNCTION estimating.accepted_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state = 'accepted' AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
    RAISE EXCEPTION 'ACCEPTED_VERSION_IMMUTABLE: an accepted estimate version is never changed; corrections are a new version or a change order'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER estimate_versions_accepted_guard BEFORE UPDATE ON estimating.estimate_versions
  FOR EACH ROW EXECUTE FUNCTION estimating.accepted_version_guard();

-- TRUNCATE bypasses row triggers; the evidence tables refuse it too.
CREATE TRIGGER approvals_no_truncate BEFORE TRUNCATE ON estimating.approvals
  FOR EACH STATEMENT EXECUTE FUNCTION platform.reject_append_only_change();
CREATE TRIGGER approval_receipts_no_truncate BEFORE TRUNCATE ON estimating.approval_receipts
  FOR EACH STATEMENT EXECUTE FUNCTION platform.reject_append_only_change();
CREATE TRIGGER job_scope_snapshots_no_truncate BEFORE TRUNCATE ON work.job_scope_snapshots
  FOR EACH STATEMENT EXECUTE FUNCTION platform.reject_append_only_change();
CREATE TRIGGER jobs_no_truncate BEFORE TRUNCATE ON work.jobs
  FOR EACH STATEMENT EXECUTE FUNCTION platform.reject_append_only_change();
CREATE TRIGGER estimate_versions_no_truncate BEFORE TRUNCATE ON estimating.estimate_versions
  FOR EACH STATEMENT EXECUTE FUNCTION platform.reject_append_only_change();
CREATE TRIGGER estimate_lines_no_truncate BEFORE TRUNCATE ON estimating.estimate_lines
  FOR EACH STATEMENT EXECUTE FUNCTION platform.reject_append_only_change();
