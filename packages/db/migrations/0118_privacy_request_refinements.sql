-- 0118 Privacy request refinements (TSK-0152; OWN-DEC-201 I1 to I5, HH-PRIV-03, HH-PRIV-05, HH-PRIV-01, HH-PRIV-07,
-- ENT-PrivacyRequest, ENT-RetentionReview, ENT-AuditEvent, RULE-HUMAN-REVIEW, RULE-SERVER-AUTHZ). The server decides who
-- may do what (apps/server/src/modules/privacy/); this migration keeps the records true whatever path writes.
-- 1. I1, the secure alternative: a privacy request the Owner records for a person whose identity they verified another
--    way (a call to the phone on file, a reply from the email on file, a photo ID in person: PROPOSED). It names the
--    check, the Owner's note and the Owner who recorded it, and has no customer session. A request made in the portal
--    keeps its fresh one-time code in the session, as before.
--    I1, the risk: before completing an export or a deletion (the elevated requests, PROPOSED) the Owner confirms the
--    identity evidence; the confirmation is recorded with the decision (who and when). None of this changes afterwards.
-- 2. I3: privacy.request_corrections, the corrections of records that are never rewritten (approvals, issued invoices,
--    payments, receipts, audit entries and the other protected records), recorded on a correction request under
--    review as a new entry beside the record: what is corrected, the record's reference and the correction itself.
--    The record keeps its content. Append-only; recorded by a live Owner. Corrections of editable records (customer,
--    contact and property details) keep their history in crm.record_changes and crm.property_changes, as before.
-- 3. I5: privacy.mapping_reviews, the Owner's reviews of the data inventory's table-to-retention mapping: the mapping's
--    digest (SHA-256 of the annotations as the server renders them), how many tables it maps, whether the CPA and the
--    attorney confirmed it, and the Owner's note. Append-only. In production the Delete actions stay disabled until the
--    latest review names the mapping in force with both confirmations (the server's gate).

-- 1. The identity verification of a privacy request.
ALTER TABLE privacy.privacy_requests
  DROP CONSTRAINT privacy_requests_identity_method_check,
  ADD CONSTRAINT privacy_requests_identity_method_check
    CHECK (identity_method IN ('fresh_session_code', 'staff_verified')),
  ALTER COLUMN session_id DROP NOT NULL,
  -- The Owner's verification of a request recorded for a person outside the portal (PROPOSED kinds of check).
  ADD COLUMN identity_check       text CHECK (identity_check IN ('call_to_phone_on_file', 'reply_from_email_on_file',
                                    'photo_id_in_person')),
  ADD COLUMN identity_note        text CHECK (char_length(identity_note) BETWEEN 1 AND 1000
                                    AND identity_note = btrim(identity_note)),
  ADD COLUMN identity_recorded_by uuid REFERENCES identity.staff_users (id),
  -- The Owner's confirmation of the identity evidence of an elevated request, recorded with the decision.
  ADD COLUMN identity_confirmed_by uuid REFERENCES identity.staff_users (id),
  ADD COLUMN identity_confirmed_at timestamptz,
  ADD CONSTRAINT privacy_requests_identity CHECK (
    (identity_method = 'fresh_session_code') = (session_id IS NOT NULL)
    AND (identity_method = 'staff_verified') = (identity_check IS NOT NULL)
    AND (identity_check IS NULL) = (identity_note IS NULL)
    AND (identity_check IS NULL) = (identity_recorded_by IS NULL)),
  ADD CONSTRAINT privacy_requests_identity_confirmed CHECK (
    (identity_confirmed_by IS NULL) = (identity_confirmed_at IS NULL)
    AND (identity_confirmed_at IS NULL OR decided_at IS NOT NULL));
COMMENT ON COLUMN privacy.privacy_requests.identity_check IS
  'I1 (OWN-DEC-201): how the Owner verified a person who asked outside the portal; null for a fresh code in a session.';

-- The verification is set when the request is made and never changed; the confirmation once, with the decision. The
-- Owner records both (a live Owner, as for the extensions).
CREATE FUNCTION privacy.privacy_request_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.identity_confirmed_by IS NOT NULL THEN
      RAISE EXCEPTION 'the identity is confirmed with the decision' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.identity_recorded_by IS NOT NULL AND NOT finance.has_live_role(NEW.identity_recorded_by, ARRAY['owner']) THEN
      RAISE EXCEPTION 'the Owner records a privacy request verified outside the portal'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.identity_check, NEW.identity_note, NEW.identity_recorded_by)
     IS DISTINCT FROM (OLD.identity_check, OLD.identity_note, OLD.identity_recorded_by) THEN
    RAISE EXCEPTION 'a privacy request keeps how the identity was verified' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.identity_confirmed_by IS NOT NULL AND (NEW.identity_confirmed_by, NEW.identity_confirmed_at)
     IS DISTINCT FROM (OLD.identity_confirmed_by, OLD.identity_confirmed_at) THEN
    RAISE EXCEPTION 'the identity confirmation is recorded once' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.identity_confirmed_by IS NULL AND NEW.identity_confirmed_by IS NOT NULL
     AND NOT finance.has_live_role(NEW.identity_confirmed_by, ARRAY['owner']) THEN
    RAISE EXCEPTION 'the Owner confirms the identity' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER privacy_requests_identity_guard BEFORE INSERT OR UPDATE ON privacy.privacy_requests
  FOR EACH ROW EXECUTE FUNCTION privacy.privacy_request_identity_guard();

