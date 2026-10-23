-- 0085 Spanish SOP safety text released as AI-reviewed after a separate comparison (TSK-0103; HH-LANG-04, HH-PKT-04,
-- T45, T70, ENT-SOPVersion, OWN-DEC-79, OWN-DEC-74, OWN-DEC-17, RULE-LANGUAGES, RULE-SAFETY-GATES,
-- RULE-NO-INVENTED-FACTS).
-- - catalog.sop_spanish_versions: the Spanish version of one English SOP version, as reviewed data. The translation
--   was made during development by AI and compared separately, deterministically, by tools/compare-safety-es.mjs
--   (seed/sops-es.json); the product has no runtime AI (OWN-DEC-74) and only stores and enforces the recorded result.
--   Each row names its English version and that version's content digest (the source version ID), the comparison
--   tool and date, the result per category (warnings, PPE, prohibited actions, measurements and units, step order,
--   stop-work conditions), the problems found and any ambiguous source instruction the translation flagged. Its
--   release status is "ai_reviewed" only when all six categories pass and nothing is flagged; anything else is
--   "pending". Never labelled human-reviewed or safety-certified; a human review record can be added later as a
--   separate, optional status. Rows are never changed or deleted; a later comparison of the same English version is a
--   new row and the latest one decides.
-- - A new English version is a new catalog.sop_versions row with no Spanish row: its Spanish stays pending until it
--   is translated and compared again, so a Spanish-reading worker is blocked at the Start Work gate
--   (SPANISH_SAFETY_REVIEW_PENDING) while English-reading workers are not affected. A job keeps the English version
--   it pinned, and with it that version's Spanish release.
-- - catalog.sop_versions.spanish_status (always 'pending' since 0050) is dropped: the release is read from the Spanish
--   versions (catalog.sop_spanish_status).

-- The six comparison categories, each 'pass' or 'fail'.
CREATE FUNCTION catalog.spanish_results_valid(r jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_typeof(r) = 'object'
     AND (SELECT count(*) FROM jsonb_object_keys(r)) = 6
     AND r ?& ARRAY['warnings', 'ppe', 'prohibited_actions', 'measurements_units', 'step_order', 'stop_work']
     AND NOT EXISTS (SELECT 1 FROM jsonb_each(r) e WHERE e.value NOT IN ('"pass"'::jsonb, '"fail"'::jsonb))
$$;
CREATE FUNCTION catalog.spanish_results_all_pass(r jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT NOT EXISTS (SELECT 1 FROM jsonb_each(r) e WHERE e.value <> '"pass"'::jsonb)
$$;

CREATE TABLE catalog.sop_spanish_versions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_version_id         uuid NOT NULL REFERENCES catalog.sop_versions (id),
  sop_id                 text NOT NULL CHECK (sop_id ~ '^SOP-[A-Z]{2}-[0-9]{2}$'),
  -- The English source: its content digest when this Spanish version was compared (must be the version's own).
  english_content_sha256 text NOT NULL CHECK (english_content_sha256 ~ '^[0-9a-f]{64}$'),
  title                  text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  -- The English structure (ids, kinds, order) with the Spanish lines; the open questions stay in English.
  content                jsonb NOT NULL CHECK (
                           jsonb_typeof(content) = 'object'
                           AND jsonb_typeof(content -> 'stages') = 'array'
                           AND jsonb_array_length(content -> 'stages') = 6
                           AND jsonb_typeof(content -> 'stopWork') = 'array'),
  content_sha256         text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  translation_sha256     text NOT NULL CHECK (translation_sha256 ~ '^[0-9a-f]{64}$'),
  translation_method     text NOT NULL DEFAULT 'ai_translation' CHECK (translation_method = 'ai_translation'),
  comparison_tool        text NOT NULL CHECK (comparison_tool ~ '^compare-safety-es@[0-9]+$'),
  checked_on             date NOT NULL,
  results                jsonb NOT NULL CHECK (catalog.spanish_results_valid(results)),
  problems               jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(problems) = 'array'),
  ambiguous              jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(ambiguous) = 'array'),
  release_status         text NOT NULL CHECK (release_status IN ('ai_reviewed', 'pending')),
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sop_version_id, translation_sha256, comparison_tool),
  -- Released only when every category passed, no problem was recorded and nothing was flagged as ambiguous.
  CONSTRAINT sop_spanish_versions_release CHECK (
    (release_status = 'ai_reviewed') = (
      catalog.spanish_results_all_pass(results)
      AND jsonb_array_length(problems) = 0
      AND jsonb_array_length(ambiguous) = 0))
);
CREATE INDEX sop_spanish_versions_version ON catalog.sop_spanish_versions (sop_version_id, created_at DESC);
COMMENT ON TABLE catalog.sop_spanish_versions IS
  'Spanish SOP versions compared with their English source; released as AI-reviewed only when every check passes.';

-- A Spanish version belongs to the English version it was compared with, and is never changed or deleted.
CREATE FUNCTION catalog.sop_spanish_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v catalog.sop_versions%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Spanish SOP versions are kept as compared: record a new comparison' USING ERRCODE = 'restrict_violation';
  END IF;
  SELECT * INTO v FROM catalog.sop_versions WHERE id = NEW.sop_version_id;
  IF v.sop_id <> NEW.sop_id OR v.content_sha256 <> NEW.english_content_sha256 THEN
    RAISE EXCEPTION 'a Spanish SOP version is compared with the exact English version it names'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sop_spanish_versions_guard BEFORE INSERT OR UPDATE OR DELETE ON catalog.sop_spanish_versions
  FOR EACH ROW EXECUTE FUNCTION catalog.sop_spanish_version_guard();
CREATE TRIGGER sop_spanish_versions_no_truncate BEFORE TRUNCATE ON catalog.sop_spanish_versions
  FOR EACH STATEMENT EXECUTE FUNCTION platform.reject_append_only_change();

-- The Spanish release of an English version: the latest comparison's status, or pending when there is none.
CREATE FUNCTION catalog.sop_spanish_status(p_sop_version uuid) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT s.release_status FROM catalog.sop_spanish_versions s
                    WHERE s.sop_version_id = p_sop_version
                    ORDER BY s.created_at DESC, s.id DESC LIMIT 1), 'pending')
$$;

-- The English versions keep their guard without the dropped column.
CREATE OR REPLACE FUNCTION catalog.sop_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
      NEW.content_sha256, NEW.hazard_sha256, NEW.quality_sha256, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.sop_id, OLD.service_id, OLD.version, OLD.title, OLD.source_file, OLD.source_sha256,
                       OLD.content, OLD.content_sha256, OLD.hazard_sha256, OLD.quality_sha256, OLD.created_at) THEN
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

ALTER TABLE catalog.sop_versions DROP COLUMN spanish_status;
