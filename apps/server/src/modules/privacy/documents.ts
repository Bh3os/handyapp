// Customer downloads of retained, customer-visible documents (TSK-0100; HH-PRIV-06, HH-SEC-05, HH-PORT-10, T68,
// ENT-Document, OWN-DEC-113). For one estimate version the customer received (current, approved, declined, expired,
// superseded or withdrawn), read inside the caller's scope: another project, another project's estimate number, a
// draft and an erased estimate are the same null (NOT_FOUND). The links are signed, short-lived (DOCUMENT_URL_SECONDS)
// and issued only now, after the record and visibility checks: the customer PDF as published, and for an uploaded
// estimate the customer document it was confirmed for (visibility customer, ready). A private original (a Word file in
// particular) and any internal document never appear. Approval receipts, change orders, invoices, receipts and care
// notes come with their own tasks; the terms are shown in full on their own page.
import type { Db, Tx } from '@handyhub/db'
import type { DataScope } from '@handyhub/policy'
import { DOCUMENT_URL_SECONDS } from '../estimates/projections.js'
import { customerVersionRow } from '../estimates/responses.js'
import type { DownloadRecord } from '../records/index.js'
import type { ObjectStorage } from '../../providers/index.js'

type Reader = Db | Tx

export async function versionDownloads(
  db: Reader,
  scope: DataScope,
  ref: { reference: string; number: string; version: number },
  storage: ObjectStorage | null,
  now = new Date(),
): Promise<
  { reference: string; number: string; version: number; documents: DownloadRecord[] } | 'not_configured' | null
> {
  const v = await customerVersionRow(db, scope, ref)
  if (!v) return null
  if (!storage) return 'not_configured'
  const row = await db
    .selectFrom('estimating.estimate_versions')
    .select(['customer_pdf_object_key', 'customer_pdf_byte_size', 'authoring_method', 'agreement_document_id'])
    .where('id', '=', v.id)
    .executeTakeFirstOrThrow()
  const expiresAt = new Date(now.getTime() + DOCUMENT_URL_SECONDS * 1000)
  const documents: DownloadRecord[] = []
  if (row.customer_pdf_object_key && row.customer_pdf_byte_size)
    documents.push({
      kind: 'estimate_pdf',
      contentType: 'application/pdf',
      byteSize: row.customer_pdf_byte_size,
      url: await storage.signedGetUrl(row.customer_pdf_object_key, { expiresInSeconds: DOCUMENT_URL_SECONDS }),
      expiresAt,
    })
  if (row.authoring_method === 'uploaded' && row.agreement_document_id) {
    const doc = await db
      .selectFrom('estimating.estimate_documents')
      .select(['object_key', 'byte_size', 'content_type'])
      .where('id', '=', row.agreement_document_id)
      .where('version_id', '=', v.id)
      .where('role', '=', 'customer_pdf')
      .where('visibility', '=', 'customer')
      .where('state', '=', 'ready')
      .executeTakeFirst()
    if (doc)
      documents.push({
        kind: 'estimate_document',
        contentType: doc.content_type,
        byteSize: doc.byte_size,
        url: await storage.signedGetUrl(doc.object_key, { expiresInSeconds: DOCUMENT_URL_SECONDS }),
        expiresAt,
      })
  }
  return { reference: v.reference, number: v.number, version: v.version, documents }
}
