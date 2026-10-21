// A synthetic staff request view (TSK-0042), shaped like GET /staff/requests/:id. Every name, address and id is
// invented for the tests (RULE-SYNTHETIC-DATA).
import type { RequestDetail } from '../src/Record'

export const REQUEST_ID = '11111111-1111-4111-8111-111111111111'

export function requestDetail(over: Partial<RequestDetail> = {}): RequestDetail {
  return {
    id: REQUEST_ID,
    reference: 'HH-7K2M9Q4D',
    state: 'received',
    version: 1,
    submittedAt: '2026-10-20T15:00:00.000Z',
    privacyNoticeVersion: 'draft-test-1',
    spam: { suspected: false, signals: [] },
    project: { id: '22222222-2222-4222-8222-222222222222', reference: 'HH-7K2M9Q4D', state: 'open' },
    customer: { id: '33333333-3333-4333-8333-333333333333', displayName: 'Synthetic Customer' },
    original: {
      services: [
        { serviceId: 'SVC-DW-01', code: 'DW-01', notes: 'Synthetic service note' },
        { serviceId: 'SVC-PT-01', code: 'PT-01', notes: null },
      ],
      notSure: false,
      otherServicesText: null,
      description: 'Synthetic description of the work.',
      answers: [
        {
          serviceCode: 'DW-01',
          question: 'damage_size',
          label: 'Damage size',
          kind: 'number',
          number: 6,
          unit: 'in',
          text: null,
          approximate: true,
        },
        {
          serviceCode: 'PT-01',
          question: 'colors',
          label: 'Colors',
          kind: 'unknown',
          number: null,
          unit: null,
          text: null,
          approximate: false,
        },
      ],
      property: {
        street: '100 Synthetic Way',
        unit: null,
        city: 'Testville',
        state: 'KY',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { preferredDate: '2026-10-30', flexible: false, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'let_handyhub_decide',
      preferredChannel: 'email',
      smsOptIn: false,
      marketingOptIn: false,
      contact: { fullName: 'Synthetic Customer', email: 'synthetic@example.test', phone: '(502) 555-0101' },
    },
    contactVerification: {
      email: 'verified',
      phone: 'unverified',
      current: { email: 'synthetic@example.test', phone: '+15025550101' },
    },
    coverage: { result: 'out_of_coverage', ruleSet: 1 },
    responsibleStaff: null,
    assignments: [],
    qualification: null,
    missingChecks: [
      'coverage',
      'service_fit',
      'essential_facts',
      'urgency',
      'site_visit_need',
      'staff_equipment',
      'risk_flags',
    ],
    notes: [],
    decisions: [],
    workPackages: [],
    nextStep: 'qualify_and_choose',
    followUpDueAt: null,
    actions: {
      askQuestion: true,
      prepareOnlineEstimate: true,
      arrangeEstimateVisit: true,
      notAFit: true,
      assign: true,
      qualify: true,
      addNote: true,
    },
    serviceCatalog: [
      { id: 'SVC-DW-01', code: 'DW-01' },
      { id: 'SVC-HI-01', code: 'HI-01' },
      { id: 'SVC-PT-01', code: 'PT-01' },
    ],
    ...over,
  }
}
