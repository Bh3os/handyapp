-- 0064 Personal packet acknowledgments and their invalidation (TSK-0072; HH-DATA-08, HH-WORK-10, HH-PKT-02, HH-CHG-03,
-- HH-STAFF-02, HH-OFF-06, T27, T44, T51, ENT-Acknowledgment, ENT-JobPacket, ENT-StaffUser, ENT-Visit, OWN-DEC-121,
-- OWN-DEC-119, OWN-DEC-123, RULE-SAFETY-GATES, RULE-SERVER-AUTHZ).
-- - job_packet_acknowledgments: a worker's own confirmation that they reviewed one packet version (ENT-Acknowledgment),
--   with the exact content digest, the scope version and the SOP versions it covered. Personal: the worker is the
--   caller (the server never takes another person's ID), and the database refuses an acknowledgment by anyone who is
--   not, at that moment, an active account with an active confirmed reservation on a live visit of the job. Only the
--   job's latest version can be acknowledged, once while it stands. Nobody edits or deletes one; nobody inherits one:
--   a newly assigned worker has none until they give their own.
-- - job_packet_acknowledgment_invalidations: why and when an acknowledgment stopped counting, at most once each
--   (UNIQUE acknowledgment_id: applying the same change again has no further effect, HH-CHG-03). Written by the
--   database in the same transaction as the change that causes it:
--   - critical_change: a new packet version marked critical (scope, hazards and holds, SOP version, assignment, site
--     access: HH-PKT-02, HH-DATA-08) ends every earlier acknowledgment of the job. PROPOSED (OQ-PACKET-ACKNOWLEDGMENT):
--     every assigned worker of the job is affected by every critical change (none is narrowed to one visit or task).
--   - assignment_removed: the worker's last active confirmed reservation on a live visit of the job ended (a
--     reassignment, a cancellation, an availability release): checked at commit, so a reschedule that ends and
--     re-creates the same worker's reservation in one transaction keeps the acknowledgment (a moved window is not
--     critical, OQ-PACKET-DETAILS). Reassigned back later, the worker reviews again personally (HH-WORK-10).
--   - account_disabled: the account was disabled (offboarding, T27): every acknowledgment of that person ends; a
--     re-enabled account reviews again.
-- - An acknowledgment never releases a hold and is never a Start Job gate by itself: the gate (TSK-0073) reads it
--   with every other check (RULE-SAFETY-GATES). Both tables are append-only.

CREATE TABLE work.job_packet_acknowledgments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id       uuid NOT NULL,
  job_id          uuid NOT NULL,
  version         integer NOT NULL,
  staff_user_id   uuid NOT NULL REFERENCES identity.staff_users (id),
  -- What was acknowledged: the whole packet version (scope, SOP versions, hazards and holds, resources, prior evidence,
  -- assignment and site access). Other kinds (an SOP or scope version alone) may be added by later tasks.
  kind            text NOT NULL CHECK (kind IN ('packet')),
  content_sha256  text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  scope_version   integer CHECK (scope_version IS NULL OR scope_version >= 1),
  sop_version_ids jsonb NOT NULL CHECK (jsonb_typeof(sop_version_ids) = 'array'),
  request_id      text NOT NULL CHECK (char_length(request_id) BETWEEN 1 AND 200),
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_packet_acknowledgments_packet FOREIGN KEY (packet_id, job_id, version)
    REFERENCES work.job_packets (id, job_id, version)
);
CREATE INDEX job_packet_acknowledgments_worker
  ON work.job_packet_acknowledgments (job_id, staff_user_id, acknowledged_at DESC);
CREATE INDEX job_packet_acknowledgments_staff ON work.job_packet_acknowledgments (staff_user_id);
COMMENT ON TABLE work.job_packet_acknowledgments IS
  'A worker''s personal acknowledgment of one job packet version (ENT-Acknowledgment); never edited or inherited.';

