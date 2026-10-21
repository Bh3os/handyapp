// The staff view of one property record (TSK-0045; HH-CRM-02, HH-CRM-03, OWN-DEC-117, RULE-SERVER-AUTHZ). Read by
// staff holding customer.view, inside their scope (TSK-0037):
// - the current address with its address version, the property type, time zone and coverage result;
// - every changeable detail with its source and when it was last confirmed (and by whom); a detail never recorded
//   says so, never an empty value;
// - the former addresses, each with the period it was current; the requests made at the property, each with the
//   address it was sent with, marked when that is a former address (historic records keep their address);
// - the customers authorized for the property; the staff change history with reasons;
// - access codes, for the roles that may enter or reveal them only, masked: kind, label, source, last confirmation
//   and who revealed them when. The sealed value is never selected here, so no code can reach this view.
import type { Db, Tx } from '@handyhub/db'
import { PROPERTY_DETAILS, sameAddress, type PropertyAddress } from '@handyhub/domain'
import { decide, type Action, type Actor, type DataScope } from '@handyhub/policy'
import { propertyInScope } from '../../platform/data-scope.js'

type Reader = Db | Tx
export type StaffRef = { id: string; name: string | null }

/** PROPOSED: the change history shows the newest 200 entries. */
export const HISTORY_LIMIT = 200

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Whether the caller's role may take an action on the property. Every write here sends its required reason, so
 * availability is decided as if it had one; the server decides again, with the facts of the record, when it is sent.
 */
export function allowed(actor: Actor, action: Action): boolean {
  return decide(actor, action, {}, { now: new Date(), online: true, reason: 'given' }).effect === 'allow'
}

async function staffNames(db: Reader, ids: (string | null | undefined)[]): Promise<Map<string, StaffRef>> {
  const wanted = [...new Set(ids.filter((i): i is string => typeof i === 'string' && UUID_RE.test(i)))]
  if (wanted.length === 0) return new Map()
  const rows = await db
    .selectFrom('identity.staff_users')
    .select(['id', 'display_name'])
    .where('id', 'in', wanted)
    .execute()
  return new Map(rows.map((r) => [r.id, { id: r.id, name: r.display_name }]))
}

/** The property's ID when it exists inside the scope; null otherwise (an altered ID finds nothing). */
export async function findProperty(db: Reader, scope: DataScope, propertyId: string): Promise<string | null> {
  if (!UUID_RE.test(propertyId)) return null
  const row = await db
    .selectFrom('crm.properties as p')
    .select('p.id')
    .where('p.id', '=', propertyId)
    .where(propertyInScope('p.id', scope))
    .executeTakeFirst()
  return row?.id ?? null
}

const address = (r: { street: string; unit: string | null; city: string; state: string; zip: string }) => ({
  street: r.street,
  unit: r.unit,
  city: r.city,
  state: r.state,
  zip: r.zip,
})

/** The address a request was sent with, from its original submission (never edited). */
function submittedAddress(original: unknown): PropertyAddress {
  const p = ((original ?? {}) as { property?: Record<string, unknown> }).property ?? {}
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const unit = text(p['unit'])
  return {
    street: text(p['street']),
    unit: unit === '' ? null : unit,
    city: text(p['city']),
    state: text(p['state']).toUpperCase(),
    zip: text(p['zip']),
  }
}

