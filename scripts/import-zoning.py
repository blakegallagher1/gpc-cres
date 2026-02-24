"""
Import EBRGIS zoning data into ebr_parcels via spatial join.

Fetches ZONING_TYPE, EXISTING_LAND_USE, FUTURE_LAND_USE from the EBRGIS
Cadastral/Lot MapServer layer, loads into a staging table, then spatial-joins
to ebr_parcels using centroid containment.

Usage:
  cloudflared access tcp --hostname db.gallagherpropco.com --url localhost:54399
  pip install psycopg2-binary requests
  python scripts/import-zoning.py

Env:
  DATABASE_URL  (default: postgresql://postgres:postgres@localhost:54399/entitlement_os)
"""

import os
import time
import requests
import psycopg2
from psycopg2.extras import execute_values

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:54399/entitlement_os",
)

ARCGIS_URL = (
    "https://maps.brla.gov/gis/rest/services/Cadastral/Lot/MapServer/0/query"
)
PAGE_SIZE = 2000
OUT_FIELDS = "LOT_ID,ZONING_TYPE,EXISTING_LAND_USE,FUTURE_LAND_USE"


def rings_to_wkt(rings):
    """Convert ArcGIS JSON rings to WKT POLYGON."""
    parts = []
    for ring in rings:
        coords = ", ".join(f"{pt[0]} {pt[1]}" for pt in ring)
        parts.append(f"({coords})")
    return f"POLYGON({', '.join(parts)})"


def fetch_page(offset):
    """Fetch one page of lots from EBRGIS."""
    params = {
        "where": "1=1",
        "outFields": OUT_FIELDS,
        "outSR": "4326",
        "f": "json",
        "returnGeometry": "true",
        "resultRecordCount": PAGE_SIZE,
        "resultOffset": offset,
    }
    for attempt in range(3):
        try:
            r = requests.get(ARCGIS_URL, params=params, timeout=60)
            r.raise_for_status()
            data = r.json()
            if "error" in data:
                raise RuntimeError(f"ArcGIS error: {data['error']}")
            return data.get("features", [])
        except Exception as e:
            if attempt < 2:
                print(f"  Retry {attempt + 1} for offset {offset}: {e}")
                time.sleep(2 ** (attempt + 1))
            else:
                raise


def main():
    print(f"Connecting to {DATABASE_URL.split('@')[1] if '@' in DATABASE_URL else DATABASE_URL}")
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()

    # 1. Add columns (idempotent)
    print("Adding zoning columns to ebr_parcels...")
    for col in ("zoning_type", "existing_land_use", "future_land_use"):
        cur.execute(f"""
            DO $$ BEGIN
                ALTER TABLE ebr_parcels ADD COLUMN {col} TEXT;
            EXCEPTION WHEN duplicate_column THEN NULL;
            END $$;
        """)
    conn.commit()

    # 2. Create staging table
    print("Creating staging table...")
    cur.execute("DROP TABLE IF EXISTS ebr_lots_staging")
    cur.execute("""
        CREATE TABLE ebr_lots_staging (
            lot_id BIGINT,
            zoning_type TEXT,
            existing_land_use TEXT,
            future_land_use TEXT,
            geom GEOMETRY(Geometry, 4326)
        )
    """)
    conn.commit()

    # 3. Paginate EBRGIS API
    print("Fetching lots from EBRGIS...")
    offset = 0
    total_inserted = 0

    while True:
        features = fetch_page(offset)
        if not features:
            break

        rows = []
        for f in features:
            attrs = f.get("attributes", {})
            geom = f.get("geometry", {})
            rings = geom.get("rings")
            if not rings:
                continue

            wkt = rings_to_wkt(rings)
            rows.append((
                attrs.get("LOT_ID"),
                attrs.get("ZONING_TYPE"),
                attrs.get("EXISTING_LAND_USE"),
                attrs.get("FUTURE_LAND_USE"),
                wkt,
            ))

        if rows:
            execute_values(
                cur,
                """
                INSERT INTO ebr_lots_staging (lot_id, zoning_type, existing_land_use, future_land_use, geom)
                VALUES %s
                """,
                rows,
                template="(%s, %s, %s, %s, ST_GeomFromText(%s, 4326))",
                page_size=500,
            )
            conn.commit()

        total_inserted += len(rows)
        print(f"  Fetched {offset + len(features)} lots, staged {total_inserted}...")

        if len(features) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    print(f"Total staged: {total_inserted}")

    # 4. Spatial index on staging
    print("Building spatial index on staging table...")
    cur.execute("CREATE INDEX ON ebr_lots_staging USING GIST (geom)")
    conn.commit()

    # 5. Spatial join UPDATE
    print("Running spatial join UPDATE (this may take a few minutes)...")
    t0 = time.time()
    cur.execute("""
        UPDATE ebr_parcels p
        SET zoning_type = s.zoning_type,
            existing_land_use = s.existing_land_use,
            future_land_use = s.future_land_use
        FROM (
            SELECT DISTINCT ON (p2.id)
                p2.id,
                s2.zoning_type,
                s2.existing_land_use,
                s2.future_land_use
            FROM ebr_parcels p2
            JOIN ebr_lots_staging s2
                ON ST_Contains(p2.geom, ST_Centroid(s2.geom))
            ORDER BY p2.id
        ) s
        WHERE p.id = s.id
    """)
    updated = cur.rowcount
    conn.commit()
    elapsed = time.time() - t0
    print(f"Updated {updated:,} parcels in {elapsed:.1f}s")

    # 6. Drop staging
    print("Dropping staging table...")
    cur.execute("DROP TABLE IF EXISTS ebr_lots_staging")
    conn.commit()

    # 7. Summary
    cur.execute("""
        SELECT zoning_type, COUNT(*) as cnt
        FROM ebr_parcels
        WHERE zoning_type IS NOT NULL
        GROUP BY zoning_type
        ORDER BY cnt DESC
        LIMIT 20
    """)
    print("\nZoning distribution (top 20):")
    print(f"  {'Zoning Type':<20} {'Count':>8}")
    print(f"  {'-'*20} {'-'*8}")
    for row in cur.fetchall():
        print(f"  {row[0] or '(null)':<20} {row[1]:>8,}")

    cur.execute("SELECT COUNT(*) FROM ebr_parcels WHERE zoning_type IS NOT NULL")
    total_zoned = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM ebr_parcels")
    total_parcels = cur.fetchone()[0]
    print(f"\nTotal: {total_zoned:,} / {total_parcels:,} parcels have zoning data ({100*total_zoned/total_parcels:.1f}%)")

    cur.close()
    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
