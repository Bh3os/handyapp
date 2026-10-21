-- 0031 Contact verification on the receipt and the optional account offer (TSK-0033; HH-INT-13, HH-ID-03, HH-INT-14,
-- ENT-Contact, ENT-Request, OWN-DEC-94, OWN-DEC-96, OWN-DEC-97, RULE-SERVER-AUTHZ).
-- - receipt_capabilities: the browser tab that sent a request gets one random token for that request's receipt page
--   (returned once, in the Receipt-Capability header of the submission). The row keeps only its SHA-256. It lets that
--   tab see its own contact's masked email and phone with their verification states, ask for codes, enter them,
--   change an unverified email (the new value applies only once its code is entered) and answer the account offer.
--   It shows nothing else about the request, the customer or any other record, and it is not project access (the
--   project access grants are TSK-0034). A reference number alone grants nothing.
-- - contacts: a verified state names the exact value it verified (ENT-Contact: "verification belongs to the exact
--   value"), so changing an email or a phone number without verifying the new value can never keep "verified".
CREATE TABLE intake.receipt_capabilities (
  id          uuid PRIMARY KEY,
  token_hash  text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  request_id  uuid NOT NULL REFERENCES intake.requests (id),
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX receipt_capabilities_request ON intake.receipt_capabilities (request_id);
COMMENT ON TABLE intake.receipt_capabilities IS
  'Receipt-page capability of the tab that sent one request (TSK-0033): token hash only; not project access.';

ALTER TABLE crm.contacts
  ADD COLUMN email_verified_value text CHECK (char_length(email_verified_value) BETWEEN 3 AND 254),
  ADD COLUMN phone_verified_value text CHECK (phone_verified_value ~ '^\+[1-9][0-9]{7,14}$'),
  ADD CONSTRAINT contacts_email_verified_exact
    CHECK (email_verification <> 'verified' OR email_verified_value = lower(email)),
  ADD CONSTRAINT contacts_phone_verified_exact
    CHECK (phone_verification <> 'verified' OR phone_verified_value = phone_e164);
COMMENT ON COLUMN crm.contacts.email_verified_value IS 'The exact (lower-case) email value the last verification proved.';
COMMENT ON COLUMN crm.contacts.phone_verified_value IS 'The exact E.164 number the last verification proved.';
