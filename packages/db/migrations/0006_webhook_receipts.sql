-- 0007 Webhook receipts (TSK-0013; ENT-WebhookReceipt, HH-ARC-09, HH-COM-10). One row per authenticated provider
-- delivery (Bird SMS events, Resend email events), shared by the later status and inbound handlers. Only deliveries
-- whose signature and timestamp verified are stored; rejected ones are logged and answered 401.
-- De-duplication: the provider's delivery ID (Standard Webhooks `webhook-id`, reused on every retry and replay) is
-- unique per provider, and so is (provider message ID, event type), so a repeated event has no second effect.
-- The payload is kept for the handler that processes it (it can hold message text); it never goes to logs.
CREATE TABLE platform.webhook_receipts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq                 bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  provider            text NOT NULL CHECK (provider IN ('bird', 'resend')),
  delivery_id         text NOT NULL CHECK (char_length(delivery_id) BETWEEN 1 AND 200),
  event_type          text NOT NULL CHECK (char_length(event_type) BETWEEN 1 AND 120),
  provider_message_id text CHECK (char_length(provider_message_id) <= 200),
  event_occurred_at   timestamptz,
  signature_verified  boolean NOT NULL CHECK (signature_verified),
  payload             jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  payload_sha256      text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  state               text NOT NULL DEFAULT 'received' CHECK (state IN ('received', 'processed', 'ignored', 'failed')),
  linked_message_id   text CHECK (char_length(linked_message_id) <= 100),
  received_at         timestamptz NOT NULL DEFAULT now(),
  processed_at        timestamptz,
  UNIQUE (provider, delivery_id)
);
CREATE UNIQUE INDEX webhook_receipts_provider_message
  ON platform.webhook_receipts (provider, provider_message_id, event_type) WHERE provider_message_id IS NOT NULL;
CREATE INDEX webhook_receipts_unprocessed ON platform.webhook_receipts (received_at) WHERE state = 'received';
