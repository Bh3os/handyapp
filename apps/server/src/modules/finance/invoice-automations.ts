// The automations of invoicing (TSK-0085; HH-FIN-04, HH-FIN-05, HH-AUTO-01, FACT-AUTOMATIC-MESSAGES #16 and #18,
// OWN-DEC-110, OWN-DEC-152, OWN-DEC-158, OWN-DEC-209, INT-R2, INT-Resend, INT-Bird):
// - invoice.prepare_draft: the approval's committed event prepares the job's final invoice draft from the approved
//   scope (OWN-DEC-110 "prepare the invoice draft automatically"); a scope that cannot be billed as it stands leaves
//   no draft (staff see why when they prepare it), and an existing draft is brought up to date.
// - invoice_document.issue: an issued invoice's English PDF is rendered from the issued record and stored once in
//   private object storage with its SHA-256; storage that is NOT CONFIGURED or failing retries and, at the last
//   attempt, is a failed job the Office owns in System health. The invoice itself is never undone.
// - notify.invoice.ready (final invoice) and notify.invoice.deposit (deposit invoice): the automatic customer notice,
//   once per invoice and destination, in the owner's wording (invoice_ready, deposit_invoice): the first name, the
//   invoice number, the job number and the link to the project's Documents tab. No amount, no address, no private
//   detail (OWN-DEC-158); the invoice and its balance are read inside verified project access. The current state is
//   rechecked at send time: an invoice no longer issued (voided) sends nothing.
import { createHash, randomUUID } from 'node:crypto'
import type { Tx } from '@handyhub/db'
import { ApiError } from '../../api/errors.js'
import type { Automation } from '../../platform/automation.js'
import type { ObjectStorage } from '../../providers/index.js'
import { ESTIMATE_APPROVED_EVENT } from '../estimates/approval.js'
import {
  firstNameOf,
  jobNumberOf,
  notificationAutomation,
  portalLink,
  type Destination,
  type NotificationProviders,
} from '../notifications/index.js'
import { invoicePdfInput, INVOICE_PDF_RENDERER, renderInvoicePdf } from './invoice-pdf.js'
import { DEPOSIT_INVOICE_ISSUED_EVENT, INVOICE_ISSUED_EVENT, prepareDraft } from './invoices.js'

export const INVOICE_READY_MESSAGE_KEY = 'invoice.ready'
export const DEPOSIT_INVOICE_MESSAGE_KEY = 'invoice.deposit'
const PDF_TYPE = 'application/pdf'
const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')

export class InvoiceDocumentError extends Error {
  override name = 'InvoiceDocumentError'
}

/** Prepares the final invoice draft of each approved job. */
export function invoiceDraftAutomation(): Automation {
  return {
    name: 'invoice.prepare_draft',
    trigger: { kind: 'event', eventTypes: [ESTIMATE_APPROVED_EVENT] },
    identity: 'system.invoicing',
    inputs: {
      description: 'the approval id of the estimate.approved event; its job and the job scope snapshot',
      version: 1,
    },
    idempotency: 'one final invoice per job (unique index); an up-to-date draft is left as it is',
    effect: 'prepares the job final invoice draft from the approved scope and recorded deposit credits',
    retry: { maxAttempts: 5, baseDelayMs: 1_000, maxDelayMs: 60_000 },
    timeoutMs: 15_000,
    exceptionOwner: 'office',
    audit: { action: 'invoice.draft_prepared' },
    handle: async ({ tx, job }) => {
      const approvalId = job.target.id
      if (!approvalId) return 'cancelled'
      const j = await tx.selectFrom('work.jobs').select('id').where('approval_id', '=', approvalId).executeTakeFirst()
      if (!j) return 'cancelled'
      try {
        const out = await prepareDraft(tx, { jobId: j.id, kind: 'final', preparedBy: null })
        return out.outcome === 'unchanged' ? 'cancelled' : 'done'
      } catch (err) {
        // Refused before anything was written (already issued, or a scope that cannot be billed as it stands).
        if (err instanceof ApiError) return 'cancelled'
        throw err
      }
    },
  }
}

/** Renders and stores the PDF of an issued invoice once; 'exists' when it is stored already. */
export async function issueInvoiceDocument(
  tx: Tx,
  storage: ObjectStorage | null,
  invoiceId: string,
): Promise<'issued' | 'exists' | null> {
  const i = await tx
    .selectFrom('finance.invoices')
    .select(['id', 'project_id', 'test_mark'])
    .where('id', '=', invoiceId)
    .forShare()
    .executeTakeFirst()
  if (!i) return null
  const existing = await tx
    .selectFrom('finance.invoice_documents')
    .select('id')
    .where('invoice_id', '=', invoiceId)
    .executeTakeFirst()
  if (existing) return 'exists'
  const input = await invoicePdfInput(tx, invoiceId)
  if (!input) return null
  if (!storage) throw new InvoiceDocumentError('storage_not_configured')
  const bytes = await renderInvoicePdf(input)
  const key = `invoices/${randomUUID()}`
  await storage.put(key, bytes, PDF_TYPE)
  const row = await tx
    .insertInto('finance.invoice_documents')
    .values({
      invoice_id: i.id,
      project_id: i.project_id,
      object_key: key,
      content_type: PDF_TYPE,
      byte_size: bytes.length,
      sha256: sha256(bytes),
      test_mark: i.test_mark,
      renderer_version: INVOICE_PDF_RENDERER,
    })
    .onConflict((oc) => oc.column('invoice_id').doNothing())
    .returning('id')
    .executeTakeFirst()
  return row ? 'issued' : 'exists'
}

