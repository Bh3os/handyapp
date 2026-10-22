-- 0080 Field photos, customer sharing and photo publication permissions (TSK-0076; HH-QA-05, HH-PORT-11, HH-PRIV-02,
-- HH-DATA-07, HH-STAFF-05, HH-SEC-05, T24, T57, T68, ENT-Photo, ENT-ConsentPreference, OWN-DEC-106, OWN-DEC-109,
-- RULE-SERVER-AUTHZ).
-- Job documentation, customer sharing and marketing publication are three separate permissions (HH-PRIV-02):
-- - work.field_photos: the before photos of 0074 (work.before_photos, renamed) become the field photos of a job: before
--   and after photos per work package and visit, each with an optional area label written by the worker (staff only),
--   an after photo optionally paired with a before photo of the same work package, a processing state (quarantined
--   until the stored original is checked again: ready or rejected, as request photos) and a visibility class
--   (HH-STAFF-05). A field photo is created internal (internal_operational) and becomes customer-visible only through
--   the audited share action of Owner or Office (media.share_with_customer); a ready photo only, and never one in a
--   restricted class. Stopping the share returns it to internal (PROPOSED). The original, its owner records, phase,
--   label and pair never change, and a row is never deleted. An after photo needs its uploader's own work start on the
--   visit (OWN-DEC-109 step 6 follows Start Work).
-- - Rows stored by 0074 passed the same content checks at upload: they are recorded as ready (processed when uploaded).
-- - work.photo_publication_permissions: the customer's evidenced permission to publish one field photo for one purpose
--   and channel under one notice version, recorded by the Owner (media.mark_marketing_eligible), and its withdrawal.
--   Append-only: the latest record per photo, purpose and channel is the current state (ENT-ConsentPreference).
--   Sharing with the customer never creates one. PROPOSED: purpose marketing and channel website only (the "Latest
--   projects" section of OWN-DEC-50 is the one decided use); the notice versions come from media.publication_notice,
--   NOT CONFIGURED below, so no permission can be recorded until the owner supplies the notice.

-- 1. The field photos ----------------------------------------------------------------------------------------------
ALTER TABLE work.before_photos RENAME TO field_photos;
ALTER TABLE work.field_photos RENAME CONSTRAINT before_photos_pkey TO field_photos_pkey;
ALTER TABLE work.field_photos RENAME CONSTRAINT before_photos_object_key_key TO field_photos_object_key_key;
ALTER TABLE work.field_photos RENAME CONSTRAINT before_photos_job TO field_photos_job;
ALTER TABLE work.field_photos RENAME CONSTRAINT before_photos_package TO field_photos_package;
ALTER INDEX work.before_photos_visit RENAME TO field_photos_visit;
ALTER TRIGGER before_photos_check ON work.field_photos RENAME TO field_photos_check;
ALTER TRIGGER before_photos_package ON work.field_photos RENAME TO field_photos_package;
ALTER TRIGGER before_photos_reset_only_truncate ON work.field_photos RENAME TO field_photos_reset_only_truncate;
DROP TRIGGER before_photos_append_only ON work.field_photos;

ALTER TABLE work.field_photos
  ADD COLUMN phase            text NOT NULL DEFAULT 'before' CHECK (phase IN ('before', 'after')),
  -- What the worker wrote about the area or task (staff only, never shown to the customer).
  ADD COLUMN area_label       text CHECK (char_length(btrim(area_label)) BETWEEN 1 AND 120),
  -- An after photo's before photo of the same work package ("pair before/after photos where possible").
  ADD COLUMN pair_of          uuid REFERENCES work.field_photos (id),
  ADD COLUMN state            text NOT NULL DEFAULT 'quarantined' CHECK (state IN ('quarantined', 'ready', 'rejected')),
  ADD COLUMN rejection_reason text CHECK (char_length(rejection_reason) <= 60),
  ADD COLUMN processed_at     timestamptz,
  ADD COLUMN visibility       text NOT NULL DEFAULT 'internal_operational'
    CHECK (visibility IN ('internal_operational', 'restricted_incident', 'restricted_financial', 'customer_shared')),
  -- The last share or stop-sharing action: who (Owner or Office) and when.
  ADD COLUMN visibility_changed_by uuid REFERENCES identity.staff_users (id),
  ADD COLUMN visibility_changed_at timestamptz,
  ADD COLUMN version          integer NOT NULL DEFAULT 1 CHECK (version >= 1);
UPDATE work.field_photos SET state = 'ready', processed_at = uploaded_at;
ALTER TABLE work.field_photos
  ALTER COLUMN phase DROP DEFAULT,
  ADD CONSTRAINT field_photos_rejected CHECK ((state = 'rejected') = (rejection_reason IS NOT NULL)),
  ADD CONSTRAINT field_photos_processed CHECK ((state = 'quarantined') = (processed_at IS NULL)),
  ADD CONSTRAINT field_photos_pair CHECK (pair_of IS NULL OR (phase = 'after' AND pair_of <> id)),
  ADD CONSTRAINT field_photos_shared CHECK (visibility <> 'customer_shared' OR state = 'ready'),
  ADD CONSTRAINT field_photos_visibility_change CHECK (
    (visibility_changed_by IS NULL) = (visibility_changed_at IS NULL));
CREATE INDEX field_photos_job ON work.field_photos (job_id, uploaded_at);
CREATE INDEX field_photos_shared_project ON work.field_photos (project_id, uploaded_at)
  WHERE visibility = 'customer_shared';
COMMENT ON TABLE work.field_photos IS
  'Before and after photos per work package and visit (ENT-Photo, OWN-DEC-109), internal until shared by Owner or '
  'Office (HH-DATA-07); originals never change.';
COMMENT ON COLUMN work.field_photos.visibility IS
  'Visibility class (HH-STAFF-05); customer_shared only through the audited share action, never marketing permission.';

-- A field photo names a work package of its own job; an after photo follows its uploader's own work start on the visit,
-- and its pair is a before photo of the same work package. It starts quarantined, internal and unchanged.
CREATE OR REPLACE FUNCTION work.before_photo_package_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM work.work_packages WHERE id = NEW.work_package_id AND job_id = NEW.job_id) THEN
    RAISE EXCEPTION 'a field photo names a work package of its own job' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.state <> 'quarantined' OR NEW.visibility <> 'internal_operational' OR NEW.version <> 1
     OR NEW.visibility_changed_by IS NOT NULL THEN
    RAISE EXCEPTION 'a field photo starts quarantined and internal' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.phase = 'after' AND NOT EXISTS (SELECT 1 FROM work.work_starts
                                         WHERE visit_id = NEW.visit_id AND staff_user_id = NEW.staff_user_id) THEN
    RAISE EXCEPTION 'an after photo follows its uploader''s own work start on the visit'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.pair_of IS NOT NULL AND NOT EXISTS (SELECT 1 FROM work.field_photos
                                             WHERE id = NEW.pair_of AND phase = 'before'
                                               AND work_package_id = NEW.work_package_id) THEN
    RAISE EXCEPTION 'an after photo pairs with a before photo of the same work package'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- Only processing (quarantined to ready or rejected) and the share action change a row; nothing is deleted.
