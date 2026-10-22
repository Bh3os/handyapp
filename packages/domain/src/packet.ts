// The job packet: its sections, what a critical change is, and what changed between two versions (TSK-0069; HH-PKT-01,
// HH-PKT-02, HH-PKT-07, HH-DATA-08, ENT-JobPacket, ENT-Acknowledgment, OWN-DEC-121, OWN-DEC-40, RULE-SAFETY-GATES,
// RULE-NO-INVENTED-FACTS).
// - A packet version is the server's snapshot of what a worker needs for one job, built only from stored records: the
//   job and its work packages, the live work visits with their windows and confirmed teams, the property's site access
//   and occupant details (each with its source and last confirmation), the accepted scope snapshot (never a price),
//   the prior customer photos, the SOP version pinned on each work package, the blocking holds, the reserved
//   equipment and the job's dependencies. A section with nothing recorded stays empty; nothing here fills it.
// - The packet never holds an access code: only the code's kind, label and last confirmation, so the packet can say
//   that a code exists and is revealed separately, online, in the audited flow (HH-OFF-02, HH-CRM-03). The service
//   address itself is not copied into the packet either: the packet names the address version and the view reads it.
// - packetChanges() lists what differs between two versions, item by item, each marked critical or not. HH-PKT-02 and
//   HH-DATA-08 name the critical changes: scope (an approved change order is a new scope version), hazards and holds,
//   the SOP version and assignment, and site access. PROPOSED (OQ-PACKET-DETAILS): a changed site-access or scope
//   value is critical, a reconfirmation of the same value is not; a changed schedule window, occupant detail, photo,
//   equipment item, job state or deposit state is a new version that is not critical; a sign-off of the same pinned SOP
//   version is not critical (the steps did not change). A critical change only ever adds work for the worker (review
//   again, TSK-0072); nothing here releases a hold or passes the Start Job gate.

/** The packet's sections, in the order HH-PKT-01 lists them. */
export const PACKET_SECTIONS = [
  'identity',
  'schedule',
  'assignment',
  'site_access',
  'occupants',
  'scope',
  'evidence',
  'sop',
  'holds',
  'resources',
  'dependencies',
] as const
export type PacketSection = (typeof PACKET_SECTIONS)[number]

/** The property details that belong to site access (critical) and to occupants and environment (not critical). */
export const SITE_ACCESS_DETAILS = ['site_contact', 'access_windows', 'access_notes', 'parking_loading'] as const
export const OCCUPANT_DETAILS = [
  'occupants_pets',
  'restricted_areas',
  'utilities',
  'customer_preparation',
  'site_flags',
] as const

/** Visit states in which a visit is live for its team: confirmed and on the day, until it is completed (OWN-DEC-40). */
export const PACKET_VISIT_STATES = ['confirmed', 'en_route', 'arrived'] as const

export type PacketDetail = {
  readonly detail: string
  readonly value: string | null
  readonly source: string
  readonly confirmedAt: string
}
export type PacketWorker = { readonly staffUserId: string; readonly name: string | null; readonly role: string }
export type PacketVisit = {
  readonly visitId: string
  readonly number: number
  readonly purpose: string
  readonly state: string
  readonly localDate: string
  readonly windowStart: string
  readonly windowEnd: string
  readonly timeZone: string
  readonly windowVersion: number
}
export type PacketLine = {
  readonly position: number
  readonly kind: string
  readonly serviceCode: string | null
  readonly description: string | null
  readonly quantity: string | null
  readonly unit: string | null
}
export type PacketSopPin = {
  readonly workPackageId: string
  readonly serviceId: string
  readonly serviceCode: string
  readonly state: 'pinned' | 'not_configured'
  readonly sopVersionId: string | null
  readonly sopId: string | null
  readonly version: number | null
  readonly title: string | null
  readonly reviewState: string | null
  readonly spanishStatus: string | null
  readonly contentSha256: string | null
  readonly hazardSha256: string | null
  readonly qualitySha256: string | null
}
export type PacketHold = {
  readonly holdId: string
  readonly kind: string
  readonly category: string
  readonly scopeType: string
  readonly state: string
  readonly note: string
  readonly source: string
  readonly raisedAt: string
}
export type PacketAccessCode = {
  readonly id: string
  readonly kind: string
  readonly label: string | null
  readonly confirmedAt: string
  readonly version: number
}

