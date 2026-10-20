// Transaction helper (TSK-0004). Every multi-row business write runs inside one transaction: it commits when the
// callback resolves and rolls back when it throws. Called with a transaction, it joins it instead of nesting, so
// helpers that need atomicity compose into a caller's larger transaction (an isolation level is only honoured on the
// outermost call).
import type { IsolationLevel, Kysely, Transaction } from 'kysely'

export type TxOptions = { isolation?: IsolationLevel }

export async function withTx<DB, T>(
  db: Kysely<DB> | Transaction<DB>,
  fn: (trx: Transaction<NoInfer<DB>>) => Promise<T>,
  options: TxOptions = {},
): Promise<T> {
  if (db.isTransaction) {
    // An isolation level can only be chosen when a transaction starts; joining cannot honour one.
    if (options.isolation) throw new Error('withTx: an isolation level cannot be set on a joined transaction')
    return fn(db as Transaction<DB>)
  }
  const builder = db.transaction()
  return (options.isolation ? builder.setIsolationLevel(options.isolation) : builder).execute(fn)
}
