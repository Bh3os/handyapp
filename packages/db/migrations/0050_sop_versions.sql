-- 0050 SOP versions with their hazard and quality checks, pinned on each work package of a job (TSK-0068; HH-PKT-03,
-- HH-WORK-11, ENT-SOPVersion, ENT-WorkPackage, ENT-Hold, OWN-DEC-17, OWN-DEC-108, OQ-SAFETY-REVIEW, RULE-SAFETY-GATES,
-- RULE-HUMAN-REVIEW, RULE-NO-INVENTED-FACTS).
-- - catalog.sop_versions: one version of a service's SOP (ENT-SOPVersion), imported verbatim from its SOP-* node
--   (tools/import-sops.mjs -> seed/sops.json -> syncSops). The content is the six checklist stages (HH-WORK-11), the
--   service-specific stop-work, escalation and incident section and the source SOP's open questions, every line kept
--   unchanged with the vault file and line it comes from; its SHA-256, and the SHA-256 of its hazard checks (the HOLD,
--   GATE and FLAG controls and the stop-work section) and of its quality checks (stage 4), so a pin names the exact
--   hazard and quality versions too. Nothing in it is written by the software.
--   States: pending_competent_review (every import) -> approved (the Owner records the competent reviewer's sign-off,
--   sop.sign_off_review) -> superseded (a later import of changed content). One version per service is current (not
--   superseded). A version's content never changes and a version is never deleted.
-- - work_packages.sop_version_id: the exact SOP version pinned on the work package once it belongs to a job. Set once,
--   never changed or cleared; it must be the SOP of the package's own service. A work package with no pinned version
--   is NOT CONFIGURED and cannot become ready (or start or complete): no checklist is ever made up for it.
-- - work_package_sop_pins: the append-only record of each pinning, with its outcome: pinned (the version and its three
--   digests), or not_configured (no SOP version existed for the service when the job was created), and whether the
--   approval or a later import made it.
-- Production use needs an approved version; private staging may run a pending one under a "Pending competent review"
-- banner (OWN-DEC-108). That rule is in @handyhub/domain (sop.ts), which knows the environment; no flag here or there
-- clears a hold, a stop-work right or the Start Job gate (RULE-SAFETY-GATES).

CREATE TABLE catalog.sop_versions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_id                 text NOT NULL CHECK (sop_id ~ '^SOP-[A-Z]{2}-[0-9]{2}$'),
  service_id             text NOT NULL REFERENCES catalog.services (id),
  version                integer NOT NULL CHECK (version >= 1),
  title                  text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  -- The vault file the node's steps come from (sources/vault/), and its SHA-256 at import.
  source_file            text NOT NULL CHECK (char_length(source_file) BETWEEN 1 AND 300),
  source_sha256          text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  content                jsonb NOT NULL CHECK (
                           jsonb_typeof(content) = 'object'
                           AND jsonb_typeof(content -> 'stages') = 'array'
                           AND jsonb_array_length(content -> 'stages') = 6
                           AND jsonb_typeof(content -> 'stopWork') = 'array'
                           AND jsonb_typeof(content -> 'openQuestions') = 'array'),
  content_sha256         text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  hazard_sha256          text NOT NULL CHECK (hazard_sha256 ~ '^[0-9a-f]{64}$'),
  quality_sha256         text NOT NULL CHECK (quality_sha256 ~ '^[0-9a-f]{64}$'),
  review_state           text NOT NULL DEFAULT 'pending_competent_review'
                           CHECK (review_state IN ('pending_competent_review', 'approved', 'superseded')),
  -- No Spanish SOP text exists; Spanish safety text is released as AI-reviewed later (OWN-DEC-79, TSK-0103).
  spanish_status         text NOT NULL DEFAULT 'pending' CHECK (spanish_status IN ('pending')),
  -- The competent-review sign-off the Owner records (OWN-DEC-17): who reviewed, their qualification, what was
  -- reviewed, and who recorded it when. All set together, once.
  reviewer_name          text CHECK (char_length(btrim(reviewer_name)) BETWEEN 1 AND 200),
  reviewer_qualification text CHECK (char_length(btrim(reviewer_qualification)) BETWEEN 1 AND 200),
  review_note            text CHECK (char_length(btrim(review_note)) BETWEEN 1 AND 2000),
  signed_off_by          uuid REFERENCES identity.staff_users (id),
  signed_off_at          timestamptz,
  superseded_at          timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  row_version            integer NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  UNIQUE (sop_id, version),
  UNIQUE (id, service_id),
  CONSTRAINT sop_versions_service CHECK (sop_id = 'SOP-' || substring(service_id FROM 5)),
  CONSTRAINT sop_versions_sign_off CHECK (
    (signed_off_at IS NULL) = (signed_off_by IS NULL)
    AND (signed_off_at IS NULL) = (reviewer_name IS NULL)
    AND (signed_off_at IS NULL) = (reviewer_qualification IS NULL)
    AND (signed_off_at IS NULL) = (review_note IS NULL)),
  CONSTRAINT sop_versions_approved CHECK (review_state <> 'approved' OR signed_off_at IS NOT NULL),
  CONSTRAINT sop_versions_superseded CHECK ((review_state = 'superseded') = (superseded_at IS NOT NULL))
);
CREATE UNIQUE INDEX sop_versions_current ON catalog.sop_versions (service_id) WHERE review_state <> 'superseded';
COMMENT ON TABLE catalog.sop_versions IS
  'Verbatim SOP versions with their hazard and quality checks (ENT-SOPVersion); pending competent review until signed off.';

