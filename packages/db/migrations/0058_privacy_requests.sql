-- 0058 Privacy requests, the Owner's Delete or Archive decisions and the deletion log (TSK-0100; HH-PRIV-03, HH-PRIV-05,
-- HH-PRIV-06, HH-DATA-09, T22, T68, T72, ENT-PrivacyRequest, ENT-RetentionReview, OWN-DEC-70, OWN-DEC-71, OWN-DEC-113,
-- FACT-RETENTION-SCHEDULE, RULE-SERVER-AUTHZ, RULE-HUMAN-REVIEW).
-- - privacy_requests: a customer's export, correction or deletion request (ENT-PrivacyRequest), made from verified
--   project access with a fresh verification (the identity confirmation), and reviewed and decided by the Owner:
--   received -> under_review -> completed / partially_completed / declined. The review keeps what the scoped search
--   found as categories and counts (never the records' content); the decision keeps the Owner, the time, the reason,
--   the deleted and retained categories with their reasons, and whether sign-in and project access were closed. A
--   decided request never changes.
-- - deletions: the deletion log (HH-PRIV-05): actor, time, record reference and reason, what kinds of rows and how many
--   went with it, whether it was early, and where the decision came from (a review entry, a privacy request, or a
--   re-application after a restore, T72). It never keeps the deleted personal content. Append-only.
-- - retention_decisions: the Owner's decision on a deletion-review entry (delete, archive, keep longer); the entry itself
--   stays as the job opened it (append-only, migration 0056). Append-only; nothing follows a delete.
-- - Erasure: the estimate tables refuse every DELETE (an estimate is "kept, never deleted") except inside the one
--   transaction that writes the deletion log entry naming that project: the entry records its transaction, the
--   transaction names the entry in the setting handyhub.erasure, and only then do the DELETE guards stand aside for
--   that project's rows. Updates are guarded exactly as before. No other table's guard changes.
COMMENT ON SCHEMA privacy IS 'Retention reviews (TSK-0099); privacy requests, Owner deletion decisions and the deletion log (TSK-0100).';

CREATE SEQUENCE privacy.privacy_request_number;

CREATE TABLE privacy.privacy_requests (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- A reference that names the request without personal content (PR-000001).
  reference            text NOT NULL UNIQUE
                         DEFAULT ('PR-' || lpad(nextval('privacy.privacy_request_number')::text, 6, '0'))
                         CHECK (reference ~ '^PR-[0-9]{6,12}$'),
  kind                 text NOT NULL CHECK (kind IN ('export', 'correction', 'deletion')),
  customer_id          uuid NOT NULL REFERENCES crm.customers (id),
  -- The verified contact who asked, and the account when the session was an account's.
  contact_id           uuid NOT NULL REFERENCES crm.contacts (id),
  account_id           uuid REFERENCES identity.customer_accounts (id),
  -- The project the request was made from (its verified access).
  project_id           uuid NOT NULL REFERENCES crm.projects (id),
  -- The customer's own words (what to correct); kept as written.
  details              text CHECK (char_length(details) BETWEEN 1 AND 2000),
  -- The identity confirmation: a one-time code entered in this session within the freshness window.
  identity_method      text NOT NULL CHECK (identity_method IN ('fresh_session_code')),
  identity_verified_at timestamptz NOT NULL,
  session_id           uuid NOT NULL REFERENCES identity.customer_sessions (id),
  state                text NOT NULL DEFAULT 'received'
                         CHECK (state IN ('received', 'under_review', 'completed', 'partially_completed', 'declined')),
  submitted_at         timestamptz NOT NULL DEFAULT now(),
  review_started_at    timestamptz,
  review_started_by    uuid REFERENCES identity.staff_users (id),
  -- What the review found: [{category, count, disposition, reason?, retention?}] and the checks; never content.
  findings             jsonb CHECK (findings IS NULL OR jsonb_typeof(findings) = 'object'),
  decided_at           timestamptz,
  decided_by           uuid REFERENCES identity.staff_users (id),
  decision_reason      text CHECK (char_length(btrim(decision_reason)) BETWEEN 1 AND 1000),
  -- The not-recorded checks (complaints, disputes, claims, holds the software does not record) the Owner confirmed.
  checks_confirmed     text[] NOT NULL DEFAULT '{}',
  -- The outcome the customer is told: deleted and retained categories with reasons and review dates; never content.
  outcome              jsonb CHECK (outcome IS NULL OR jsonb_typeof(outcome) = 'object'),
  access_closed        boolean,
  version              integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  request_id           text NOT NULL CHECK (char_length(request_id) BETWEEN 1 AND 100),
  CHECK (kind = 'correction' OR details IS NULL),
  CHECK ((review_started_at IS NULL) = (review_started_by IS NULL)),
  CHECK (state = 'received' OR review_started_at IS NOT NULL),
  CHECK ((state IN ('completed', 'partially_completed', 'declined')) = (decided_at IS NOT NULL)),
  CHECK ((decided_at IS NULL) = (decided_by IS NULL)),
  CHECK ((decided_at IS NULL) = (decision_reason IS NULL)),
  CHECK ((decided_at IS NULL) = (outcome IS NULL)),
  CHECK (decided_at IS NULL OR access_closed IS NOT NULL),
  CHECK (kind = 'deletion' OR access_closed IS NOT TRUE)
);
-- One open request of each kind per customer; a second one finds the first.
CREATE UNIQUE INDEX privacy_requests_one_open ON privacy.privacy_requests (customer_id, kind)
  WHERE state IN ('received', 'under_review');
CREATE INDEX privacy_requests_state ON privacy.privacy_requests (state, submitted_at, id);
CREATE INDEX privacy_requests_customer ON privacy.privacy_requests (customer_id, submitted_at DESC);
COMMENT ON TABLE privacy.privacy_requests IS
  'Customer export, correction and deletion requests (ENT-PrivacyRequest, HH-PRIV-03): reviewed and decided by the Owner.';

-- What a request names and how it was confirmed never change; the state moves forward only; a decided request is final.
CREATE FUNCTION privacy.privacy_request_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'privacy requests are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW.id, NEW.reference, NEW.kind, NEW.customer_id, NEW.contact_id, NEW.account_id, NEW.project_id, NEW.details,
      NEW.identity_method, NEW.identity_verified_at, NEW.session_id, NEW.submitted_at, NEW.request_id)
     IS DISTINCT FROM (OLD.id, OLD.reference, OLD.kind, OLD.customer_id, OLD.contact_id, OLD.account_id, OLD.project_id,
      OLD.details, OLD.identity_method, OLD.identity_verified_at, OLD.session_id, OLD.submitted_at, OLD.request_id) THEN
    RAISE EXCEPTION 'a privacy request keeps what was asked and how it was confirmed' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.state IN ('completed', 'partially_completed', 'declined') THEN
    RAISE EXCEPTION 'a decided privacy request is final' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.state = 'under_review' AND NEW.state = 'received' THEN
    RAISE EXCEPTION 'a privacy request under review does not go back' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.review_started_at IS NOT NULL AND (NEW.review_started_at, NEW.review_started_by)
     IS DISTINCT FROM (OLD.review_started_at, OLD.review_started_by) THEN
    RAISE EXCEPTION 'the start of a review is recorded once' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER privacy_requests_guard BEFORE UPDATE OR DELETE ON privacy.privacy_requests
  FOR EACH ROW EXECUTE FUNCTION privacy.privacy_request_guard();

