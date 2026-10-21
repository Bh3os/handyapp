---
id: OQ-WINDOW-HOURS
type: question
title: Hours of the Mornings, Afternoons and Evenings preferred windows
status: open
area: intake
links:
  related: ["[[OWN-DEC-92]]", "[[HH-INT-02]]", "[[FACT-HOURS]]"]
source: "OWN-DEC-92 (owner-answers-verbatim 2026-10-12T18:31:16.913Z [2.3 Timing])"
---
**Question:** which hours do Mornings, Afternoons and Evenings cover on the request form? The owner asked to "Display configured window hours within 8 AM–10 PM" ([[OWN-DEC-92]]) but gave no hours.

- **Who answers:** the owner (three start and end times inside [[FACT-HOURS]]).
- **Known:** the windows are preferences, never booking slots ([[HH-INT-02]]); every window must lie inside the visit hours, and a window outside them is not offered.
- **Until answered:** the configuration value `request.window_hours` is NOT CONFIGURED; the form offers the five windows without hours and never guesses any (TSK-0028).
