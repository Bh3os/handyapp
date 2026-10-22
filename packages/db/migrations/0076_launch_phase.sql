-- 0076 Launch-phase switches (TSK-0142; HH-OPS-06, OWN-DEC-191, OWN-DEC-212, OWN-DEC-22, RULE-SYNTHETIC-DATA).
-- launch.phase is the launch phase in force on this database: owner_acceptance_testing (phase 1), invited_customers
-- (phase 2) or public (phase 3). Every database starts in phase 1, where customer invitations, public submissions and
-- search indexing are all off. The server applies the phase in production only (staging stays behind the access gate
-- and out of search whatever its phase).
-- The database backs the server's own checks: a later version of launch.phase is accepted only
-- - with a phase of the three and a written reason (the Owner's recorded approval);
-- - from an active staff account that holds the Owner role (changed_by is that staff user's id);
-- - one step forward from the phase in force, or back to any earlier phase. A version is never edited or deleted
--   (policy_version is append-only, migration 0005), so the history of every phase decision stays.
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by, change_reason) VALUES
  ('launch.phase', 1, 'configured', '{"phase": "owner_acceptance_testing"}', false,
   ARRAY['OWN-DEC-191', 'HH-OPS-06'], 'migration:0076',
   'Phase 1, Owner Acceptance Testing: no customer is invited and nothing is public until the Owner approves the next phase.');

CREATE FUNCTION platform.launch_phase_guard() RETURNS trigger LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  phases constant text[] := ARRAY['owner_acceptance_testing', 'invited_customers', 'public'];
  next_rank integer;
  current_rank integer;
BEGIN
  IF NEW.state <> 'configured' OR jsonb_typeof(NEW.value) <> 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(NEW.value)) <> 1 THEN
    RAISE EXCEPTION 'launch.phase is always one of the three phases' USING ERRCODE = 'check_violation';
  END IF;
  next_rank := array_position(phases, NEW.value ->> 'phase');
  IF next_rank IS NULL THEN
    RAISE EXCEPTION 'launch.phase is always one of the three phases' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.version = 1 THEN
    IF NEW.changed_by NOT LIKE 'migration:%' OR next_rank <> 1 THEN
      RAISE EXCEPTION 'launch.phase starts in phase 1' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.change_reason IS NULL OR btrim(NEW.change_reason) = '' THEN
    RAISE EXCEPTION 'a launch phase change records the Owner''s approval' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.changed_by !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR NOT EXISTS (
       SELECT 1 FROM identity.staff_users u JOIN identity.role_grants g ON g.staff_user_id = u.id
        WHERE u.id = NEW.changed_by::uuid AND u.status = 'active' AND g.kind = 'role' AND g.name = 'owner'
          AND g.ended_at IS NULL AND g.effective_from <= now()) THEN
    RAISE EXCEPTION 'only the Owner changes the launch phase' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT array_position(phases, p.value ->> 'phase') INTO current_rank
    FROM platform.policy_version p WHERE p.key = 'launch.phase' ORDER BY p.version DESC LIMIT 1;
  IF current_rank IS NULL OR next_rank = current_rank OR next_rank > current_rank + 1 THEN
    RAISE EXCEPTION 'the launch phase moves one step forward, or back to an earlier phase'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER policy_version_launch_phase BEFORE INSERT ON platform.policy_version
  FOR EACH ROW WHEN (NEW.key = 'launch.phase') EXECUTE FUNCTION platform.launch_phase_guard();
