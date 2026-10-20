import { describe, expect, it } from 'vitest'
import { renderSchema, type CatalogColumn } from '../../src/typegen.js'

const col = (column: string, type: string, extra: Partial<CatalogColumn> = {}): CatalogColumn => ({
  schema: 'crm',
  table: 'thing',
  kind: 'r',
  column,
  type,
  elementType: null,
  notNull: true,
  hasDefault: false,
  identity: '',
  generated: '',
  ...extra,
})

describe('generated table types (TSK-0004)', () => {
  const out = renderSchema({
    enums: [{ schema: 'crm', name: 'thing_status', labels: ['active', "it's"] }],
    columns: [
      col('id', 'int8', { identity: 'a' }),
      col('total_cents', 'int8'),
      col('label', 'text', { notNull: false }),
      col('status', 'thing_status', { hasDefault: true }),
      col('due_on', 'date'),
      col('created_at', 'timestamptz', { hasDefault: true }),
      col('tags', '_text', { elementType: 'text' }),
      col('flags', '_thing_status', { elementType: 'thing_status' }),
      col('payload', 'jsonb'),
      col('shape', 'point'),
      col('note', 'text', { schema: 'public', table: 'plain' }),
      col('n', 'int4', { schema: 'crm', table: 'thing_view', kind: 'v', notNull: false }),
    ],
  })

  it('maps bigint money columns to strings, never floating point (RULE-MONEY-CENTS)', () => {
    expect(out).toContain('export type Int8 = ColumnType<string, bigint | number | string, bigint | number | string>')
    expect(out).toContain('  total_cents: Int8\n')
  })

  it('marks identity, defaults, nullability, enums, arrays, json and unknown types', () => {
    expect(out).toContain('  id: GeneratedAlways<string>\n')
    expect(out).toContain('  label: string | null\n')
    expect(out).toContain("export type CrmThingStatus = 'active' | 'it\\'s'")
    expect(out).toContain('  status: Generated<CrmThingStatus>\n')
    expect(out).toContain('  due_on: string\n')
    expect(out).toContain('  created_at: ColumnType<Date, Date | string | undefined, Date | string>\n')
    expect(out).toContain('  tags: string[]\n')
    expect(out).toContain('  flags: string\n')
    expect(out).toContain('  payload: Json\n')
    expect(out).toContain('  shape: unknown\n')
    expect(out).toContain("import type { ColumnType, Generated, GeneratedAlways } from 'kysely'")
  })

  it('keys tables by schema, leaves public tables bare and makes view columns read-only nullable', () => {
    expect(out).toContain("  'crm.thing': CrmThingTable\n")
    expect(out).toContain('  plain: PlainTable\n')
    expect(out).toContain('export interface CrmThingViewTable {\n  n: number | null\n}')
  })

  it('is deterministic', () => {
    expect(renderSchema({ enums: [], columns: [col('a', 'text')] })).toBe(
      renderSchema({ enums: [], columns: [col('a', 'text')] }),
    )
  })
})
