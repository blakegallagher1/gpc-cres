-- ZCTA (ZIP Code Tabulation Area) polygon layer for Louisiana
-- Enables spatial ZIP breakdowns: JOIN ebr_parcels with zcta ON ST_Intersects
--
-- Data source: Census Bureau ZCTA via OpenDataDE/State-zip-code-GeoJSON
-- Loaded: 2026-03-24 (516 Louisiana ZCTAs)
--
-- To reload from scratch:
--   1. Download: curl -o /tmp/la_zcta.geojson https://raw.githubusercontent.com/OpenDataDE/State-zip-code-GeoJSON/master/la_louisiana_zip_codes_geo.min.json
--   2. Run the Python loader below
--   3. Or run this SQL to create the empty table, then use the Python loader
--
-- Usage (via gateway /tools/parcels.sql):
--   SELECT z.zip, COUNT(*) as cnt
--   FROM ebr_parcels p JOIN zcta z ON ST_Intersects(p.geom, z.geom)
--   WHERE p.zoning_type = 'A4'
--   GROUP BY z.zip ORDER BY cnt DESC

CREATE TABLE IF NOT EXISTS zcta (
  id SERIAL PRIMARY KEY,
  zip TEXT NOT NULL,
  state_fips TEXT,
  land_area_sqm BIGINT,
  water_area_sqm BIGINT,
  lat NUMERIC,
  lon NUMERIC,
  geom GEOMETRY(MultiPolygon, 4326)
);

CREATE INDEX IF NOT EXISTS idx_zcta_zip ON zcta(zip);
CREATE INDEX IF NOT EXISTS idx_zcta_geom ON zcta USING GIST(geom);
