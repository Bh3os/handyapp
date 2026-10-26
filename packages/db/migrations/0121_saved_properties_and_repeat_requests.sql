-- 0121 Saved properties, preferences and Request This Service Again (TSK-0113; HH-ID-12, HH-ID-03, HH-SCH-10, C11,
-- ENT-CustomerAccount, ENT-Property, ENT-ConsentPreference, OWN-DEC-113, OWN-DEC-160, RULE-SERVER-AUTHZ).
-- The server decides what an account may see and reuse (apps/server/src/modules/accounts/saved.ts); this migration keeps
-- the records true whatever path writes.
-- - customer_saved_properties: a name the account customer gives one property of their own history. It names the
--   property record only; the address stays on the property (staff keep it, the customer confirms it per job) and is
--   read from there each time. An account sees and uses a saved property only while one of its active links opens a
--   project at that property, so a revoked link or a closed account hides it at once. The customer renames or removes
--   their own names (a removal deletes the name, never the property); what a name points to never changes.
-- - customer_account_preferences: the account's own preferences that are not consent records. Today the contact method
--   a new request starts with; texting, marketing and optional follow-ups stay append-only consent records
--   (platform.consent_records, source portal), so the send-time checks read one place (HH-COM-05).
-- - request_repeats: a request sent with Request This Service Again, linked to the earlier project it repeats. It is
--   written only for an account with an active link to that project, at the moment the request is saved, with the time
--   the customer confirmed the property details were still current and whether the address sent matches the earlier
--   project's. Nothing of the earlier project is copied into the new request: prices, discounts, verification and
--   consent start again (OWN-DEC-113: "New pricing and appointments require review"). Kept like the request; only the
--   Owner's request erasure (0112) removes it with its request.

CREATE TABLE identity.customer_saved_properties (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES identity.customer_accounts (id),
  property_id uuid NOT NULL REFERENCES crm.properties (id),
  label       text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 60 AND label = btrim(label)),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  version     integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (account_id, property_id)
);
CREATE UNIQUE INDEX customer_saved_properties_label ON identity.customer_saved_properties (account_id, lower(label));
CREATE INDEX customer_saved_properties_property ON identity.customer_saved_properties (property_id);
COMMENT ON TABLE identity.customer_saved_properties IS
  'Names an account customer gives properties of their own verified history (TSK-0113, HH-ID-12).';

-- Saved only for a property one of the account's active links opens; what a name points to never changes.
CREATE FUNCTION identity.customer_saved_property_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM identity.customer_identity_links l
        JOIN crm.projects p ON p.id = l.project_id
        JOIN identity.customer_accounts a ON a.id = l.account_id
       WHERE l.account_id = NEW.account_id AND l.state = 'active' AND a.state = 'active'
         AND p.property_id = NEW.property_id
    ) THEN
      RAISE EXCEPTION 'a saved property is a property of a project the account is linked to'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.account_id, NEW.property_id, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.account_id, OLD.property_id, OLD.created_at) THEN
    RAISE EXCEPTION 'a saved property keeps what it names' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER customer_saved_properties_guard BEFORE INSERT OR UPDATE ON identity.customer_saved_properties
  FOR EACH ROW EXECUTE FUNCTION identity.customer_saved_property_guard();

CREATE TABLE identity.customer_account_preferences (
  account_id        uuid PRIMARY KEY REFERENCES identity.customer_accounts (id),
  -- The contact method a new request starts with (the request form's preferred channel); null: none chosen.
  preferred_channel text CHECK (preferred_channel IN ('email', 'call', 'text')),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  version           integer NOT NULL DEFAULT 1 CHECK (version >= 1)
);
COMMENT ON TABLE identity.customer_account_preferences IS
  'An account''s own preferences that are not consent records (TSK-0113, HH-ID-12): the contact method new requests start with.';

CREATE TABLE intake.request_repeats (
  request_id           uuid PRIMARY KEY REFERENCES intake.requests (id),
  source_project_id    uuid NOT NULL REFERENCES crm.projects (id),
  account_id           uuid NOT NULL REFERENCES identity.customer_accounts (id),
  -- When the customer confirmed, on the form, that the property details were still current.
  details_confirmed_at timestamptz NOT NULL,
  -- Whether the address sent is the earlier project's property address as it read then (street, unit, city, state,
  -- ZIP and property type; case and spacing aside). A changed address is a new property record, as for every request.
  same_address         boolean NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (details_confirmed_at <= created_at)
);
CREATE INDEX request_repeats_source ON intake.request_repeats (source_project_id);
COMMENT ON TABLE intake.request_repeats IS
  'Requests sent with Request This Service Again and the earlier project each repeats (TSK-0113, HH-ID-12, C11).';

-- Written with its request, for an account linked to the earlier project and never to the new request's own project;
-- kept as written.
CREATE FUNCTION intake.request_repeat_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'a request''s repeat link is kept as written' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM identity.customer_identity_links l
      JOIN identity.customer_accounts a ON a.id = l.account_id
     WHERE l.account_id = NEW.account_id AND l.project_id = NEW.source_project_id AND l.state = 'active'
       AND a.state = 'active'
  ) THEN
    RAISE EXCEPTION 'a request repeats a project its account is linked to' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM intake.requests r WHERE r.id = NEW.request_id AND r.project_id = NEW.source_project_id) THEN
    RAISE EXCEPTION 'a request never repeats its own project' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER request_repeats_guard BEFORE INSERT OR UPDATE ON intake.request_repeats
  FOR EACH ROW EXECUTE FUNCTION intake.request_repeat_guard();
-- Deleted only by the Owner's request erasure (0112), with the request it belongs to.
CREATE TRIGGER request_repeats_guard_erasure BEFORE DELETE ON intake.request_repeats
  FOR EACH ROW WHEN (NOT privacy.request_erasure_permitted()) EXECUTE FUNCTION intake.request_repeat_guard();

-- A staging test-data reset (TSK-0141) clears all three; outside a permitted reset TRUNCATE is refused.
CREATE TRIGGER customer_saved_properties_reset_only_truncate BEFORE TRUNCATE ON identity.customer_saved_properties
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();
CREATE TRIGGER customer_account_preferences_reset_only_truncate BEFORE TRUNCATE ON identity.customer_account_preferences
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();
CREATE TRIGGER request_repeats_reset_only_truncate BEFORE TRUNCATE ON intake.request_repeats
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();
