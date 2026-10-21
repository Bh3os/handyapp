-- 0035 Media visibility (TSK-0037; HH-DATA-07, HH-ARC-04, HH-PORT-01, HH-SEC-05, ENT-Photo, OWN-DEC-106).
-- - photos.uploader_kind: who uploaded the original (ENT-Photo "uploader"): the customer, through a request's upload
--   capability, or staff. Customer uploads are visible to that customer and to authorized staff (HH-DATA-07); it is
--   fixed with the original and never changes.
-- - photos.visibility: the visibility class (ENT-Photo): internal, customer_shared or restricted_incident. Internal is
--   the default: a row that does not say otherwise is internal. A staff upload always starts internal and becomes
--   customer-visible only by a later, audited share action (media.share_with_customer); sharing never grants
--   marketing or publication use, which is a separate permission (OWN-DEC-109, HH-PRIV-02).
-- - The customer projection serves a photo only when the customer uploaded it or it is customer_shared; any other
--   photo is not found by URL or ID (OWN-DEC-106).
-- Every photo stored so far came from a customer's draft or request capability (0016): they are customer uploads.
ALTER TABLE intake.photos
  ADD COLUMN uploader_kind text,
  ADD COLUMN visibility text NOT NULL DEFAULT 'internal'
    CHECK (visibility IN ('internal', 'customer_shared', 'restricted_incident'));
UPDATE intake.photos SET uploader_kind = 'customer';
ALTER TABLE intake.photos
  ALTER COLUMN uploader_kind SET NOT NULL,
  ADD CONSTRAINT photos_uploader_kind CHECK (uploader_kind IN ('customer', 'staff'));
COMMENT ON COLUMN intake.photos.uploader_kind IS 'Who uploaded the original: customer or staff (ENT-Photo; fixed).';
COMMENT ON COLUMN intake.photos.visibility IS
  'Visibility class: internal (default), customer_shared or restricted_incident (HH-DATA-07, ENT-Photo).';

-- The uploader never changes, and a staff upload starts internal (sharing is a separate, audited step).
CREATE FUNCTION intake.photo_visibility_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.uploader_kind = 'staff' AND NEW.visibility <> 'internal' THEN
      RAISE EXCEPTION 'PHOTO_INTERNAL_FIRST: a staff photo starts internal' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.uploader_kind IS DISTINCT FROM OLD.uploader_kind THEN
    RAISE EXCEPTION 'PHOTO_UPLOADER: the uploader of a photo never changes' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER photos_visibility_guard BEFORE INSERT OR UPDATE ON intake.photos
  FOR EACH ROW EXECUTE FUNCTION intake.photo_visibility_guard();