/**
 * The loadout pinned on one work package (TSK-0071, HH-PKT-05): the item list a worker loads against, never its
 * confirmations (those change by the minute and live in the loadout itself). `not_configured`: no list for the
 * service.
 */
export type PacketLoadout = {
  readonly workPackageId: string
  readonly serviceCode: string
  readonly state: 'pinned' | 'not_configured'
  readonly loadoutVersionId: string | null
  readonly version: number | null
  readonly contentSha256: string | null
  readonly items: readonly {
    readonly key: string
    readonly group: string | null
    readonly name: string | null
    readonly criticality: string
  }[]
}

export type PacketContent = {
  readonly identity: {
    readonly projectId: string
    readonly projectReference: string
    readonly jobId: string
    readonly jobState: string
    readonly services: readonly {
      readonly workPackageId: string
      readonly serviceId: string
      readonly serviceCode: string
      readonly position: number
      readonly state: string
    }[]
  }
  readonly schedule: { readonly visits: readonly PacketVisit[] }
  readonly assignment: {
    readonly visits: readonly { readonly visitId: string; readonly number: number; readonly team: PacketWorker[] }[]
  }
  readonly site_access: {
    readonly propertyId: string
    readonly addressVersion: number
    readonly propertyType: string
    readonly timeZone: string
    readonly details: readonly PacketDetail[]
    readonly accessCodes: readonly PacketAccessCode[]
  }
  readonly occupants: { readonly details: readonly PacketDetail[] }
  readonly scope: {
    readonly snapshotId: string | null
    readonly version: number | null
    readonly source: string | null
    readonly createdAt: string | null
    readonly lines: readonly PacketLine[]
    readonly texts: Readonly<Record<string, readonly string[]>>
    readonly selectedOptions: readonly number[]
    readonly history: readonly { readonly version: number; readonly source: string; readonly createdAt: string }[]
  }
  readonly evidence: {
    readonly photos: readonly { readonly id: string; readonly uploadedAt: string; readonly uploaderKind: string }[]
  }
  readonly sop: { readonly packages: readonly PacketSopPin[] }
  readonly holds: { readonly holds: readonly PacketHold[] }
  readonly resources: {
    readonly visits: readonly {
      readonly visitId: string
      readonly number: number
      readonly equipment: readonly { readonly equipmentId: string; readonly name: string }[]
      readonly requested: readonly string[]
    }[]
    /** TSK-0071: absent from the versions written before loadouts existed. */
    readonly loadout?: readonly PacketLoadout[]
  }
  readonly dependencies: {
    readonly approvalId: string
    readonly approvedAt: string
    readonly deposit: { readonly required: boolean; readonly state: string } | null
  }
}

export type PacketChange = {
  readonly section: PacketSection
  readonly code: string
  readonly critical: boolean
  /** What the change is about: a visit number, a detail name, a hold category, a line description, a service code. */
  readonly ref: string | null
  readonly from: string | number | null
  readonly to: string | number | null
}

const change = (
  section: PacketSection,
  code: string,
  critical: boolean,
  ref: string | number | null = null,
  from: string | number | null = null,
  to: string | number | null = null,
): PacketChange => ({ section, code, critical, ref: ref === null ? null : String(ref), from, to })

