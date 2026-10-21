-- 0032 Estimate lifecycle, publishing and version history (TSK-0055; HH-EST-04, HH-STATE-01, ENT-EstimateVersion,
-- ENT-Estimate, OWN-DEC-102, OWN-DEC-103, OWN-DEC-118, FACT-ESTIMATE-VALIDITY, T32, RULE-NO-INVENTED-FACTS).
-- - The version states move only along the estimate_version.lifecycle machine of @handyhub/domain:
--     draft <-> in_review; draft / in_review -> published;
--     published -> accepted / declined / expired / withdrawn / superseded (final states: nothing leaves them).
--   So a superseded or an expired version can never become accepted, whatever writes to the table. Accepting also
--   needs the version to be unexpired at that moment and no newer version of its estimate published or accepted;
--   superseding needs a newer version of the estimate to exist.
-- - At most one published version per estimate (publishing a new one supersedes the old one first, in the same
--   transaction) and at most one version being edited per estimate (a revision is one new draft at a time).
-- - A version past review always carries what publishing pinned: the publisher and time, the validity period's policy
--   version and the valid-until time (after publishing), the estimate terms version, and the customer PDF stored at
--   publishing with its SHA-256 and size. While any of those values is NOT CONFIGURED nothing can be published, so
--   NOT CONFIGURED never turns into a default. A draft carries none of them.
-- - A new version starts as a draft numbered after the last one of its estimate; any version after the first is a
--   revision and names the version it was revised from (one that is past review), which is kept unchanged. Versions
--   are never deleted (migration 0026); the history is every row of the estimate.
ALTER TABLE estimating.estimate_versions ADD CONSTRAINT estimate_versions_id_estimate UNIQUE (id, estimate_id);

ALTER TABLE estimating.estimate_versions
  ADD COLUMN revised_from_id         uuid,
  -- The customer PDF as published (TSK-0054 renderer), stored once in private object storage under an opaque key.
  ADD COLUMN customer_pdf_object_key text UNIQUE CHECK (customer_pdf_object_key ~ '^[a-z0-9]+(?:[/-][a-z0-9]+)*$'),
  ADD COLUMN customer_pdf_sha256     text CHECK (customer_pdf_sha256 ~ '^[0-9a-f]{64}$'),
  ADD COLUMN customer_pdf_byte_size  integer CHECK (customer_pdf_byte_size > 0),
  ADD CONSTRAINT estimate_versions_revised_from FOREIGN KEY (revised_from_id, estimate_id)
    REFERENCES estimating.estimate_versions (id, estimate_id),
  ADD CONSTRAINT estimate_versions_customer_pdf_shape CHECK (
    (customer_pdf_object_key IS NULL) = (customer_pdf_sha256 IS NULL)
    AND (customer_pdf_object_key IS NULL) = (customer_pdf_byte_size IS NULL)),
  ADD CONSTRAINT estimate_versions_draft_unpublished CHECK (
    state NOT IN ('draft', 'in_review') OR (
      published_at IS NULL AND published_by IS NULL AND valid_until IS NULL AND validity_policy_version IS NULL
      AND terms_version IS NULL AND first_viewed_at IS NULL AND customer_pdf_object_key IS NULL));
COMMENT ON COLUMN estimating.estimate_versions.revised_from_id IS
  'The version this one was revised from (a new version of the same estimate); null for the first version.';
COMMENT ON COLUMN estimating.estimate_versions.customer_pdf_sha256 IS
  'SHA-256 of the customer PDF stored at publishing; the stored bytes are checked against it when served.';

ALTER TABLE estimating.estimate_versions DROP CONSTRAINT estimate_versions_published_complete;
ALTER TABLE estimating.estimate_versions ADD CONSTRAINT estimate_versions_published_complete CHECK (
  state IN ('draft', 'in_review') OR (
    total_cents IS NOT NULL AND tax_mode_version IS NOT NULL AND published_at IS NOT NULL
    AND published_by IS NOT NULL AND deposit_state <> 'not_configured'
    AND validity_policy_version IS NOT NULL AND valid_until IS NOT NULL AND valid_until > published_at
    AND terms_version IS NOT NULL AND customer_pdf_object_key IS NOT NULL));

CREATE UNIQUE INDEX estimate_versions_one_published ON estimating.estimate_versions (estimate_id)
  WHERE state = 'published';
CREATE UNIQUE INDEX estimate_versions_one_open ON estimating.estimate_versions (estimate_id)
  WHERE state IN ('draft', 'in_review');
-- The validity expiry job and the staff lists read published versions by their end of validity.
CREATE INDEX estimate_versions_valid_until ON estimating.estimate_versions (valid_until) WHERE state = 'published';

-- A new version: a draft, numbered after the last version of its estimate; a revision names a version past review.
CREATE FUNCTION estimating.estimate_version_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  last_version integer;
  source_state text;
