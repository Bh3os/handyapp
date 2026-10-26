-- 0107 Owner extensions of a worker's visit-day data access (TSK-0128; HH-PKT-08, HH-CRM-03, HH-OFF-02, HH-DATA-08,
-- T28, ENT-Reservation, ENT-AccessInstructionSecret, ENT-AuditEvent, OWN-DEC-171, RULE-SERVER-AUTHZ).
-- The server decides who sees what and when (apps/server/src/modules/packets/access-window.ts, @handyhub/domain
-- visit-access.ts): the assigned workers see the address, the site contact and may reveal codes only on the visit's
-- own local service day. This migration keeps the extension records true whatever path writes.
-- - work.visit_access_extensions: the Owner's temporary extension of one assigned worker's visit-day access on one
--   visit, with a recorded reason and an automatic expiry. It is tied to the worker's reservation: when that
--   reservation ends (a reassignment, a reschedule, which books a new reservation, a cancellation or an availability
--   change), the extension no longer counts; the visit must also still be live and the account active. Expired and
--   ended rows are kept as access history; the only change ever made is the Owner ending one early, once, with a
--   reason. Never deleted.
-- - PROPOSED (OQ-WORKER-ACCESS-DETAILS): at most 24 hours from the grant (the server's rule, checked here too).

CREATE TABLE work.visit_access_extensions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id        uuid NOT NULL REFERENCES work.visits (id),
  reservation_id  uuid NOT NULL REFERENCES work.reservations (id),
  staff_user_id   uuid NOT NULL REFERENCES identity.staff_users (id),
  -- Why the Owner extended it, as they wrote it (staff only).
  reason          text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
  granted_by      uuid NOT NULL REFERENCES identity.staff_users (id),
  starts_at       timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  -- The Owner ended it before its expiry, with a reason.
  ended_at        timestamptz,
  ended_by        uuid REFERENCES identity.staff_users (id),
  end_reason      text CHECK (char_length(btrim(end_reason)) BETWEEN 1 AND 500),
  request_id      text NOT NULL CHECK (char_length(request_id) BETWEEN 1 AND 200),
  CONSTRAINT visit_access_extensions_span CHECK (expires_at > starts_at AND expires_at <= starts_at + interval '24 hours'),
  CONSTRAINT visit_access_extensions_end CHECK (
    (ended_at IS NULL) = (ended_by IS NULL) AND (ended_at IS NULL) = (end_reason IS NULL))
);
CREATE INDEX visit_access_extensions_reservation ON work.visit_access_extensions (reservation_id, expires_at);
CREATE INDEX visit_access_extensions_visit ON work.visit_access_extensions (visit_id, starts_at);
COMMENT ON TABLE work.visit_access_extensions IS
  'Owner extensions of one assigned worker''s visit-day data access (OWN-DEC-171): reason, automatic expiry, '
  'tied to the reservation; kept as access history, ended early once by the Owner, never deleted.';

-- Granted by a live Owner on an active confirmed worker reservation of the visit, while the visit is live; the end
-- is the only change, once, by a live Owner.
CREATE FUNCTION work.visit_access_extension_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  r record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'visit access extensions are kept as access history, never deleted'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NOT work.has_live_role(NEW.granted_by, 'owner') THEN
      RAISE EXCEPTION 'only the Owner extends a worker''s visit-day access' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT res.visit_id, res.staff_user_id, res.resource, res.kind, res.ended_at, v.state INTO r
      FROM work.reservations res JOIN work.visits v ON v.id = res.visit_id
     WHERE res.id = NEW.reservation_id;
    IF NOT FOUND OR r.visit_id <> NEW.visit_id OR r.staff_user_id IS DISTINCT FROM NEW.staff_user_id
       OR r.resource <> 'worker' OR r.kind <> 'confirmed' OR r.ended_at IS NOT NULL THEN
      RAISE EXCEPTION 'an extension names an active confirmed assignment of that worker on that visit'
        USING ERRCODE = 'check_violation';
    END IF;
    IF r.state NOT IN ('confirmed', 'en_route', 'arrived') THEN
      RAISE EXCEPTION 'an extension is granted while the visit is live' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.ended_at IS NOT NULL THEN
      RAISE EXCEPTION 'an extension is granted before it is ended' USING ERRCODE = 'check_violation';
    END IF;
    NEW.starts_at := now();
    IF NEW.expires_at <= NEW.starts_at OR NEW.expires_at > NEW.starts_at + interval '24 hours' THEN
      RAISE EXCEPTION 'an extension expires within 24 hours of its grant' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.visit_id, NEW.reservation_id, NEW.staff_user_id, NEW.reason, NEW.granted_by, NEW.starts_at,
      NEW.expires_at, NEW.request_id)
     IS DISTINCT FROM (OLD.id, OLD.visit_id, OLD.reservation_id, OLD.staff_user_id, OLD.reason, OLD.granted_by,
                       OLD.starts_at, OLD.expires_at, OLD.request_id) THEN
    RAISE EXCEPTION 'an extension never changes; the Owner may only end it' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'an extension is ended once' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NOT work.has_live_role(NEW.ended_by, 'owner') THEN
    RAISE EXCEPTION 'only the Owner ends an extension early' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.ended_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER visit_access_extensions_guard BEFORE INSERT OR UPDATE OR DELETE ON work.visit_access_extensions
  FOR EACH ROW EXECUTE FUNCTION work.visit_access_extension_guard();

-- A staging reset is the only path that empties this table (TSK-0141).
CREATE TRIGGER visit_access_extensions_reset_only_truncate BEFORE TRUNCATE ON work.visit_access_extensions
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();
