-- 0002 service registry (TSK-0019; HH-SVC-01, HH-SVC-02, OWN-DEC-33, OWN-DEC-84). One registry of the 26 services,
-- read by both websites, the request router and dispatch.
-- - catalog.services: the stable identity (ID and code never change, never reused), category, slug, the public status
--   and the scheduling mode. Public status (draft, shown on staging, owner-approved for production) is kept apart from
--   operational readiness, which is decided per job by the Hold / Ready control, holds and the Start Job gate.
-- - catalog.service_versions: versioned content. A version is immutable once written; changed content is a new
--   version. Only the owner's approval of a version is recorded on it afterwards.
CREATE SCHEMA IF NOT EXISTS catalog;
COMMENT ON SCHEMA catalog IS 'Service registry: the 26 services and their versioned content (HH-SVC-01).';

CREATE TABLE catalog.services (
  id text PRIMARY KEY CHECK (id ~ '^SVC-[A-Z]{2}-[0-9]{2}$'),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z]{2}-[0-9]{2}$' AND id = 'SVC-' || code),
  category text NOT NULL CHECK (category IN ('cleaning', 'drywall', 'home_improvement', 'painting')),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- draft: on no public site; staging: shown on private staging (and local, ci); published: owner-approved for
  -- production (published_version names the approved version).
  public_status text NOT NULL DEFAULT 'draft' CHECK (public_status IN ('draft', 'staging', 'published')),
  -- inquiry_only only with the owner's approval; it never auto-schedules as fully qualified work (HH-SVC-02).
  scheduling_mode text NOT NULL DEFAULT 'standard' CHECK (scheduling_mode IN ('standard', 'inquiry_only')),
  in_launch_set boolean NOT NULL DEFAULT true,
  current_version integer NOT NULL CHECK (current_version >= 1),
  published_version integer CHECK (published_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (public_status <> 'published' OR published_version IS NOT NULL)
);

CREATE TABLE catalog.service_versions (
  service_id text NOT NULL REFERENCES catalog.services (id),
  version integer NOT NULL CHECK (version >= 1),
  name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  staff_label_en text NOT NULL,
  staff_label_es text NOT NULL,
  -- Public page content; the description stays null until the owner approves one (OQ-SERVICE-DESCRIPTIONS).
  content jsonb NOT NULL,
  intake jsonb NOT NULL,
  estimate_route text NOT NULL CHECK (estimate_route IN ('online_or_site_visit')),
  sop_id text NOT NULL CHECK (sop_id ~ '^SOP-[A-Z]{2}-[0-9]{2}$'),
  home_age_limits boolean NOT NULL,
  source text,
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by text,
  PRIMARY KEY (service_id, version),
  CHECK ((approved_at IS NULL) = (approved_by IS NULL))
);

ALTER TABLE catalog.services
  ADD FOREIGN KEY (id, current_version) REFERENCES catalog.service_versions (service_id, version) DEFERRABLE INITIALLY DEFERRED,
  ADD FOREIGN KEY (id, published_version) REFERENCES catalog.service_versions (service_id, version) DEFERRABLE INITIALLY DEFERRED;

-- Versions are immutable: no delete, and an update may only record the owner's approval once.
CREATE FUNCTION catalog.service_versions_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'service versions are never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (to_jsonb(NEW) - 'approved_at' - 'approved_by') IS DISTINCT FROM (to_jsonb(OLD) - 'approved_at' - 'approved_by')
     OR OLD.approved_at IS NOT NULL THEN
    RAISE EXCEPTION 'service versions are immutable: write a new version' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER service_versions_immutable
  BEFORE UPDATE OR DELETE ON catalog.service_versions
  FOR EACH ROW EXECUTE FUNCTION catalog.service_versions_immutable();