CREATE TABLE work.job_packet_acknowledgment_invalidations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acknowledgment_id uuid NOT NULL UNIQUE REFERENCES work.job_packet_acknowledgments (id),
  job_id            uuid NOT NULL,
  staff_user_id     uuid NOT NULL REFERENCES identity.staff_users (id),
  reason            text NOT NULL CHECK (reason IN ('critical_change', 'assignment_removed', 'account_disabled')),
  -- critical_change: the critical version that ended it.
  packet_id         uuid,
  version           integer,
  -- assignment_removed: the reservation whose end removed the worker.
  reservation_id    uuid REFERENCES work.reservations (id),
  invalidated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_packet_ack_invalidations_packet FOREIGN KEY (packet_id, job_id, version)
    REFERENCES work.job_packets (id, job_id, version),
  CHECK ((reason = 'critical_change') = (packet_id IS NOT NULL AND version IS NOT NULL)),
  CHECK ((reason = 'assignment_removed') = (reservation_id IS NOT NULL))
);
CREATE INDEX job_packet_ack_invalidations_job ON work.job_packet_acknowledgment_invalidations (job_id, staff_user_id);
COMMENT ON TABLE work.job_packet_acknowledgment_invalidations IS
  'Why and when a packet acknowledgment stopped counting (critical change, assignment removed, account disabled); once.';

CREATE TRIGGER job_packet_acknowledgments_append_only BEFORE UPDATE OR DELETE ON work.job_packet_acknowledgments
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
CREATE TRIGGER job_packet_acknowledgments_no_truncate BEFORE TRUNCATE ON work.job_packet_acknowledgments
  FOR EACH STATEMENT EXECUTE FUNCTION platform.reject_append_only_change();
CREATE TRIGGER job_packet_ack_invalidations_append_only
  BEFORE UPDATE OR DELETE ON work.job_packet_acknowledgment_invalidations
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
CREATE TRIGGER job_packet_ack_invalidations_no_truncate BEFORE TRUNCATE ON work.job_packet_acknowledgment_invalidations
  FOR EACH STATEMENT EXECUTE FUNCTION platform.reject_append_only_change();

-- Whether a staff member is assigned to a job now: an active confirmed worker reservation on one of its live visits
-- (confirmed, on the way, arrived: PACKET_VISIT_STATES of @handyhub/domain, as apps/server/src/modules/packets/
-- assignments.ts reads it).
CREATE FUNCTION work.staff_assigned_to_job(p_job uuid, p_staff uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM work.reservations r JOIN work.visits v ON v.id = r.visit_id
     WHERE v.job_id = p_job AND r.staff_user_id = p_staff AND r.resource = 'worker' AND r.kind = 'confirmed'
       AND r.ended_at IS NULL AND v.state IN ('confirmed', 'en_route', 'arrived'))
$$;

-- An acknowledgment is personal, of the latest version, by an active assigned worker, once while it stands.
CREATE FUNCTION work.job_packet_acknowledgment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.version <> (SELECT max(version) FROM work.job_packets WHERE job_id = NEW.job_id) THEN
    RAISE EXCEPTION 'an acknowledgment is of the latest packet version' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.content_sha256 <> (SELECT content_sha256 FROM work.job_packets WHERE id = NEW.packet_id) THEN
    RAISE EXCEPTION 'an acknowledgment names the content it acknowledges' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.staff_users WHERE id = NEW.staff_user_id AND status = 'active') THEN
    RAISE EXCEPTION 'only an active account acknowledges' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT work.staff_assigned_to_job(NEW.job_id, NEW.staff_user_id) THEN
    RAISE EXCEPTION 'only a worker assigned to the job acknowledges its packet, personally'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM work.job_packet_acknowledgments a
     WHERE a.job_id = NEW.job_id AND a.staff_user_id = NEW.staff_user_id AND a.version = NEW.version
       AND NOT EXISTS (SELECT 1 FROM work.job_packet_acknowledgment_invalidations i WHERE i.acknowledgment_id = a.id)
  ) THEN
    RAISE EXCEPTION 'this version is already acknowledged by this worker' USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER job_packet_acknowledgments_guard BEFORE INSERT ON work.job_packet_acknowledgments
  FOR EACH ROW EXECUTE FUNCTION work.job_packet_acknowledgment_guard();

