// Public site module (TSK-0020; HH-CUS-05, HH-CUS-07, FACT-PUBLIC-CONTACT, FACT-PAYMENT-METHODS). The public site is a
// static build; the facts it shows that live in configuration (RULE-DECIDED-VALUES-ACTIVE) are read here at run time:
// the brand, the public contact details and the accepted payment methods.
//
// - The public phone and email are NOT CONFIGURED today (OWN-DEC-131): the response says so and carries no value, so
//   the site can show a labelled placeholder and never a working link (OWN-DEC-47).
// - Only the payment method codes are returned. The surcharge flag of payment.methods is never sent: no text on the
//   site mentions a surcharge (FACT-NO-SURCHARGE), and the configuration refuses any value but false anyway.
// - The payment instructions (Zelle, Cash App, Chime, check payee) are placeholders (FACT-PAYMENT-INSTRUCTIONS) and are
//   not part of this read: the homepage lists methods, never payment destinations.
import type { ApiModule, RouteDef } from '../../api/route.js'
import { loadConfig } from '../../platform/config/index.js'

const siteFacts: RouteDef = {
  method: 'GET',
  path: '/public/site',
  operationId: 'getPublicSiteFacts',
  summary: 'Public site facts',
  description:
    'Public read of the configured facts the public site shows: the brand (business.name, FACT-BRAND-IDENTITY), the ' +
    'public phone and email (business.public_contact, FACT-PUBLIC-CONTACT) and the accepted payment method codes ' +
    '(payment.methods, FACT-PAYMENT-METHODS). A value that is NOT CONFIGURED is null, never a default.',
  actors: ['guest', 'customer'],
  // PROPOSED: the guest-allowed action the other public reads use; the role matrix has no separate "view the site" row.
  permission: 'request.submit',
  kind: 'read',
  idempotency: 'none',
  expectedVersion: 'none',
  rateLimit: 'none',
  audit: 'none',
  pagination: false,
  test: 'test/integration/site.test.ts',
  schema: {
    response: {
      200: {
        type: 'object',
        additionalProperties: false,
        required: ['brand', 'contact', 'paymentMethods'],
        properties: {
          brand: { type: ['string', 'null'] },
          contact: {
            type: 'object',
            additionalProperties: false,
            required: ['configured', 'phone', 'email'],
            properties: {
              configured: { type: 'boolean' },
              phone: { type: ['string', 'null'] },
              email: { type: ['string', 'null'] },
            },
          },
          paymentMethods: { type: ['array', 'null'], items: { type: 'string' } },
        },
      },
    },
  },
  handler: async (ctx) => {
    const config = await loadConfig(ctx.db)
    const name = config.get('business.name')
    const contact = config.get('business.public_contact')
    const methods = config.get('payment.methods')
    return {
      body: {
        brand: name.state === 'CONFIGURED' ? name.value.brand : null,
        contact:
          contact.state === 'CONFIGURED'
            ? { configured: true, phone: contact.value.phone, email: contact.value.email }
            : { configured: false, phone: null, email: null },
        paymentMethods: methods.state === 'CONFIGURED' ? [...methods.value.methods] : null,
      },
      headers: { 'cache-control': 'no-cache' },
    }
  },
}

export const SITE_MODULE: ApiModule = { name: 'site', routes: [siteFacts] }
