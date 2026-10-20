---
id: HH-BASE-01
type: requirement
title: Keep the premium design; add functional states without a theme rewrite
status: active
priority: P0
area: site
links:
  decided_by: ["[[OWN-DEC-54]]", "[[OWN-DEC-55]]", "[[OWN-DEC-86]]"]
  uses: ["[[FACT-BRAND-IDENTITY]]"]
  tested_by: ["[[T75]]"]
source: "guide Read this first, 1.4; OWN-DEC-54, OWN-DEC-55"
---
- The premium home-services identity ([[FACT-BRAND-IDENTITY]]) is kept on both websites. New work adds functional states (empty, loading, error, stale, offline, blocked, success) and accessible interactions using the existing tokens and components.
- No unrelated visual redesign or theme rewrite. A rebuild reproduces the approved identity; it does not invent a new one.
- Owner-approved site wording ([[OWN-DEC-86]]) is reproduced exactly.
- Regression checks prove that existing pages, components and working routes keep their behaviour (T75).
