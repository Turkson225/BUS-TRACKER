-- Add Office & Support Staff to an installed tracker. Run once.
BEGIN;
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text NOT NULL PRIMARY KEY);
ALTER TABLE supabase_migrations.schema_migrations ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE supabase_migrations.schema_migrations ADD COLUMN IF NOT EXISTS statements text[];
-- Expand worker departments while preserving approved members and worker-only sections.
ALTER TABLE transport_private.members DROP CONSTRAINT IF EXISTS members_section_check;
ALTER TABLE transport_private.members DROP CONSTRAINT IF EXISTS members_check;
ALTER TABLE transport_private.members ADD CONSTRAINT valid_worker_section CHECK (
 section IS NULL OR (role = 'worker' AND section IN ('Flightops','Fulops','CCA','Office & Support Staff'))
);
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261004182000', 'office_support');
COMMIT;
