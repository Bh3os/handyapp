// The append-only audit log against PostgreSQL 16 (TSK-0011; HH-SEC-06, RULE-SERVER-AUTHZ, OWN-DEC-123).
import { Writable } from 'node:stream'
import { withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { audit, AuditError } from '../../src/platform/audit.js'
import { createLogger } from '../../src/platform/logger.js'
import { REDACTED } from '../../src/platform/redact.js'
import { runWithContext } from '../../src/platform/request-context.js'

// Secret-looking values are built at runtime so the secret scanner never sees a literal (RULE-SYNTHETIC-DATA).
const secret = (label: string) => ['synthetic', label, 'secret', '5d1e'].join('-')
const owner = { kind: 'staff', id: 'staff-test-owner', roles: ['owner'] } as const

let t: TestDatabase
beforeAll(async () => {
  t = await createTestDatabase()
})
afterAll(async () => {
  await t.drop()
})

const allRows = async () =>
  (await sql<Record<string, unknown>>`SELECT * FROM platform.audit_events ORDER BY seq`.execute(t.db)).rows

describe('audit.record (TSK-0011, HH-SEC-06)', () => {
  it('writes who, what, which record, result, reason, step-up and request ID in the caller transaction', async () => {
    const recorded = await withTx(t.db, (tx) =>
      audit.record(tx, {
        actor: owner,
        action: 'estimate.publish',
        target: { type: 'estimate', id: 'est-test-1', version: 2 },
        summary: { changes: [{ field: 'status', from: 'draft', to: 'sent' }] },
        reason: 'Synthetic test',
        stepUpUsed: true,
        requestId: 'req-test-audit-1',
      }),
    )
    const row = await t.db
      .selectFrom('platform.audit_events')
      .selectAll()
      .where('id', '=', recorded.id)
      .executeTakeFirstOrThrow()
    expect(row).toMatchObject({
      actor_kind: 'staff',
      actor_id: 'staff-test-owner',
      actor_roles: ['owner'],
      actor_process: null,
      action: 'estimate.publish',
      target_type: 'estimate',
      target_id: 'est-test-1',
      target_version: 2,
      result: 'succeeded',
      reason: 'Synthetic test',
      summary: { changes: [{ field: 'status', from: 'draft', to: 'sent' }] },
      step_up_used: true,
      request_id: 'req-test-audit-1',
    })
    expect(row.occurred_at).toBeInstanceOf(Date)
    expect(row.seq).toBe(recorded.seq)
  })

  it('rolls back with the action it records', async () => {
    const before = (await allRows()).length
    await expect(
      withTx(t.db, async (tx) => {
        await audit.record(tx, {
          actor: { kind: 'guest' },
          action: 'request.submit',
          target: { type: 'request' },
          requestId: 'req-rollback-1',
        })
        throw new Error('action failed')
      }),
    ).rejects.toThrow('action failed')
    expect(await allRows()).toHaveLength(before)
  })

  it('takes the request ID from the request context and refuses an event without one or outside a transaction', async () => {
    const r = await runWithContext({ requestId: 'req-from-context-1' }, () =>
      withTx(t.db, (tx) =>
        audit.record(tx, {
          actor: { kind: 'system', process: 'test.job' },
          action: 'job.run',
          target: { type: 'job' },
        }),
      ),
    )
    const row = await t.db
      .selectFrom('platform.audit_events')
      .select(['request_id', 'actor_process'])
      .where('id', '=', r.id)
      .executeTakeFirstOrThrow()
    expect(row).toEqual({ request_id: 'req-from-context-1', actor_process: 'test.job' })
    await expect(
      withTx(t.db, (tx) =>
        audit.record(tx, { actor: { kind: 'guest' }, action: 'request.submit', target: { type: 'request' } }),
      ),
    ).rejects.toThrow(AuditError)
    await expect(
      audit.record(t.db as never, {
        actor: { kind: 'guest' },
        action: 'request.submit',
        target: { type: 'request' },
        requestId: 'req-x-1',
      }),
    ).rejects.toThrow(/inside the business transaction/)
  })

  it('rejects malformed actions and actor shapes in the database', async () => {
    await expect(
      withTx(t.db, (tx) =>
        audit.record(tx, {
          actor: owner,
          action: 'Publish Estimate',
          target: { type: 'estimate' },
          requestId: 'req-bad-1',
        }),
      ),
    ).rejects.toThrow(/check constraint/)
    await expect(
      sql`INSERT INTO platform.audit_events (actor_kind, action, target_type, result, request_id)
          VALUES ('staff', 'staff.sign_in', 'staff_user', 'succeeded', 'req-bad-2')`.execute(t.db),
    ).rejects.toThrow(/check constraint/)
  })
})

describe('append-only audit_events (TSK-0011, RULE-SERVER-AUTHZ, OWN-DEC-123)', () => {
  beforeAll(async () => {
    await withTx(t.db, (tx) =>
      audit.record(tx, {
        actor: owner,
        action: 'staff.sign_in',
        target: { type: 'staff_user', id: owner.id },
        requestId: 'req-ao-1',
      }),
    )
  })

  it('rejects UPDATE, DELETE and TRUNCATE of an audit row, even for the table owner or a superuser', async () => {
    await expect(sql`UPDATE platform.audit_events SET reason = 'edited'`.execute(t.db)).rejects.toThrow(
      /APPEND_ONLY: UPDATE/,
    )
    await expect(sql`DELETE FROM platform.audit_events`.execute(t.db)).rejects.toThrow(/APPEND_ONLY: DELETE/)
    await expect(sql`TRUNCATE platform.audit_events`.execute(t.db)).rejects.toThrow(/APPEND_ONLY: TRUNCATE/)
    await expect(
      t.db
        .updateTable('platform.audit_events')
        .set({ reason: 'edited' })
        .where('request_id', '=', 'req-ao-1')
        .execute(),
    ).rejects.toThrow(/APPEND_ONLY/)
    const rows = await allRows()
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r['reason'] !== 'edited')).toBe(true)
  })

  it('grants UPDATE, DELETE and TRUNCATE to no role, the owner included', async () => {
    const { rows } = await sql<{ grantee: string; privilege: string }>`
      SELECT coalesce(r.rolname, 'PUBLIC') AS grantee, a.privilege_type AS privilege
      FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
      LEFT JOIN pg_roles r ON r.oid = a.grantee
      WHERE c.oid = 'platform.audit_events'::regclass`.execute(t.db)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.filter((r) => ['UPDATE', 'DELETE', 'TRUNCATE'].includes(r.privilege))).toEqual([])
    expect(rows.some((r) => r.privilege === 'INSERT')).toBe(true)
  })
})

