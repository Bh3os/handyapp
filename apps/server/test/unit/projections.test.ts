// Customer projections and the customer surface contract (TSK-0037; HH-ARC-04, HH-PORT-01, HH-DATA-07, T24).
import { describe, expect, it } from 'vitest'
import type { JsonSchema, RouteDef } from '../../src/api/route.js'
import { MODULES } from '../../src/modules/index.js'
import {
  CUSTOMER_PHOTO,
  CUSTOMER_VIEWS,
  customerView,
  forbiddenForCustomer,
  listOf,
  PROJECT_GLANCE,
  PROJECT_LIST,
  PROJECT_APPOINTMENTS,
  PROJECT_DOCUMENTS,
  PROJECT_MESSAGES,
  PROJECT_OVERVIEW,
  PROJECT_PAYMENTS,
  PROJECT_PHOTOS,
  ProjectionError,
} from '../../src/modules/records/index.js'

const routes = MODULES.flatMap((m) => m.routes)
/** Every property name anywhere in a schema. */
function fieldNames(schema: unknown, out: string[] = []): string[] {
  if (!schema || typeof schema !== 'object') return out
  const s = schema as Record<string, unknown>
  if (s['properties'] && typeof s['properties'] === 'object')
    for (const [k, v] of Object.entries(s['properties'] as Record<string, unknown>)) {
      out.push(k)
      fieldNames(v, out)
    }
  for (const k of ['items', 'anyOf', 'oneOf', 'allOf', 'additionalProperties']) {
    const v = s[k]
    if (Array.isArray(v)) for (const x of v) fieldNames(x, out)
    else fieldNames(v, out)
  }
  return out
}
const success = (r: RouteDef): JsonSchema[] =>
  Object.entries(r.schema.response)
    .filter(([status]) => Number(status) < 300)
    .map(([, s]) => s)

