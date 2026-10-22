// The workspace tabs beside the Overview, read from the shared records (TSK-0039; HH-PORT-09, HH-PORT-01, HH-ARC-04,
// OWN-DEC-106, RULE-SERVER-AUTHZ). Every read goes through the caller's scope (TSK-0037): a project outside it is null,
// answered NOT_FOUND like a missing one. What each tab may say today (records/projections.ts):
// - Messages (TSK-0050): the project's customer conversation: the customer's email and texts that are on the project
//   and come from one of the customer's own contacts (a message staff linked from another sender is never shown to
//   the customer), and HandyHub's replies, at once when staff press Send (their email or text may still wait for the
//   contact hours). Never an internal message, a staff name, an address or a delivery detail. TSK-0051: the customer
//   writes in it from the portal too (channel 'portal').
// - Documents: the estimate versions the customer received, each with its status (TSK-0056, HH-PORT-10); "none" while
//   there is none. Payments: no payment record exists yet, so none is shown. Appointments (TSK-0063): the offered
//   windows the customer can choose from and the confirmed visits (visits/offers.ts appointmentsOf); "none" while
//   there is neither.
// - Photos: the counts of the customer's uploads by state (the same counts the receipt shows); TSK-0076 (HH-PORT-11):
//   the uploads themselves and the before and after photos staff shared, paired where possible, each ready one with a
//   short-lived signed URL (field-photos/photos.ts customerPhotos). Internal and restricted photos are never read.
import type { Db, Tx } from '@handyhub/db'
import type { DataScope } from '@handyhub/policy'
import { customerEstimateList, type CustomerEstimateListItem } from '../estimates/customer.js'
import type { ObjectStorage } from '../../providers/index.js'
import { customerPhotos, type CustomerUpload, type SharedGroup } from '../field-photos/photos.js'
import { PHOTO_URL_SECONDS } from '../photos/photos.js'
import { findProject, type ConversationMessageRecord, type PhotoCounts } from '../records/index.js'
import { appointmentsOf, type CustomerAppointment, type CustomerOffer } from '../visits/offers.js'
import { refreshSeconds } from './overview.js'

type Reader = Db | Tx

export const WORKSPACE_TABS = ['messages', 'documents', 'photos', 'appointments', 'payments'] as const
export type WorkspaceTab = (typeof WORKSPACE_TABS)[number]

type Head = { reference: string; refreshedAt: Date; refreshSeconds: number }
export type TabAnswer =
  | (Head & { tab: 'messages'; messages: ConversationMessageRecord[] })
  | (Head & { tab: 'documents'; state: 'none' })
  | (Head & { tab: 'documents'; state: 'listed'; estimates: CustomerEstimateListItem[] })
  | (Head & { tab: 'appointments' | 'payments'; state: 'none' })
  | (Head & { tab: 'appointments'; state: 'listed'; offers: CustomerOffer[]; appointments: CustomerAppointment[] })
  | (Head & {
      tab: 'photos'
      photos: PhotoCounts
      yours: CustomerUpload[]
      shared: SharedGroup[]
      linkSeconds: number
    })

/** PROPOSED: the most messages one read lists (the newest ones, shown oldest first). */
export const CONVERSATION_LIMIT = 500

/** The project's customer conversation as the customer sees it (the project is already in the caller's scope). */
async function conversation(db: Reader, projectId: string): Promise<ConversationMessageRecord[]> {
  const rows = await db
    .selectFrom('comms.messages as m')
    .innerJoin('comms.conversations as cv', 'cv.id', 'm.conversation_id')
    .select(['m.direction', 'm.channel', 'm.received_at', 'm.body_text', 'm.body_state', 'm.attachments', 'm.seq'])
    .where('cv.project_id', '=', projectId)
    .where('cv.audience', '=', 'customer')
    .where('m.project_id', '=', projectId)
    .where((eb) =>
      eb.or([
        eb('m.direction', '=', 'outbound'),
        eb.and([
          eb('m.direction', '=', 'inbound'),
          eb('m.link_state', 'in', ['matched', 'linked']),
          eb('m.contact_id', 'is not', null),
        ]),
      ]),
    )
    .orderBy('m.received_at', 'desc')
    .orderBy('m.seq', 'desc')
    .limit(CONVERSATION_LIMIT)
    .execute()
  return rows.reverse().map((m) => {
    const readable = m.body_state === 'received' || m.body_state === 'html_converted'
    const text = readable && m.body_text !== null && m.body_text.trim() !== '' ? m.body_text : null
    return {
      from: m.direction === 'outbound' ? 'handyhub' : 'you',
      channel: m.channel === 'sms' ? 'sms' : m.channel === 'portal' ? 'portal' : 'email',
      at: m.received_at,
      text,
      textState: text !== null ? 'shown' : readable || m.body_state === 'empty' ? 'empty' : 'not_available',
      attachments: Array.isArray(m.attachments) ? m.attachments.length : 0,
    }
  })
}

/** One tab of a project in the caller's scope; null for any other or unknown project. */
export async function projectTab(
  db: Reader,
  scope: DataScope,
  reference: string,
  tab: WorkspaceTab,
  now = new Date(),
  storage: ObjectStorage | null = null,
): Promise<TabAnswer | null> {
  const project = await findProject(db, scope, { reference })
  if (!project) return null
  const head: Head = { reference: project.reference, refreshedAt: now, refreshSeconds: await refreshSeconds(db) }
  switch (tab) {
    case 'messages':
      return { ...head, tab, messages: await conversation(db, project.id) }
    case 'photos': {
      const p = await customerPhotos(db, project.id, storage)
      return { ...head, tab, photos: p.counts, yours: p.yours, shared: p.shared, linkSeconds: PHOTO_URL_SECONDS }
    }
    case 'documents': {
      const estimates = (await customerEstimateList(db, scope, project.reference, now)) ?? []
      return estimates.length ? { ...head, tab, state: 'listed', estimates } : { ...head, tab, state: 'none' }
    }
    case 'appointments': {
      const a = await appointmentsOf(db, project.id, now)
      return a.offers.length || a.appointments.length
        ? { ...head, tab, state: 'listed', ...a }
        : { ...head, tab, state: 'none' }
    }
    default:
      return { ...head, tab, state: 'none' }
  }
}
