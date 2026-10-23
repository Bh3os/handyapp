-- 0091 Invoice-specific Square payment links (TSK-0087; HH-FIN-08, HH-FIN-09, HH-PORT-12, T60, INT-Square,
-- OWN-DEC-67, OWN-DEC-138). The server checks the link (https on a configured Square host) and who may paste it
-- (apps/server/src/modules/finance/payment-links.ts); this migration keeps the records true whatever path writes.
-- - finance.invoice_payment_links: each link the Owner or Office pasted on an issued final invoice, kept in order; the
--   newest is the one "Pay by Card" opens. A link never changes and is never deleted: a new one replaces it.
-- - A link is only a way to pay in Square. Nothing about it, and no visit to it, changes an invoice or its balance:
--   only a staff-recorded verified payment does (HH-FIN-09). There is no callback from Square.

CREATE TABLE finance.invoice_payment_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES finance.invoices (id),
  url         text NOT NULL CHECK (url ~ '^https://[^\s/?#]+' AND char_length(url) <= 500 AND url !~ '\s'),
  set_by      uuid NOT NULL REFERENCES identity.staff_users (id),
  set_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invoice_payment_links_invoice ON finance.invoice_payment_links (invoice_id, set_at DESC);
COMMENT ON TABLE finance.invoice_payment_links IS
  'Square payment links pasted on issued final invoices (HH-FIN-08); the newest is current; never a payment.';

CREATE FUNCTION finance.invoice_payment_link_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  i record;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'invoice payment links are kept as pasted, never changed or deleted'
      USING ERRCODE = 'restrict_violation';
  END IF;
  SELECT kind, state INTO i FROM finance.invoices WHERE id = NEW.invoice_id;
  IF i.kind IS DISTINCT FROM 'final' THEN
    RAISE EXCEPTION 'a payment link goes on a final invoice (a deposit has its own)' USING ERRCODE = 'check_violation';
  END IF;
  IF i.state NOT IN ('issued', 'partially_paid') THEN
    RAISE EXCEPTION 'a payment link goes on an issued invoice with a balance' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT finance.has_live_role(NEW.set_by, ARRAY['owner', 'office']) THEN
    RAISE EXCEPTION 'only the Owner or Office pastes a payment link' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invoice_payment_links_guard BEFORE INSERT OR UPDATE OR DELETE ON finance.invoice_payment_links
  FOR EACH ROW EXECUTE FUNCTION finance.invoice_payment_link_guard();

-- A staging reset is the only path that empties this table (TSK-0141).
CREATE TRIGGER invoice_payment_links_reset_only_truncate BEFORE TRUNCATE ON finance.invoice_payment_links
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();
