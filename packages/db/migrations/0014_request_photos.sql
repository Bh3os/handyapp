-- 0016 Request photos (TSK-0031; HH-INT-04, HH-INT-05, HH-INT-06, HH-INT-07, HH-SEC-05, ENT-Photo, FACT-UPLOAD-LIMITS).
-- - upload_capabilities: an expiring upload capability scoped to one draft (before submission) or to one request
--   (retrying a failed photo from the receipt). The browser holds a random token; the row keeps its SHA-256 only. A
--   capability can add, list and remove the photos of its own scope and nothing else.
-- - photos: one row per stored original. The object is written once under an opaque key and never changed; the row
--   records the checked content type, size and SHA-256. A new photo is quarantined until processing passes it (ready)
--   or refuses it (rejected); only ready photos are ever served, and only through short-lived signed URLs after the
--   server authorized the read. On submission the server binds the draft's photos to the new request and project;
--   the client never chooses the owner.
CREATE TABLE intake.upload_capabilities (
  id           uuid PRIMARY KEY,
  token_hash   text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  scope        text NOT NULL CHECK (scope IN ('draft', 'request')),
  request_id   uuid REFERENCES intake.requests (id),
  state        text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'consumed', 'revoked')),
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  consumed_at  timestamptz,
  -- A request capability always names its request; a draft capability names it once consumed by the submission.
  CHECK (scope = 'draft' OR request_id IS NOT NULL),
  CHECK (expires_at > created_at)
);
COMMENT ON TABLE intake.upload_capabilities IS 'Expiring upload capabilities scoped to one draft or request (HH-INT-05).';

CREATE TABLE intake.photos (
  id               uuid PRIMARY KEY,
  capability_id    uuid NOT NULL REFERENCES intake.upload_capabilities (id),
  request_id       uuid REFERENCES intake.requests (id),
  project_id       uuid REFERENCES crm.projects (id),
  object_key       text NOT NULL UNIQUE CHECK (object_key ~ '^[a-z0-9]+(?:[/-][a-z0-9]+)*$'),
  content_type     text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size        integer NOT NULL CHECK (byte_size > 0),
  sha256           text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  state            text NOT NULL DEFAULT 'quarantined' CHECK (state IN ('quarantined', 'ready', 'rejected', 'removed')),
  rejection_reason text CHECK (char_length(rejection_reason) <= 60),
  uploaded_at      timestamptz NOT NULL DEFAULT now(),
  processed_at     timestamptz,
  removed_at       timestamptz,
  CHECK ((request_id IS NULL) = (project_id IS NULL)),
  CHECK ((state = 'rejected') = (rejection_reason IS NOT NULL))
);
CREATE INDEX photos_capability ON intake.photos (capability_id, uploaded_at);
CREATE INDEX photos_request ON intake.photos (request_id, uploaded_at) WHERE request_id IS NOT NULL;
-- The same bytes uploaded twice to one draft are one photo (a retried upload never duplicates it).
CREATE UNIQUE INDEX photos_once_per_capability ON intake.photos (capability_id, sha256) WHERE state <> 'removed';
COMMENT ON TABLE intake.photos IS 'Request photos: private originals, quarantined until processed (HH-INT-06, HH-SEC-05).';

-- Originals never change (HH-INT-06): the object, its type, size and hash are fixed; only the state, the binding to a
-- request and the processing times move, and a photo row is never deleted.
CREATE FUNCTION intake.photo_original_unchanged() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PHOTO_KEPT: photo records are never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW.object_key, NEW.content_type, NEW.byte_size, NEW.sha256, NEW.capability_id)
     IS DISTINCT FROM (OLD.object_key, OLD.content_type, OLD.byte_size, OLD.sha256, OLD.capability_id)
     OR (OLD.request_id IS NOT NULL AND NEW.request_id IS DISTINCT FROM OLD.request_id) THEN
    RAISE EXCEPTION 'PHOTO_ORIGINAL: a stored original and its owner never change' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER photos_original_unchanged BEFORE UPDATE OR DELETE ON intake.photos
  FOR EACH ROW EXECUTE FUNCTION intake.photo_original_unchanged();
