-- 0001 baseline (TSK-0004, HH-ARC-01): the one business database shared by both websites.
-- The migration runner keeps its own checksum table, platform.schema_migration. Business tables arrive with the tasks
-- that own them, each in its own numbered file. Migrations are forward-only: an applied file is never edited.
CREATE SCHEMA IF NOT EXISTS platform;
COMMENT ON SCHEMA platform IS 'Shared platform tables, starting with the migration checksum table schema_migration.';