CREATE TABLE privacy.deletions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq                  bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  -- The record deleted: its type, ID and a reference that names it without its personal content.
  record_type          text NOT NULL CHECK (record_type IN ('estimate', 'customer_account')),
  record_id            uuid NOT NULL,
  record_ref           text NOT NULL CHECK (char_length(btrim(record_ref)) BETWEEN 1 AND 160),
  -- The project whose rows the erasure may remove (estimates); null for a login account.
  project_id           uuid REFERENCES crm.projects (id),
  source               text NOT NULL CHECK (source IN ('retention_review', 'privacy_request', 'restore_reapply')),
  review_id            uuid REFERENCES privacy.retention_reviews (id),
  privacy_request_id   uuid REFERENCES privacy.privacy_requests (id),
  -- A re-application after a restore names the original entry, which the restored database may not hold (T72).
  original_deletion_id uuid,
  original_decided_at  timestamptz,
  reason               text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000),
  -- Deleted before the end of its retention period (the Owner's recorded reason, OWN-DEC-70).
  early                boolean NOT NULL,
  permanent            boolean NOT NULL,
  -- What went with the record: {"versions": 2, "lines": 5, "documents": 1, "objects": 3, ...}; counts only.
  removed              jsonb NOT NULL CHECK (jsonb_typeof(removed) = 'object'),
  -- The checks the software could not run that the Owner confirmed before deleting.
  checks_confirmed     text[] NOT NULL DEFAULT '{}',
  decided_by           text NOT NULL CHECK (char_length(decided_by) BETWEEN 1 AND 200),
  decided_at           timestamptz NOT NULL DEFAULT now(),
  request_id           text NOT NULL CHECK (char_length(request_id) BETWEEN 1 AND 100),
  -- The transaction that wrote the entry: only it may erase the rows (privacy.erasure_permitted).
  erasure_txid         bigint NOT NULL DEFAULT txid_current(),
  CHECK ((source = 'retention_review') = (review_id IS NOT NULL)),
  CHECK ((source = 'privacy_request') = (privacy_request_id IS NOT NULL)),
  CHECK ((source = 'restore_reapply') = (original_deletion_id IS NOT NULL)),
  CHECK ((original_deletion_id IS NULL) = (original_decided_at IS NULL)),
  CHECK ((record_type = 'estimate') = (project_id IS NOT NULL))
);
CREATE INDEX deletions_record ON privacy.deletions (record_type, record_id);
CREATE TRIGGER deletions_append_only BEFORE UPDATE OR DELETE ON privacy.deletions
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
CREATE TRIGGER deletions_no_truncate BEFORE TRUNCATE ON privacy.deletions
  FOR EACH STATEMENT EXECUTE FUNCTION platform.reject_append_only_change();
