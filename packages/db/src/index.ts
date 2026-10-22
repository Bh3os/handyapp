// @handyhub/db: PostgreSQL 16 access through Kysely, numbered SQL migrations and synthetic seeds (TSK-0004, HH-ARC-01).
// The integration-test harness is the separate entry point `@handyhub/db/testing`.
export const PACKAGE_NAME = '@handyhub/db'

export { createDb, createPool, typeParsers, type Database, type Db, type PoolOptions, type Tx } from './client.js'
export { withTx, type TxOptions } from './tx.js'
export {
  checksum,
  listMigrations,
  migrate,
  MigrationError,
  MIGRATIONS_DIR,
  pendingMigrations,
  planMigrations,
  type Migration,
  type MigrateOptions,
  type MigrationResult,
} from './migrate.js'
export {
  assertTestEmail,
  assertTestPhone,
  createRng,
  DEFAULT_SEED,
  isTestEmail,
  isTestPhone,
  runSeeders,
  SEED_ENVIRONMENTS,
  SeedRefusedError,
  syntheticContacts,
  seedEnvironment,
  TEST_EMAIL_DOMAINS,
  TEST_PHONE_AREA_CODES,
  type Rng,
  type SeedContext,
  type Seeder,
  type SeedEnvironment,
  type SeedOptions,
} from './seed.js'
export { SEEDERS } from './seeders.js'
export {
  databaseIdentity,
  MARK_ENVIRONMENTS,
  recordEnvironmentMark,
  type DatabaseIdentity,
  type MarkEnvironment,
  type MarkSource,
} from './environment.js'
export {
  canAutoSchedule,
  contentHash,
  isPublicServiceSlug,
  loadServiceSeed,
  PUBLIC_STATUSES,
  publicServices,
  registryServices,
  SERVICE_CATEGORIES,
  SERVICES_SEED_FILE,
  syncServices,
  type PublicService,
  type PublicStatus,
  type RegistryEnvironment,
  type SchedulingMode,
  type ServiceCategory,
  type ServiceSeed,
  type SyncResult,
} from './services.js'
export {
  loadSopSeed,
  pinJobSops,
  SOPS_SEED_FILE,
  syncSops,
  type PinOutcome,
  type PinResult,
  type SopSeed,
  type SopSyncResult,
} from './sops.js'
