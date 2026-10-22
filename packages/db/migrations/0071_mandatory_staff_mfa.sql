-- 0071 Mandatory MFA for every active staff account (TSK-0154; HH-STAFF-01, HH-SEC-02, HH-STAFF-02, HH-SEC-06,
-- OWN-DEC-202, OWN-DEC-200). The TOTP authenticator and recovery codes of TSK-0015 (migration 0013) stay; they become
-- required for every staff role (Owner, Office/Dispatcher, Estimator, Worker).
-- - staff_sessions.state gains 'mfa_enrollment': a correct password for an account without a confirmed authenticator.
--   Like 'mfa_pending' (an enrolled account waiting for its code) it acts for nobody; it reaches only enrolment, the
--   challenge and sign-out until the authenticator is confirmed.
-- - Backstop: a session is 'complete' only for a staff user with a confirmed authenticator (trigger below), so no code
--   path can start or rotate into a complete session without the second factor.
-- - Revoke reasons: 'mfa_reset' (the Owner's reset of a staff member's authenticator, or the operations recovery of an
--   Owner's own), 'mfa_required' (this migration).
-- - Existing accounts: every live session of a staff user without a confirmed authenticator ends here
--   ('mfa_required'); the person signs in again and enrols before reaching any staff screen. Staff IDs, roles,
--   assignments and audit records are unchanged.
-- - Disabled accounts: offboarding now also removes the authenticator and the recovery codes (OWN-DEC-202: previous
--   credentials are invalidated), so the accounts disabled before this migration lose theirs too; their password was
--   already cleared and their sessions revoked. Re-enabling them means a new password link and a new enrolment.
ALTER TABLE identity.staff_sessions DROP CONSTRAINT staff_sessions_state_check;
ALTER TABLE identity.staff_sessions ADD CONSTRAINT staff_sessions_state_check
  CHECK (state IN ('mfa_enrollment', 'mfa_pending', 'complete'));
ALTER TABLE identity.staff_sessions DROP CONSTRAINT staff_sessions_revoke_reason_check;
ALTER TABLE identity.staff_sessions ADD CONSTRAINT staff_sessions_revoke_reason_check CHECK (
  revoke_reason IN ('sign_out', 'idle_expired', 'password_set', 'disabled', 'revoked_by_owner', 'rotated',
                    'revoked_all', 'mfa_changed', 'mfa_pending_expired', 'mfa_reset', 'mfa_required')
);

CREATE FUNCTION identity.complete_session_needs_factor() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state = 'complete' AND NOT EXISTS (
    SELECT 1 FROM identity.staff_mfa m WHERE m.staff_user_id = NEW.staff_user_id AND m.confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'a staff session is complete only after the second factor (OWN-DEC-202)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER staff_sessions_complete_needs_factor BEFORE INSERT OR UPDATE OF state ON identity.staff_sessions
  FOR EACH ROW EXECUTE FUNCTION identity.complete_session_needs_factor();

UPDATE identity.staff_sessions s
   SET revoked_at = now(), revoke_reason = 'mfa_required'
 WHERE s.revoked_at IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM identity.staff_mfa m WHERE m.staff_user_id = s.staff_user_id AND m.confirmed_at IS NOT NULL
   );

DELETE FROM identity.staff_recovery_codes c
 USING identity.staff_users u
 WHERE u.id = c.staff_user_id AND u.status = 'disabled';
DELETE FROM identity.staff_mfa m
 USING identity.staff_users u
 WHERE u.id = m.staff_user_id AND u.status = 'disabled';
