-- =============================================================================
-- Zoning Vector Tile Contract
-- Target: property DB / Entitlement OS parcel DB
-- Purpose: publish a dedicated Martin-discoverable zoning tile source instead
-- of relying on incidental parcel-table columns.
-- =============================================================================

ALTER TABLE IF EXISTS ebr_parcels
  ADD COLUMN IF NOT EXISTS zoning_type text,
  ADD COLUMN IF NOT EXISTS existing_land_use text,
  ADD COLUMN IF NOT EXISTS future_land_use text;

CREATE OR REPLACE FUNCTION get_zoning_mvt(z int, x int, y int)
RETURNS bytea
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
AS $$
DECLARE
  tile_extent geometry;
  tile_bbox_4326 geometry;
  result bytea;
BEGIN
  IF z < 10 THEN
    RETURN NULL;
  END IF;

  tile_extent := ST_TileEnvelope(z, x, y);
  tile_bbox_4326 := ST_Transform(tile_extent::geometry, 4326);

  SELECT ST_AsMVT(tile, 'zoning', 4096, 'geom')::bytea INTO result
  FROM (
    SELECT
      id,
      parcel_id,
      zoning_type,
      existing_land_use,
      future_land_use,
      ST_AsMVTGeom(
        ST_Transform(ST_CurveToLine(geom), 3857),
        tile_extent::geometry,
        4096,
        256,
        true
      ) AS geom
    FROM ebr_parcels
    WHERE geom IS NOT NULL
      AND zoning_type IS NOT NULL
      AND ST_Intersects(geom, tile_bbox_4326)
  ) tile;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION get_zoning_mvt(int, int, int) IS
  'Returns Mapbox Vector Tiles for parcel zoning polygons with zoning_type and land-use fields.';
