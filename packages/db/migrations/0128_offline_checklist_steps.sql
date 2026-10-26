-- 0128 Offline checklist steps, off until the Owner turns them on (TSK-0115; HH-OFF-08, HH-OFF-03, HH-OFF-05,
-- HH-OFF-06, OWN-DEC-121, RULE-SAFETY-GATES, RULE-SERVER-AUTHZ). The server decides what an uploaded step may do
-- (apps/server/src/modules/field/sync.ts); this migration keeps the records true whatever path writes.
-- 1. field.offline_actions: the actions a phone may save offline beyond the minimal set (On my way, Arrived, Finished
--    and Stop Work). HH-OFF-08 allows fuller offline workflows only after the threat, conflict, freshness and device
--    controls are proven on staging, and the Owner's walk of those controls has not happened: version 1 turns nothing
--    on. A later version is accepted only from a live Owner with a written reason, naming actions of the list below
--    (PROPOSED, OQ-OFFLINE-ACTIONS-DETAILS): checklist_step.
-- 2. work.field_events takes checklist_step events (a checklist step started, paused, resumed or completed on the phone).
--    One is applied only while field.offline_actions in force names checklist_step; Start Work, holds and stop-work
--    rights are untouched (the step itself still needs the worker's own online Start Work and no open hold, 0083).

INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by, change_reason) VALUES
  ('field.offline_actions', 1, 'configured', '{"actions": []}', false,
   ARRAY['HH-OFF-08', 'OWN-DEC-121', 'TSK-0115'], 'migration:0128',
   'HH-OFF-08: no action beyond the minimal offline set until the offline controls are proven on staging');

CREATE FUNCTION platform.offline_actions_guard() RETURNS trigger LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  available constant text[] := ARRAY['checklist_step'];
  listed text[];
BEGIN
  IF NEW.state <> 'configured' OR jsonb_typeof(NEW.value) <> 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(NEW.value)) <> 1 OR jsonb_typeof(NEW.value -> 'actions') <> 'array' THEN
    RAISE EXCEPTION 'field.offline_actions is always a list of actions' USING ERRCODE = 'check_violation';
  END IF;
  SELECT coalesce(array_agg(a), ARRAY[]::text[]) INTO listed FROM jsonb_array_elements_text(NEW.value -> 'actions') a;
  IF NOT listed <@ available OR cardinality(listed) <> (SELECT count(DISTINCT x) FROM unnest(listed) x) THEN
    RAISE EXCEPTION 'field.offline_actions names each available action at most once' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.version = 1 THEN
    IF NEW.changed_by NOT LIKE 'migration:%' OR cardinality(listed) <> 0 THEN
      RAISE EXCEPTION 'field.offline_actions starts with nothing turned on' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.change_reason IS NULL OR btrim(NEW.change_reason) = '' THEN
    RAISE EXCEPTION 'an offline actions change records the Owner''s reason' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.changed_by !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR NOT EXISTS (
       SELECT 1 FROM identity.staff_users u JOIN identity.role_grants g ON g.staff_user_id = u.id
        WHERE u.id = NEW.changed_by::uuid AND u.status = 'active' AND g.kind = 'role' AND g.name = 'owner'
          AND g.ended_at IS NULL AND g.effective_from <= now()) THEN
    RAISE EXCEPTION 'only the Owner changes the offline actions' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER policy_version_offline_actions BEFORE INSERT ON platform.policy_version
  FOR EACH ROW WHEN (NEW.key = 'field.offline_actions') EXECUTE FUNCTION platform.offline_actions_guard();

ALTER TABLE work.field_events DROP CONSTRAINT field_events_type_check;
ALTER TABLE work.field_events ADD CONSTRAINT field_events_type_check
  CHECK (type IN ('tap_on_my_way', 'tap_arrived', 'tap_finished', 'checklist_step'));

-- A checklist step from a phone is applied only while the Owner has turned it on (the server checks it first).
CREATE FUNCTION work.field_event_offline_action_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.type = 'checklist_step' AND NEW.outcome IN ('applied', 'already_recorded') AND NOT EXISTS (
       SELECT 1 FROM platform.policy_version p
        WHERE p.key = 'field.offline_actions' AND p.status = 'active' AND p.value -> 'actions' ? 'checklist_step') THEN
    RAISE EXCEPTION 'offline checklist steps are not turned on' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.type = 'checklist_step' AND NOT (NEW.payload ?& ARRAY['workPackageId', 'stepId', 'event', 'version']
       AND NEW.payload ->> 'event' IN ('start', 'pause', 'resume', 'complete')) THEN
    RAISE EXCEPTION 'an offline checklist step names its step, event and version' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER field_events_offline_action BEFORE INSERT ON work.field_events
  FOR EACH ROW EXECUTE FUNCTION work.field_event_offline_action_guard();
