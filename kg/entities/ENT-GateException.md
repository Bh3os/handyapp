---
id: ENT-GateException
type: entity
title: "Start Work administrative exception"
status: active
area: safety
links:
  decided_by: ["[[OWN-DEC-68]]"]
source: "OWN-DEC-68"
---
One of the three exceptions of [[HH-WORK-03]].

**Fields:** job; visit; affected requirement (customer not present, before-photo upload failed, deposit verified with bookkeeping pending); reason; evidence; requester; owner approval and time; follow-up owner and deadline; expiry (end of visit); invalidated at and why.

**States:** `requested → approved / declined`; `approved → expired / invalidated`.

**Invariants:** one requirement, one job, one visit; never carries over; follow-up tasks stay open after expiry; listed in the Owner's review queue.

**Who may change:** an assigned worker requests; only the Owner approves.
