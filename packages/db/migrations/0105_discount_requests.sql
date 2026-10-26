-- 0105 Discount requests with staff verification (TSK-0125; HH-EST-15, OWN-DEC-165, OWN-DEC-145, FACT-PRICING-DISCOUNTS,
-- FACT-DEPOSIT-RULE, ENT-Request, ENT-EstimateVersion, ENT-AuditEvent, RULE-DECIDED-VALUES-ACTIVE, RULE-MONEY-CENTS,
-- RULE-SERVER-AUTHZ).
-- The server decides who may do what and when (apps/server/src/modules/estimates/discounts.ts); this migration seeds
-- the decided values and keeps the records true whatever path writes.
-- 1. discount.rule version 2 (OWN-DEC-165): one discount per job, chosen by the customer and never stacked (all three
--    are 10%, so "the biggest applies" of OWN-DEC-66 is now the customer's choice). The share, the categories and the
--    subtotal it applies to are unchanged: every estimate line is labor or service (FACT-PRICING-EXTRA-COSTS: no
--    separate fee line exists), and the deposit stays computed on the total after the discount (FACT-DEPOSIT-RULE).
-- 2. discount.eligibility_verification version 2, configured (OWN-DEC-165 answers OQ-DISCOUNT-ELIGIBILITY): military
--    covers service members, veterans and military spouses, checked by staff looking at the documentation; senior is
--    60 or older, checked by staff looking at a photo ID or another reasonable age check; returning customer needs a
--    qualifying completed job within the preceding 12 months, found from the matched job history. No document is
--    kept; the Owner reviews what the standard process cannot verify.
-- 3. estimating.discount_requests: the one discount the customer asked for when sending the request (one per project,
--    so one per job; ENT-Job: one job per project). Kept as sent, never changed or deleted; the original submission
--    keeps it too.
-- 4. estimating.discount_verifications: each recorded result, in order: the category, the result, who recorded it and
--    when, and nothing else (no document image, ID number, Social Security number or date of birth; OWN-DEC-165).
--    Append-only. Recorded by a live Owner, Office or Estimator (PROPOSED who, OQ-DISCOUNT-REQUEST-DETAILS); an owner
--    decision (owner_approved, owner_declined) by the Owner only. Nothing is recorded once an estimate version of the
--    project is approved: the approved price is never changed by a later verification.
-- 5. estimating.discount_state(project): pending, verified, not_verified, owner_review or declined, from the latest
--    result; none without a request.
-- 6. An approval of a version carrying a discount needs that discount requested by the customer and verified, so a
--    checkbox alone never approves one (OWN-DEC-165).

-- 1. The discount rule with the customer's choice.
UPDATE platform.policy_version SET status = 'superseded' WHERE key = 'discount.rule' AND status = 'active';
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by, change_reason)
SELECT 'discount.rule', max(version) + 1, 'configured',
   '{"percentBps": 1000, "categories": ["military", "senior", "returning_customer"], "perJob": "one_customer_choice", "appliedTo": "subtotal"}',
   false, ARRAY['FACT-PRICING-DISCOUNTS', 'OWN-DEC-165', 'OWN-DEC-145', 'OWN-DEC-66'],
   'migration:0105', 'OWN-DEC-165: one 10% discount per job, chosen by the customer, never stacked'
FROM platform.policy_version WHERE key = 'discount.rule';

-- 2. How eligibility is verified.
UPDATE platform.policy_version SET status = 'superseded'
 WHERE key = 'discount.eligibility_verification' AND status = 'active';
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by, change_reason)
SELECT 'discount.eligibility_verification', max(version) + 1, 'configured',
   '{"military": {"eligible": ["service_member", "veteran", "military_spouse"], "check": "staff_visual"}, "senior": {"fromAge": 60, "check": "staff_visual"}, "returningCustomer": {"withinMonths": 12, "check": "matched_completed_jobs"}, "documentsKept": false, "ownerReview": true}',
   false, ARRAY['FACT-PRICING-DISCOUNTS', 'OWN-DEC-165'],
   'migration:0105', 'OWN-DEC-165: staff verify military and senior eligibility visually, keep no document; returning customers from the matched job history; the Owner reviews the rest'
FROM platform.policy_version WHERE key = 'discount.eligibility_verification';

-- 3. The discount the customer asked for.
CREATE TABLE estimating.discount_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL UNIQUE REFERENCES crm.projects (id),
  request_id   uuid NOT NULL UNIQUE REFERENCES intake.requests (id),
  category     text NOT NULL CHECK (category IN ('military', 'senior', 'returning_customer')),
  requested_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE estimating.discount_requests IS
  'The one discount a customer asked for when sending the request (OWN-DEC-165, HH-EST-15): pending verification '
  'until a result is recorded. Kept as sent.';

