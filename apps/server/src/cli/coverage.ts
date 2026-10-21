// Operations command for the ZIP coverage rules (TSK-0022; ENT-CoverageRule, OWN-DEC-37, OQ-SERVICE-AREA-ZIPS). Run in
// the host shell with DATABASE_URL set:
//   node apps/server/dist/cli/coverage.js status
//   node apps/server/dist/cli/coverage.js import <relationship-file> [source label]
//       derives a PROPOSED rule set from the Census ZCTA-to-county relationship file and coverage.area, and prints
//       the in-coverage and boundary ZIPs for the owner to review; the checker keeps answering from the active set
//   node apps/server/dist/cli/coverage.js approve <version> <approved by> <decision id>...
//       records the owner's confirmation and makes that set active (the previous one is superseded)
// Each change is audited. The file is never edited or guessed at: its SHA-256 is stored with the rule set.
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { createDb, withTx } from '@handyhub/db'
import { loadConfig } from '../config.js'
import { approveRuleSet, importRuleSet, RuleSetError } from '../modules/coverage/coverage.js'
import { audit } from '../platform/audit.js'
import { runWithContext } from '../platform/request-context.js'

const [command, ...args] = process.argv.slice(2)
const out = (line: string) => process.stdout.write(`${line}\n`)
const fail = (message: string): never => {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}
const USAGE =
  'usage: coverage status | import <relationship-file> [source label] | approve <version> <approved by> <decision id>...'
if (!command || !['status', 'import', 'approve'].includes(command)) fail(USAGE)
const config = loadConfig(process.env)
if (!config.databaseUrl) fail('DATABASE_URL is not set')

const db = createDb(config.databaseUrl as string, { max: 1, applicationName: 'handyapp-coverage' })
const actor = { kind: 'system' as const, process: 'ops:coverage' }
try {
  await runWithContext({ requestId: `ops:${randomUUID()}` }, async () => {
    if (command === 'status') {
      const sets = await db
        .selectFrom('platform.coverage_rule_sets')
        .select(['version', 'status', 'source', 'area_version', 'approved_by', 'approved_at'])
        .orderBy('version')
        .execute()
      if (sets.length === 0) out('No coverage rule set: every ZIP is the unknown outcome (NOT CONFIGURED).')
      for (const s of sets)
        out(
          `v${s.version} ${s.status} area v${s.area_version} ${s.source}${s.approved_by ? ` approved by ${s.approved_by}` : ''}`,
        )
      return
    }
    if (command === 'import') {
      const [file, ...label] = args
      if (!file) fail(USAGE)
      const fileText = readFileSync(file as string, 'utf8')
      const summary = await withTx(db, async (tx) => {
        const s = await importRuleSet(tx, {
          fileText,
          source: label.join(' ').trim() || basename(file as string),
          createdBy: 'ops:coverage',
        })
        await audit.record(tx, {
          actor,
          action: 'coverage.import_rules',
          target: { type: 'coverage_rule_set', id: String(s.version), version: s.version },
          summary: { areaVersion: s.areaVersion, ...s.counts },
        })
        return s
      })
      out(`Proposed rule set v${summary.version} from coverage.area v${summary.areaVersion}:`)
      out(
        `  in_coverage ${summary.counts.in_coverage}, boundary ${summary.counts.boundary}, out_of_coverage ${summary.counts.out_of_coverage}`,
      )
      for (const r of summary.inArea) out(`  ${r.zip5} ${r.disposition} ${r.counties.join(', ')}`)
      out('Not used until approved: coverage approve <version> <approved by> <decision id>')
      return
    }
    const [version, approvedBy, ...sources] = args
    if (!version || !/^[0-9]+$/.test(version) || !approvedBy || sources.length === 0) fail(USAGE)
    const result = await withTx(db, async (tx) => {
      const r = await approveRuleSet(tx, { version: Number(version), approvedBy: approvedBy as string, sources })
      await audit.record(tx, {
        actor,
        action: 'coverage.approve_rules',
        target: { type: 'coverage_rule_set', id: String(version), version: Number(version) },
        summary: { approvedBy: approvedBy as string, sources, superseded: r.superseded },
      })
      return r
    })
    out(`Rule set v${version} is active${result.superseded ? `; v${result.superseded} is superseded` : ''}.`)
  })
} catch (error) {
  if (error instanceof RuleSetError || (error as Error).name === 'CoverageSourceError') fail((error as Error).message)
  throw error
} finally {
  await db.destroy()
}
