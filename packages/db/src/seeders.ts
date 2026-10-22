// The seeders `pnpm db:seed` runs, in order (TSK-0004). Each later seeder is appended here and uses only the context's
// synthetic e-mail addresses and phone numbers.
import type { Seeder } from './seed.js'
import { loadServiceSeed, syncServices } from './services.js'
import { loadLoadoutSeed, syncLoadouts } from './loadouts.js'
import { loadSopSeed, syncSops } from './sops.js'

export const SEEDERS: readonly Seeder[] = [
  // The service registry (TSK-0019): business configuration from the SVC-* nodes, also loaded outside the seeders by
  // `pnpm db:services` in every environment.
  { name: 'service-registry', run: async ({ trx }) => void (await syncServices(trx, loadServiceSeed())) },
  // The SOP versions (TSK-0068): verbatim from the SOP-* nodes, pending competent review; also loaded by `pnpm db:sops`.
  { name: 'sop-versions', run: async ({ trx }) => void (await syncSops(trx, loadSopSeed())) },
  // The loadout versions (TSK-0071): verbatim from the FACT-INVENTORY-* nodes; also loaded by `pnpm db:loadouts`.
  { name: 'loadout-versions', run: async ({ trx }) => void (await syncLoadouts(trx, loadLoadoutSeed())) },
]
