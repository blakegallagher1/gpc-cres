#!/usr/bin/env python3
"""
Fast zoning backfill: Download lot centroids + zoning from EBRGIS,
load into staging table, then spatial-join against unmatched parcels.
Uses returnCentroid=true to skip heavy geometry downloads.
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
QUERY_URL = "https://maps.brla.gov/gis/rest/services/Cadastral/Lot/MapServer/0/query"
PAGE_SIZE = 2000
DELAY = 0.5  # seconds between pages


def fetch_page(offset: int) -> list:
    """Fetch a page of lots with zoning data. Returns list of (zoning, elu, flu, lng, lat)."""
    params = urllib.parse.urlencode({
        "where": "ZONING_TYPE IS NOT NULL AND ZONING_TYPE <> 'Null'",
        "outFields": "ZONING_TYPE,EXISTING_LAND_USE,FUTURE_LAND_USE",
        "returnGeometry": "true",
        "returnCentroid": "true",
        "outSR": "4326",
        "resultOffset": str(offset),
        "resultRecordCount": str(PAGE_SIZE),
        "f": "json",
    })
    url = f"{QUERY_URL}?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": "GPC-ZoningBackfill/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())

    features = data.get("features", [])
    results = []
    for f in features:
        attrs = f.get("attributes", {})
        zoning = attrs.get("ZONING_TYPE")
        elu = attrs.get("EXISTING_LAND_USE")
        flu = attrs.get("FUTURE_LAND_USE")

        # Get centroid from geometry rings (compute centroid of first ring)
        geom = f.get("geometry", {})
        rings = geom.get("rings", [])
        if rings and rings[0]:
            ring = rings[0]
            cx = sum(p[0] for p in ring) / len(ring)
            cy = sum(p[1] for p in ring) / len(ring)
            results.append((zoning, elu, flu, cx, cy))

    return results, data.get("exceededTransferLimit", False)


def main():
    conn = psycopg2.connect(DB_DSN)
    conn.autocommit = True
    cur = conn.cursor()

    # Create staging table
    print("Creating staging table...")
    cur.execute("DROP TABLE IF EXISTS _zoning_staging")
    cur.execute("""
        CREATE TABLE _zoning_staging (
            zoning_type text,
            existing_land_use text,
            future_land_use text,
            lng double precision,
            lat double precision
        )
    """)

    # Download all lots with zoning
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
                print(f"  Retry failed: {e2}, skipping this page")
                offset += PAGE_SIZE
                continue

        if not rows:
            break

        # Bulk insert
        args = ",".join(
            cur.mogrify("(%s,%s,%s,%s,%s)", r).decode() for r in rows
        )
        cur.execute(f"INSERT INTO _zoning_staging VALUES {args}")
        total_staged += len(rows)
        offset += PAGE_SIZE
        print(f"  Fetched {total_staged} lots (offset={offset})")

        if not has_more:
            break
        time.sleep(DELAY)

    print(f"\nTotal lots staged: {total_staged}")

    # Create spatial index on staging
    print("Building spatial index on staging table...")
    cur.execute("""
        ALTER TABLE _zoning_staging ADD COLUMN geom geometry(Point, 4326)
    """)
    cur.execute("""
        UPDATE _zoning_staging SET geom = ST_SetSRID(ST_MakePoint(lng, lat), 4326)
    """)
    cur.execute("""
        CREATE INDEX idx_zoning_staging_geom ON _zoning_staging USING GIST(geom)
    """)
    print("Index built.")

    # Spatial join: for each unmatched EBR parcel, find nearest staging lot within 50m
    print("Running spatial join for unmatched parcels...")
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
        SET
            zoning_type = s.zoning_type,
            existing_land_use = s.existing_land_use,
            future_land_use = s.future_land_use
        FROM unmatched u
        CROSS JOIN LATERAL (
            SELECT zoning_type, existing_land_use, future_land_use
            FROM _zoning_staging s
            WHERE ST_DWithin(s.geom::geography, u.centroid::geography, 50)
            ORDER BY s.geom <-> u.centroid
            LIMIT 1
        ) s
        WHERE p.id = u.id
    """)
    updated = cur.rowcount
    conn.commit()
    print(f"Updated {updated} parcels via nearest-lot join (50m radius)")

    # Check remaining
    cur.execute("""
        SELECT count(*) FROM ebr_parcels
        WHERE parish='East Baton Rouge' AND zoning_type IS NOT NULL
    """)
    final = cur.fetchone()[0]
    print(f"\nTotal EBR parcels with zoning: {final}/198949 ({final/198949*100:.1f}%)")

    # Cleanup
    cur.execute("DROP TABLE IF EXISTS _zoning_staging")
    conn.commit()

    cur.close()
    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
