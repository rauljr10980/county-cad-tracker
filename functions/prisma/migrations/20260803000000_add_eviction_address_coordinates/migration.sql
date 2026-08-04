-- Coordinates for eviction addresses, so landlord locations can be mapped.
--
-- Nullable because geocoding happens after import, in a resumable batch run.
-- geocodeStatus drives that batch: 'pending' rows are the work queue, 'failed'
-- rows are addresses Nominatim could not resolve and are kept visible rather
-- than silently dropped, so map coverage is always answerable.
ALTER TABLE "eviction_addresses" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "eviction_addresses" ADD COLUMN "longitude" DOUBLE PRECISION;
ALTER TABLE "eviction_addresses" ADD COLUMN "geocodedAt" TIMESTAMP(3);
ALTER TABLE "eviction_addresses" ADD COLUMN "geocodeStatus" TEXT NOT NULL DEFAULT 'pending';

-- The batch worker pulls the next slice of pending rows on every call.
CREATE INDEX "eviction_addresses_geocodeStatus_idx" ON "eviction_addresses"("geocodeStatus");
