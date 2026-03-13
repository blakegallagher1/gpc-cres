-- CreateTable
CREATE TABLE "area_summary_caches" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "cache_key" TEXT NOT NULL,
    "canonical_address" TEXT,
    "place_id" TEXT,
    "lat" DECIMAL(10,7),
    "lng" DECIMAL(10,7),
    "radius_meters" INTEGER NOT NULL,
    "summary_json" JSONB NOT NULL,
    "source_payload_json" JSONB,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "area_summary_caches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poi_density_caches" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "cache_key" TEXT NOT NULL,
    "canonical_address" TEXT,
    "place_id" TEXT,
    "lat" DECIMAL(10,7) NOT NULL,
    "lng" DECIMAL(10,7) NOT NULL,
    "radius_meters" INTEGER NOT NULL,
    "poi_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "density_score" DOUBLE PRECISION NOT NULL,
    "result_json" JSONB NOT NULL,
    "source_payload_json" JSONB,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "poi_density_caches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "area_summary_caches_org_id_idx" ON "area_summary_caches"("org_id");

-- CreateIndex
CREATE INDEX "area_summary_caches_org_id_canonical_address_idx" ON "area_summary_caches"("org_id", "canonical_address");

-- CreateIndex
CREATE INDEX "area_summary_caches_org_id_place_id_idx" ON "area_summary_caches"("org_id", "place_id");

-- CreateIndex
CREATE INDEX "area_summary_caches_org_id_lat_lng_radius_meters_idx" ON "area_summary_caches"("org_id", "lat", "lng", "radius_meters");

-- CreateIndex
CREATE INDEX "area_summary_caches_org_id_expires_at_idx" ON "area_summary_caches"("org_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "area_summary_caches_org_id_cache_key_key" ON "area_summary_caches"("org_id", "cache_key");

-- CreateIndex
CREATE INDEX "poi_density_caches_org_id_idx" ON "poi_density_caches"("org_id");

-- CreateIndex
CREATE INDEX "poi_density_caches_org_id_canonical_address_idx" ON "poi_density_caches"("org_id", "canonical_address");

-- CreateIndex
CREATE INDEX "poi_density_caches_org_id_place_id_idx" ON "poi_density_caches"("org_id", "place_id");

-- CreateIndex
CREATE INDEX "poi_density_caches_org_id_lat_lng_radius_meters_idx" ON "poi_density_caches"("org_id", "lat", "lng", "radius_meters");

-- CreateIndex
CREATE INDEX "poi_density_caches_org_id_expires_at_idx" ON "poi_density_caches"("org_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "poi_density_caches_org_id_cache_key_key" ON "poi_density_caches"("org_id", "cache_key");

-- AddForeignKey
ALTER TABLE "area_summary_caches" ADD CONSTRAINT "area_summary_caches_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poi_density_caches" ADD CONSTRAINT "poi_density_caches_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
