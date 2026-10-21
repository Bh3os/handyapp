// The inbound webhook settings of the first e2e server (TSK-0049) and a signer for synthetic deliveries. The secrets
// are synthetic and built at runtime, so no literal looks like a credential (RULE-SYNTHETIC-DATA). The signature
// mirrors signWebhook of apps/server/src/providers/webhooks.ts (Standard Webhooks: HMAC-SHA-256 over
// "<id>.<timestamp>.<raw body>", keyed with the base64 secret after its whsec_ prefix); a drift fails the inbox e2e.
import { createHmac, randomUUID } from 'node:crypto'

const secret = (label: string) =>
  [
    'whsec',
    Buffer.from(['e2e', 'synthetic', label, 'signing', 'key', 'not', 'secret'].join('-')).toString('base64'),
  ].join('_')
export const E2E_BIRD_WEBHOOK_SECRET = secret('bird')
export const E2E_RESEND_WEBHOOK_SECRET = secret('resend')
export const E2E_INBOUND_EMAIL_ADDRESS = 'replies@inbound.example.test'

/** Headers and raw body of one signed delivery. */
export function signedDelivery(webhookSecret: string, body: object): { headers: Record<string, string>; data: string } {
  const data = JSON.stringify(body)
  const id = `msg_e2e_${randomUUID()}`
  const ts = Math.floor(Date.now() / 1000)
  const key = Buffer.from(webhookSecret.slice('whsec_'.length), 'base64')
  const mac = createHmac('sha256', key).update(`${id}.${ts}.`).update(data).digest('base64')
  return {
    headers: {
      'content-type': 'application/json',
      'webhook-id': id,
      'webhook-timestamp': String(ts),
      'webhook-signature': `v1,${mac}`,
    },
    data,
  }
}
