#!/usr/bin/env python3
"""
Backfill zoning using EBRGIS Zoning District boundary polygons.
Downloads ~10K zoning district polygons from the Cadastral/Zoning MapServer,
loads into staging table, then does ST_Intersects spatial join against unmatched parcels.
This covers parcels that the lot-centroid approach missed.
"""
import json
import sys
import time
import urllib.request
import urllib.parse
import psycopg2

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

DB_DSN = "postgresql://postgres:postgres@localhost:54399/entitlement_os"
QUERY_URL = "https://maps.brla.gov/gis/rest/services/Cadastral/Zoning/MapServer/0/query"
PAGE_SIZE = 1000
DELAY = 0.5


def rings_to_wkt_polygon(rings):
    """Convert ArcGIS rings to WKT POLYGON."""
    parts = []
    for ring in rings:
        coords = ", ".join(f"{p[0]} {p[1]}" for p in ring)
        parts.append(f"({coords})")
    return f"POLYGON({', '.join(parts)})"


def fetch_page(offset: int) -> tuple:
    """Fetch a page of zoning districts with geometry."""
    params = urllib.parse.urlencode({
        "where": "ZONING_TYPE IS NOT NULL",
        "outFields": "ZONING_TYPE",
        "returnGeometry": "true",
        "outSR": "4326",
        "resultOffset": str(offset),
        "resultRecordCount": str(PAGE_SIZE),
        "f": "json",
    })
    url = f"{QUERY_URL}?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": "GPC-ZoningBackfill/2.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read())

    features = data.get("features", [])
    results = []
    for f in features:
        attrs = f.get("attributes", {})
        zoning = attrs.get("ZONING_TYPE")
        geom = f.get("geometry", {})
        rings = geom.get("rings", [])
        if rings and zoning:
            try:
                wkt = rings_to_wkt_polygon(rings)
                results.append((zoning, wkt))
            except Exception as e:
                print(f"  Skipped bad geometry: {e}", file=sys.stderr)

    return results, data.get("exceededTransferLimit", False)


def main():
    conn = psycopg2.connect(DB_DSN)
    conn.autocommit = True
    cur = conn.cursor()

    # Create staging table for zoning district polygons
    print("Creating zoning district staging table...")
    cur.execute("DROP TABLE IF EXISTS _zoning_district_staging")
    cur.execute("""
        CREATE TABLE _zoning_district_staging (
            id serial PRIMARY KEY,
            zoning_type text NOT NULL,
            geom geometry(Polygon, 4326)
        )
    """)

    # Download all zoning district polygons
    offset = 0
    total_staged = 0
    while True:
        try:
            rows, has_more = fetch_page(offset)
        except Exception as e:
            print(f"  Error at offset {offset}: {e}, retrying in 5s...")
            time.sleep(5)
            try:
                rows, has_more = fetch_page(offset)
            except Exception as e2:
                print(f"  Retry failed: {e2}, skipping page")
                offset += PAGE_SIZE
                continue

        if not rows:
            break

        # Insert with geometry conversion
        for zoning, wkt in rows:
            try:
                cur.execute(
                    "INSERT INTO _zoning_district_staging (zoning_type, geom) VALUES (%s, ST_GeomFromText(%s, 4326))",
                    (zoning, wkt)
                )
            except Exception as e:
                # Some geometries may be invalid (self-intersecting etc)
                conn.rollback()
                conn.autocommit = True
                try:
                    cur.execute(
                        "INSERT INTO _zoning_district_staging (zoning_type, geom) VALUES (%s, ST_MakeValid(ST_GeomFromText(%s, 4326)))",
                        (zoning, wkt)
                    )
                except Exception as e2:
                    conn.rollback()
                    conn.autocommit = True
                    print(f"  Skipped invalid geometry for {zoning}: {e2}", file=sys.stderr)

        total_staged += len(rows)
        offset += PAGE_SIZE
        print(f"  Fetched {total_staged} zoning districts (offset={offset})")

        if not has_more:
            break
        time.sleep(DELAY)

    print(f"\nTotal zoning districts staged: {total_staged}")

    # Build spatial index
    print("Building spatial index...")
    cur.execute("CREATE INDEX idx_zoning_district_geom ON _zoning_district_staging USING GIST(geom)")
    print("Index built.")

    # Check current state
    cur.execute("""
        SELECT count(*) FROM ebr_parcels
        WHERE parish='East Baton Rouge' AND zoning_type IS NULL AND geom IS NOT NULL
    """)
    unmatched = cur.fetchone()[0]
    print(f"\nUnmatched EBR parcels before join: {unmatched}")

    # Spatial join: parcel centroid intersects zoning district polygon
    print("Running spatial join (ST_Intersects with parcel centroids)...")
    conn.autocommit = False
    cur.execute("""
        WITH unmatched AS (
            SELECT id, ST_Centroid(geom) as centroid
            FROM ebr_parcels
            WHERE parish = 'East Baton Rouge'
              AND zoning_type IS NULL
              AND geom IS NOT NULL
        )
        UPDATE ebr_parcels p
        SET zoning_type = s.zoning_type
        FROM unmatched u
        JOIN LATERAL (
            SELECT zoning_type
            FROM _zoning_district_staging s
            WHERE ST_Intersects(s.geom, u.centroid)
            ORDER BY ST_Area(s.geom)  -- prefer smallest (most specific) district
            LIMIT 1
        ) s ON true
        WHERE p.id = u.id
    """)
    updated = cur.rowcount
    conn.commit()
    print(f"Updated {updated} parcels via zoning district polygon join")

    # Final count
    cur.execute("""
        SELECT count(*) FROM ebr_parcels
        WHERE parish='East Baton Rouge' AND zoning_type IS NOT NULL
    """)
    final = cur.fetchone()[0]
    print(f"\nTotal EBR parcels with zoning: {final}/198949 ({final/198949*100:.1f}%)")

    # Also show remaining gap
    cur.execute("""
        SELECT count(*) FROM ebr_parcels
        WHERE parish='East Baton Rouge' AND zoning_type IS NULL AND geom IS NOT NULL
    """)
    still_missing = cur.fetchone()[0]
    print(f"Still missing (have geometry, no zoning): {still_missing}")

    cur.execute("""
        SELECT count(*) FROM ebr_parcels
        WHERE parish='East Baton Rouge' AND zoning_type IS NULL AND geom IS NULL
    """)
    no_geom = cur.fetchone()[0]
    print(f"No geometry at all: {no_geom}")

    # Cleanup
    cur.execute("DROP TABLE IF EXISTS _zoning_district_staging")
    conn.commit()

    cur.close()
    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
