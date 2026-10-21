// e2e set-up for the request form (TSK-0027): loads the service registry into the e2e database and shows a fixed set of
// services on the test site (public_status 'staging'), so the services step has something to choose. Synthetic test
// set-up only: it refuses to run outside HANDYHUB_ENV=ci, and only ever touches the E2E_DATABASE_URL database.
import { createDb, loadServiceSeed, loadSopSeed, syncServices, syncSops } from '@handyhub/db'

if (process.env['HANDYHUB_ENV'] !== 'ci' || !process.env['DATABASE_URL']) {
  process.stderr.write('fixtures/services.mjs runs only for the ci e2e database\n')
  process.exit(1)
}

// TSK-0068: the SOP versions of every service but this one, whose work packages therefore show NOT CONFIGURED (no SOP
// version) in the browser, as a service would before its SOP is imported.
export const E2E_SERVICE_WITHOUT_SOP = 'SVC-HI-06'

export const E2E_STAGED_SERVICES = [
  'SVC-HI-01',
  'SVC-HI-02',
  'SVC-HI-03',
  'SVC-HI-04',
  'SVC-HI-05',
  'SVC-HI-06',
  'SVC-DW-01',
  'SVC-PT-01',
]

const db = createDb(process.env['DATABASE_URL'], { max: 1, applicationName: 'handyapp-e2e-fixtures' })
try {
  await syncServices(db, loadServiceSeed())
  await db
    .updateTable('catalog.services')
    .set({ public_status: 'staging' })
    .where('id', 'in', E2E_STAGED_SERVICES)
    .execute()
  await syncSops(
    db,
    loadSopSeed().filter((s) => s.serviceId !== E2E_SERVICE_WITHOUT_SOP),
  )
} finally {
  await db.destroy()
}
