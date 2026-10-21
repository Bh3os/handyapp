// Estimates module (TSK-0052; HH-DATA-02, HH-EST-02, HH-EST-03, HH-BASE-02): the estimate model with server-side
// totals and the customer and staff projections. TSK-0053 (HH-EST-01, HH-EST-05) adds the staff builder's routes
// (routes.ts) and the publish readiness check (readiness.ts) that publishing (TSK-0055) runs. TSK-0054 (HH-EST-11) adds
// Upload an Estimate (documents.ts, document-content.ts, document-routes.ts) and the customer PDF (customer-pdf.ts).
// TSK-0055 (HH-EST-04) adds the lifecycle: publishing under the Owner's publishing policy, revising as a new version,
// withdrawing, expiring and recording a decline, the validity expiry job, the estimate-ready notice and the version
// history (lifecycle.ts, lifecycle-routes.ts, notify.ts). TSK-0056 (HH-EST-09, HH-EST-13) adds the customer view and the
// customer's responses (customer.ts, responses.ts; the routes are the portal module's).
import type { ApiModule } from '../../api/route.js'
import { estimateDocumentRoutes, type EstimateDocumentDeps } from './document-routes.js'
import { lifecycleRoutes } from './lifecycle-routes.js'
import { ESTIMATE_ROUTES } from './routes.js'

export function estimatesModule(deps: EstimateDocumentDeps): ApiModule {
  return {
    name: 'estimates',
    routes: [...ESTIMATE_ROUTES, ...estimateDocumentRoutes(deps), ...lifecycleRoutes(deps)],
  }
}
export { builderView } from './routes.js'
export {
  acceptanceCheck,
  changeVersionState,
  currentVersion,
  ESTIMATE_PUBLISHED_EVENT,
  estimateExpiryAutomation,
  expireIfDue,
  lifecycleView,
  publishingRoles,
  publishVersion,
  reviseVersion,
  STAFF_EVENTS,
  type AcceptanceCheck,
  type LifecycleView,
  type PublishDeps,
  type PublishResult,
  type StaffEvent,
} from './lifecycle.js'
export { estimateReadyAutomation, ESTIMATE_READY_MESSAGE_KEY, type EstimateReadyDeps } from './notify.js'
// TSK-0056: the customer estimate view and the customer's responses (Request Changes, Decline, Request an Update).
export {
  customerEstimateDetail,
  customerEstimateList,
  pinnedTerms,
  type ApprovalReason,
  type CustomerEstimateDetail,
  type CustomerEstimateListItem,
  type TermsState,
} from './customer.js'
export {
  customerVersionRow,
  customerVersionStatus,
  ESTIMATE_CHANGES_REQUESTED_EVENT,
  ESTIMATE_DECLINED_EVENT,
  ESTIMATE_RESPONSE_ITEM,
  estimateResponseNoticeAutomations,
  estimateResponses,
  recordCustomerResponse,
  RESPONSE_KINDS,
  RESPONSE_LIMITS,
  STAFF_NOTICE_OF,
  type CustomerVersionStatus,
  type RecordedResponse,
  type ResponseKind,
  type ResponseNoticeDeps,
} from './responses.js'
export type { EstimateDocumentDeps } from './document-routes.js'
export {
  customerPdfInput,
  customerPdfModel,
  pdfText,
  renderCustomerPdf,
  type CustomerPdfInput,
  type CustomerPdfModel,
  type PdfBlock,
} from './customer-pdf.js'
export {
  DOCUMENT_CHECK_LIMITS,
  DOCUMENT_PROBLEMS,
  documentProblems,
  DOCX_TYPE,
  ESTIMATE_DOCUMENT_TYPES,
  PDF_TYPE,
  sniffDocument,
  type DocumentProblem,
} from './document-content.js'
export {
  currentDocuments,
  DOCUMENT_ROLES,
  DOCUMENT_SOURCES,
  DOCUMENT_STATES,
  DocumentError,
  ESTIMATE_DOCUMENT_UPLOADED_EVENT,
  estimateDocumentProcessAutomation,
  pdfRequired,
  readEstimateDocument,
  setAgreement,
  uploadEstimateDocument,
  type CurrentDocuments,
  type DocumentRole,
  type EstimateDocumentView,
} from './documents.js'
export {
  DOCUMENT_PROBLEM_CODES,
  documentDetails,
  documentReadiness,
  PUBLISH_PROBLEM_CODES,
  PUBLISH_REQUIRED_KEYS,
  publishReadiness,
  readinessOf,
  versionSnapshot,
  type DocumentDetails,
  type DocumentProblemCode,
  type DocumentSnapshot,
  type LineSnapshot,
  type PublishProblem,
  type PublishProblemCode,
  type Readiness,
  type VersionSnapshot,
} from './readiness.js'
export {
  AUTHORING_METHODS,
  createEstimate,
  CUSTOMER_STATES,
  DRAFT_LIMITS,
  EDITABLE_STATES,
  isUuid,
  QUANTITY_SOURCES,
  readinessProblems,
  saveDraft,
  TEXT_LISTS,
  type AuthoringMethod,
  type DraftInput,
  type DraftLineInput,
  type QuantitySource,
  type ReadinessProblem,
  type TextList,
} from './model.js'
export {
  computeVersionTotals,
  discountFor,
  pricingPolicies,
  type DepositState,
  type PricingPolicies,
} from './pricing.js'
export {
  CUSTOMER_VERSION_FIELDS,
  customerEstimateDocument,
  customerEstimateVersion,
  customerVersionContent,
  DOCUMENT_URL_SECONDS,
  staffEstimateVersion,
  type CustomerEstimateLine,
  type CustomerEstimateVersion,
  type CustomerVersionContent,
  type StaffEstimateVersion,
} from './projections.js'
