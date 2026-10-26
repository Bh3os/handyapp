---
id: FACT-WINDOW-HOURS
type: fact
title: "Preferred time windows: Mornings 8–12, Afternoons 12–5, Evenings 5–10"
status: active
area: intake
links:
  decided_by: ["[[OWN-DEC-170]]"]
  uses: ["[[FACT-HOURS]]"]
source: "OWN-DEC-170; owner answers 2026-10-21 R6-Q1"
---
**Value (configuration `request.window_hours`):**
- Mornings: 8:00 AM–12:00 PM.
- Afternoons: 12:00 PM–5:00 PM.
- Evenings: 5:00 PM–10:00 PM.
- Weekends: Saturday and Sunday, combinable with a time-of-day choice.
- Any Time: flexible within the visit hours ([[FACT-HOURS]]); clears the other choices.

Hours are in the service property's local zone ([[OWN-DEC-159]]). They are preferences, never booking slots ([[HH-INT-02]]).

**Built by [[TSK-0139]] (2026-10-25):** migration 0104 records `request.window_hours` version 2 with these hours, citing [[OWN-DEC-170]] (version 1, NOT CONFIGURED, superseded). Each request keeps the hours it was offered. PROPOSED details: [[OQ-WINDOW-HOURS-DETAILS]].