-- Ends the standing acknowledgments that match (a job or every job, a person or everyone, versions before one).
CREATE FUNCTION work.invalidate_packet_acknowledgments(
  p_job uuid, p_staff uuid, p_reason text, p_packet uuid, p_version integer, p_reservation uuid
) RETURNS void LANGUAGE sql AS $$
  INSERT INTO work.job_packet_acknowledgment_invalidations
    (acknowledgment_id, job_id, staff_user_id, reason, packet_id, version, reservation_id)
  SELECT a.id, a.job_id, a.staff_user_id, p_reason,
         CASE WHEN p_reason = 'critical_change' THEN p_packet END,
         CASE WHEN p_reason = 'critical_change' THEN p_version END,
         CASE WHEN p_reason = 'assignment_removed' THEN p_reservation END
    FROM work.job_packet_acknowledgments a
   WHERE (p_job IS NULL OR a.job_id = p_job)
     AND (p_staff IS NULL OR a.staff_user_id = p_staff)
     AND (p_version IS NULL OR a.version < p_version)
     AND NOT EXISTS (SELECT 1 FROM work.job_packet_acknowledgment_invalidations i WHERE i.acknowledgment_id = a.id)
  ON CONFLICT (acknowledgment_id) DO NOTHING
$$;

-- A critical packet version ends every earlier acknowledgment of the job, in the version's transaction.
CREATE FUNCTION work.job_packet_critical_invalidates() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM work.invalidate_packet_acknowledgments(NEW.job_id, NULL, 'critical_change', NEW.id, NEW.version, NULL);
  RETURN NULL;
END $$;
CREATE TRIGGER job_packets_critical_invalidates AFTER INSERT ON work.job_packets
  FOR EACH ROW WHEN (NEW.critical) EXECUTE FUNCTION work.job_packet_critical_invalidates();

-- A worker's ended confirmed reservation: at commit, when no other one keeps them on the job, their acknowledgments of
-- that job end (a reassignment, a cancellation, an availability release; a reschedule re-creates it and keeps them).
CREATE FUNCTION work.reservation_end_invalidates() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  job uuid;
BEGIN
  SELECT job_id INTO job FROM work.visits WHERE id = NEW.visit_id;
  IF job IS NULL OR work.staff_assigned_to_job(job, NEW.staff_user_id) THEN
    RETURN NULL;
  END IF;
  PERFORM work.invalidate_packet_acknowledgments(job, NEW.staff_user_id, 'assignment_removed', NULL, NULL, NEW.id);
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER reservations_end_invalidates_acknowledgments AFTER UPDATE ON work.reservations
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL AND NEW.resource = 'worker' AND NEW.kind = 'confirmed')
  EXECUTE FUNCTION work.reservation_end_invalidates();

-- A disabled account (offboarding, T27): every acknowledgment of that person ends in the disabling transaction.
CREATE FUNCTION work.account_disabled_invalidates() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM work.invalidate_packet_acknowledgments(NULL, NEW.staff_user_id, 'account_disabled', NULL, NULL, NULL);
  RETURN NULL;
END $$;
CREATE TRIGGER staff_status_changes_invalidate_acknowledgments AFTER INSERT ON identity.staff_status_changes
  FOR EACH ROW WHEN (NEW.to_status = 'disabled') EXECUTE FUNCTION work.account_disabled_invalidates();

REVOKE UPDATE, DELETE, TRUNCATE ON work.job_packet_acknowledgments FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON work.job_packet_acknowledgment_invalidations FROM PUBLIC;
