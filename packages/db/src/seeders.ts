// The seeders `pnpm db:seed` runs, in order (TSK-0004). Empty until a task adds tables with synthetic records to seed;
// each later seeder is appended here and uses only the context's synthetic e-mail addresses and phone numbers.
import type { Seeder } from './seed.js'

export const SEEDERS: readonly Seeder[] = []
