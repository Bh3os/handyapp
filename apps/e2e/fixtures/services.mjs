// e2e set-up for the request form (TSK-0027): loads the service registry into the e2e database. Since TSK-0132 the
// registry publishes all 26 quality-reviewed services (OWN-DEC-180), so every service page and the services step show
// all of them; services.spec.ts moves one back to a draft inside its own test to check the 404 rule. Synthetic test
// set-up only: it refuses to run outside HANDYHUB_ENV=ci, and only ever touches the E2E_DATABASE_URL database.
import {
  createDb,
  loadLoadoutSeed,
  loadServiceSeed,
  loadSopSeed,
  syncLoadouts,
  syncServices,
  syncSops,
} from '@handyhub/db'

if (process.env['HANDYHUB_ENV'] !== 'ci' || !process.env['DATABASE_URL']) {
  process.stderr.write('fixtures/services.mjs runs only for the ci e2e database\n')
  process.exit(1)
}

// TSK-0068: the SOP versions of every service but this one, whose work packages therefore show NOT CONFIGURED (no SOP
// version) in the browser, as a service would before its SOP is imported.
export const E2E_SERVICE_WITHOUT_SOP = 'SVC-HI-06'

const db = createDb(process.env['DATABASE_URL'], { max: 1, applicationName: 'handyapp-e2e-fixtures' })
try {
  await syncServices(db, loadServiceSeed())
  await syncSops(
    db,
    loadSopSeed().filter((s) => s.serviceId !== E2E_SERVICE_WITHOUT_SOP),
  )
  // TSK-0071: the loadout lists of every service (business configuration from the FACT-INVENTORY nodes).
  await syncLoadouts(db, loadLoadoutSeed())
} finally {
  await db.destroy()
}
