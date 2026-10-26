// The accountant's CSV files (TSK-0096; HH-FIN-16, HH-FIN-06, HH-DATA-10, T64, ENT-Invoice, ENT-Payment,
// ENT-TimeStamp, OWN-DEC-67, OWN-DEC-69, RULE-MONEY-CENTS, RULE-SERVER-AUTHZ, RULE-HUMAN-REVIEW).
// - One file per kind of record, as recorded: invoices with their ledger, payments (tenders), payment allocations,
//   refunds, credits and write-offs, deposits, Square fees and payouts recorded by hand, job-cost entries, and the
//   Arrived/Finished times (the TSK-0070 file). Amounts are exact US dollars written from integer cents.
// - Only what the Owner reads on the staff screens: no access code, password, token, message text, case detail or
//   medical detail is in any file. Every cell is protected against spreadsheet formulas.
// - Records only: no revenue recognition, tax treatment or write-off presentation is applied (NOT CONFIGURED: the
//   CPA's or the Owner's). A file never replaces an accounting system or the accountant's tax review.
// PROPOSED (OQ-DASHBOARD-DETAILS): the columns of each file and which date places a record in the range.
import type { Db, Tx } from '@handyhub/db'
import {
  addLocalDays,
  centsAsDollars,
  csvText,
  PENDING_PAYMENT_STATES,
  RECEIVED_PAYMENT_STATES,
  type AccountingDataset,
  type DashboardPeriod,
} from '@handyhub/domain'
import { sql } from 'kysely'
import { timestampsCsv } from '../field/timestamps.js'
import { startOfLocalDay } from './figures.js'

type Reader = Db | Tx
type Cell = string | number | null

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null)
const dateText = (d: Date | string | null): string | null =>
  d === null ? null : typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10)
const usd = (c: string | number | null) => (c === null ? null : centsAsDollars(Number(c)))
const VERIFIED = [...RECEIVED_PAYMENT_STATES]
const PENDING = [...PENDING_PAYMENT_STATES]

type File = { header: readonly string[]; rows: Cell[][] }

/** The CSV of one kind of record for the period (dates in the business zone, both ends included). */
export async function accountingCsv(
  db: Reader,
  dataset: AccountingDataset,
  period: DashboardPeriod,
  zone: string,
): Promise<{ csv: string; rows: number }> {
  if (dataset === 'arrived_finished') {
    const out = await timestampsCsv(db, { from: period.from, to: period.to })
    return { csv: out.csv, rows: out.rows }
  }
  const start = startOfLocalDay(period.from, zone)
  const end = startOfLocalDay(addLocalDays(period.to, 1), zone)
  const file = await FILES[dataset](db, { from: period.from, to: period.to, start, end, zone })
  return { csv: csvText(file.header, file.rows), rows: file.rows.length }
}

type Range = { from: string; to: string; start: Date; end: Date; zone: string }

