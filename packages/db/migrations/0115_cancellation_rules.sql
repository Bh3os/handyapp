-- 0115 Cancellation and reschedule rules: small deposits, free estimate visits, Office routine cancellations, who
-- started a reschedule and the work-start markers (TSK-0140; HH-SCH-07, HH-FIN-14, HH-STATE-02, FACT-CANCELLATION-RULES,
-- OWN-DEC-161, OWN-DEC-163, OWN-DEC-195, ENT-Visit, ENT-TimeStamp, RULE-MONEY-CENTS, RULE-HUMAN-REVIEW,
-- RULE-SERVER-AUTHZ).
-- The server computes each outcome (@handyhub/domain cancellation.ts) and decides who may do what
-- (apps/server/src/modules/visits/changes.ts); this migration seeds the decided values and keeps the records true
-- whatever path writes.
-- 1. cancellation.rules version 2 (OWN-DEC-161, OWN-DEC-163, OWN-DEC-195): the notice (24 hours) and the late amount
--    ($50.00, 5000 cents) are unchanged and are now the cap of the fee: a deposit of $50.00 or more keeps at most it and
--    refunds the rest; a smaller deposit is kept and nothing more is invoiced; with no deposit the amount is invoiced
--    only where it was disclosed and accepted in advance; estimate visits are never charged; who started a reschedule
--    is required. Fee enforcement waits for the attorney (OQ-ATTORNEY-TERMS): nothing is collected or refunded by the
--    software either way (the Owner applies each outcome, HH-FIN-14).
-- 2. cancellation.repeat_review, NOT CONFIGURED: how many short-notice cancellations and no-shows, within how many
--    days, flag a customer's next estimate booking for the Owner's review (OWN-DEC-163 7). No number is decided
--    (OQ-CANCELLATION-RULES-DETAILS), so nothing is flagged until the Owner sets it.
-- 3. work.visit_changes keeps the new outcomes (late_no_charge: a late cancellation with no deposit and the fee not
--    disclosed and accepted; estimate_visit_free), the circumstance that keeps a customer's cancellation from being
--    charged automatically (unsafe conditions, an emergency, a legally protected right, an owner-review case), whether
--    the accepted terms disclosed the fee, and the Owner's waiver or reduction of the fee (the fee before it and the
--    documented reason). A new reschedule always names who started it (C2); rows written before keep what they had.
-- 4. A waived or reduced fee is the Owner's alone: the database refuses a waiver recorded by anyone else.

-- 1. The rules.
UPDATE platform.policy_version SET status = 'superseded' WHERE key = 'cancellation.rules' AND status = 'active';
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by, change_reason)
SELECT 'cancellation.rules', max(version) + 1, 'configured',
   '{"rescheduleFree": true, "noticeHours": 24, "lateCancellationCents": 5000, "depositBelowFee": "keep_deposit_only", "noDepositInvoice": "only_if_disclosed_and_accepted", "estimateVisits": "never_charged", "rescheduleInitiator": "required", "feeEnforcement": "attorney_approval_pending"}',
   false, ARRAY['FACT-CANCELLATION-RULES', 'OWN-DEC-134', 'OWN-DEC-161', 'OWN-DEC-163', 'OWN-DEC-195', 'OQ-ATTORNEY-TERMS'],
   'migration:0115', 'OWN-DEC-161, OWN-DEC-163, OWN-DEC-195: the late fee capped at $50.00, estimate visits free, reschedule initiator required'
FROM platform.policy_version WHERE key = 'cancellation.rules';

-- 2. The repeat pattern's numbers, not decided.
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by) VALUES
  ('cancellation.repeat_review', 1, 'not_configured', NULL, false,
   ARRAY['OWN-DEC-163', 'OQ-CANCELLATION-RULES-DETAILS'], 'migration:0115');

-- 3. The change record.
ALTER TABLE work.visit_changes DROP CONSTRAINT visit_changes_outcome_check;
ALTER TABLE work.visit_changes ADD CONSTRAINT visit_changes_outcome_check CHECK (outcome IN (
  'full_refund_no_charge', 'late_cancellation', 'late_no_charge', 'estimate_visit_free', 'work_started',
  'customer_chooses', 'owner_review'));
