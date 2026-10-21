-- 0043 The customer's responses to an estimate version (TSK-0056; HH-EST-09, HH-EST-06, OWN-DEC-103, ENT-EstimateVersion,
-- C05 step 3, RULE-SERVER-AUTHZ).
-- - One row per response the verified customer gave on the project's estimate: "Request Changes" (a message to staff,
--   kept as a revision request), "Decline" (with an optional reason) and "Request an Updated Estimate" (on a version
--   that expired with no current version to show, FACT-ESTIMATE-VALIDITY, OWN-DEC-103). The customer's own words are
--   kept exactly as written.
-- - Append-only (HH-EST-09 "the history of requests, declines and replies is append-only on the project"): no row is
--   ever changed or deleted. A response never changes the estimate's content; a decline is the version's own state
--   change (published -> declined, migration 0032), written in the same transaction, and at most one decline is kept
--   per version.
-- - Nothing here accepts anything: there is no "accepted" kind, and silence or an unanswered request never becomes an
--   approval (HH-EST-09). Approval is its own transaction (TSK-0057).
-- - The evidence kept is what the server knew: the verified contact and the customer session the request came in on,
--   the version's state at that moment and the server time.
CREATE TABLE estimating.customer_responses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES crm.projects (id),
  estimate_id         uuid NOT NULL REFERENCES estimating.estimates (id),
  version_id          uuid NOT NULL,
  kind                text NOT NULL CHECK (kind IN ('changes_requested', 'declined', 'update_requested')),
  -- The customer's message (Request Changes: required) or reason (Decline, Request an Updated Estimate: optional).
  message             text CHECK (char_length(message) BETWEEN 1 AND 2000),
  -- The version's state when the response was recorded (a decline: published, the state it left).
  version_state       text NOT NULL CHECK (version_state IN ('published', 'expired', 'withdrawn', 'superseded')),
  contact_ref         text NOT NULL CHECK (char_length(contact_ref) BETWEEN 1 AND 200),
  customer_session_id uuid REFERENCES identity.customer_sessions (id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_responses_version FOREIGN KEY (version_id, estimate_id)
    REFERENCES estimating.estimate_versions (id, estimate_id),
  CONSTRAINT customer_responses_message_required CHECK (kind <> 'changes_requested' OR message IS NOT NULL)
);
COMMENT ON TABLE estimating.customer_responses IS
  'Append-only history of the customer''s Request Changes, Decline and Request an Updated Estimate (HH-EST-09).';
CREATE INDEX customer_responses_project ON estimating.customer_responses (project_id, created_at);
CREATE INDEX customer_responses_version ON estimating.customer_responses (version_id, created_at);
-- A version is declined once.
CREATE UNIQUE INDEX customer_responses_one_decline ON estimating.customer_responses (version_id)
  WHERE kind = 'declined';

-- A response belongs to the project of its version; a decline is recorded with the version's own move to declined,
-- and Request Changes only on a version the customer can still act on.
CREATE FUNCTION estimating.customer_response_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_project uuid;
  v_state text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'customer responses are append-only: they are never changed or deleted'
      USING ERRCODE = 'restrict_violation';
  END IF;
  SELECT project_id, state INTO v_project, v_state FROM estimating.estimate_versions WHERE id = NEW.version_id;
  IF v_project IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION 'a customer response belongs to the project of its estimate version'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.kind = 'declined' AND (v_state <> 'declined' OR NEW.version_state <> 'published') THEN
    RAISE EXCEPTION 'a decline is recorded with the published version''s move to declined'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.kind = 'changes_requested' AND (v_state <> 'published' OR NEW.version_state <> 'published') THEN
    RAISE EXCEPTION 'changes are requested on a published version' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.kind = 'update_requested' AND v_state IN ('draft', 'in_review', 'accepted', 'declined') THEN
    RAISE EXCEPTION 'an updated estimate is requested for a version that can no longer be approved'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER customer_responses_guard BEFORE INSERT OR UPDATE OR DELETE ON estimating.customer_responses
  FOR EACH ROW EXECUTE FUNCTION estimating.customer_response_guard();