REVOKE UPDATE, DELETE, TRUNCATE ON privacy.deletions FROM PUBLIC;
DO $$
BEGIN
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON privacy.deletions FROM %I', current_user);
END;
$$;
COMMENT ON TABLE privacy.deletions IS
  'The deletion log (HH-PRIV-05): actor, time, record reference and reason; never the deleted personal content.';

CREATE TABLE privacy.retention_decisions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq              bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  review_id        uuid NOT NULL REFERENCES privacy.retention_reviews (id),
  decision         text NOT NULL CHECK (decision IN ('delete', 'archive', 'extend')),
  reason           text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000),
  -- Keep longer: the record comes back to review at this time.
  keep_until       timestamptz,
  -- Archive after a refused Delete: why deletion was blocked (codes only).
  blockers         text[] NOT NULL DEFAULT '{}',
  checks_confirmed text[] NOT NULL DEFAULT '{}',
  deletion_id      uuid REFERENCES privacy.deletions (id),
  decided_by       uuid NOT NULL REFERENCES identity.staff_users (id),
  decided_at       timestamptz NOT NULL DEFAULT now(),
  request_id       text NOT NULL CHECK (char_length(request_id) BETWEEN 1 AND 100),
  CHECK ((decision = 'extend') = (keep_until IS NOT NULL)),
  CHECK ((decision = 'delete') = (deletion_id IS NOT NULL))
);
CREATE INDEX retention_decisions_review ON privacy.retention_decisions (review_id, seq DESC);
-- Nothing follows a delete decision on the same entry.
CREATE FUNCTION privacy.retention_decision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM privacy.retention_decisions d WHERE d.review_id = NEW.review_id AND d.decision = 'delete') THEN
    RAISE EXCEPTION 'the record of this entry was deleted; no decision follows' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER retention_decisions_after_delete BEFORE INSERT ON privacy.retention_decisions
  FOR EACH ROW EXECUTE FUNCTION privacy.retention_decision_guard();
CREATE TRIGGER retention_decisions_append_only BEFORE UPDATE OR DELETE ON privacy.retention_decisions
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
CREATE TRIGGER retention_decisions_no_truncate BEFORE TRUNCATE ON privacy.retention_decisions
  FOR EACH STATEMENT EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE privacy.retention_decisions IS
  'The Owner''s decisions on deletion-review entries (HH-PRIV-05): delete, archive or keep longer, with a reason.';

-- Whether this transaction wrote the deletion log entry it names in handyhub.erasure, for this project.
CREATE FUNCTION privacy.erasure_permitted(p_project uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM privacy.deletions d
     WHERE d.id::text = nullif(current_setting('handyhub.erasure', true), '')
       AND d.erasure_txid = txid_current()
       AND d.project_id = p_project
  )
