-- 0123 Reviewed service-specific default preparation instructions for window offers (TSK-0146; OWN-DEC-194 B7,
-- HH-SCH-11, HH-CUS-02, OWN-DEC-180, OWN-DEC-84, RULE-NO-INVENTED-FACTS, RULE-HUMAN-REVIEW, RULE-SERVER-AUTHZ).
-- - catalog.preparation_defaults: the default preparation instructions of a service, as versions the Owner approves
--   (service_content.approve). A version is the reviewed "Getting ready" steps of the service's approved page
--   version taken as they are (basis service_page), the Owner's own edit of them (edited), or the removal of the
--   default (removed: NOT CONFIGURED again). No default exists until the Owner approves one: this migration seeds
--   none, so every service starts NOT CONFIGURED. Versions are never changed or deleted; each is the next version of
--   its service, and only a live Owner approves one. The text is checked against the unsafe-instruction rules by the
--   server (@handyhub/domain preparation.ts) before it is written.
-- - work.window_offers: how an offer's instructions stand against the defaults in force when it was saved
--   (preparation_basis: default, edited, staff, none) and which default versions those were. Offers saved before
--   this migration keep null (not recorded). Both are kept as saved, like the instructions themselves.

CREATE TABLE catalog.preparation_defaults (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id      text NOT NULL REFERENCES catalog.services (id),
  version         integer NOT NULL CHECK (version >= 1),
  -- The customer-facing default; null only for a removal.
  text            text CHECK (char_length(btrim(text)) BETWEEN 1 AND 1000),
  basis           text NOT NULL CHECK (basis IN ('service_page', 'edited', 'removed')),
  -- The approved page version whose reviewed steps the Owner had beside it (service_page: taken from it verbatim).
  service_version integer,
  reason          text CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
  approved_by     uuid NOT NULL REFERENCES identity.staff_users (id),
  approved_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_id, version),
  FOREIGN KEY (service_id, service_version) REFERENCES catalog.service_versions (service_id, version),
  CONSTRAINT preparation_defaults_removed CHECK ((basis = 'removed') = (text IS NULL)),
  CONSTRAINT preparation_defaults_page CHECK (basis <> 'service_page' OR service_version IS NOT NULL)
);
COMMENT ON TABLE catalog.preparation_defaults IS
  'Owner-approved default preparation instructions per service for window offers (OWN-DEC-194 B7); append-only.';

CREATE TRIGGER preparation_defaults_append_only BEFORE UPDATE OR DELETE ON catalog.preparation_defaults
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();

-- The next version of its service, approved by a live Owner; a service_page version names an approved page version.
CREATE FUNCTION catalog.preparation_default_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT work.has_live_role(NEW.approved_by, 'owner') THEN
    RAISE EXCEPTION 'only an Owner approves a default preparation text' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM 1 FROM catalog.services WHERE id = NEW.service_id FOR UPDATE;
  IF NEW.version IS DISTINCT FROM
     coalesce((SELECT max(version) FROM catalog.preparation_defaults WHERE service_id = NEW.service_id), 0) + 1 THEN
    RAISE EXCEPTION 'a default takes the next version of its service' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.service_version IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM catalog.service_versions
        WHERE service_id = NEW.service_id AND version = NEW.service_version AND approved_at IS NOT NULL) THEN
    RAISE EXCEPTION 'a default rests on an approved service version' USING ERRCODE = 'check_violation';
  END IF;
  NEW.approved_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER preparation_defaults_guard BEFORE INSERT ON catalog.preparation_defaults
  FOR EACH ROW EXECUTE FUNCTION catalog.preparation_default_guard();

ALTER TABLE work.window_offers ADD COLUMN preparation_basis text
  CHECK (preparation_basis IN ('default', 'edited', 'staff', 'none'));
ALTER TABLE work.window_offers ADD COLUMN preparation_default_ids uuid[]
  CHECK (cardinality(preparation_default_ids) <= 26);
ALTER TABLE work.window_offers ADD CONSTRAINT window_offers_preparation_basis CHECK (
  preparation_basis IS NULL
  OR (preparation_default_ids IS NOT NULL
      AND (preparation_basis IN ('default', 'edited')) = (cardinality(preparation_default_ids) > 0)
      AND (preparation_basis <> 'none' OR preparation_instructions IS NULL)
      AND (preparation_basis NOT IN ('default', 'staff') OR preparation_instructions IS NOT NULL)));

-- A new offer records its basis; an offer keeps it, as it keeps its instructions (0120 window_offer_guard).
CREATE FUNCTION work.window_offer_preparation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.preparation_basis IS NULL THEN
      RAISE EXCEPTION 'an offer records how its preparation instructions stand against the defaults'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.preparation_basis, NEW.preparation_default_ids)
     IS DISTINCT FROM (OLD.preparation_basis, OLD.preparation_default_ids) THEN
    RAISE EXCEPTION 'an offer keeps its instructions and their basis' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER window_offers_preparation_guard BEFORE INSERT OR UPDATE ON work.window_offers
  FOR EACH ROW EXECUTE FUNCTION work.window_offer_preparation_guard();