/** Canonical JSON (object keys sorted): stored content read back from jsonb compares equal to what was written. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(',')}}`
  return JSON.stringify(value ?? null)
}
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b)
const windowText = (v: PacketVisit) => `${v.localDate} ${v.windowStart}-${v.windowEnd} ${v.timeZone}`

function byKey<T>(items: readonly T[], key: (t: T) => string): Map<string, T> {
  return new Map(items.map((i) => [key(i), i]))
}

function detailChanges(
  section: 'site_access' | 'occupants',
  critical: boolean,
  before: readonly PacketDetail[],
  after: readonly PacketDetail[],
): PacketChange[] {
  const out: PacketChange[] = []
  const old = byKey(before, (d) => d.detail)
  const now = byKey(after, (d) => d.detail)
  for (const d of after) {
    const o = old.get(d.detail)
    if (!o) out.push(change(section, 'detail_recorded', critical, d.detail))
    else if (o.value !== d.value) out.push(change(section, 'detail_changed', critical, d.detail))
    else if (o.source !== d.source || o.confirmedAt !== d.confirmedAt)
      out.push(change(section, 'detail_reconfirmed', false, d.detail))
  }
  for (const d of before) if (!now.has(d.detail)) out.push(change(section, 'detail_removed', critical, d.detail))
  return out
}

/**
 * What changed from `before` to `after`, section by section in packet order, each item marked critical or not.
 * `before` null (no earlier version) lists nothing. The same content always lists nothing.
 */