describe('customer projections (TSK-0037, HH-ARC-04, T24)', () => {
  it('[T24][HH-ARC-04] no public or customer surface response declares an internal field (deny-list)', () => {
    // The staff surface answers only on the staff host (its sign-in routes take guests, who become staff).
    const reachable = routes.filter((r) => !r.path.startsWith('/staff/'))
    expect(reachable.length).toBeGreaterThan(10)
    const leaks = reachable.flatMap((r) =>
      success(r).flatMap((s) =>
        fieldNames(s)
          .filter(forbiddenForCustomer)
          .map((f) => `${r.operationId}: ${f}`),
      ),
    )
    expect(leaks).toEqual([])
  })

  it('[HH-ARC-04][HH-PORT-01] every customer surface route answers with exactly one declared customer view', () => {
    const customerRoutes = routes.filter((r) => r.path.startsWith('/customer/'))
    expect(customerRoutes.map((r) => r.operationId).sort()).toEqual(
      [
        'getCustomerAccess',
        'getCustomerProject',
        'listCustomerRequestPhotos',
        'listCustomerProjects',
        'getCustomerProjectOverview',
        // TSK-0036: optional customer accounts.
        'getAccountEnrollment',
        'sendLinkAccountCode',
        'enrollFromProjectLink',
        'getCustomerAccount',
        'sendAccountEmailCode',
        'changeAccountEmail',
        'customerSignOut',
        // TSK-0039: the workspace tabs beside the Overview.
        'getCustomerProjectMessages',
        'getCustomerProjectDocuments',
        'getCustomerProjectPhotos',
        'getCustomerProjectAppointments',
        'getCustomerProjectPayments',
        // TSK-0056: the customer estimate view and the customer's responses to it.
        'getCustomerEstimate',
        'requestEstimateChanges',
        'declineEstimate',
        'requestUpdatedEstimate',
        // TSK-0057: the selected options, the approval and the in-session fresh verification before it.
        'saveEstimateSelection',
        'approveEstimate',
        'getSessionVerification',
        'sendSessionVerificationCode',
        'confirmSessionVerification',
        // TSK-0063: the customer's answer to offered windows.
        'selectOfferedWindow',
        'requestOtherWindows',
        // TSK-0066: Request to Reschedule and Request Cancellation of a confirmed appointment.
        'requestAppointmentReschedule',
        'requestAppointmentCancellation',
        // TSK-0051: questions from HandyHub, the reply and its photos, and writing in the project conversation.
        'listCustomerQuestions',
        'createQuestionReplyUpload',
        'replyToQuestion',
        'sendPortalMessage',
        // TSK-0100: the customer's privacy requests, their data export and the document download links.
        'listCustomerPrivacyRequests',
        'requestExport',
        'requestCorrection',
        'requestDeletion',
        'getCustomerDataExport',
        'getCustomerEstimateDownloads',
      ].sort(),
    )
    for (const r of customerRoutes) {
      // A route that answers with no body at all (Sign Out: 204) sends no record, so it names no view.
      if (success(r).every((s) => s['type'] === 'null')) {
        expect(r.projection, r.operationId).toBeUndefined()
        continue
      }
      const view = r.projection ? CUSTOMER_VIEWS.get(r.projection.name) : undefined
      expect(view, r.operationId).toBeDefined()
      if (!view) continue
      expect(r.projection?.entity).toBe(view.entity)
      const shapes = [
        view.schema,
        ...Object.keys((success(r)[0]?.['properties'] ?? {}) as object).map((k) => listOf(k, view)),
      ]
      for (const s of success(r)) expect(shapes, r.operationId).toContainEqual(s)
    }
  })

  it('[HH-ARC-04] a view copies only its allow-listed fields; anything else on the record stays on the server', () => {
    const record = {
      id: 'photo-1',
      state: 'ready',
      contentType: 'image/png',
      byteSize: 10,
      rejectionReason: null,
      url: 'https://storage.example.test/signed',
      objectKey: 'requests/photos/photo-1',
      visibility: 'internal_operational',
    }
    expect(CUSTOMER_PHOTO.project(record)).toEqual({
      id: 'photo-1',
      state: 'ready',
      contentType: 'image/png',
      byteSize: 10,
      rejectionReason: null,
      url: 'https://storage.example.test/signed',
    })
    const glance = PROJECT_GLANCE.project({
      reference: 'HH-0000TEST',
      submittedAt: new Date('2026-10-21T12:00:00Z'),
      requestState: 'new',
      services: ['Drywall'],
      notSure: false,
    })
    expect(glance).toEqual({
      reference: 'HH-0000TEST',
      submittedAt: '2026-10-21T12:00:00.000Z',
      requestState: 'new',
      services: ['Drywall'],
      notSure: false,
    })
    expect(PROJECT_GLANCE.schema).toMatchObject({ additionalProperties: false, required: Object.keys(glance) })
  })

  it('[HH-ARC-04][HH-DATA-07] a customer view cannot list an internal field', () => {
    for (const field of ['internalNote', 'costCents', 'marginCents', 'accessCode', 'objectKey', 'responsibleStaff'])
      expect(() => customerView('bad', 'Project', { [field]: { type: 'string' } }, () => ({ [field]: '' }))).toThrow(
        ProjectionError,
      )
    for (const field of ['reference', 'submittedAt', 'services', 'url', 'contentType'])
      expect(forbiddenForCustomer(field), field).toBe(false)
  })

  it('[TSK-0038][HH-ARC-04][HH-PORT-03] the Overview and projects views copy only their allow-listed fields, nested ones too', () => {
    const at = new Date('2026-10-21T12:00:00Z')
    const status = { situation: 'site_visit', step: 'visit_windows_pending', waitingOn: 'handyhub', nextAction: 'none' }
    const record = {
      reference: 'HH-0000TEST',
      services: ['Drywall'],
      notSure: false,
      submittedAt: at,
      status: { ...status, since: at, text: 'We need to see the wall.', internalNote: 'staff only' },
      timeline: [{ kind: 'site_visit', at, text: 'We need to see the wall.', decidedBy: 'staff-1', internalNote: 'x' }],
      appointment: null,
      payment: { state: 'none', marginCents: 1 },
      refreshedAt: at,
      refreshSeconds: 30,
      responsibleStaff: 'staff-1',
    } as unknown as Parameters<typeof PROJECT_OVERVIEW.project>[0]
    expect(PROJECT_OVERVIEW.project(record)).toEqual({
      reference: 'HH-0000TEST',
      services: ['Drywall'],
      notSure: false,
      submittedAt: '2026-10-21T12:00:00.000Z',
      status: { ...status, since: '2026-10-21T12:00:00.000Z', text: 'We need to see the wall.' },
      timeline: [{ kind: 'site_visit', at: '2026-10-21T12:00:00.000Z', text: 'We need to see the wall.' }],
      appointment: null,
      payment: { state: 'none' },
      refreshedAt: '2026-10-21T12:00:00.000Z',
      refreshSeconds: 30,
    })
    const list = PROJECT_LIST.project({
      projects: [{ ...record, status: { ...status, since: at } }],
      refreshedAt: at,
      refreshSeconds: 30,
    } as unknown as Parameters<typeof PROJECT_LIST.project>[0])
    expect(list).toEqual({
      projects: [
        {
          reference: 'HH-0000TEST',
          services: ['Drywall'],
          notSure: false,
          submittedAt: '2026-10-21T12:00:00.000Z',
          status: { ...status, since: '2026-10-21T12:00:00.000Z' },
        },
      ],
      refreshedAt: '2026-10-21T12:00:00.000Z',
      refreshSeconds: 30,
    })
    for (const schema of [PROJECT_OVERVIEW.schema, PROJECT_LIST.schema])
      expect(fieldNames(schema).filter(forbiddenForCustomer)).toEqual([])
  })

  it('[TSK-0039][HH-PORT-09][HH-ARC-04][TSK-0050][HH-PORT-08] the tab views send only their state codes or counts, never a record field', () => {
    const at = new Date('2026-10-21T12:00:00Z')
    const head = { reference: 'HH-0000TEST', refreshedAt: at, refreshSeconds: 30 }
    const out = { reference: 'HH-0000TEST', refreshedAt: '2026-10-21T12:00:00.000Z', refreshSeconds: 30 }
    const extra = { internalNote: 'staff only', objectKey: 'requests/photos/x', id: 'photo-1' }
    // TSK-0050: the Messages tab lists the conversation: who, how, when and the text, nothing else of the record.
    const message = {
      from: 'handyhub' as const,
      channel: 'email' as const,
      at,
      text: 'Synthetic reply text.',
      textState: 'shown' as const,
      attachments: 0,
      authorStaffId: 'staff-1',
      staffName: 'Synthetic Staff',
      toAddresses: ['someone@example.test'],
      deliveryId: 'delivery-1',
    }
    expect(PROJECT_MESSAGES.project({ ...head, ...extra, messages: [message] } as never)).toEqual({
      ...out,
      messages: [
        {
          from: 'handyhub',
          channel: 'email',
          at: '2026-10-21T12:00:00.000Z',
          text: 'Synthetic reply text.',
          textState: 'shown',
          attachments: 0,
        },
      ],
    })
    for (const view of [PROJECT_DOCUMENTS, PROJECT_APPOINTMENTS, PROJECT_PAYMENTS])
      expect(view.project({ ...head, ...extra, state: 'none' })).toEqual({ ...out, state: 'none' })
    expect(
      PROJECT_PHOTOS.project({
        ...head,
        ...extra,
        photos: { received: 2, processing: 1, failed: 0, ids: ['photo-1'] } as never,
      }),
    ).toEqual({ ...out, photos: { received: 2, processing: 1, failed: 0 } })
    // The states are closed sets: a tab cannot answer "paid", "read" or a list it does not have yet.
    expect(PROJECT_MESSAGES.schema).toMatchObject({
      additionalProperties: false,
      properties: {
        messages: {
          items: {
            additionalProperties: false,
            required: ['from', 'channel', 'at', 'text', 'textState', 'attachments'],
            properties: { from: { enum: ['you', 'handyhub'] } },
          },
        },
      },
    })
    expect(fieldNames(PROJECT_MESSAGES.schema).filter(forbiddenForCustomer)).toEqual([])
    expect(PROJECT_PAYMENTS.schema).toMatchObject({
      additionalProperties: false,
      properties: { state: { enum: ['none'] } },
    })
    // TSK-0063 (HH-LEAD-07, HH-SCH-11): Appointments also answers "listed" with the offered windows and the confirmed
    // visits; "none" is still the state alone.
    expect(PROJECT_APPOINTMENTS.schema).toMatchObject({
      additionalProperties: false,
      required: ['reference', 'refreshedAt', 'refreshSeconds', 'state'],
      properties: { state: { enum: ['none', 'listed'] } },
    })
    // TSK-0056 (HH-PORT-10): Documents also answers "listed" with the estimate versions the customer received; "none"
    // is still the state alone.
    expect(PROJECT_DOCUMENTS.schema).toMatchObject({
      additionalProperties: false,
      required: ['reference', 'refreshedAt', 'refreshSeconds', 'state'],
      properties: { state: { enum: ['none', 'listed'] } },
    })
    expect(PROJECT_PHOTOS.schema).toMatchObject({
      properties: { photos: { additionalProperties: false, required: ['received', 'processing', 'failed'] } },
    })
  })

  it('[TSK-0063][HH-LEAD-07][HH-SCH-11][HH-ARC-04] the Appointments view sends windows and confirmed visits, never a hold, worker or ID', () => {
    const at = new Date('2026-10-21T12:00:00Z')
    const w = {
      localDate: '2026-11-04',
      start: '09:00',
      end: '10:00',
      timeZone: 'America/Kentucky/Louisville',
      startsAt: '2026-11-04T14:00:00.000Z',
      endsAt: '2026-11-04T15:00:00.000Z',
    }
    const out = PROJECT_APPOINTMENTS.project({
      reference: 'HH-0000TEST',
      refreshedAt: at,
      refreshSeconds: 30,
      state: 'listed',
      offers: [
        {
          number: 1,
          purpose: 'estimate_visit',
          status: 'open',
          offeredAt: at,
          expiresAt: at,
          windows: [{ position: 1, ...w, holdId: 'hold-1', workerId: 'staff-1' } as never],
          offerId: 'offer-1',
        } as never,
      ],
      appointments: [
        {
          purpose: 'estimate_visit',
          status: 'confirmed',
          window: { ...w, reservationId: 'r-1' } as never,
          address: {
            street: '1 Synthetic Way',
            unit: null,
            city: 'Testville',
            state: 'KY',
            zip: '40000',
            gateCode: 'x',
          },
          preparationInstructions: null,
          number: 1,
          request: { kind: 'reschedule', status: 'awaiting_confirmation', requestId: 'req-1' },
          actions: { requestReschedule: false, requestCancellation: false },
          visitId: 'visit-1',
          workers: ['staff-1'],
        } as never,
      ],
      internalNote: 'staff only',
    } as never)
    const raw = JSON.stringify(out)
    for (const leak of ['hold-1', 'staff-1', 'offer-1', 'visit-1', 'r-1', 'req-1', 'gateCode', 'staff only'])
      expect(raw).not.toContain(leak)
    expect(out).toMatchObject({
      state: 'listed',
      offers: [{ number: 1, windows: [{ position: 1, start: '09:00' }] }],
      appointments: [
        {
          number: 1,
          address: { street: '1 Synthetic Way' },
          window: { start: '09:00' },
          request: { kind: 'reschedule', status: 'awaiting_confirmation' },
          actions: { requestReschedule: false, requestCancellation: false },
        },
      ],
    })
  })
})