const FILES: Record<Exclude<AccountingDataset, 'arrived_finished'>, (db: Reader, r: Range) => Promise<File>> = {
  // Invoices issued in the range (deposit and final; voided ones kept with their state), with their ledger.
  async invoices(db, r) {
    const rows = await sql<Record<string, string | Date | boolean | null>>`
      SELECT i.number, i.kind, i.state, p.reference, i.issued_at,
             i.charges_cents::text AS charges, i.credit_lines_cents::text AS credit_lines,
             i.discount_cents::text AS discount, i.total_cents::text AS total,
             i.deposit_credit_cents::text AS deposit_credit,
             (finance.invoice_credits_cents(i.id) - i.deposit_credit_cents)::text AS credits_applied,
             finance.invoice_written_off_cents(i.id)::text AS written_off,
             finance.invoice_paid_cents(i.id, ${sql.val(VERIFIED)}::text[])::text AS confirmed,
             finance.invoice_paid_cents(i.id, ${sql.val(PENDING)}::text[])::text AS pending,
             i.test_mark
        FROM finance.invoices i JOIN crm.projects p ON p.id = i.project_id
       WHERE i.issued_at >= ${r.start} AND i.issued_at < ${r.end}
       ORDER BY i.issued_at, i.id`.execute(db)
    return {
      header: [
        'invoice_number',
        'kind',
        'state',
        'project_reference',
        'issued_utc',
        'charges_usd',
        'credit_lines_usd',
        'discount_usd',
        'total_usd',
        'deposit_credit_usd',
        'credits_applied_usd',
        'written_off_usd',
        'confirmed_payments_usd',
        'pending_payments_usd',
        'balance_usd',
        'test_record',
      ],
      rows: rows.rows.map((x) => {
        const n = (k: string) => Number(x[k] as string)
        const balance =
          x['kind'] === 'final' && (x['state'] === 'issued' || x['state'] === 'partially_paid')
            ? Math.max(0, n('total') - n('deposit_credit') - n('credits_applied') - n('written_off') - n('confirmed'))
            : null
        return [
          x['number'] as string,
          x['kind'] as string,
          x['state'] as string,
          x['reference'] as string,
          iso(x['issued_at'] as Date),
          usd(x['charges'] as string),
          usd(x['credit_lines'] as string),
          usd(x['discount'] as string),
          usd(x['total'] as string),
          usd(x['deposit_credit'] as string),
          usd(x['credits_applied'] as string),
          usd(x['written_off'] as string),
          usd(x['confirmed'] as string),
          usd(x['pending'] as string),
          usd(balance),
          x['test_mark'] ? 'yes' : 'no',
        ]
      }),
    }
  },

  // Every payment (tender) received in the range, in every state, once each.
  async payments(db, r) {
    const rows = await db
      .selectFrom('finance.payments as y')
      .innerJoin('crm.projects as p', 'p.id', 'y.project_id')
      .leftJoin('identity.staff_users as c', 'c.id', 'y.collector_staff_id')
      .select([
        'y.id',
        'y.received_on',
        'y.method',
        'y.state',
        'y.amount_cents',
        'y.reference',
        'y.payer_name',
        'p.reference as project_reference',
        'c.display_name as collector',
        'y.created_at',
        'y.deposited_at',
        'y.cleared_at',
        'y.reconciled_at',
        'y.corrects_payment_id',
      ])
      .where('y.received_on', '>=', r.from)
      .where('y.received_on', '<=', r.to)
      .orderBy('y.received_on')
      .orderBy('y.created_at')
      .orderBy('y.id')
      .execute()
    return {
      header: [
        'payment_id',
        'received_on',
        'method',
        'state',
        'counts_as_received',
        'amount_usd',
        'reference',
        'payer_name',
        'project_reference',
        'collected_by',
        'recorded_utc',
        'deposited_utc',
        'cleared_utc',
        'reconciled_utc',
        'corrects_payment_id',
      ],
      rows: rows.map((y) => [
        y.id,
        dateText(y.received_on),
        y.method,
        y.state,
        (VERIFIED as string[]).includes(y.state) ? 'yes' : 'no',
        usd(y.amount_cents),
        y.reference,
        y.payer_name,
        y.project_reference,
        y.collector,
        iso(y.created_at),
        iso(y.deposited_at),
        iso(y.cleared_at),
        iso(y.reconciled_at),
        y.corrects_payment_id,
      ]),
    }
  },

  // Allocations made in the range: which payment went to which invoice or deposit (reversals as their own rows).
  async payment_allocations(db, r) {
    const rows = await db
      .selectFrom('finance.payment_allocations as a')
      .innerJoin('finance.payments as y', 'y.id', 'a.payment_id')
      .innerJoin('crm.projects as p', 'p.id', 'y.project_id')
      .leftJoin('finance.invoices as i', 'i.id', 'a.invoice_id')
      .select([
        'a.id',
        'a.created_at',
        'a.payment_id',
        'y.received_on',
        'y.method',
        'y.state',
        'i.number as invoice_number',
        'a.deposit_requirement_id',
        'a.amount_cents',
        'a.reverses_allocation_id',
        'p.reference',
      ])
      .where('a.created_at', '>=', r.start)
      .where('a.created_at', '<', r.end)
      .orderBy('a.created_at')
      .orderBy('a.id')
      .execute()
    return {
      header: [
        'allocation_id',
        'allocated_utc',
        'payment_id',
        'payment_received_on',
        'payment_method',
        'payment_state',
        'invoice_number',
        'to_deposit',
        'amount_usd',
        'reverses_allocation_id',
        'project_reference',
      ],
      rows: rows.map((a) => [
        a.id,
        iso(a.created_at),
        a.payment_id,
        dateText(a.received_on),
        a.method,
        a.state,
        a.invoice_number,
        a.deposit_requirement_id ? 'yes' : 'no',
        usd(a.amount_cents),
        a.reverses_allocation_id,
        a.reference,
      ]),
    }
  },

  // Refunds, credits and write-offs requested in the range, in every state, as recorded (no presentation applied).
  async refunds_credits_write_offs(db, r) {
    const rows = await db
      .selectFrom('finance.refunds as f')
      .innerJoin('crm.projects as p', 'p.id', 'f.project_id')
      .leftJoin('finance.invoices as i', 'i.id', 'f.invoice_id')
      .select([
        'f.id',
        'f.type',
        'f.state',
        'f.amount_cents',
        'f.payment_id',
        'i.number as invoice_number',
        'f.created_at',
        'f.approved_at',
        'f.provider_confirmation',
        'f.reason',
        'p.reference',
      ])
      .where('f.created_at', '>=', r.start)
      .where('f.created_at', '<', r.end)
      .orderBy('f.created_at')
      .orderBy('f.id')
      .execute()
    return {
      header: [
        'record_id',
        'type',
        'state',
        'amount_usd',
        'payment_id',
        'invoice_number',
        'requested_utc',
        'approved_utc',
        'provider_confirmation',
        'reason',
        'project_reference',
      ],
      rows: rows.map((f) => [
        f.id,
        f.type,
        f.state,
        usd(f.amount_cents),
        f.payment_id,
        f.invoice_number,
        iso(f.created_at),
        iso(f.approved_at),
        f.provider_confirmation,
        f.reason,
        f.reference,
      ]),
    }
  },

  // Deposit requirements set in the range: required amount, confirmed payments toward it and the final credit.
  async deposits(db, r) {
    const rows = await sql<Record<string, string | Date | boolean | null>>`
      SELECT d.id, p.reference, d.created_at, d.state, d.required, d.amount_cents::text AS amount,
             d.base_total_cents::text AS base_total,
             COALESCE((SELECT sum(a.amount_cents) FROM finance.payment_allocations a
                         JOIN finance.payments y ON y.id = a.payment_id
                        WHERE a.deposit_requirement_id = d.id AND y.state = ANY(${sql.val(VERIFIED)}::text[])), 0)::text
               AS confirmed,
             COALESCE((SELECT sum(a.amount_cents) FROM finance.payment_allocations a
                         JOIN finance.payments y ON y.id = a.payment_id
                        WHERE a.deposit_requirement_id = d.id AND y.state = ANY(${sql.val(PENDING)}::text[])), 0)::text
               AS pending,
             (SELECT i.number FROM finance.invoices i
               WHERE i.deposit_requirement_id = d.id AND i.kind = 'deposit' AND i.state <> 'voided'
               ORDER BY i.prepared_at DESC LIMIT 1) AS deposit_invoice,
             COALESCE((SELECT sum(c.amount_cents) FROM finance.invoice_deposit_credits c
                        WHERE c.deposit_requirement_id = d.id), 0)::text AS credited
        FROM finance.deposit_requirements d JOIN crm.projects p ON p.id = d.project_id
       WHERE d.created_at >= ${r.start} AND d.created_at < ${r.end}
       ORDER BY d.created_at, d.id`.execute(db)
    return {
      header: [
        'deposit_id',
        'project_reference',
        'set_utc',
        'state',
        'required',
        'required_usd',
        'approved_total_usd',
        'confirmed_payments_usd',
        'pending_payments_usd',
        'deposit_invoice_number',
        'credited_on_final_invoice_usd',
      ],
      rows: rows.rows.map((d) => [
        d['id'] as string,
        d['reference'] as string,
        iso(d['created_at'] as Date),
        d['state'] as string,
        d['required'] ? 'yes' : 'no',
        usd(d['amount'] as string | null),
        usd(d['base_total'] as string),
        usd(d['confirmed'] as string),
        usd(d['pending'] as string),
        d['deposit_invoice'] as string | null,
        usd(d['credited'] as string),
      ]),
    }
  },

  // Square fees recorded by hand, by the date incurred.
  async provider_fees(db, r) {
    const rows = await db
      .selectFrom('finance.provider_fees as x')
      .leftJoin('finance.payouts as o', 'o.id', 'x.payout_id')
      .select([
        'x.id',
        'x.incurred_on',
        'x.provider',
        'x.amount_cents',
        'x.reference',
        'x.payment_id',
        'o.reference as payout_reference',
        'x.created_at',
      ])
      .where('x.incurred_on', '>=', r.from)
      .where('x.incurred_on', '<=', r.to)
      .orderBy('x.incurred_on')
      .orderBy('x.id')
      .execute()
    return {
      header: [
        'fee_id',
        'incurred_on',
        'provider',
        'amount_usd',
        'reference',
        'payment_id',
        'payout_reference',
        'recorded_utc',
      ],
      rows: rows.map((x) => [
        x.id,
        dateText(x.incurred_on),
        x.provider,
        usd(x.amount_cents),
        x.reference,
        x.payment_id,
        x.payout_reference,
        iso(x.created_at),
      ]),
    }
  },

  // Square payouts (settlements) recorded by hand, by the date paid out, with the fees recorded against each.
  async payouts(db, r) {
    const rows = await sql<Record<string, string | Date | null>>`
      SELECT o.id, o.paid_out_on::text AS paid_out_on, o.provider, o.reference, o.amount_cents::text AS amount,
             COALESCE((SELECT sum(x.amount_cents) FROM finance.provider_fees x WHERE x.payout_id = o.id), 0)::text
               AS fees,
             o.created_at
        FROM finance.payouts o
       WHERE o.paid_out_on >= ${r.from} AND o.paid_out_on <= ${r.to}
       ORDER BY o.paid_out_on, o.id`.execute(db)
    return {
      header: ['payout_id', 'paid_out_on', 'provider', 'reference', 'amount_usd', 'fees_recorded_usd', 'recorded_utc'],
      rows: rows.rows.map((o) => [
        o['id'] as string,
        o['paid_out_on'] as string,
        o['provider'] as string,
        o['reference'] as string,
        usd(o['amount'] as string),
        usd(o['fees'] as string),
        iso(o['created_at'] as Date),
      ]),
    }
  },

  // Job-cost entries by the date incurred, voided ones kept with their reason (job-cost inputs, HH-FIN-17).
  async job_costs(db, r) {
    const rows = await db
      .selectFrom('finance.job_costs as k')
      .innerJoin('crm.projects as p', 'p.id', 'k.project_id')
      .select([
        'k.id',
        'k.job_id',
        'p.reference',
        'k.category',
        'k.amount_cents',
        'k.incurred_on',
        'k.note',
        'k.recorded_at',
        'k.voided_at',
        'k.void_reason',
      ])
      .where('k.incurred_on', '>=', r.from)
      .where('k.incurred_on', '<=', r.to)
      .orderBy('k.incurred_on')
      .orderBy('k.recorded_at')
      .orderBy('k.id')
      .execute()
    return {
      header: [
        'cost_id',
        'job_id',
        'project_reference',
        'category',
        'amount_usd',
        'incurred_on',
        'note',
        'recorded_utc',
        'state',
        'voided_utc',
        'void_reason',
      ],
      rows: rows.map((k) => [
        k.id,
        k.job_id,
        k.reference,
        k.category,
        usd(k.amount_cents),
        dateText(k.incurred_on),
        k.note,
        iso(k.recorded_at),
        k.voided_at ? 'voided' : 'recorded',
        iso(k.voided_at),
        k.void_reason,
      ]),
    }
  },
}
