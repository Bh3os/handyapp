-- 0005 policy versions (TSK-0007; ENT-PolicyVersion, RULE-DECIDED-VALUES-ACTIVE, OWN-DEC-122, HH-FIN-01).
-- Every configuration value is a versioned row citing the fact or decision it comes from. The owner's decided values
-- are seeded active here (no separate activation step); a fact the owner has not provided is a NOT CONFIGURED row
-- (state 'not_configured', no value), never a default. Rows are append-only: a change is a new version, and the
-- previous active version becomes superseded; records that pinned an older version keep reading it.
-- Money inside values is integer cents (RULE-MONEY-CENTS). Seed rows name no approving user: the migration is the
-- recorded authorization of the decisions they cite (OWN-DEC-128).

CREATE TABLE platform.policy_version (
  key text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  version integer NOT NULL CHECK (version >= 1),
  state text NOT NULL CHECK (state IN ('configured', 'not_configured')),
  value jsonb,
  -- True while the value is a PROPOSED reading of the owner's answer (for example the time zone id, OQ-TIMEZONE-ID).
  proposed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded')),
  source_ids text[] NOT NULL CHECK (cardinality(source_ids) >= 1),
  effective_from timestamptz NOT NULL DEFAULT now(),
  changed_by text NOT NULL CHECK (changed_by <> ''),
  change_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key, version),
  CONSTRAINT policy_version_value_matches_state CHECK ((state = 'configured') = (value IS NOT NULL)),
  -- RULE-AI-WAVE2: the AI module stays disabled; no configuration change can enable it.
  CONSTRAINT policy_version_ai_disabled CHECK (key <> 'ai.module' OR value = '{"enabled": false}'::jsonb)
);
COMMENT ON TABLE platform.policy_version IS
  'Versioned configuration (ENT-PolicyVersion): decided values citing their source; NOT CONFIGURED rows for open facts.';

-- One active version per key.
CREATE UNIQUE INDEX policy_version_one_active ON platform.policy_version (key) WHERE status = 'active';

-- Append-only: no delete; the only update is an active version becoming superseded, with nothing else changed.
CREATE FUNCTION platform.policy_version_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'policy versions are append-only: add a new version instead of deleting'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.status = 'active' AND NEW.status = 'superseded'
     AND (to_jsonb(NEW) - 'status') = (to_jsonb(OLD) - 'status') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'policy versions are append-only: add a new version instead of editing'
    USING ERRCODE = 'restrict_violation';
END;
$$;
CREATE TRIGGER policy_version_append_only
  BEFORE UPDATE OR DELETE ON platform.policy_version
  FOR EACH ROW EXECUTE FUNCTION platform.policy_version_append_only();

INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by) VALUES
  ('deposit.rule', 1, 'configured',
   '{"comparison": "greater_than", "thresholdCents": 100000, "percentBps": 2000, "base": "final_total_after_discount", "rounding": "half_up"}',
   false, ARRAY['FACT-DEPOSIT-RULE', 'OWN-DEC-42', 'OWN-DEC-104'], 'migration:0005'),
  ('discount.rule', 1, 'configured',
   '{"percentBps": 1000, "categories": ["military", "senior", "returning_customer"], "perJob": "one_largest", "appliedTo": "subtotal"}',
   false, ARRAY['FACT-PRICING-DISCOUNTS', 'OWN-DEC-66', 'OWN-DEC-145'], 'migration:0005'),
  ('discount.eligibility_verification', 1, 'not_configured', NULL,
   false, ARRAY['FACT-PRICING-DISCOUNTS', 'OQ-DISCOUNT-ELIGIBILITY'], 'migration:0005'),
  ('tax.mode', 1, 'configured', '{"mode": "no_tax_line"}',
   false, ARRAY['FACT-TAX-NO-LINE', 'OWN-DEC-83', 'OWN-DEC-128'], 'migration:0005'),
  ('estimate.validity', 1, 'configured', '{"days": 14, "from": "published"}',
   false, ARRAY['FACT-ESTIMATE-VALIDITY', 'OWN-DEC-34'], 'migration:0005'),
  ('estimate.publishing_roles', 1, 'configured', '{"roles": ["owner", "estimator"]}',
   false, ARRAY['OWN-DEC-118'], 'migration:0005'),
  ('payment.term_default', 1, 'configured', '{"term": "due_on_receipt"}',
   false, ARRAY['FACT-PAYMENT-DUE'], 'migration:0005'),
  ('payment.methods', 1, 'configured',
   '{"methods": ["square_payment_link", "square_tap_to_pay", "cash", "check", "zelle", "cash_app", "chime"], "surcharge": false}',
   false, ARRAY['FACT-PAYMENT-METHODS', 'FACT-NO-SURCHARGE', 'OWN-DEC-67'], 'migration:0005'),
  ('payment.instructions', 1, 'configured',
   '{"placeholder": true, "zelle": "[Payment email or phone]", "cashApp": "[$Cashtag]", "chime": "[Payment handle or details]", "checkPayee": "[Payee name]"}',
   false, ARRAY['FACT-PAYMENT-INSTRUCTIONS', 'OWN-DEC-126', 'OQ-PAYMENT-HANDLES'], 'migration:0005'),
  ('cancellation.rules', 1, 'configured',
   '{"rescheduleFree": true, "noticeHours": 24, "lateCancellationCents": 5000}',
   false, ARRAY['FACT-CANCELLATION-RULES', 'OWN-DEC-134'], 'migration:0005'),
  ('contact.hours', 1, 'configured', '{"days": "every_day", "open": "08:00", "close": "22:00"}',
   false, ARRAY['FACT-HOURS'], 'migration:0005'),
  ('business.timezone', 1, 'configured', '{"zone": "America/Kentucky/Louisville"}',
   true, ARRAY['FACT-TIMEZONE', 'OQ-TIMEZONE-ID'], 'migration:0005'),
  ('reminders.cadences', 1, 'configured',
   '{"unansweredEstimate": {"firstHours": 24, "finalHours": 72, "contactHoursOnly": false}, "unansweredQuestion": {"firstHours": 24, "finalHours": 48, "closeAfterFinalHours": 24, "contactHoursOnly": true}, "appointment": {"hoursBefore": 24, "contactHoursOnly": true}, "satisfaction": {"daysAfterCompletion": 2, "contactHoursOnly": true}, "unpaidInvoice": {"firstHours": 24, "finalHours": 72, "contactHoursOnly": true}, "repeatService": {"schedule": "customer_agreed", "contactHoursOnly": true}}',
   false, ARRAY['FACT-REMINDER-CADENCES', 'OWN-DEC-78', 'OWN-DEC-101', 'OWN-DEC-112', 'OWN-DEC-132'], 'migration:0005'),
  ('request.reopen_period', 1, 'configured', '{"days": 30}',
   false, ARRAY['FACT-REOPEN-PERIOD', 'OWN-DEC-101'], 'migration:0005'),
  ('response.target', 1, 'configured', '{"minutes": 60, "countedWithin": "contact_hours"}',
   false, ARRAY['FACT-RESPONSE-TARGET', 'OWN-DEC-115'], 'migration:0005'),
  ('session.timings', 1, 'configured',
   '{"staffInviteLinkHours": 24, "passwordResetLinkHours": 24, "oneTimeCodeMinutes": 10, "customerSessionIdleMinutes": 30, "customerSessionMaxHours": 8, "staffSessionIdleMinutes": 30, "requestDraftDays": 7}',
   false, ARRAY['FACT-SESSION-TIMINGS', 'OWN-DEC-141'], 'migration:0005'),
  ('uploads.limits', 1, 'configured',
   '{"maxFileBytes": 15728640, "maxRequestPhotos": 10, "requestPhotoTypes": ["image/jpeg", "image/png", "image/webp"]}',
   false, ARRAY['FACT-UPLOAD-LIMITS', 'OWN-DEC-146'], 'migration:0005'),
  ('business.name', 1, 'configured', '{"documentName": "Handyhub LLC", "brand": "HandyHub"}',
   false, ARRAY['FACT-BUSINESS-NAME', 'OWN-DEC-126', 'OWN-DEC-46'], 'migration:0005'),
  ('business.mailing_address', 1, 'not_configured', NULL,
   false, ARRAY['FACT-BUSINESS-ADDRESS', 'OQ-MAILING-ADDRESS'], 'migration:0005'),
  ('business.public_contact', 1, 'not_configured', NULL,
   false, ARRAY['FACT-PUBLIC-CONTACT', 'OQ-PUBLIC-CONTACT'], 'migration:0005'),
  ('ai.module', 1, 'configured', '{"enabled": false}',
   false, ARRAY['RULE-AI-WAVE2'], 'migration:0005');
