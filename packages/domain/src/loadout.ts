// Loadouts: what a work package needs loaded, what the workers stated about each item, whether the package is ready
// for Start Work on this count, and how a critical shortage is resolved (TSK-0071; HH-PKT-05, HH-PKT-06, HH-WORK-01,
// HH-WORK-02, HH-CHG-02, T43, T45, ENT-WorkPackage, ENT-Hold, ENT-ChangeOrder, OQ-LOADOUT-DETAILS, RULE-SAFETY-GATES,
// RULE-NO-INVENTED-FACTS).
// - The list of a work package is the loadout version of its service pinned on it (imported verbatim from the
//   service's FACT-INVENTORY node): the vault file's own groups and checklist items, never a quantity, vendor or stock
//   level that the file does not state. PROPOSED (OQ-LOADOUT-DETAILS): every item is "required" (the files do not say
//   which are only nice to have; unknown is not safe), and no item is classified into the HH-PKT-05 categories yet.
// - Workers state, per item, "loaded" (loaded and available), "missing" or "damaged", with an optional note. The latest
//   statement is the item's state. A missing or damaged required item raises a task block on its work package (a
//   hold of kind task_block) in the same transaction, with an owner and an action: the Owner provides the item or
//   approves a substitute (PROPOSED). Start Work stays blocked for that package only (HH-PKT-06); a nice-to-have item
//   is recorded and blocks nothing.
// - A task block ends only by a recorded resolution (HH-WORK-02): the item confirmed loaded after the block was
//   raised, or an approved substitute named with what it affects; or a cancellation as entered in error. A worker's
//   later "loaded" never clears it by itself, and nothing is ever marked equivalent silently. A substitute that
//   affects the customer is a change order (HH-CHG-02), which is NOT CONFIGURED until change orders exist (TSK-0081,
//   TSK-0082): it is refused here.
// - loadoutReadiness() is what the Start Work gate (TSK-0073) reads for its seventh prerequisite (critical PPE, tools,
//   equipment and materials confirmed available, HH-WORK-01): `ready` only when every required item is loaded (or
//   has an approved substitute) and no task block blocks. Nothing here passes the gate or overrides a hold.

/** HH-PKT-05: required and nice-to-have items are distinct. */
export const LOADOUT_CRITICALITIES = ['required', 'nice_to_have'] as const
export type LoadoutCriticality = (typeof LOADOUT_CRITICALITIES)[number]

/** HH-PKT-05's groups, and `not_classified` for the imported items (PROPOSED: the files use their own headings). */
export const LOADOUT_CATEGORIES = [
  'shop_vehicle_tool',
  'consumable_material',
  'ppe',
  'rental_equipment',
  'customer_supplied',
  'not_classified',
] as const
export type LoadoutCategory = (typeof LOADOUT_CATEGORIES)[number]

/** What a worker states about one item. */
export const LOADOUT_REPORTS = ['loaded', 'missing', 'damaged'] as const
export type LoadoutReport = (typeof LOADOUT_REPORTS)[number]
/** Every state an item can be in; `substitute_approved` is written only by the resolution of a task block. */
export const LOADOUT_STATUSES = [...LOADOUT_REPORTS, 'substitute_approved'] as const
export type LoadoutStatus = (typeof LOADOUT_STATUSES)[number]

/** What an approved substitute may affect (HH-PKT-06); the approver records each that applies. */
export const SUBSTITUTE_IMPACTS = ['safety', 'appearance', 'specification', 'price', 'warranty'] as const
export type SubstituteImpact = (typeof SUBSTITUTE_IMPACTS)[number]

/** How a task block is resolved (PROPOSED, OQ-LOADOUT-DETAILS). */
export const TASK_BLOCK_RESOLUTIONS = ['item_provided', 'substitute_approved'] as const
export type TaskBlockResolution = (typeof TASK_BLOCK_RESOLUTIONS)[number]

/**
 * The owner and the action of every task block (HH-PKT-06 "a task-specific block with an owner and an action").
 * PROPOSED: the Owner resolves it (job_hold.set_ready), by providing the item or approving a substitute.
 */
export const TASK_BLOCK_OWNER = { role: 'owner', action: 'provide_item_or_approve_substitute' } as const

/** The readiness of one work package's loadout. */
export const LOADOUT_READINESS = ['ready', 'not_confirmed', 'blocked', 'not_configured'] as const
export type LoadoutReadinessState = (typeof LOADOUT_READINESS)[number]