-- Written with its request, for the request's own project; never changed or deleted.
CREATE FUNCTION estimating.discount_request_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'a discount request is kept as sent, never changed or deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM intake.requests WHERE id = NEW.request_id AND project_id = NEW.project_id) THEN
    RAISE EXCEPTION 'a discount request names its request''s own project' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER discount_requests_guard BEFORE INSERT OR UPDATE OR DELETE ON estimating.discount_requests
  FOR EACH ROW EXECUTE FUNCTION estimating.discount_request_guard();
-- Test data: cleared only by a permitted staging reset (0070).
CREATE TRIGGER discount_requests_reset_only_truncate BEFORE TRUNCATE ON estimating.discount_requests
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();

-- 4. The recorded results.
CREATE TABLE estimating.discount_verifications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_request_id uuid NOT NULL REFERENCES estimating.discount_requests (id),
  project_id          uuid NOT NULL REFERENCES crm.projects (id),
  -- The order of the results of one request (1, 2, ...): the latest decides the state.
  position            integer NOT NULL CHECK (position >= 1),
  category            text NOT NULL CHECK (category IN ('military', 'senior', 'returning_customer')),
  result              text NOT NULL CHECK (result IN ('verified', 'not_verified', 'owner_review', 'owner_approved',
                        'owner_declined')),
  verified_by         uuid NOT NULL REFERENCES identity.staff_users (id),
  verified_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (discount_request_id, position)
);
COMMENT ON TABLE estimating.discount_verifications IS
  'Discount verification results (OWN-DEC-165, HH-EST-15): category, result, verifier and time only. Append-only.';

-- In order, for the request's own project and category, by a live Owner, Office or Estimator (an owner decision: the
-- Owner), and only while no estimate version of the project is approved. Never changed or deleted.
CREATE FUNCTION estimating.discount_verification_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  r record;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'discount verifications are kept as recorded, never changed or deleted'
      USING ERRCODE = 'restrict_violation';
  END IF;
  SELECT id, project_id, category INTO r FROM estimating.discount_requests WHERE id = NEW.discount_request_id;
  IF r.project_id IS DISTINCT FROM NEW.project_id OR r.category IS DISTINCT FROM NEW.category THEN
    RAISE EXCEPTION 'a verification names its request''s own project and category' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.position <> 1 + (SELECT count(*) FROM estimating.discount_verifications
                           WHERE discount_request_id = NEW.discount_request_id) THEN
    RAISE EXCEPTION 'verifications are recorded in order' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT finance.has_live_role(NEW.verified_by,
       (CASE WHEN NEW.result IN ('owner_approved', 'owner_declined') THEN ARRAY['owner']
             ELSE ARRAY['owner', 'office', 'estimator'] END)) THEN
    RAISE EXCEPTION 'the Owner, Office or an Estimator records a verification; an owner decision is the Owner''s'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (SELECT 1 FROM estimating.estimate_versions WHERE project_id = NEW.project_id AND state = 'accepted') THEN
    RAISE EXCEPTION 'the project''s estimate is approved: its price is never changed by a later verification'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER discount_verifications_guard BEFORE INSERT OR UPDATE OR DELETE ON estimating.discount_verifications
  FOR EACH ROW EXECUTE FUNCTION estimating.discount_verification_guard();
CREATE TRIGGER discount_verifications_reset_only_truncate BEFORE TRUNCATE ON estimating.discount_verifications
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();

-- 5. The state of a project's discount.
CREATE FUNCTION estimating.discount_state(p_project uuid) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE
           WHEN r.id IS NULL THEN 'none'
           ELSE CASE (SELECT v.result FROM estimating.discount_verifications v
                       WHERE v.discount_request_id = r.id ORDER BY v.position DESC LIMIT 1)
                  WHEN 'verified' THEN 'verified'
                  WHEN 'owner_approved' THEN 'verified'
                  WHEN 'not_verified' THEN 'not_verified'
                  WHEN 'owner_review' THEN 'owner_review'
                  WHEN 'owner_declined' THEN 'declined'
                  ELSE 'pending'
                END
         END
    FROM (SELECT 1) one LEFT JOIN estimating.discount_requests r ON r.project_id = p_project
$$;

-- 6. Only a requested, verified discount is approved.
CREATE FUNCTION estimating.approval_discount_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  c text;
BEGIN
  SELECT discount_category INTO c FROM estimating.estimate_versions WHERE id = NEW.version_id;
  IF c IS NOT NULL AND (
       NOT EXISTS (SELECT 1 FROM estimating.discount_requests WHERE project_id = NEW.project_id AND category = c)
       OR estimating.discount_state(NEW.project_id) <> 'verified') THEN
    RAISE EXCEPTION 'a discount is approved only once the customer requested it and it was verified (OWN-DEC-165)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER approvals_discount_verified BEFORE INSERT ON estimating.approvals
  FOR EACH ROW EXECUTE FUNCTION estimating.approval_discount_check();
