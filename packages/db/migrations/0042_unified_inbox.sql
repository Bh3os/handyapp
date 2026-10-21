-- 0042 The unified inbox (TSK-0049; HH-COM-07, HH-COM-10, HH-COM-01, T21, T24, T68, T71, T74, ENT-Message,
-- ENT-WebhookReceipt, ENT-Contact, ENT-Project, INT-Bird, INT-Resend, OWN-DEC-120, OWN-DEC-129).
--
-- - comms.conversations: one customer conversation and one internal conversation per project (PROPOSED: one thread per
--   audience and project). Internal conversations hold staff-only operational messages and never reach a customer.
-- - comms.messages: every inbound email and text (from a signature-verified webhook receipt, at most one message per
--   receipt) and every internal message. The received content is kept exactly as it arrived and never changes
--   (messages_original_unchanged); only the linking columns move, and every linking correction is an append-only row
--   in comms.message_links with the staff member and the reason.
--   Linking states (ENT-Message): matched (by a reliable reference: the per-project reply token, the In-Reply-To or
--   References headers of a message already in the project, a verified contact email, or the verified phone plus the
--   latest open conversation), needs_linking (several possible projects, none, or a reference whose sender is not on
--   the project), and linked (placed by staff). Names never match. A message in Needs Linking has no project and no
--   customer, and only authorized office staff see it (message.view_unmatched).
-- - comms.project_reply_tokens: one random reply token per project for the plus-addressed reply-to of its customer
--   emails. It names the project only; it grants no access to anything.
-- - platform.message_deliveries gains the project a delivery belongs to, so a customer email of a project carries the
--   project's reply address and appears (as metadata) in the project's conversation.
-- Attachments are recorded as metadata only (count, content types, sizes; never file names or content): importing
-- them needs validation and project permissions (HH-SEC-05) and is not built here, so the inbox says they were not
-- imported instead of pretending they are there.
CREATE SCHEMA IF NOT EXISTS comms;
COMMENT ON SCHEMA comms IS 'Customer and internal conversations and the unified inbox (OWN-DEC-120).';

CREATE TABLE comms.conversations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES crm.projects (id),
  customer_id      uuid NOT NULL REFERENCES crm.customers (id),
  audience         text NOT NULL CHECK (audience IN ('customer', 'internal')),
  state            text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'closed')),
  last_message_at  timestamptz,
  last_inbound_at  timestamptz,
  -- When staff last marked the customer's replies handled (resolves the "customer replied" queue item).
  handled_at       timestamptz,
  handled_by       uuid REFERENCES identity.staff_users (id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, audience)
);
CREATE INDEX conversations_recent ON comms.conversations (audience, last_message_at DESC NULLS LAST, id);
COMMENT ON TABLE comms.conversations IS
  'One customer and one internal conversation per project (HH-COM-01); internal ones never reach the customer.';

CREATE TABLE comms.messages (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq                  bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  direction            text NOT NULL CHECK (direction IN ('inbound', 'outbound', 'internal')),
  channel              text NOT NULL CHECK (channel IN ('email', 'sms', 'internal')),
  -- The webhook receipt an inbound message came from: one message per receipt, so a replay adds nothing.
  webhook_receipt_id   uuid UNIQUE REFERENCES platform.webhook_receipts (id),
  provider             text CHECK (provider IN ('bird', 'resend')),
  provider_message_id  text CHECK (char_length(provider_message_id) <= 200),
  -- The sender and recipient as received (lower-case e-mail or E.164); internal messages have neither.
  from_address         text CHECK (char_length(from_address) BETWEEN 3 AND 320),
  to_addresses         text[] NOT NULL DEFAULT '{}' CHECK (cardinality(to_addresses) <= 50),
  subject              text CHECK (char_length(subject) <= 1000),
  body_text            text CHECK (char_length(body_text) <= 100000),
  -- received: the body is the provider's text; html_converted: tags removed from an HTML-only email; not_retrieved:
  -- the provider holds the body but this process cannot read it (not configured); retrieval_failed: reading it failed
  -- after every retry; empty: the message had no text.
  body_state           text NOT NULL CHECK (body_state IN ('received', 'html_converted', 'not_retrieved', 'retrieval_failed', 'empty')),
  body_truncated       boolean NOT NULL DEFAULT false,
  -- RFC 5322 Message-ID, In-Reply-To and References of an email (threading); null for texts.
  email_message_id     text CHECK (char_length(email_message_id) <= 1000),
  in_reply_to          text[] NOT NULL DEFAULT '{}' CHECK (cardinality(in_reply_to) <= 100),
  -- Attachment metadata only: [{contentType, size}]; never names or content. Not imported (see above).
  attachments          jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(attachments) = 'array'),
  -- A whole-message SMS keyword (stop, start, help), handled by the consent automation (TSK-0048).
  keyword              text CHECK (keyword IN ('stop', 'start', 'help')),
  received_at          timestamptz NOT NULL DEFAULT now(),
  -- Internal messages: the staff author.
  author_staff_id      uuid REFERENCES identity.staff_users (id),
  -- Linking (the only columns that change after insert).
  link_state           text NOT NULL CHECK (link_state IN ('matched', 'needs_linking', 'linked')),
  match_rule           text CHECK (match_rule IN ('reply_token', 'thread_reference', 'verified_email', 'verified_phone', 'latest_conversation', 'staff')),
  needs_linking_reason text CHECK (needs_linking_reason IN ('no_match', 'shared_contact', 'several_projects', 'no_open_project', 'sender_not_on_project', 'conflicting_references', 'returned_by_staff')),
  project_id           uuid REFERENCES crm.projects (id),
  customer_id          uuid REFERENCES crm.customers (id),
  conversation_id      uuid REFERENCES comms.conversations (id),
  -- The contact the sender's address belongs to, on the linked customer only; never created from a message.
  contact_id           uuid REFERENCES crm.contacts (id),
  -- A project a reliable reference named while the sender is not on it: a hint for office staff, never a link.
  suggested_project_id uuid REFERENCES crm.projects (id),
  link_version         integer NOT NULL DEFAULT 1 CHECK (link_version >= 1),
  created_at           timestamptz NOT NULL DEFAULT now(),
  CHECK ((direction = 'internal') = (channel = 'internal')),
  CHECK (direction <> 'inbound' OR (webhook_receipt_id IS NOT NULL AND from_address IS NOT NULL AND provider IS NOT NULL)),
  CHECK (direction <> 'internal' OR (author_staff_id IS NOT NULL AND link_state = 'matched' AND match_rule = 'staff'
    AND project_id IS NOT NULL AND conversation_id IS NOT NULL)),
  CHECK ((link_state = 'needs_linking') = (needs_linking_reason IS NOT NULL)),
  CHECK (link_state = 'needs_linking' OR (project_id IS NOT NULL AND customer_id IS NOT NULL AND conversation_id IS NOT NULL
    AND match_rule IS NOT NULL)),
  CHECK (link_state <> 'needs_linking' OR (project_id IS NULL AND customer_id IS NULL AND conversation_id IS NULL
    AND contact_id IS NULL AND match_rule IS NULL)),
  CHECK (link_state <> 'linked' OR match_rule = 'staff')
);
CREATE INDEX messages_conversation ON comms.messages (conversation_id, received_at, seq);
CREATE INDEX messages_needs_linking ON comms.messages (received_at DESC, seq DESC) WHERE link_state = 'needs_linking';
CREATE INDEX messages_email_message_id ON comms.messages (email_message_id) WHERE email_message_id IS NOT NULL;
CREATE INDEX messages_outbound_sms ON comms.messages (channel, direction, received_at DESC) WHERE direction = 'outbound';
COMMENT ON TABLE comms.messages IS
  'Inbound email and texts and internal messages (ENT-Message): content immutable, linking corrected with history.';