export function packetChanges(before: PacketContent | null, after: PacketContent): PacketChange[] {
  if (!before) return []
  const out: PacketChange[] = []

  // Identity: the job's state and its services.
  if (before.identity.jobState !== after.identity.jobState)
    out.push(change('identity', 'job_state', false, null, before.identity.jobState, after.identity.jobState))
  if (!same(before.identity.services, after.identity.services)) out.push(change('identity', 'services_changed', false))

  // Schedule: visits added or ended, windows and states.
  const oldVisits = byKey(before.schedule.visits, (v) => v.visitId)
  const newVisits = byKey(after.schedule.visits, (v) => v.visitId)
  for (const v of after.schedule.visits) {
    const o = oldVisits.get(v.visitId)
    if (!o) out.push(change('schedule', 'visit_added', false, v.number, null, windowText(v)))
    else {
      if (windowText(o) !== windowText(v))
        out.push(change('schedule', 'window_changed', false, v.number, windowText(o), windowText(v)))
      if (o.state !== v.state) out.push(change('schedule', 'visit_state', false, v.number, o.state, v.state))
    }
  }
  for (const v of before.schedule.visits)
    if (!newVisits.has(v.visitId)) out.push(change('schedule', 'visit_removed', false, v.number, windowText(v), null))

  // Assignment (critical): who is on each visit's team, and the lead.
  const oldTeams = byKey(before.assignment.visits, (v) => v.visitId)
  const newTeams = byKey(after.assignment.visits, (v) => v.visitId)
  const visitIds = [...new Set([...before.assignment.visits, ...after.assignment.visits].map((v) => v.visitId))]
  for (const id of visitIds) {
    const o = oldTeams.get(id)
    const n = newTeams.get(id)
    const number = (n ?? o)?.number ?? null
    const was = byKey(o?.team ?? [], (w) => w.staffUserId)
    const is = byKey(n?.team ?? [], (w) => w.staffUserId)
    for (const w of n?.team ?? []) {
      const p = was.get(w.staffUserId)
      if (!p) out.push(change('assignment', 'worker_added', true, number, null, w.name))
      else if (p.role !== w.role) out.push(change('assignment', 'role_changed', true, number, p.role, w.role))
    }
    for (const w of o?.team ?? [])
      if (!is.has(w.staffUserId)) out.push(change('assignment', 'worker_removed', true, number, w.name, null))
  }

  // Site access (critical): the address version, the property type, the access details and the access codes (their
  // existence only; the packet never holds a code).
  const a = before.site_access
  const b = after.site_access
  if (a.propertyId !== b.propertyId || a.addressVersion !== b.addressVersion)
    out.push(change('site_access', 'address_changed', true, null, a.addressVersion, b.addressVersion))
  if (a.propertyType !== b.propertyType)
    out.push(change('site_access', 'property_type', true, null, a.propertyType, b.propertyType))
  out.push(...detailChanges('site_access', true, a.details, b.details))
  const oldCodes = byKey(a.accessCodes, (c) => c.id)
  const newCodes = byKey(b.accessCodes, (c) => c.id)
  for (const c of b.accessCodes) {
    const o = oldCodes.get(c.id)
    if (!o) out.push(change('site_access', 'access_code_added', true, c.kind))
    else if (o.version !== c.version || o.kind !== c.kind || o.label !== c.label)
      out.push(change('site_access', 'access_code_changed', true, c.kind))
  }
  for (const c of a.accessCodes)
    if (!newCodes.has(c.id)) out.push(change('site_access', 'access_code_removed', true, c.kind))

  // Occupants and environment.
  out.push(...detailChanges('occupants', false, before.occupants.details, after.occupants.details))

  // Scope (critical): a new accepted scope version (an approved change order), lines and texts.
  const s0 = before.scope
  const s1 = after.scope
  if (s0.version !== s1.version) out.push(change('scope', 'scope_version', true, null, s0.version, s1.version))
  const lineKey = (l: PacketLine) => canonical([l.kind, l.serviceCode, l.description, l.quantity, l.unit])
  const oldLines = new Set(s0.lines.map(lineKey))
  const newLines = new Set(s1.lines.map(lineKey))
  for (const l of s1.lines) if (!oldLines.has(lineKey(l))) out.push(change('scope', 'line_added', true, l.description))
  for (const l of s0.lines)
    if (!newLines.has(lineKey(l))) out.push(change('scope', 'line_removed', true, l.description))
  for (const k of [...new Set([...Object.keys(s0.texts), ...Object.keys(s1.texts)])].sort())
    if (!same(s0.texts[k] ?? [], s1.texts[k] ?? [])) out.push(change('scope', 'text_changed', true, k))
  if (!same(s0.selectedOptions, s1.selectedOptions)) out.push(change('scope', 'options_changed', true))

  // Prior evidence.
  const oldPhotos = new Set(before.evidence.photos.map((p) => p.id))
  const newPhotos = new Set(after.evidence.photos.map((p) => p.id))
  const added = after.evidence.photos.filter((p) => !oldPhotos.has(p.id)).length
  const removed = before.evidence.photos.filter((p) => !newPhotos.has(p.id)).length
  if (added) out.push(change('evidence', 'photos_added', false, null, null, added))
  if (removed) out.push(change('evidence', 'photos_removed', false, null, removed, null))

  // SOP (critical when the pinned version changes): per work package.
  const oldPins = byKey(before.sop.packages, (p) => p.workPackageId)
  for (const p of after.sop.packages) {
    const o = oldPins.get(p.workPackageId)
    if (!o) out.push(change('sop', 'package_added', true, p.serviceCode, null, p.version))
    else if (o.sopVersionId !== p.sopVersionId || o.contentSha256 !== p.contentSha256)
      out.push(change('sop', 'sop_version', true, p.serviceCode, o.version, p.version))
    else if (o.reviewState !== p.reviewState)
      out.push(change('sop', 'sop_review_state', false, p.serviceCode, o.reviewState, p.reviewState))
  }

  // Holds (critical): a blocking hold raised, changed or no longer blocking.
  const oldHolds = byKey(before.holds.holds, (h) => h.holdId)
  const newHolds = byKey(after.holds.holds, (h) => h.holdId)
  for (const h of after.holds.holds) {
    const o = oldHolds.get(h.holdId)
    if (!o) out.push(change('holds', 'hold_added', true, h.category, null, h.state))
    else if (o.state !== h.state || o.note !== h.note)
      out.push(change('holds', 'hold_changed', true, h.category, o.state, h.state))
  }
  for (const h of before.holds.holds)
    if (!newHolds.has(h.holdId)) out.push(change('holds', 'hold_ended', true, h.category, h.state, null))

  // Tools and equipment.
  if (!same(before.resources.visits, after.resources.visits)) out.push(change('resources', 'equipment_changed', false))
  // The loadout list of each work package (TSK-0071). PROPOSED (OQ-LOADOUT-DETAILS): a new or changed list is a new
  // version that is not critical (HH-PKT-02 names scope, hazards and SOP); a critical shortage is a task block, which
  // the holds section reports as critical.
  const oldLoadouts = byKey(before.resources.loadout ?? [], (l) => l.workPackageId)
  for (const l of after.resources.loadout ?? []) {
    const o = oldLoadouts.get(l.workPackageId)
    if (o?.contentSha256 !== l.contentSha256 || o?.loadoutVersionId !== l.loadoutVersionId)
      out.push(change('resources', 'loadout_changed', false, l.serviceCode, o?.version ?? null, l.version))
  }

  // Dependencies: the deposit's state.
  const d0 = before.dependencies.deposit?.state ?? null
  const d1 = after.dependencies.deposit?.state ?? null
  if (d0 !== d1) out.push(change('dependencies', 'deposit_state', false, null, d0, d1))
  return out
}