describe('secrets stay out of audit rows and logs (TSK-0011, T74, HH-SEC-06)', () => {
  it('redacts secret summary fields in the row and in every captured log line of the same request', async () => {
    const values = {
      password: secret('pw'),
      token: secret('tok'),
      code: secret('otp'),
      access: secret('gate'),
      bearer: secret('bearer'),
    }
    let raw = ''
    const stream = new Writable({
      write(chunk: Buffer, _enc, cb) {
        raw += chunk.toString()
        cb()
      },
    })
    const app = await buildApp({ logger: createLogger({ level: 'info' }, stream) })
    app.post('/probe', async (req) => {
      const body = req.body as Record<string, unknown>
      req.log.info({ body }, 'probe received')
      const r = await withTx(t.db, (tx) =>
        audit.record(tx, {
          actor: owner,
          action: 'property.update_access',
          target: { type: 'property', id: 'prop-test-1' },
          summary: {
            changes: [
              { field: 'accessInstructions', from: null, to: values.access },
              { field: 'label', from: 'Front', to: 'Side' },
            ],
            credentials: { password: values.password, resetToken: values.token },
            verification: { code: values.code },
          },
        }),
      )
      return { id: r.id }
    })
    const res = await app.inject({
      method: 'POST',
      url: '/probe',
      headers: { authorization: `Bearer ${values.bearer}`, 'x-request-id': 'req-secrets-0001' },
      payload: { password: values.password, accessCode: values.access, note: 'synthetic note' },
    })
    await app.close()
    expect(res.statusCode).toBe(200)
    const { id } = res.json<{ id: string }>()
    const row = await t.db
      .selectFrom('platform.audit_events')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow()
    const rowText = JSON.stringify(row)
    for (const v of Object.values(values)) {
      expect(rowText).not.toContain(v)
      expect(raw).not.toContain(v)
    }
    expect(row.request_id).toBe('req-secrets-0001')
    expect(row.summary).toEqual({
      changes: [
        { field: 'accessInstructions', from: REDACTED, to: REDACTED },
        { field: 'label', from: 'Front', to: 'Side' },
      ],
      credentials: { password: REDACTED, resetToken: REDACTED },
      verification: { code: REDACTED },
    })
    expect(raw).toContain('"requestId":"req-secrets-0001"')
    expect(raw).toContain('synthetic note')
  })
})