-- The original message stays unchanged (OWN-DEC-120); only its linking moves, and it is never deleted.
CREATE FUNCTION comms.messages_original_unchanged() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'messages are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW.direction, NEW.channel, NEW.webhook_receipt_id, NEW.provider, NEW.provider_message_id, NEW.from_address,
      NEW.to_addresses, NEW.subject, NEW.body_text, NEW.body_state, NEW.body_truncated, NEW.email_message_id,
      NEW.in_reply_to, NEW.attachments, NEW.keyword, NEW.received_at, NEW.author_staff_id, NEW.created_at)
     IS DISTINCT FROM
     (OLD.direction, OLD.channel, OLD.webhook_receipt_id, OLD.provider, OLD.provider_message_id, OLD.from_address,
      OLD.to_addresses, OLD.subject, OLD.body_text, OLD.body_state, OLD.body_truncated, OLD.email_message_id,
      OLD.in_reply_to, OLD.attachments, OLD.keyword, OLD.received_at, OLD.author_staff_id, OLD.created_at) THEN
    RAISE EXCEPTION 'MESSAGE_IMMUTABLE: a received message never changes; only its linking does'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.direction = 'internal' AND (NEW.project_id, NEW.conversation_id) IS DISTINCT FROM (OLD.project_id, OLD.conversation_id) THEN
    RAISE EXCEPTION 'MESSAGE_IMMUTABLE: an internal message stays on its project' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER messages_original_unchanged BEFORE UPDATE OR DELETE ON comms.messages
  FOR EACH ROW EXECUTE FUNCTION comms.messages_original_unchanged();

-- Every linking step of a message, from the automatic match to each staff correction (append-only).
CREATE TABLE comms.message_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq             bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  message_id      uuid NOT NULL REFERENCES comms.messages (id),
  from_state      text CHECK (from_state IN ('matched', 'needs_linking', 'linked')),
  to_state        text NOT NULL CHECK (to_state IN ('matched', 'needs_linking', 'linked')),
  from_project_id uuid REFERENCES crm.projects (id),
  to_project_id   uuid REFERENCES crm.projects (id),
  rule            text NOT NULL CHECK (char_length(rule) BETWEEN 1 AND 60),
  -- Staff corrections only: the reason they gave.
  reason          text CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000),
  staff_id        uuid REFERENCES identity.staff_users (id),
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  CHECK ((staff_id IS NULL) = (reason IS NULL))
);
CREATE INDEX message_links_message ON comms.message_links (message_id, seq);
CREATE TRIGGER message_links_append_only BEFORE UPDATE OR DELETE ON comms.message_links
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE comms.message_links IS 'Linking history of every message: automatic matches and staff corrections.';

CREATE TABLE comms.project_reply_tokens (
  project_id uuid PRIMARY KEY REFERENCES crm.projects (id),
  -- 20 base32 characters (100 random bits), lower-case so mail systems that fold case keep it.
  token      text NOT NULL UNIQUE CHECK (token ~ '^[a-z2-7]{20}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER project_reply_tokens_append_only BEFORE UPDATE OR DELETE ON comms.project_reply_tokens
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE comms.project_reply_tokens IS
  'Per-project reply token of the plus-addressed reply-to (HH-COM-07); a thread reference, never access.';

ALTER TABLE platform.message_deliveries ADD COLUMN project_id uuid REFERENCES crm.projects (id);
CREATE INDEX message_deliveries_project ON platform.message_deliveries (project_id, seq) WHERE project_id IS NOT NULL;
COMMENT ON COLUMN platform.message_deliveries.project_id IS
  'The project a customer message belongs to (TSK-0049): its reply address and its conversation.';
