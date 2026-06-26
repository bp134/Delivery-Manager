CREATE TABLE IF NOT EXISTS delivery_manifests (
    id SERIAL PRIMARY KEY,
    scanned_address VARCHAR(255) NOT NULL,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    assigned_grouping VARCHAR(100),
    source VARCHAR(20) DEFAULT 'manual',
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_delivery_manifests_processed_at ON delivery_manifests (processed_at);
CREATE INDEX IF NOT EXISTS idx_delivery_manifests_grouping ON delivery_manifests (assigned_grouping);
