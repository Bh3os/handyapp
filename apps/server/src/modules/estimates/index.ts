// Estimates module (TSK-0052; HH-DATA-02, HH-EST-02, HH-EST-03, HH-BASE-02): the estimate model with server-side
// totals and the customer and staff projections. TSK-0053 (HH-EST-01, HH-EST-05) adds the staff builder's routes
// (routes.ts) and the publish readiness check (readiness.ts) that publishing (TSK-0055) runs. TSK-0054 (HH-EST-11) adds
// Upload an Estimate (documents.ts, document-content.ts, document-routes.ts) and the customer PDF (customer-pdf.ts).
// The lifecycle and publishing (TSK-0055) and the customer view (TSK-0056) build on these functions.
import type { ApiModule } from '../../api/route.js'
import { estimateDocumentRoutes, type EstimateDocumentDeps } from './document-routes.js'
import { ESTIMATE_ROUTES } from './routes.js'

export function estimatesModule(deps: EstimateDocumentDeps): ApiModule {
  return { name: 'estimates', routes: [...ESTIMATE_ROUTES, ...estimateDocumentRoutes(deps)] }
}
export { builderView } from './routes.js'
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