CREATE FUNCTION work.field_photo_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PHOTO_KEPT: field photos are never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW.id, NEW.job_id, NEW.project_id, NEW.visit_id, NEW.work_package_id, NEW.staff_user_id, NEW.object_key,
      NEW.content_type, NEW.byte_size, NEW.sha256, NEW.device_captured_at, NEW.uploaded_at, NEW.phase, NEW.area_label,
      NEW.pair_of)
     IS DISTINCT FROM (OLD.id, OLD.job_id, OLD.project_id, OLD.visit_id, OLD.work_package_id, OLD.staff_user_id,
      OLD.object_key, OLD.content_type, OLD.byte_size, OLD.sha256, OLD.device_captured_at, OLD.uploaded_at, OLD.phase,
      OLD.area_label, OLD.pair_of) THEN
    RAISE EXCEPTION 'PHOTO_ORIGINAL: a stored original, its records, label and pair never change'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.state IS DISTINCT FROM OLD.state AND NOT (OLD.state = 'quarantined' AND NEW.state IN ('ready', 'rejected')) THEN
    RAISE EXCEPTION 'a field photo is processed once' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.visibility IS DISTINCT FROM OLD.visibility THEN
    IF NOT ((OLD.visibility = 'internal_operational' AND NEW.visibility = 'customer_shared')
            OR (OLD.visibility = 'customer_shared' AND NEW.visibility = 'internal_operational')) THEN
      RAISE EXCEPTION 'only an internal photo is shared with the customer, and only a shared one stops being shared'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.visibility_changed_by IS NULL
       OR NOT (work.has_live_role(NEW.visibility_changed_by, 'owner')
               OR work.has_live_role(NEW.visibility_changed_by, 'office')) THEN
      RAISE EXCEPTION 'the Owner or Office shares a field photo' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'a field photo change takes the next version' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER field_photos_guard BEFORE UPDATE OR DELETE ON work.field_photos
  FOR EACH ROW EXECUTE FUNCTION work.field_photo_guard();

