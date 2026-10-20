// The seeders `pnpm db:seed` runs, in order (TSK-0004). Each later seeder is appended here and uses only the context's
// synthetic e-mail addresses and phone numbers.
import type { Seeder } from './seed.js'
import { loadServiceSeed, syncServices } from './services.js'

export const SEEDERS: readonly Seeder[] = [
  // The service registry (TSK-0019): business configuration from the SVC-* nodes, also loaded outside the seeders by
  // `pnpm db:services` in every environment.
  { name: 'service-registry', run: async ({ trx }) => void (await syncServices(trx, loadServiceSeed())) },
]