/** Whether any change is critical: it then invalidates the affected workers' review (HH-PKT-02, HH-DATA-08). */
export function hasCriticalChange(changes: readonly PacketChange[]): boolean {
  return changes.some((c) => c.critical)
}

/** The sections with at least one change, in packet order. */
export function changedSections(changes: readonly PacketChange[]): PacketSection[] {
  const set = new Set(changes.map((c) => c.section))
  return PACKET_SECTIONS.filter((s) => set.has(s))
}

// Acknowledgments (TSK-0072; HH-DATA-08, HH-WORK-10, HH-PKT-02, HH-CHG-03, T44, ENT-Acknowledgment,
// RULE-SAFETY-GATES): a worker's own confirmation of one packet version. It stands while the worker stays assigned and
// no later version is critical; a critical version, the end of the worker's assignment or a disabled account ends it
// (recorded once by the database, migration 0064). Nobody inherits one, and it never releases a hold: the Start Job
// gate (TSK-0073) reads it next to every other check.

/** Where one worker's acknowledgment of a job's packet stands. */
export const ACKNOWLEDGMENT_STATES = ['acknowledged', 'required', 'invalidated', 'not_assigned'] as const
export type AcknowledgmentState = (typeof ACKNOWLEDGMENT_STATES)[number]

/** Why an acknowledgment stopped counting. */
export const ACKNOWLEDGMENT_INVALIDATIONS = ['critical_change', 'assignment_removed', 'account_disabled'] as const
export type AcknowledgmentInvalidation = (typeof ACKNOWLEDGMENT_INVALIDATIONS)[number]

export type AcknowledgmentFacts = {
  /** The person is assigned to the job now (an active confirmed reservation on a live visit, inside its window). */
  readonly assigned: boolean
  /** The person's latest acknowledgment of the job: its version and whether the database recorded its end. */
  readonly latest: { readonly version: number; readonly invalidated: boolean } | null
  /** The job's packet versions marked critical. */
  readonly criticalVersions: readonly number[]
}

/**
 * Where a worker's acknowledgment stands: not assigned (nothing to acknowledge, nothing counts), never given
 * (required), ended (invalidated: its end was recorded, or a later version is critical even before that is recorded),
 * or standing (acknowledged). Only `acknowledged` satisfies the review part of the Start Job gate.
 */
export function acknowledgmentState(f: AcknowledgmentFacts): AcknowledgmentState {
  if (!f.assigned) return 'not_assigned'
  if (!f.latest) return 'required'
  const { version, invalidated } = f.latest
  if (invalidated || f.criticalVersions.some((v) => v > version)) return 'invalidated'
  return 'acknowledged'
}
