-- Run once if delivery_manifests already exists without the source column.
ALTER TABLE delivery_manifests
    ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'manual';
