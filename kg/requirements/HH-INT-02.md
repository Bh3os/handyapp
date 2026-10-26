---
id: HH-INT-02
type: requirement
title: Preferred visit windows are preferences, never booking slots
status: active
priority: P0
area: intake
links:
  decided_by: ["[[OWN-DEC-92]]", "[[OWN-DEC-56]]", "[[OWN-DEC-66]]", "[[OWN-DEC-170]]"]
  depends_on: ["[[HH-INT-17]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]"]
  uses: ["[[ENT-Request]]", "[[FACT-HOURS]]"]
  tested_by: ["[[T09]]"]
  part_of: ["[[C02]]"]
  related: ["[[OQ-WINDOW-HOURS]]", "[[OQ-WINDOW-HOURS-DETAILS]]", "[[FACT-WINDOW-HOURS]]"]
source: "guide 7.1 HH-INT-02; OWN-DEC-92, OWN-DEC-56"
---
- The choices are **Mornings, Afternoons, Evenings, Weekends, Any time**, stored as canonical enum values (`preferred_windows`).
- The window hours shown are the configured window hours ([[FACT-WINDOW-HOURS]]), all within the visit hours ([[FACT-HOURS]]), as wall-clock times of the property's zone. Only choices compatible with the configured hours appear (today all five).
- Several windows may be selected. "Any time" clears the other selections.
- "Weekends" must agree with the preferred date or the "I'm flexible" choice ([[HH-INT-17]]); Weekends combined with Mornings or Afternoons is allowed and the interface explains the combination.
- The form shows exactly, below the choices: "These are your preferred times only. Your appointment is not confirmed until HandyHub sends you a confirmed date and arrival window."
- The request keeps the hours each chosen day window had when it was sent. Preferences are shown to the office on the request, with those hours and the property's zone named (unknown while not verified), and are never written to a visit. An appointment exists only when staff send a date and an arrival window.

**Changed by [[OWN-DEC-170]] (2026-10-21):** window hours are [[FACT-WINDOW-HOURS]]; the notice now reads "These are your preferred times only. Your appointment is not confirmed until HandyHub sends you a confirmed date and arrival window."

**Built by [[TSK-0139]] (2026-10-25, migration 0104):** `request.window_hours` version 2 holds the decided hours; the notice is the owner's exact sentence below the choices and is in the claims register; `intake.requests.time_window_hours` keeps the hours offered; the staff record shows them in the property's zone. Details PROPOSED in [[OQ-WINDOW-HOURS-DETAILS]].