ALTER TABLE work.visit_changes
  ADD COLUMN circumstance text CHECK (circumstance IN ('unsafe_conditions', 'emergency', 'legally_protected',
                                                       'owner_review')),
  ADD COLUMN fee_disclosed boolean,
  ADD COLUMN fee_waived_from_cents bigint CHECK (fee_waived_from_cents > 0),
  ADD COLUMN fee_waiver_reason text CHECK (char_length(btrim(fee_waiver_reason)) BETWEEN 1 AND 2000);
-- A circumstance only on a customer's cancellation; the disclosure only on a cancellation.
ALTER TABLE work.visit_changes ADD CONSTRAINT visit_changes_circumstance
  CHECK (circumstance IS NULL OR (kind = 'canceled' AND initiator = 'customer'));
ALTER TABLE work.visit_changes ADD CONSTRAINT visit_changes_fee_disclosed
  CHECK (kind = 'canceled' OR fee_disclosed IS NULL);
-- A waiver names the fee it lowered and why, only on a late cancellation, and never raises it.
ALTER TABLE work.visit_changes ADD CONSTRAINT visit_changes_fee_waiver CHECK (
  (fee_waived_from_cents IS NULL) = (fee_waiver_reason IS NULL)
  AND (fee_waived_from_cents IS NULL OR (outcome = 'late_cancellation'
       AND coalesce(kept_cents, 0) + coalesce(invoice_cents, 0) <= fee_waived_from_cents)));
COMMENT ON COLUMN work.visit_changes.circumstance IS
  'Why a customer''s cancellation is not charged automatically (OWN-DEC-161): the Owner decides its outcome.';
COMMENT ON COLUMN work.visit_changes.fee_disclosed IS
  'Whether the accepted estimate terms disclosed the late-cancellation fee (the no-deposit invoice needs it).';
COMMENT ON COLUMN work.visit_changes.fee_waived_from_cents IS
  'The fee before the Owner waived or reduced it (OWN-DEC-161 8); the kept and invoiced amounts are after it.';

-- 4. A waiver is recorded by a live Owner. C2: from now on, every reschedule names who started it (the customer or
--    HandyHub with its cause); a trigger, not a constraint, so the rows written before keep what they had.
CREATE FUNCTION work.visit_change_waiver_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind = 'rescheduled' AND NEW.initiator IS NULL THEN
    RAISE EXCEPTION 'a reschedule names who started it' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.fee_waived_from_cents IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM identity.role_grants
        WHERE staff_user_id = NEW.changed_by AND kind = 'role' AND name = 'owner' AND ended_at IS NULL
          AND effective_from <= now()) THEN
    RAISE EXCEPTION 'only the Owner waives or reduces a cancellation fee' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER visit_changes_waiver_check BEFORE INSERT ON work.visit_changes
  FOR EACH ROW EXECUTE FUNCTION work.visit_change_waiver_check();

-- 5. The Owner's review flag of an estimate booking (cancellation_pattern_review, OWN-DEC-163 7) resolves with the
--    visit's change requests when the visit is no longer booked (0059); nothing else changes in this function.
CREATE OR REPLACE FUNCTION work.visit_state_closes_requests() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state IS DISTINCT FROM OLD.state AND NEW.state NOT IN ('tentative', 'confirmed') THEN
    UPDATE work.visit_change_requests
       SET state = 'closed', version = version + 1, decided_at = now(), closed_reason = 'visit_' || NEW.state
     WHERE visit_id = NEW.id AND state = 'open';
    UPDATE ops.queue_items
       SET resolved_at = now(), updated_at = now(), resolution = 'visit_' || NEW.state, version = version + 1
     WHERE type IN ('visit_change_request', 'visit_cancellation_review', 'cancellation_pattern_review')
       AND subject_type = 'visit' AND subject_id = NEW.id::text AND resolved_at IS NULL;
  END IF;
  RETURN NULL;
END $$;
