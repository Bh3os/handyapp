-- 0104 Preferred window hours (TSK-0139; OWN-DEC-170, FACT-WINDOW-HOURS, HH-INT-02, OWN-DEC-159, FACT-HOURS, T09,
-- ENT-Request, RULE-DECIDED-VALUES-ACTIVE). The form offers the windows the server serves
-- (apps/server/src/modules/requests/submit.ts); this migration seeds the decided hours and keeps what the customer saw.
-- 1. request.window_hours version 2 (OWN-DEC-170, answering OQ-WINDOW-HOURS): Mornings 8:00 AM-12:00 PM, Afternoons
--    12:00 PM-5:00 PM, Evenings 5:00 PM-10:00 PM, all inside the visit hours of contact.hours (8 AM-10 PM, FACT-HOURS).
--    Wall-clock times of the service property's own zone, Eastern or Central (OWN-DEC-159). Weekends (Saturday and
--    Sunday, combinable with a time of day) and Any Time (flexible within the visit hours) have no hours of their own.
--    Version 1 (NOT CONFIGURED, migration 0018) is superseded. Preferences only: nothing here is a slot.
-- 2. intake.requests.time_window_hours: the hours of the day windows the customer chose, exactly as the form offered
--    them (OWN-DEC-170 item 5, preferences preserved through the request and estimate workflow). A later change of
--    request.window_hours never changes what an earlier request meant. Part of the original submission, so it never
--    changes (requests_original_unchanged compares every column). Requests saved before this migration were offered
--    no hours: '{}'.

-- 1. The decided hours.
UPDATE platform.policy_version SET status = 'superseded' WHERE key = 'request.window_hours' AND status = 'active';
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by, change_reason)
SELECT 'request.window_hours', coalesce(max(version), 0) + 1, 'configured',
       '{"mornings": {"start": "08:00", "end": "12:00"}, "afternoons": {"start": "12:00", "end": "17:00"}, "evenings": {"start": "17:00", "end": "22:00"}}',
       false, ARRAY['FACT-WINDOW-HOURS', 'OWN-DEC-170', 'HH-INT-02'], 'migration:0104',
       'OWN-DEC-170: Mornings 8-12, Afternoons 12-5, Evenings 5-10, in the property''s zone'
  FROM platform.policy_version WHERE key = 'request.window_hours';

-- 2. The hours each request was offered.
CREATE FUNCTION intake.window_hours_ok(hours jsonb, windows text[]) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_typeof(hours) = 'object' AND NOT EXISTS (
    SELECT 1 FROM jsonb_each(hours) AS e (k, v)
     WHERE e.k NOT IN ('mornings', 'afternoons', 'evenings')
        OR NOT (e.k = ANY (windows))
        OR jsonb_typeof(e.v) <> 'object'
        OR coalesce(e.v ->> 'start', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        OR coalesce(e.v ->> 'end', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        OR e.v ->> 'start' >= e.v ->> 'end')
$$;
COMMENT ON FUNCTION intake.window_hours_ok(jsonb, text[]) IS
  'Whether hours name only chosen day windows (mornings, afternoons, evenings), each with HH:MM start before end.';

ALTER TABLE intake.requests
  ADD COLUMN time_window_hours jsonb NOT NULL DEFAULT '{}' CHECK (intake.window_hours_ok(time_window_hours, time_windows));
COMMENT ON COLUMN intake.requests.time_window_hours IS
  'The hours of the chosen day windows as the form offered them (request.window_hours, OWN-DEC-170), wall-clock '
  'times of the property''s zone; {} when none were offered. Part of the original submission: never changed.';
