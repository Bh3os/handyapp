-- 0069 The staging log email sender (TSK-0112; HH-COM-03, HH-COM-14, OWN-DEC-152 section 14, RULE-SYNTHETIC-DATA).
-- EMAIL_PROVIDER=log (staging, local and ci only; the server refuses it in production) writes an email to an approved
-- test address to the server log instead of sending it. Its deliveries record the provider `log`, a test provider:
-- such a message is never shown as delivered. Only the provider check of the deliveries and their attempts widens.
ALTER TABLE platform.message_deliveries DROP CONSTRAINT message_deliveries_provider_check;
ALTER TABLE platform.message_deliveries
  ADD CONSTRAINT message_deliveries_provider_check CHECK (provider IN ('resend', 'bird', 'fake', 'log'));
ALTER TABLE platform.message_delivery_attempts DROP CONSTRAINT message_delivery_attempts_provider_check;
ALTER TABLE platform.message_delivery_attempts
  ADD CONSTRAINT message_delivery_attempts_provider_check CHECK (provider IN ('resend', 'bird', 'fake', 'log'));