$$;
CREATE FUNCTION privacy.erasure_permitted_version(p_version uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT privacy.erasure_permitted(v.project_id) FROM estimating.estimate_versions v WHERE v.id = p_version
$$;
COMMENT ON FUNCTION privacy.erasure_permitted(uuid) IS
  'True only inside the transaction that wrote the deletion log entry named in handyhub.erasure for this project.';

-- The estimate tables: updates guarded exactly as before; deletes refused except for a permitted erasure.
DROP TRIGGER estimates_append_only ON estimating.estimates;
CREATE TRIGGER estimates_append_only BEFORE UPDATE ON estimating.estimates
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
CREATE TRIGGER estimates_no_delete BEFORE DELETE ON estimating.estimates
  FOR EACH ROW WHEN (NOT coalesce(privacy.erasure_permitted(OLD.project_id), false))
  EXECUTE FUNCTION platform.reject_append_only_change();

DROP TRIGGER estimate_versions_guard ON estimating.estimate_versions;
CREATE TRIGGER estimate_versions_guard BEFORE UPDATE ON estimating.estimate_versions
  FOR EACH ROW EXECUTE FUNCTION estimating.estimate_version_guard();
CREATE TRIGGER estimate_versions_no_delete BEFORE DELETE ON estimating.estimate_versions
  FOR EACH ROW WHEN (NOT coalesce(privacy.erasure_permitted(OLD.project_id), false))
  EXECUTE FUNCTION estimating.estimate_version_guard();

DROP TRIGGER estimate_lines_guard ON estimating.estimate_lines;
CREATE TRIGGER estimate_lines_guard BEFORE INSERT OR UPDATE ON estimating.estimate_lines
  FOR EACH ROW EXECUTE FUNCTION estimating.estimate_content_guard();
CREATE TRIGGER estimate_lines_delete_guard BEFORE DELETE ON estimating.estimate_lines
  FOR EACH ROW WHEN (NOT coalesce(privacy.erasure_permitted(OLD.project_id), false))
  EXECUTE FUNCTION estimating.estimate_content_guard();

DROP TRIGGER estimate_line_costs_guard ON estimating.estimate_line_costs;
CREATE TRIGGER estimate_line_costs_guard BEFORE INSERT OR UPDATE ON estimating.estimate_line_costs
  FOR EACH ROW EXECUTE FUNCTION estimating.estimate_content_guard();
CREATE TRIGGER estimate_line_costs_delete_guard BEFORE DELETE ON estimating.estimate_line_costs
  FOR EACH ROW WHEN (NOT coalesce(privacy.erasure_permitted_version(OLD.version_id), false))
  EXECUTE FUNCTION estimating.estimate_content_guard();

DROP TRIGGER estimate_version_internals_guard ON estimating.estimate_version_internals;
CREATE TRIGGER estimate_version_internals_guard BEFORE INSERT OR UPDATE ON estimating.estimate_version_internals
  FOR EACH ROW EXECUTE FUNCTION estimating.estimate_content_guard();
CREATE TRIGGER estimate_version_internals_delete_guard BEFORE DELETE ON estimating.estimate_version_internals
  FOR EACH ROW WHEN (NOT coalesce(privacy.erasure_permitted_version(OLD.version_id), false))
  EXECUTE FUNCTION estimating.estimate_content_guard();

DROP TRIGGER estimate_documents_guard ON estimating.estimate_documents;
CREATE TRIGGER estimate_documents_guard BEFORE INSERT OR UPDATE ON estimating.estimate_documents
  FOR EACH ROW EXECUTE FUNCTION estimating.estimate_document_guard();
CREATE TRIGGER estimate_documents_delete_guard BEFORE DELETE ON estimating.estimate_documents
  FOR EACH ROW WHEN (NOT coalesce(privacy.erasure_permitted(OLD.project_id), false))
  EXECUTE FUNCTION estimating.estimate_document_guard();

DROP TRIGGER customer_responses_guard ON estimating.customer_responses;
CREATE TRIGGER customer_responses_guard BEFORE INSERT OR UPDATE ON estimating.customer_responses
  FOR EACH ROW EXECUTE FUNCTION estimating.customer_response_guard();
CREATE TRIGGER customer_responses_delete_guard BEFORE DELETE ON estimating.customer_responses
  FOR EACH ROW WHEN (NOT coalesce(privacy.erasure_permitted(OLD.project_id), false))
  EXECUTE FUNCTION estimating.customer_response_guard();
