-- Expand worker departments while preserving approved members and worker-only sections.
ALTER TABLE transport_private.members DROP CONSTRAINT IF EXISTS members_section_check;
ALTER TABLE transport_private.members ADD CONSTRAINT valid_worker_section CHECK (
 section IS NULL OR (role = 'worker' AND section IN ('Flightops','Fulops','CCA','Office & Support Staff'))
);
