-- 0057 Confirmation preconditions: blocking holds stop a visit from being confirmed (TSK-0064; HH-SCH-06, HH-SCH-05,
-- T40, ENT-Hold, ENT-Visit, OWN-DEC-82, OWN-DEC-137, RULE-SAFETY-GATES).
-- - The server checks every confirmation precondition itself, in the confirming transaction, and names each unmet one
--   (apps/server/src/modules/visits/preconditions.ts). This migration is the database's own backstop for the holds:
--   whatever code path writes it, a visit never becomes confirmed while its project has a hold that blocks
--   confirmation. No role, flag, setting or AI can bypass it; there is no parameter that skips it.
-- - Only two kinds of hold block confirmation (HH-SCH-06): an unresolved critical safety hold and an explicit blocking
--   job-level Hold (the Hold / Ready control, ENT-Hold). PROPOSED (TSK-0064, OQ-CONFIRMATION-PRECONDITIONS): an intake
--   review hold (a potential hazard or restricted scope found at intake, HH-LEAD-04) blocks too while it is open or
--   under review, since the hazard it names is unresolved; task blocks (critical resource shortages) never block a
--   planning appointment (HH-PKT-06) and are not counted. The kinds job_requirement and critical_safety are written
--   by later tasks to the same table (TSK-0074, TSK-0077); they are counted here already.
-- - A hold blocks while it is open or under review (ENT-Hold); a resolved hold or one cancelled as entered in error is
--   history and never blocks.

CREATE FUNCTION work.confirmation_blocking_holds(p_project uuid) RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT count(*)::integer
  FROM work.holds
  WHERE project_id = p_project
    AND kind IN ('review', 'job_requirement', 'critical_safety')
    AND state IN ('open', 'under_review')
$$;
COMMENT ON FUNCTION work.confirmation_blocking_holds(uuid) IS
  'How many holds of a project block confirming its visits (HH-SCH-06): review, job-level and critical safety holds '
  'that are open or under review.';

CREATE FUNCTION work.visit_confirmation_hold_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF work.confirmation_blocking_holds(NEW.project_id) > 0 THEN
    RAISE EXCEPTION 'visit % cannot be confirmed while a blocking hold is open on its project', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER visits_confirmation_hold_guard BEFORE UPDATE OF state ON work.visits
  FOR EACH ROW WHEN (NEW.state = 'confirmed' AND OLD.state IS DISTINCT FROM 'confirmed')
  EXECUTE FUNCTION work.visit_confirmation_hold_guard();
