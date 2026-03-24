#!/usr/bin/env python3
"""Load Louisiana ZCTA (ZIP code) polygons into the property database.

Downloads Census Bureau ZCTA GeoJSON and inserts into the zcta table.
Requires: psycopg2-binary, requests

Usage:
  # Via CF DB tunnel:
  cloudflared access tcp --hostname db.gallagherpropco.com --url localhost:54399
  DATABASE_URL=postgresql://postgres:postgres@localhost:54399/entitlement_os python3 load-zcta.py

  # Direct (on Windows PC):
  DATABASE_URL=postgresql://postgres:postgres@localhost:5432/entitlement_os python3 load-zcta.py
"""

import json
import os
import sys
import tempfile
import urllib.request

GEOJSON_URL = "https://raw.githubusercontent.com/OpenDataDE/State-zip-code-GeoJSON/master/la_louisiana_zip_codes_geo.min.json"

def main():
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("Set DATABASE_URL environment variable")
        sys.exit(1)

    try:
        import psycopg2
    except ImportError:
        print("pip install psycopg2-binary")
        sys.exit(1)

    # Download GeoJSON
    print(f"Downloading ZCTA data from {GEOJSON_URL}...")
    with urllib.request.urlopen(GEOJSON_URL) as resp:
        data = json.loads(resp.read())

    features = data.get("features", [])
    print(f"Found {len(features)} ZCTAs")

    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    # Create table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS zcta (
            id SERIAL PRIMARY KEY,
            zip TEXT NOT NULL,
            state_fips TEXT,
            land_area_sqm BIGINT,
            water_area_sqm BIGINT,
            lat NUMERIC,
            lon NUMERIC,
            geom GEOMETRY(MultiPolygon, 4326)
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_zcta_zip ON zcta(zip)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_zcta_geom ON zcta USING GIST(geom)")

    # Clear existing data
    cur.execute("TRUNCATE zcta RESTART IDENTITY")

    # Insert features
    for i, feat in enumerate(features):
        props = feat["properties"]
        geom = feat["geometry"]

        # Normalize to MultiPolygon
        if geom["type"] == "Polygon":
            geom = {"type": "MultiPolygon", "coordinates": [geom["coordinates"]]}

        cur.execute(
            """INSERT INTO zcta (zip, state_fips, land_area_sqm, water_area_sqm, lat, lon, geom)
               VALUES (%s, %s, %s, %s, %s, %s, ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326))""",
            (
                props["ZCTA5CE10"],
                props["STATEFP10"],
                props.get("ALAND10", 0),
                props.get("AWATER10", 0),
                float(props.get("INTPTLAT10", 0)),
                float(props.get("INTPTLON10", 0)),
                json.dumps(geom),
            ),
        )

        if (i + 1) % 100 == 0:
            print(f"  Inserted {i + 1}/{len(features)}")

    conn.commit()

    cur.execute("SELECT count(*) FROM zcta")
    count = cur.fetchone()[0]
    print(f"Done. {count} ZCTAs loaded.")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
