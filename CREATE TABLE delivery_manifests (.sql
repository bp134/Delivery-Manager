CREATE TABLE delivery_manifests (
    id SERIAL PRIMARY KEY,
    scanned_address VARCHAR(255) NOT NULL,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    assigned_grouping VARCHAR(100),
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);