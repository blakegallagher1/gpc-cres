#!/usr/bin/env python3
"""Sync Property DB parcels to CF Worker D1 cache.

Runs on the Windows PC via Windows Task Scheduler every 15 minutes.
Queries the local Property DB and POSTs batches to the CF Worker /admin/sync endpoint.

Usage:
  python sync-to-d1.py                    # incremental sync (since last run)
  python sync-to-d1.py --full             # full sync (all parcels)
  python sync-to-d1.py --dry-run          # show what would sync, don't push

Env vars:
  DATABASE_URL          - Property DB connection string (postgresql://...)
  GATEWAY_PROXY_URL     - CF Worker URL (https://gateway.gallagherpropco.com)
  SYNC_TOKEN            - Auth token for /admin/sync endpoint
"""

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("pip install psycopg2-binary")
    sys.exit(1)

try:
    import requests
except ImportError:
    print("pip install requests")
    sys.exit(1)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("sync-to-d1")

BATCH_SIZE = 1000
SYNC_STATE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".sync-state.json")


def load_last_sync() -> int:
    """Load unix timestamp of last successful sync."""
    try:
        with open(SYNC_STATE_FILE) as f:
            return json.load(f).get("last_sync_at", 0)
    except (FileNotFoundError, json.JSONDecodeError):
        return 0


def save_last_sync(ts: int):
    with open(SYNC_STATE_FILE, "w") as f:
        json.dump({"last_sync_at": ts, "synced_at_human": datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()}, f)


def fetch_parcels(conn, since_ts: int, full: bool):
    """Yield batches of parcels from Property DB."""
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    if full:
        cur.execute("""
            SELECT parcel_id, owner_name, site_address, zoning_type,
                   acres, legal_description, assessed_value,
                   ST_AsGeoJSON(geom) as geometry
            FROM ebr_parcels
            ORDER BY parcel_id
        """)
    else:
        cur.execute("""
            SELECT parcel_id, owner_name, site_address, zoning_type,
                   acres, legal_description, assessed_value,
                   ST_AsGeoJSON(geom) as geometry
            FROM ebr_parcels
            WHERE EXTRACT(EPOCH FROM COALESCE(updated_at, created_at, NOW())) > %s
            ORDER BY parcel_id
        """, (since_ts,))

    batch = []
    for row in cur:
        raw = dict(row)
        batch.append({
            "parcel_id": raw["parcel_id"],
            "owner_name": raw.get("owner_name"),
            "site_address": raw.get("site_address"),
            "zoning_type": raw.get("zoning_type"),
            "acres": float(raw["acres"]) if raw.get("acres") else None,
            "legal_description": raw.get("legal_description"),
            "assessed_value": float(raw["assessed_value"]) if raw.get("assessed_value") else None,
            "geometry": raw.get("geometry"),
            "raw_json": json.dumps(raw, default=str),
        })
        if len(batch) >= BATCH_SIZE:
            yield batch
            batch = []
    if batch:
        yield batch
    cur.close()


def push_batch(gateway_url: str, sync_token: str, parcels: list) -> dict:
    """POST a batch of parcels to the CF Worker sync endpoint."""
    resp = requests.post(
        f"{gateway_url}/admin/sync",
        json={"parcels": parcels},
        headers={"X-Sync-Token": sync_token, "Content-Type": "application/json"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def main():
    parser = argparse.ArgumentParser(description="Sync Property DB to D1 cache")
    parser.add_argument("--full", action="store_true", help="Full sync (all parcels)")
    parser.add_argument("--dry-run", action="store_true", help="Show counts, don't push")
    args = parser.parse_args()

    db_url = os.environ.get("DATABASE_URL")
    gateway_url = os.environ.get("GATEWAY_PROXY_URL", "https://gateway.gallagherpropco.com")
    sync_token = os.environ.get("SYNC_TOKEN")

    if not db_url:
        log.error("DATABASE_URL not set")
        sys.exit(1)
    if not sync_token and not args.dry_run:
        log.error("SYNC_TOKEN not set")
        sys.exit(1)

    since_ts = 0 if args.full else load_last_sync()
    sync_start = int(time.time())

    log.info("Connecting to Property DB...")
    conn = psycopg2.connect(db_url)

    total_rows = 0
    total_batches = 0

    try:
        for batch in fetch_parcels(conn, since_ts, args.full):
            total_batches += 1
            total_rows += len(batch)

            if args.dry_run:
                log.info(f"[dry-run] Batch {total_batches}: {len(batch)} parcels")
                continue

            log.info(f"Pushing batch {total_batches} ({len(batch)} parcels)...")
            try:
                result = push_batch(gateway_url, sync_token, batch)
                log.info(f"  -> synced: {result}")
            except Exception as e:
                log.error(f"  -> FAILED: {e}")
                # Continue with next batch instead of aborting
                continue

        if not args.dry_run and total_rows > 0:
            save_last_sync(sync_start)

        log.info(f"Done. {total_rows} parcels in {total_batches} batches.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