export async function staffPropertyView(
  db: Reader,
  scope: DataScope,
  propertyId: string,
  actor: Actor,
  store: 'available' | 'not_configured',
) {
  const id = await findProperty(db, scope, propertyId)
  if (!id) return null
  const p = await db
    .selectFrom('crm.properties')
    .select([
      'id',
      'street',
      'unit',
      'city',
      'state',
      'zip',
      'property_type',
      'time_zone',
      'coverage_result',
      'created_at',
      'version',
      'address_version',
    ])
    .where('id', '=', id)
    .executeTakeFirstOrThrow()
  const details = await db
    .selectFrom('crm.property_details')
    .select(['detail', 'value', 'source', 'confirmed_at', 'confirmed_by'])
    .where('property_id', '=', id)
    .execute()
  const addresses = await db
    .selectFrom('crm.property_addresses')
    .select(['address_version', 'street', 'unit', 'city', 'state', 'zip', 'source', 'recorded_by', 'recorded_at'])
    .where('property_id', '=', id)
    .orderBy('address_version')
    .execute()
  const customers = await db
    .selectFrom('crm.customer_properties as cp')
    .innerJoin('crm.customers as cu', 'cu.id', 'cp.customer_id')
    .select(['cu.id', 'cu.display_name', 'cu.status', 'cp.relationship'])
    .where('cp.property_id', '=', id)
    .orderBy('cp.created_at')
    .execute()
  const requests = await db
    .selectFrom('intake.requests')
    .select(['id', 'reference', 'state', 'submitted_at', 'original_submission'])
    .where('property_id', '=', id)
    .orderBy('submitted_at', 'desc')
    .execute()
  const history = await db
    .selectFrom('crm.property_changes')
    .select(['detail', 'action', 'source', 'reason', 'changed_by', 'changed_at'])
    .where('property_id', '=', id)
    .orderBy('changed_at', 'desc')
    .orderBy('id')
    .limit(HISTORY_LIMIT)
    .execute()

  const mayAct = { set: allowed(actor, 'access_code.set'), reveal: allowed(actor, 'access_code.reveal') }
  const codesVisible = mayAct.set || mayAct.reveal
  // Metadata only: the sealed value is not selected.
  const codes = codesVisible
    ? await db
        .selectFrom('crm.access_instruction_secrets')
        .select([
          'id',
          'kind',
          'label',
          'source',
          'confirmed_at',
          'confirmed_by',
          'created_by',
          'created_at',
          'removed_at',
          'removed_by',
          'removal_reason',
          'version',
        ])
        .where('property_id', '=', id)
        .orderBy('created_at')
        .orderBy('id')
        .execute()
    : []
  const reveals = codes.length
    ? await db
        .selectFrom('crm.access_code_reveals')
        .select(['secret_id', 'staff_id', 'revealed_at'])
        .where(
          'secret_id',
          'in',
          codes.map((c) => c.id),
        )
        .orderBy('revealed_at', 'desc')
        .execute()
    : []

  const names = await staffNames(db, [
    ...details.map((d) => d.confirmed_by),
    ...addresses.map((a) => a.recorded_by),
    ...history.map((h) => h.changed_by),
    ...codes.flatMap((c) => [c.confirmed_by, c.created_by, c.removed_by]),
    ...reveals.map((r) => r.staff_id),
  ])
  const ref = (sid: string | null): StaffRef | null => (sid ? (names.get(sid) ?? { id: sid, name: null }) : null)
  const current = address(p)

  return {
    id: p.id,
    version: p.version,
    address: current,
    addressVersion: p.address_version,
    propertyType: p.property_type,
    timeZone: p.time_zone,
    coverage: p.coverage_result,
    createdAt: p.created_at.toISOString(),
    details: PROPERTY_DETAILS.map((detail) => {
      const d = details.find((x) => x.detail === detail)
      return {
        detail,
        value: d?.value ?? null,
        // A text detail staff cleared stays a record (source and date) without a value.
        recorded: d !== undefined && (detail === 'address' || detail === 'property_type' || d.value !== null),
        source: d?.source ?? null,
        confirmedAt: d ? d.confirmed_at.toISOString() : null,
        confirmedBy: d ? ref(d.confirmed_by) : null,
      }
    }),
    formerAddresses: addresses
      .filter((a) => a.address_version < p.address_version)
      .map((a) => {
        const next = addresses.find((x) => x.address_version === a.address_version + 1)
        return {
          addressVersion: a.address_version,
          address: address(a),
          source: a.source,
          from: a.recorded_at.toISOString(),
          until: (next?.recorded_at ?? a.recorded_at).toISOString(),
          recordedBy: ref(a.recorded_by),
        }
      })
      .reverse(),
    customers: customers.map((c) => ({
      id: c.id,
      displayName: c.display_name,
      status: c.status,
      relationship: c.relationship,
    })),
    requests: requests.map((r) => {
      const sent = submittedAddress(r.original_submission)
      return {
        id: r.id,
        reference: r.reference,
        state: r.state,
        submittedAt: r.submitted_at.toISOString(),
        address: sent,
        formerAddress: !sameAddress(sent, current),
      }
    }),
    accessCodes: {
      visible: codesVisible,
      store,
      items: codes
        .filter((c) => c.removed_at === null)
        .map((c) => {
          const mine = reveals.filter((r) => r.secret_id === c.id)
          const last = mine[0]
          return {
            id: c.id,
            version: c.version,
            kind: c.kind,
            label: c.label,
            source: c.source,
            confirmedAt: c.confirmed_at.toISOString(),
            confirmedBy: ref(c.confirmed_by),
            createdAt: c.created_at.toISOString(),
            createdBy: ref(c.created_by),
            lastRevealed: last ? { at: last.revealed_at.toISOString(), by: ref(last.staff_id) } : null,
            reveals: mine.length,
          }
        }),
      removed: codes
        .filter((c) => c.removed_at !== null)
        .map((c) => ({
          id: c.id,
          kind: c.kind,
          label: c.label,
          removedAt: (c.removed_at as Date).toISOString(),
          removedBy: ref(c.removed_by),
          reason: c.removal_reason ?? '',
          createdAt: c.created_at.toISOString(),
        }))
        .reverse(),
    },
    history: history.map((h) => ({
      at: h.changed_at.toISOString(),
      detail: h.detail,
      action: h.action,
      source: h.source,
      by: ref(h.changed_by),
      reason: h.reason,
    })),
    actions: {
      edit: allowed(actor, 'customer.edit'),
      // The role's permission; entering, replacing and revealing also need the store configured (`store`).
      setAccessCodes: mayAct.set,
      revealAccessCodes: mayAct.reveal,
    },
  }
}
