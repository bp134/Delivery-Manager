-- Stage 2: postcode -> delivery zone list.
-- status:  'seeded'    = starting zone taken from the zone map, not flagged
--          'check'     = starting zone needs checking (near a boundary or outside all zones)
--          'confirmed' = checked by the pharmacy
-- zone     = a zone name from zones.json, or 'Not delivered' for postcodes outside the delivery area
-- is_split = TRUE when one postcode is delivered by more than one route; the app then
--            falls back to the map and flags the delivery (street exceptions arrive in stage 3).
CREATE TABLE IF NOT EXISTS delivery_postcode_zones (
    postcode    VARCHAR(8)   PRIMARY KEY CHECK (postcode = UPPER(postcode)),
    zone        VARCHAR(100) NOT NULL,
    status      VARCHAR(10)  NOT NULL DEFAULT 'seeded'
                CHECK (status IN ('seeded', 'check', 'confirmed')),
    is_split    BOOLEAN      NOT NULL DEFAULT FALSE,
    latitude    DECIMAL(10, 8),
    longitude   DECIMAL(11, 8),
    notes       VARCHAR(255),
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_delivery_postcode_zones_zone ON delivery_postcode_zones (zone);

ALTER TABLE delivery_manifests ADD COLUMN IF NOT EXISTS postcode VARCHAR(8);