BEGIN
  IF NEW.state <> 'draft' THEN
    RAISE EXCEPTION 'ESTIMATE_VERSION_NEW: a new estimate version starts as a draft' USING ERRCODE = 'check_violation';
  END IF;
  SELECT max(version) INTO last_version FROM estimating.estimate_versions WHERE estimate_id = NEW.estimate_id;
  IF NEW.version <> COALESCE(last_version, 0) + 1 THEN
    RAISE EXCEPTION 'ESTIMATE_VERSION_NUMBER: version % follows version %', NEW.version, COALESCE(last_version, 0)
      USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.version = 1) <> (NEW.revised_from_id IS NULL) THEN
    RAISE EXCEPTION 'ESTIMATE_VERSION_REVISION: every version after the first is a revision of an earlier one'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.revised_from_id IS NOT NULL THEN
    SELECT state INTO source_state FROM estimating.estimate_versions WHERE id = NEW.revised_from_id;
    IF source_state IN ('draft', 'in_review') THEN
      RAISE EXCEPTION 'ESTIMATE_VERSION_REVISION: a version being edited is changed in place, not revised'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER estimate_versions_insert_guard BEFORE INSERT ON estimating.estimate_versions
  FOR EACH ROW EXECUTE FUNCTION estimating.estimate_version_insert_guard();

-- The version guard of migrations 0026 and 0030, unchanged in what it already refused, with the lifecycle table:
-- the only state changes are the machine's, accepting needs the current unexpired version, and superseding needs a
-- newer version of the same estimate.
CREATE OR REPLACE FUNCTION estimating.estimate_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  editable constant text[] := ARRAY['draft', 'in_review'];
  mutable constant text[] := ARRAY['state', 'state_changed_at', 'first_viewed_at', 'row_version'];
  base_sum numeric;
  bad_lines integer;
  ready_originals integer;
  agreed boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'estimate versions are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW.id, NEW.estimate_id, NEW.project_id, NEW.version, NEW.authoring_method, NEW.prepared_by, NEW.created_at,
      NEW.revised_from_id)
     IS DISTINCT FROM (OLD.id, OLD.estimate_id, OLD.project_id, OLD.version, OLD.authoring_method, OLD.prepared_by,
                       OLD.created_at, OLD.revised_from_id) THEN
    RAISE EXCEPTION 'an estimate version keeps its estimate, number, method, preparer and source version'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.state = ANY (editable) THEN
    IF NOT (NEW.state = ANY (editable)) THEN
      IF NEW.state <> 'published' THEN
        RAISE EXCEPTION 'ESTIMATE_VERSION_TRANSITION: a % estimate version never becomes % without publishing',
          OLD.state, NEW.state USING ERRCODE = 'restrict_violation';
      END IF;
      SELECT COALESCE(sum(amount_cents) FILTER (WHERE kind = 'base'), 0),
             count(*) FILTER (WHERE amount_cents IS NULL OR amount_cents <= 0 OR description IS NULL)
        INTO base_sum, bad_lines
        FROM estimating.estimate_lines WHERE version_id = NEW.id;
      IF bad_lines > 0 OR NEW.subtotal_cents IS NULL OR base_sum <> NEW.subtotal_cents THEN
        RAISE EXCEPTION 'a version is published only with every line priced above $0.00 and totals equal to its lines'
          USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.authoring_method = 'uploaded' THEN
        SELECT count(*) FILTER (WHERE role = 'original' AND state = 'ready'),
               COALESCE(bool_or(role = 'customer_pdf' AND state = 'ready' AND id = NEW.agreement_document_id), false)
          INTO ready_originals, agreed
          FROM estimating.estimate_documents
         WHERE version_id = NEW.id AND state IN ('quarantined', 'ready', 'rejected');
        IF ready_originals <> 1 OR NOT agreed THEN
          RAISE EXCEPTION 'an uploaded estimate is published only with its documents ready and the confirmation that the document and the amounts agree'
            USING ERRCODE = 'check_violation';
        END IF;
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.state = ANY (editable) THEN
    RAISE EXCEPTION 'a published estimate version never returns to editing; revise it as a new version'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.state IS DISTINCT FROM OLD.state THEN
    IF OLD.state <> 'published'
       OR NOT (NEW.state IN ('accepted', 'declined', 'expired', 'withdrawn', 'superseded')) THEN
      RAISE EXCEPTION 'ESTIMATE_VERSION_TRANSITION: a % estimate version never becomes %', OLD.state, NEW.state
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.state = 'accepted' THEN
      IF OLD.valid_until <= clock_timestamp() THEN
        RAISE EXCEPTION 'ESTIMATE_VERSION_EXPIRED: an expired estimate version is never accepted'
          USING ERRCODE = 'restrict_violation';
      END IF;
      IF EXISTS (SELECT 1 FROM estimating.estimate_versions
                  WHERE estimate_id = OLD.estimate_id AND version > OLD.version
                    AND state IN ('published', 'accepted')) THEN
        RAISE EXCEPTION 'ESTIMATE_VERSION_SUPERSEDED: only the current version of an estimate is accepted'
          USING ERRCODE = 'restrict_violation';
      END IF;
    END IF;
    IF NEW.state = 'superseded' AND NOT EXISTS (
         SELECT 1 FROM estimating.estimate_versions WHERE estimate_id = OLD.estimate_id AND version > OLD.version) THEN
      RAISE EXCEPTION 'ESTIMATE_VERSION_TRANSITION: only a newer version supersedes an estimate version'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  IF OLD.first_viewed_at IS NOT NULL AND NEW.first_viewed_at IS DISTINCT FROM OLD.first_viewed_at THEN
    RAISE EXCEPTION 'the first customer view is recorded once' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (to_jsonb(NEW) - mutable) IS DISTINCT FROM (to_jsonb(OLD) - mutable) THEN
    RAISE EXCEPTION 'a published estimate version is immutable; revise it as a new version'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