export type LoadoutItem = {
  readonly key: string
  readonly name: string | null
  readonly lines: readonly string[]
  readonly line: number | null
  readonly criticality: LoadoutCriticality
  readonly category: LoadoutCategory
}
export type LoadoutNote = { readonly lines: readonly string[]; readonly line: number | null }
export type LoadoutGroup = {
  readonly heading: string | null
  readonly line: number | null
  readonly items: readonly LoadoutItem[]
  readonly notes: readonly LoadoutNote[]
}
/** A loadout version's content, as tools/import-loadouts.mjs writes it. */
export type LoadoutContent = { readonly groups: readonly LoadoutGroup[]; readonly proposed: LoadoutNote | null }

export function loadoutItems(content: LoadoutContent): LoadoutItem[] {
  return content.groups.flatMap((g) => [...g.items])
}

/** Whether a worker's statement about an item raises a task block: a missing or damaged required item. */
export function raisesTaskBlock(criticality: LoadoutCriticality, report: LoadoutReport): boolean {
  return criticality === 'required' && (report === 'missing' || report === 'damaged')
}

/** Whether an item's latest state counts as available for Start Work. */
export function isAvailable(status: LoadoutStatus | null): boolean {
  return status === 'loaded' || status === 'substitute_approved'
}

export type LoadoutReadiness = {
  readonly state: LoadoutReadinessState
  /** Required items with no "loaded" statement (or approved substitute) as their latest state, in list order. */
  readonly unconfirmed: readonly string[]
  /** Items whose latest state is missing or damaged, required or not. */
  readonly reported: readonly string[]
  /** The blocking task blocks (hold ids). */
  readonly blocks: readonly string[]
}

/**
 * The readiness of one work package: `not_configured` without a pinned list; `blocked` while a task block blocks;
 * `not_confirmed` while a required item is not available; `ready` otherwise. `latest` maps item keys to their latest
 * state.
 */
export function loadoutReadiness(input: {
  readonly content: LoadoutContent | null
  readonly latest: ReadonlyMap<string, LoadoutStatus>
  readonly blockingHolds: readonly string[]
}): LoadoutReadiness {
  if (!input.content) return { state: 'not_configured', unconfirmed: [], reported: [], blocks: [] }
  const items = loadoutItems(input.content)
  const unconfirmed = items
    .filter((i) => i.criticality === 'required' && !isAvailable(input.latest.get(i.key) ?? null))
    .map((i) => i.key)
  const reported = items
    .filter((i) => {
      const s = input.latest.get(i.key)
      return s === 'missing' || s === 'damaged'
    })
    .map((i) => i.key)
  const blocks = [...input.blockingHolds]
  const state: LoadoutReadinessState = blocks.length ? 'blocked' : unconfirmed.length ? 'not_confirmed' : 'ready'
  return { state, unconfirmed, reported, blocks }
}

export type TaskBlockResolutionProblem =
  'ITEM_NOT_CONFIRMED_LOADED' | 'SUBSTITUTE_REQUIRED' | 'IMPACTS_REQUIRED' | 'CHANGE_ORDER_REQUIRED'

/**
 * What stands in the way of resolving a task block this way. `item_provided` needs a "loaded" statement about the item
 * recorded after the block was raised; `substitute_approved` needs the substitute named, what it affects stated, and
 * a substitute that does not affect the customer (one that does is a change order, HH-CHG-02: NOT CONFIGURED until
 * change orders exist).
 */
export function taskBlockResolutionProblems(input: {
  readonly resolution: TaskBlockResolution
  readonly loadedAfterBlock: boolean
  readonly substitute?: string | undefined
  readonly impacts?: readonly string[] | undefined
  readonly customerAffected?: boolean | undefined
}): TaskBlockResolutionProblem[] {
  if (input.resolution === 'item_provided') return input.loadedAfterBlock ? [] : ['ITEM_NOT_CONFIRMED_LOADED']
  const out: TaskBlockResolutionProblem[] = []
  if (!input.substitute || input.substitute.trim() === '') out.push('SUBSTITUTE_REQUIRED')
  if (
    input.impacts === undefined ||
    input.customerAffected === undefined ||
    input.impacts.some((i) => !(SUBSTITUTE_IMPACTS as readonly string[]).includes(i))
  )
    out.push('IMPACTS_REQUIRED')
  if (input.customerAffected === true) out.push('CHANGE_ORDER_REQUIRED')
  return out
}