-- 2. Corrections recorded as new entries beside records that are never rewritten.
CREATE TABLE privacy.request_corrections (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq                bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  privacy_request_id uuid NOT NULL REFERENCES privacy.privacy_requests (id),
  -- The kind of record corrected (PROPOSED list of the records the software never rewrites).
  record_kind        text NOT NULL CHECK (record_kind IN ('estimate_approval', 'estimate_version', 'invoice', 'payment',
                       'receipt', 'refund', 'audit_entry', 'job_record', 'message', 'other')),
  -- The record's reference as staff read it (an estimate number, an invoice number, an audit entry number).
  record_ref         text NOT NULL CHECK (char_length(record_ref) BETWEEN 1 AND 160 AND record_ref = btrim(record_ref)),
  -- The correction, in the Owner's words: what is wrong and what is right.
  correction         text NOT NULL CHECK (char_length(correction) BETWEEN 1 AND 2000 AND correction = btrim(correction)),
  recorded_by        uuid NOT NULL REFERENCES identity.staff_users (id),
  recorded_at        timestamptz NOT NULL DEFAULT now(),
  request_id         text NOT NULL CHECK (char_length(request_id) BETWEEN 1 AND 100)
);
CREATE INDEX request_corrections_request ON privacy.request_corrections (privacy_request_id, seq);
COMMENT ON TABLE privacy.request_corrections IS
  'I3 (OWN-DEC-201): corrections of records never rewritten, recorded as new entries on a correction request. '
  'Append-only.';

-- Recorded by a live Owner on a correction request under review; never changed or deleted.
CREATE FUNCTION privacy.request_correction_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  r record;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'corrections are kept as recorded, never changed or deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  SELECT kind, state INTO r FROM privacy.privacy_requests WHERE id = NEW.privacy_request_id;
  IF NOT FOUND OR r.kind <> 'correction' OR r.state <> 'under_review' THEN
    RAISE EXCEPTION 'a correction is recorded on a correction request under review' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT finance.has_live_role(NEW.recorded_by, ARRAY['owner']) THEN
    RAISE EXCEPTION 'the Owner records a correction' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.recorded_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER request_corrections_guard BEFORE INSERT OR UPDATE OR DELETE ON privacy.request_corrections
  FOR EACH ROW EXECUTE FUNCTION privacy.request_correction_guard();
-- A staging reset is the only path that empties this table (TSK-0141).
CREATE TRIGGER request_corrections_reset_only_truncate BEFORE TRUNCATE ON privacy.request_corrections
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();

-- 3. The Owner's reviews of the table-to-retention mapping.
CREATE TABLE privacy.mapping_reviews (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq                bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  -- The mapping reviewed: the SHA-256 of the annotations, and how many tables they map.
  digest             text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  tables             integer NOT NULL CHECK (tables > 0),
  -- Whether the CPA and the attorney confirmed this mapping (the Owner records what they were told).
  cpa_confirmed      boolean NOT NULL,
  attorney_confirmed boolean NOT NULL,
  note               text NOT NULL CHECK (char_length(note) BETWEEN 1 AND 2000 AND note = btrim(note)),
  recorded_by        uuid NOT NULL REFERENCES identity.staff_users (id),
  recorded_at        timestamptz NOT NULL DEFAULT now(),
  request_id         text NOT NULL CHECK (char_length(request_id) BETWEEN 1 AND 100)
);
COMMENT ON TABLE privacy.mapping_reviews IS
  'I5 (OWN-DEC-201): reviews of the table-to-retention mapping; production deletion waits for a confirmed one. '
  'Append-only.';

CREATE FUNCTION privacy.mapping_review_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'mapping reviews are kept as recorded, never changed or deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NOT finance.has_live_role(NEW.recorded_by, ARRAY['owner']) THEN
    RAISE EXCEPTION 'the Owner records a mapping review' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.recorded_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER mapping_reviews_guard BEFORE INSERT OR UPDATE OR DELETE ON privacy.mapping_reviews
  FOR EACH ROW EXECUTE FUNCTION privacy.mapping_review_guard();
CREATE TRIGGER mapping_reviews_no_truncate BEFORE TRUNCATE ON privacy.mapping_reviews
  FOR EACH STATEMENT EXECUTE FUNCTION platform.reject_append_only_change();
