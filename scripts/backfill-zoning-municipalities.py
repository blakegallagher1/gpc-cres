#!/usr/bin/env python3
"""
Backfill zoning for incorporated municipalities within EBR Parish.

Downloads zoning district polygons from:
  - City of St. George (IBTS ArcGIS): ~2,484 polygons
  - City of Central (IBTS ArcGIS): ~134 polygons

These municipalities maintain their own zoning systems separate from
EBRGIS/Metro Council, which is why ~55K parcels had no zoning data.

Baker (~6K parcels) has no digitized zoning layer available yet.
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
PAGE_SIZE = 2000
DELAY = 0.5

# Municipality zoning data sources (IBTS ArcGIS Online)
MUNICIPALITIES = [
    {
        "name": "Saint George",
        "lot_location": "Saint George",
        "url": "https://services5.arcgis.com/wATr0UsvWt8807Pv/arcgis/rest/services/SGZoning_/FeatureServer/167/query",
        "zoning_field": "ZONING_TYP",
    },
    {
        "name": "Central",
        "lot_location": "Central",
        "url": "https://services5.arcgis.com/wATr0UsvWt8807Pv/arcgis/rest/services/CoCZoning/FeatureServer/25/query",
        "zoning_field": "ZONING_TYP",
    },
]


def rings_to_wkt(rings):
    """Convert ArcGIS rings to WKT MULTIPOLYGON (handles multiple rings)."""
    if len(rings) == 1:
        coords = ", ".join(f"{p[0]} {p[1]}" for p in rings[0])
        return f"POLYGON(({coords}))"
    parts = []
    for ring in rings:
        coords = ", ".join(f"{p[0]} {p[1]}" for p in ring)
        parts.append(f"(({coords}))")
    return f"MULTIPOLYGON({', '.join(parts)})"


def fetch_page(base_url, zoning_field, offset):
    """Fetch a page of zoning polygons with geometry in WGS84."""
    params = urllib.parse.urlencode({
        "where": f"{zoning_field} IS NOT NULL",
        "outFields": zoning_field,
        "returnGeometry": "true",
        "outSR": "4326",
        "resultOffset": str(offset),
        "resultRecordCount": str(PAGE_SIZE),
        "f": "json",
    })
    url = f"{base_url}?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": "GPC-ZoningBackfill/3.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read())

    features = data.get("features", [])
    results = []
    for f in features:
        attrs = f.get("attributes", {})
        zoning = attrs.get(zoning_field)
        geom = f.get("geometry", {})
        rings = geom.get("rings", [])
        if rings and zoning:
            try:
                wkt = rings_to_wkt(rings)
                results.append((zoning.strip(), wkt))
            except Exception as e:
                print(f"  Skipped bad geometry: {e}", file=sys.stderr)

    return results, data.get("exceededTransferLimit", False)


def main():
    conn = psycopg2.connect(DB_DSN)
    conn.autocommit = True
    cur = conn.cursor()

    # Create staging table
    print("Creating municipality zoning staging table...")
    cur.execute("DROP TABLE IF EXISTS _muni_zoning_staging")
    cur.execute("""
        CREATE TABLE _muni_zoning_staging (
            id serial PRIMARY KEY,
            municipality text NOT NULL,
            zoning_type text NOT NULL,
            geom geometry(Geometry, 4326)
        )
    """)

    # Download zoning polygons from each municipality
    for muni in MUNICIPALITIES:
        name = muni["name"]
        print(f"\n--- Downloading {name} zoning polygons ---")
        offset = 0
        total = 0

        while True:
            try:
                rows, has_more = fetch_page(muni["url"], muni["zoning_field"], offset)
            except Exception as e:
                print(f"  Error at offset {offset}: {e}, retrying in 5s...")
                time.sleep(5)
                try:
                    rows, has_more = fetch_page(muni["url"], muni["zoning_field"], offset)
                except Exception as e2:
                    print(f"  Retry failed: {e2}, skipping page")
                    offset += PAGE_SIZE
                    continue

            if not rows:
                break

            for zoning, wkt in rows:
                try:
                    cur.execute(
                        "INSERT INTO _muni_zoning_staging (municipality, zoning_type, geom) "
                        "VALUES (%s, %s, ST_GeomFromText(%s, 4326))",
                        (name, zoning, wkt)
                    )
                except Exception as e:
                    conn.rollback()
                    conn.autocommit = True
                    try:
                        cur.execute(
                            "INSERT INTO _muni_zoning_staging (municipality, zoning_type, geom) "
                            "VALUES (%s, %s, ST_MakeValid(ST_GeomFromText(%s, 4326)))",
                            (name, zoning, wkt)
                        )
                    except Exception as e2:
                        conn.rollback()
                        conn.autocommit = True
                        print(f"  Skipped invalid geometry for {zoning}: {e2}", file=sys.stderr)

            total += len(rows)
            offset += PAGE_SIZE
            print(f"  Fetched {total} polygons (offset={offset})")

            if not has_more:
                break
            time.sleep(DELAY)

        print(f"  {name}: {total} zoning polygons staged")

    # Summary
    cur.execute("SELECT municipality, count(*) FROM _muni_zoning_staging GROUP BY municipality ORDER BY municipality")
    for row in cur.fetchall():
        print(f"  {row[0]}: {row[1]} polygons")

    # Build spatial index
    print("\nBuilding spatial index...")
    cur.execute("CREATE INDEX idx_muni_zoning_geom ON _muni_zoning_staging USING GIST(geom)")
    print("Index built.")

    # Check current state for each municipality
    for muni in MUNICIPALITIES:
        loc = muni["lot_location"]
        # We don't have lot_location in ebr_parcels, so we'll do it spatially
        cur.execute("""
            SELECT count(*) FROM ebr_parcels
            WHERE parish='East Baton Rouge' AND zoning_type IS NULL AND geom IS NOT NULL
        """)
        unmatched_total = cur.fetchone()[0]

    print(f"\nTotal unmatched EBR parcels before join: {unmatched_total}")

    # Spatial join: parcel centroid intersects municipality zoning polygon
    # Prefer smallest polygon (most specific zone) when multiple overlap
    print("Running spatial join (ST_Intersects with parcel centroids)...")
    conn.autocommit = False
    cur.execute("""
        WITH unmatched AS (
            SELECT id,
                   COALESCE(centroid, ST_Centroid(geom)) as pt
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
            FROM _muni_zoning_staging s
            WHERE ST_Intersects(s.geom, u.pt)
            ORDER BY ST_Area(s.geom)
            LIMIT 1
        ) s ON true
        WHERE p.id = u.id
    """)
    updated = cur.rowcount
    conn.commit()
    print(f"Updated {updated} parcels via municipality zoning polygon join")

    # Final counts
    cur.execute("""
        SELECT count(*) FROM ebr_parcels
        WHERE parish='East Baton Rouge' AND zoning_type IS NOT NULL
    """)
    final = cur.fetchone()[0]
    print(f"\nTotal EBR parcels with zoning: {final}/198949 ({final/198949*100:.1f}%)")

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
    cur.execute("DROP TABLE IF EXISTS _muni_zoning_staging")
    conn.commit()

    cur.close()
    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
