// Public legal document versions (TSK-0024; ENT-PolicyVersion, HH-PRIV-04, HH-INT-19, OWN-DEC-72). The versions are
// rows of platform.policy_version under the legal.* keys (migration 0021). A request saves the privacy policy version
// the page presented; only a version that exists (current or superseded) can be saved, so a record never names a
// document that was never published.
import type { Db, Tx } from '@handyhub/db'
import type { EstimateTermsOwnerSignOff, LegalConfigKey } from '@handyhub/domain/legal'
import { parseValue } from '../../platform/config/keys.js'

export type LegalVersion = {
  key: LegalConfigKey
  version: number
  documentId: string
  status: string
  active: boolean
  /** TSK-0056: whether an attorney reviewed the version, and the SHA-256 of the exact wording it records. */
  attorneyReviewed: boolean
  contentSha256: string
  /** TSK-0144: the owner's sign-off recorded on an estimate terms version (OWN-DEC-187); null for every other one. */
  ownerSignOff: EstimateTermsOwnerSignOff | null
  /** When the version became the active one (its effective time). */
  effectiveFrom: Date
}

/** Every published version of a legal document, newest first. */
export async function legalVersions(db: Db | Tx, key: LegalConfigKey): Promise<LegalVersion[]> {
  const rows = await db
    .selectFrom('platform.policy_version')
    .select(['version', 'value', 'status', 'effective_from'])
    .where('key', '=', key)
    .where('state', '=', 'configured')
    .orderBy('version', 'desc')
    .execute()
  return rows.map((r) => {
    const value = parseValue(key, r.value)
    return {
      key,
      version: r.version,
      documentId: value.documentId,
      status: value.status,
      active: r.status === 'active',
      attorneyReviewed: value.attorneyReviewed,
      contentSha256: value.contentSha256,
      ownerSignOff: 'ownerSignOff' in value && value.ownerSignOff ? value.ownerSignOff : null,
      effectiveFrom: r.effective_from,
    }
  })
}

/** True when `documentId` names a published version of the document. */
export async function isLegalVersion(db: Db | Tx, key: LegalConfigKey, documentId: string): Promise<boolean> {
  return (await legalVersions(db, key)).some((v) => v.documentId === documentId)
}
