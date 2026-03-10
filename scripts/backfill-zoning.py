#!/usr/bin/env python3
"""
Backfill zoning_type for EBR parcels using EBRGIS identify endpoint.
Queries each parcel's centroid against the Cadastral/Lot MapServer.
Processes in batches with rate limiting to avoid API throttling.
"""
import json
import sys
import time
import urllib.request
import urllib.parse
import psycopg2
from psycopg2.extras import execute_values

# Force unbuffered output
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

DB_DSN = "postgresql://postgres:postgres@localhost:54399/entitlement_os"
IDENTIFY_URL = "https://maps.brla.gov/gis/rest/services/Cadastral/Lot/MapServer/identify"

BATCH_SIZE = 100  # DB fetch batch
COMMIT_EVERY = 500  # commit to DB every N updates
DELAY_PER_REQUEST = 0.15  # seconds between API calls (avoid rate limit)


def identify_point(lng: float, lat: float) -> dict | None:
    """Query EBRGIS identify endpoint for a single point. Returns attributes or None."""
    params = urllib.parse.urlencode({
        "geometry": f"{lng},{lat}",
        "geometryType": "esriGeometryPoint",
        "sr": "4326",
        "layers": "all:0",
        "tolerance": "2",
        "mapExtent": f"{lng-0.01},{lat-0.01},{lng+0.01},{lat+0.01}",
        "imageDisplay": "100,100,96",
        "returnGeometry": "false",
        "f": "json",
    })
    url = f"{IDENTIFY_URL}?{params}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "GPC-ZoningBackfill/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            results = data.get("results", [])
            if results:
                return results[0].get("attributes", {})
    except Exception as e:
        print(f"  API error for ({lng},{lat}): {e}", file=sys.stderr)
    return None


def main():
    conn = psycopg2.connect(DB_DSN)
    conn.autocommit = False
    cur = conn.cursor()

    # Get all unmatched EBR parcels
    cur.execute("""
        SELECT id, ST_X(ST_Centroid(geom)) as lng, ST_Y(ST_Centroid(geom)) as lat
        FROM ebr_parcels
        WHERE parish = 'East Baton Rouge'
          AND zoning_type IS NULL
          AND geom IS NOT NULL
        ORDER BY id
    """)
    parcels = cur.fetchall()
    total = len(parcels)
    print(f"Found {total} EBR parcels without zoning data")

    updated = 0
    skipped = 0
    errors = 0
    updates_pending = []

    for i, (parcel_id, lng, lat) in enumerate(parcels):
        attrs = identify_point(lng, lat)

        if attrs:
            zoning = attrs.get("Zoning Type") or attrs.get("ZONING_TYPE")
            elu = attrs.get("Existing Land Use") or attrs.get("EXISTING_LAND_USE")
            flu = attrs.get("Future Land Use") or attrs.get("FUTURE_LAND_USE")

            if zoning:
                updates_pending.append((zoning, elu, flu, parcel_id))
                updated += 1
            else:
                skipped += 1
        else:
            errors += 1

        # Commit in batches
        if len(updates_pending) >= COMMIT_EVERY:
            cur.executemany(
                "UPDATE ebr_parcels SET zoning_type=%s, existing_land_use=%s, future_land_use=%s WHERE id=%s",
                updates_pending
            )
            conn.commit()
            updates_pending = []

        # Progress
        if (i + 1) % 500 == 0 or i == total - 1:
            pct = (i + 1) / total * 100
            print(f"  [{i+1}/{total}] {pct:.1f}% — updated: {updated}, skipped: {skipped}, errors: {errors}")

        time.sleep(DELAY_PER_REQUEST)

    # Final commit
    if updates_pending:
        cur.executemany(
            "UPDATE ebr_parcels SET zoning_type=%s, existing_land_use=%s, future_land_use=%s WHERE id=%s",
            updates_pending
        )
        conn.commit()

    print(f"\nDone. Updated: {updated}, Skipped (no zoning): {skipped}, Errors: {errors}")

    # Final count
    cur.execute("SELECT count(*) FROM ebr_parcels WHERE parish='East Baton Rouge' AND zoning_type IS NOT NULL")
    final = cur.fetchone()[0]
    print(f"Total EBR parcels with zoning: {final}/198949 ({final/198949*100:.1f}%)")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