/** Stores the PDF of each issued invoice (final or deposit). */
export function invoiceDocumentAutomation(storage: ObjectStorage | null): Automation {
  return {
    name: 'invoice_document.issue',
    trigger: { kind: 'event', eventTypes: [INVOICE_ISSUED_EVENT, DEPOSIT_INVOICE_ISSUED_EVENT] },
    identity: 'system.documents',
    inputs: { description: 'the invoice id of the invoice.issued or invoice.deposit_issued event', version: 1 },
    idempotency: 'one stored PDF per invoice (unique invoice_id); an invoice with its PDF is left as it is',
    effect: 'renders the issued invoice PDF, stores it once in private object storage and records its SHA-256',
    retry: { maxAttempts: 5, baseDelayMs: 5_000, maxDelayMs: 300_000 },
    timeoutMs: 60_000,
    exceptionOwner: 'office',
    audit: { action: 'invoice_document.issued' },
    handle: async ({ tx, job }) => {
      const id = job.target.id
      if (!id) return 'cancelled'
      return (await issueInvoiceDocument(tx, storage, id)) === 'issued' ? 'done' : 'cancelled'
    },
  }
}

type NoticeDeps = {
  providers: NotificationProviders
  /** The public site's base URL for the portal links; undefined while not configured (no link is made up). */
  publicSiteUrl?: string | undefined
}

function invoiceNotice(messageKey: string, kind: 'final' | 'deposit', deps: NoticeDeps): Automation {
  return notificationAutomation({
    messageKey,
    providers: deps.providers,
    resolve: async ({ tx, job }) => {
      const id = job.target.id
      if (!id) return 'stale'
      const i = await tx
        .selectFrom('finance.invoices as i')
        .innerJoin('crm.projects as p', 'p.id', 'i.project_id')
        .innerJoin('intake.requests as r', 'r.project_id', 'i.project_id')
        .innerJoin('crm.contacts as c', 'c.id', 'r.contact_id')
        .select([
          'i.id',
          'i.kind',
          'i.state',
          'i.number',
          'i.project_id',
          'p.reference as project_reference',
          'r.reference',
          'r.responsible_staff_id',
          'c.id as contactId',
          'c.full_name',
          'c.email',
          'c.phone_e164',
          'c.preferred_channel',
        ])
        .where('i.id', '=', id)
        .executeTakeFirst()
      // Rechecked at send time: only an issued invoice of this kind (paid or partly paid still counts as issued).
      if (!i || i.kind !== kind || !i.number || i.state === 'draft' || i.state === 'voided') return 'stale'
      const destinations: Destination[] = []
      if (i.email)
        destinations.push({
          channel: 'email',
          destination: i.email,
          permission: i.preferred_channel === 'email' ? 'preferred' : 'permitted',
        })
      if (i.phone_e164)
        destinations.push({
          channel: 'sms',
          destination: i.phone_e164,
          permission: i.preferred_channel === 'text' ? 'preferred' : 'permitted',
        })
      const invoiceLink = portalLink(deps.publicSiteUrl, i.project_reference, 'documents')
      const projectLink = portalLink(deps.publicSiteUrl, i.project_reference)
      return {
        subjectKey: `invoice:${i.id}`,
        record: { type: 'invoice', id: i.id },
        recipients: [{ kind: 'customer_contact', id: i.contactId, destinations }],
        values: {
          customerName: firstNameOf(i.full_name),
          invoiceNumber: i.number,
          ...(kind === 'deposit' ? { jobNumber: jobNumberOf(i.project_reference) } : {}),
          ...(invoiceLink ? { invoiceLink } : {}),
          ...(kind === 'final' && projectLink ? { projectLink } : {}),
        },
        failureItem: { reference: i.reference, projectId: i.project_id, assignedStaffId: i.responsible_staff_id },
        projectId: i.project_id,
      }
    },
  })
}

/** "Your HandyHub invoice is ready" (FACT-AUTOMATIC-MESSAGES #18): once per issued final invoice. */
export const invoiceReadyAutomation = (deps: NoticeDeps) => invoiceNotice(INVOICE_READY_MESSAGE_KEY, 'final', deps)
/** The deposit invoice message (FACT-AUTOMATIC-MESSAGES #16, OWN-DEC-152): once per issued deposit invoice. */
export const depositInvoiceAutomation = (deps: NoticeDeps) =>
  invoiceNotice(DEPOSIT_INVOICE_MESSAGE_KEY, 'deposit', deps)
