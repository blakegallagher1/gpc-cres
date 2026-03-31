-- Create mobile_home_parks table in Property DB (entitlement_os)
-- PostGIS geometry column for spatial queries from the map

CREATE TABLE IF NOT EXISTS mobile_home_parks (
    id SERIAL PRIMARY KEY,
    mhv_park_id INTEGER UNIQUE NOT NULL,  -- MHVillage park ID
    name TEXT NOT NULL,
    address TEXT,
    city TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'LA',
    zip TEXT,
    county TEXT,
    lat DOUBLE PRECISION,
    lon DOUBLE PRECISION,
    geom geometry(Point, 4326),  -- PostGIS point for spatial queries
    phone TEXT,
    total_sites INTEGER,
    year_built INTEGER,
    community_type TEXT,  -- 'All Ages', '55+', 'Family'
    pets_allowed BOOLEAN,
    lot_rent TEXT,  -- stored as text since it can be ranges/text
    source_url TEXT,
    scraped_at TIMESTAMP DEFAULT NOW()
);

-- Spatial index for map viewport queries
CREATE INDEX IF NOT EXISTS idx_mobile_home_parks_geom ON mobile_home_parks USING GIST (geom);

-- Index on city for filtering
CREATE INDEX IF NOT EXISTS idx_mobile_home_parks_city ON mobile_home_parks (city);

-- Auto-populate geom from lat/lon
-- Will be run after data insertion
-- UPDATE mobile_home_parks SET geom = ST_SetSRID(ST_MakePoint(lon, lat), 4326) WHERE lat IS NOT NULL AND lon IS NOT NULL;
