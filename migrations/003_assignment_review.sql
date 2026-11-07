-- Stage 1: record how each delivery was assigned to a zone and whether it needs checking.
-- The app also applies these columns automatically at start-up; this file is for running by hand in pgAdmin.
ALTER TABLE delivery_manifests
    ADD COLUMN IF NOT EXISTS assignment_method VARCHAR(20),
    ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS review_reason VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_delivery_manifests_needs_review
    ON delivery_manifests (needs_review)
    WHERE needs_review;

-- Deliveries waiting to be checked:
-- SELECT processed_at, scanned_address, assigned_grouping, assignment_method, review_reason
-- FROM delivery_manifests WHERE needs_review ORDER BY processed_at DESC;