-- 2. Photo publication permissions -----------------------------------------------------------------------------------
CREATE TABLE work.photo_publication_permissions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq                bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  photo_id           uuid NOT NULL REFERENCES work.field_photos (id),
  project_id         uuid NOT NULL REFERENCES crm.projects (id),
  -- The customer whose consent it is: the customer of the photo's project.
  customer_id        uuid NOT NULL REFERENCES crm.customers (id),
  purpose            text NOT NULL CHECK (purpose IN ('marketing')),
  channel            text NOT NULL CHECK (channel IN ('website')),
  granted            boolean NOT NULL,
  -- The version of the publication notice the customer agreed to (media.publication_notice); a withdrawal names none.
  notice_version     text CHECK (notice_version ~ '^[a-z][a-z0-9-]{0,38}[0-9]$'),
  -- The customer's instruction: how it was given and a reference to it (staff only; never message text).
  evidence_kind      text NOT NULL CHECK (evidence_kind IN ('signed_form', 'email', 'text_message')),
  evidence_reference text NOT NULL CHECK (char_length(btrim(evidence_reference)) BETWEEN 1 AND 300),
  recorded_by        uuid NOT NULL REFERENCES identity.staff_users (id),
  recorded_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT photo_publication_permissions_notice CHECK (granted = (notice_version IS NOT NULL))
);
CREATE INDEX photo_publication_permissions_current
  ON work.photo_publication_permissions (photo_id, purpose, channel, seq DESC);
CREATE TRIGGER photo_publication_permissions_append_only BEFORE UPDATE OR DELETE ON work.photo_publication_permissions
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE work.photo_publication_permissions IS
  'Per-photo publication permission (HH-PRIV-02, ENT-ConsentPreference): the customer''s evidenced consent per '
  'purpose, channel and notice version, recorded by the Owner; append-only, latest record is current.';

-- Recorded by the Owner, for a ready field photo of its own project that is not in a restricted class, as the
-- consent of that project's customer.
CREATE FUNCTION work.photo_publication_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM work.field_photos f JOIN crm.projects p ON p.id = f.project_id
                 WHERE f.id = NEW.photo_id AND f.project_id = NEW.project_id AND p.customer_id = NEW.customer_id
                   AND f.state = 'ready' AND f.visibility IN ('internal_operational', 'customer_shared')) THEN
    RAISE EXCEPTION 'a publication permission names a ready, unrestricted photo of its project and that project''s customer'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT work.has_live_role(NEW.recorded_by, 'owner') THEN
    RAISE EXCEPTION 'only the Owner records a photo publication permission' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER photo_publication_permissions_check BEFORE INSERT ON work.photo_publication_permissions
  FOR EACH ROW EXECUTE FUNCTION work.photo_publication_check();

-- 3. The publication notice: NOT CONFIGURED until the owner supplies its approved, attorney-reviewed version.
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by) VALUES
  ('media.publication_notice', 1, 'not_configured', NULL, false,
   ARRAY['HH-PRIV-02', 'ENT-ConsentPreference', 'OQ-FIELD-PHOTO-DETAILS'], 'migration:0080');

-- Staging reset (TSK-0141): test records with no TRUNCATE guard of their own; only a permitted staging reset clears
-- them (work.field_photos keeps the guard 0074 gave it).
CREATE TRIGGER photo_publication_permissions_reset_only_truncate BEFORE TRUNCATE ON work.photo_publication_permissions
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();
