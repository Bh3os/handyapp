-- 0030 Upload an Estimate: estimate documents and the agree-confirmation (TSK-0054; HH-EST-11, HH-SEC-05, ENT-Document,
-- ENT-EstimateVersion, INT-R2, FACT-UPLOAD-LIMITS, OWN-DEC-102, OWN-DEC-146).
-- - estimate_documents: the files of an uploaded estimate version, in private object storage (INT-R2). Each object is
--   written once under an opaque key and never changed; the row keeps its checked content type, size and SHA-256, so
--   the original can always be proven byte-for-byte unchanged. Rows are never deleted: an upload that replaces the
--   current document marks the old one `replaced` and keeps it.
--   - role 'original': the PDF or Word (.docx) document exactly as staff uploaded it. Private to staff, always.
--   - role 'customer_pdf': the PDF the customer views. For a PDF original it is a server-made copy of the same bytes
--     (same SHA-256); for a Word original it is a PDF supplied by staff, because this deployment has no faithful
--     Word-to-PDF converter and no third-party conversion service may be used (HH-EST-11): until one is supplied the
--     version is not ready ("PDF required").
--   A new document is quarantined until the processing job checks the stored bytes again (ready) or refuses them
--   (rejected), like request photos (TSK-0031). Only ready documents are served, only after the server authorized the
--   read.
-- - The agree-confirmation: the staff member who confirmed that the document and the structured amounts agree, when,
--   and the customer document it was given for. Saving the draft or uploading a document clears it (application), and
--   publishing an uploaded version without it, or without its ready documents, is refused here (HH-EST-11, T31).
-- - The documents of a version past review never change, like its lines (HH-DATA-03): edits create a new version.
-- - Amounts are never read from a document: the structured amounts are the version's lines and totals (migration 0026).
CREATE TABLE estimating.estimate_documents (
  id               uuid PRIMARY KEY,
  version_id       uuid NOT NULL,
  project_id       uuid NOT NULL,
  role             text NOT NULL CHECK (role IN ('original', 'customer_pdf')),
  -- uploaded: the original as uploaded; copy_of_original: the customer copy of a PDF original; supplied: a PDF staff
  -- supplied for a Word original.
  source           text NOT NULL CHECK (source IN ('uploaded', 'copy_of_original', 'supplied')),
  derived_from     uuid REFERENCES estimating.estimate_documents (id),
  object_key       text NOT NULL UNIQUE CHECK (object_key ~ '^[a-z0-9]+(?:[/-][a-z0-9]+)*$'),
  content_type     text NOT NULL CHECK (content_type IN ('application/pdf',
                     'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  byte_size        integer NOT NULL CHECK (byte_size > 0),
  sha256           text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  -- staff: never served to a customer. customer: the document a customer may read once the version is published
  -- (the customer estimate view, TSK-0056).
  visibility       text NOT NULL CHECK (visibility IN ('staff', 'customer')),
  state            text NOT NULL DEFAULT 'quarantined' CHECK (state IN ('quarantined', 'ready', 'rejected', 'replaced')),
  rejection_reason text CHECK (char_length(rejection_reason) <= 60),
  uploaded_by      uuid NOT NULL REFERENCES identity.staff_users (id),
  uploaded_at      timestamptz NOT NULL DEFAULT now(),
  processed_at     timestamptz,
  replaced_at      timestamptz,
  FOREIGN KEY (version_id, project_id) REFERENCES estimating.estimate_versions (id, project_id),
  CONSTRAINT estimate_documents_role_shape CHECK (
    (role = 'original') = (visibility = 'staff')
    AND (role = 'original') = (source = 'uploaded')
    AND (role = 'original' OR content_type = 'application/pdf')
    AND (source = 'copy_of_original') = (derived_from IS NOT NULL)),
  CONSTRAINT estimate_documents_state_shape CHECK (
    (state <> 'rejected' OR rejection_reason IS NOT NULL)
    AND (state = 'replaced') = (replaced_at IS NOT NULL))
);
-- One current document per role and version; replaced ones are kept beside it.
CREATE UNIQUE INDEX estimate_documents_current ON estimating.estimate_documents (version_id, role)
  WHERE state IN ('quarantined', 'ready', 'rejected');
CREATE INDEX estimate_documents_version ON estimating.estimate_documents (version_id, uploaded_at);
COMMENT ON TABLE estimating.estimate_documents IS
  'Uploaded estimate documents: private originals and the customer PDF, quarantined until processed (HH-EST-11).';

ALTER TABLE estimating.estimate_versions
  ADD COLUMN agreement_document_id  uuid REFERENCES estimating.estimate_documents (id),
  ADD COLUMN agreement_confirmed_by uuid REFERENCES identity.staff_users (id),
  ADD COLUMN agreement_confirmed_at timestamptz,
  ADD CONSTRAINT estimate_versions_agreement_shape CHECK (
    (agreement_document_id IS NULL) = (agreement_confirmed_by IS NULL)
    AND (agreement_document_id IS NULL) = (agreement_confirmed_at IS NULL)
    AND (authoring_method = 'uploaded' OR agreement_document_id IS NULL));
COMMENT ON COLUMN estimating.estimate_versions.agreement_document_id IS
  'Uploaded versions: the customer PDF for which staff confirmed that the document and the amounts agree.';

-- Document guard: a stored document never changes (object, type, size, hash, role, owner); its state only moves
-- forward (quarantined to ready or rejected, any current one to replaced); rows are never deleted; and nothing is
-- written for a version past review. The version row is share-locked so publishing and a document write serialize.
CREATE FUNCTION estimating.estimate_document_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_state text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ESTIMATE_DOCUMENT_KEPT: estimate documents are never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.id, NEW.version_id, NEW.project_id, NEW.role, NEW.source, NEW.derived_from, NEW.object_key,
        NEW.content_type, NEW.byte_size, NEW.sha256, NEW.visibility, NEW.uploaded_by, NEW.uploaded_at)
       IS DISTINCT FROM
       (OLD.id, OLD.version_id, OLD.project_id, OLD.role, OLD.source, OLD.derived_from, OLD.object_key,
        OLD.content_type, OLD.byte_size, OLD.sha256, OLD.visibility, OLD.uploaded_by, OLD.uploaded_at) THEN
      RAISE EXCEPTION 'ESTIMATE_DOCUMENT_ORIGINAL: a stored estimate document never changes'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.state IS DISTINCT FROM OLD.state AND NOT (
         (OLD.state = 'quarantined' AND NEW.state IN ('ready', 'rejected', 'replaced'))
         OR (OLD.state IN ('ready', 'rejected') AND NEW.state = 'replaced')) THEN
      RAISE EXCEPTION 'ESTIMATE_DOCUMENT_STATE: % cannot become %', OLD.state, NEW.state
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  SELECT state INTO v_state FROM estimating.estimate_versions WHERE id = NEW.version_id FOR SHARE;
  IF v_state IS NOT NULL AND v_state NOT IN ('draft', 'in_review') THEN
    RAISE EXCEPTION 'the documents of a published estimate version are immutable; revise it as a new version'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER estimate_documents_guard BEFORE INSERT OR UPDATE OR DELETE ON estimating.estimate_documents
  FOR EACH ROW EXECUTE FUNCTION estimating.estimate_document_guard();

-- The version guard of migration 0026, unchanged except that an uploaded version leaves review only with its
-- original ready, a ready customer PDF and the agree-confirmation given for exactly that PDF (HH-EST-11).
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
  IF (NEW.id, NEW.estimate_id, NEW.project_id, NEW.version, NEW.authoring_method, NEW.prepared_by, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.estimate_id, OLD.project_id, OLD.version, OLD.authoring_method, OLD.prepared_by,
                       OLD.created_at) THEN
    RAISE EXCEPTION 'an estimate version keeps its estimate, number, method and preparer'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.state = ANY (editable) THEN
    IF NOT (NEW.state = ANY (editable)) THEN
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
  IF OLD.first_viewed_at IS NOT NULL AND NEW.first_viewed_at IS DISTINCT FROM OLD.first_viewed_at THEN
    RAISE EXCEPTION 'the first customer view is recorded once' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (to_jsonb(NEW) - mutable) IS DISTINCT FROM (to_jsonb(OLD) - mutable) THEN
    RAISE EXCEPTION 'a published estimate version is immutable; revise it as a new version'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