-- An import inserts a pending version; the content never changes; the sign-off is recorded once, on a pending
-- version; a version is superseded once, by a later import; nothing is deleted.
CREATE FUNCTION catalog.sop_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'SOP versions are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.review_state <> 'pending_competent_review' OR NEW.signed_off_at IS NOT NULL
       OR NEW.superseded_at IS NOT NULL OR NEW.row_version <> 1 THEN
      RAISE EXCEPTION 'an SOP version is imported pending competent review' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.sop_id, NEW.service_id, NEW.version, NEW.title, NEW.source_file, NEW.source_sha256, NEW.content,
      NEW.content_sha256, NEW.hazard_sha256, NEW.quality_sha256, NEW.spanish_status, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.sop_id, OLD.service_id, OLD.version, OLD.title, OLD.source_file, OLD.source_sha256,
                       OLD.content, OLD.content_sha256, OLD.hazard_sha256, OLD.quality_sha256, OLD.spanish_status,
                       OLD.created_at) THEN
    RAISE EXCEPTION 'SOP versions are immutable: import a new version' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.signed_off_at IS NOT NULL
     AND (NEW.reviewer_name, NEW.reviewer_qualification, NEW.review_note, NEW.signed_off_by, NEW.signed_off_at)
         IS DISTINCT FROM (OLD.reviewer_name, OLD.reviewer_qualification, OLD.review_note, OLD.signed_off_by,
                           OLD.signed_off_at) THEN
    RAISE EXCEPTION 'a recorded sign-off is never changed' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.review_state = 'superseded' THEN
    RAISE EXCEPTION 'a superseded SOP version is final' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.review_state = 'approved' AND OLD.review_state <> 'approved' AND OLD.review_state <> 'pending_competent_review'
  THEN
    RAISE EXCEPTION 'only a version pending competent review is signed off' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.review_state = 'pending_competent_review' AND OLD.review_state <> 'pending_competent_review' THEN
    RAISE EXCEPTION 'a signed-off SOP version never returns to pending' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.row_version <> OLD.row_version + 1 THEN
    RAISE EXCEPTION 'an SOP version change advances its row version by one' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sop_versions_guard BEFORE INSERT OR UPDATE OR DELETE ON catalog.sop_versions
  FOR EACH ROW EXECUTE FUNCTION catalog.sop_version_guard();

-- The pinned SOP version of a work package: only on a package of a job, only its own service's SOP, set once.
ALTER TABLE work.work_packages
  ADD COLUMN sop_version_id uuid,
  ADD COLUMN sop_pinned_at  timestamptz,
  ADD CONSTRAINT work_packages_sop_version FOREIGN KEY (sop_version_id, service_id)
    REFERENCES catalog.sop_versions (id, service_id),
  ADD CONSTRAINT work_packages_sop_pinned CHECK ((sop_version_id IS NULL) = (sop_pinned_at IS NULL)),
  ADD CONSTRAINT work_packages_sop_on_job CHECK (sop_version_id IS NULL OR job_id IS NOT NULL),
  -- NOT CONFIGURED: a work package without a pinned SOP version never becomes ready, starts or completes.
  ADD CONSTRAINT work_packages_sop_before_ready CHECK (
    state NOT IN ('ready', 'in_progress', 'complete') OR sop_version_id IS NOT NULL);

CREATE FUNCTION work.work_package_sop_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.sop_version_id IS NOT NULL
     AND (NEW.sop_version_id, NEW.sop_pinned_at) IS DISTINCT FROM (OLD.sop_version_id, OLD.sop_pinned_at) THEN
    RAISE EXCEPTION 'a work package keeps the SOP version pinned on it' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER work_packages_sop_guard BEFORE UPDATE ON work.work_packages
  FOR EACH ROW EXECUTE FUNCTION work.work_package_sop_guard();

CREATE TABLE work.work_package_sop_pins (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id uuid NOT NULL,
  project_id      uuid NOT NULL,
  job_id          uuid NOT NULL,
  service_id      text NOT NULL,
  outcome         text NOT NULL CHECK (outcome IN ('pinned', 'not_configured')),
  sop_version_id  uuid,
  content_sha256  text CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  hazard_sha256   text CHECK (hazard_sha256 ~ '^[0-9a-f]{64}$'),
  quality_sha256  text CHECK (quality_sha256 ~ '^[0-9a-f]{64}$'),
  -- approval: in the approval transaction that created the job; import: an SOP import found the package unpinned.
  source          text NOT NULL CHECK (source IN ('approval', 'import')),
  pinned_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_package_sop_pins_package FOREIGN KEY (work_package_id, project_id)
    REFERENCES work.work_packages (id, project_id),
  CONSTRAINT work_package_sop_pins_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id),
  CONSTRAINT work_package_sop_pins_version FOREIGN KEY (sop_version_id, service_id)
    REFERENCES catalog.sop_versions (id, service_id),
  CONSTRAINT work_package_sop_pins_outcome CHECK (
    (outcome = 'pinned') = (sop_version_id IS NOT NULL)
    AND (outcome = 'pinned') = (content_sha256 IS NOT NULL)
    AND (outcome = 'pinned') = (hazard_sha256 IS NOT NULL)
    AND (outcome = 'pinned') = (quality_sha256 IS NOT NULL))
);
CREATE UNIQUE INDEX work_package_sop_pins_once ON work.work_package_sop_pins (work_package_id)
  WHERE outcome = 'pinned';
CREATE INDEX work_package_sop_pins_package ON work.work_package_sop_pins (work_package_id, pinned_at);
CREATE TRIGGER work_package_sop_pins_append_only BEFORE UPDATE OR DELETE ON work.work_package_sop_pins
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE work.work_package_sop_pins IS
  'Append-only record of each SOP pinning of a work package: the exact version and digests, or NOT CONFIGURED.';
