#!/usr/bin/env python3
"""Sync Property DB parcels to CF D1 cache from Mac.

Reads parcels via gateway proxy SQL endpoint and writes to D1
via /sync/push (direct HTTP) or wrangler CLI (fallback).

Modes:
  - Incremental (default): compares upstream count vs D1, syncs only new parcels
  - Full (--full): re-syncs all parcels

Usage:
  python3 sync-from-mac.py              # incremental sync
  python3 sync-from-mac.py --full       # full sync (all parcels)
  python3 sync-from-mac.py --dry-run    # count only, no writes

Env vars (auto-read from apps/web/.env.local):
  GATEWAY_PROXY_TOKEN  - Bearer token for gateway proxy
  GATEWAY_PROXY_URL    - CF Worker URL (default: https://gateway.gallagherpropco.com)
  SYNC_TOKEN           - Token for /sync/push endpoint
"""

import argparse
import fcntl
import json
import logging
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

try:
    import requests
except ImportError:
    print("pip install requests")
    sys.exit(1)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("sync-from-mac")

PUSH_BATCH_SIZE = 500  # parcels per /sync/push call
WRANGLER_BATCH_SIZE = 500  # rows per wrangler d1 execute call
GATEWAY_ROW_LIMIT = 1000  # upstream now supports up to 1000
WRANGLER_DB = "gpc-gateway-cache"
SCRIPT_DIR = Path(__file__).parent.parent  # infra/gateway-proxy/
MAX_RETRIES = 3
LOCK_FILE = Path("/tmp/gpc-d1-sync.lock")
STATE_FILE = Path("/tmp/gpc-d1-sync-state.json")


def load_env():
    """Load tokens from apps/web/.env.local if not in environment."""
    env_file = SCRIPT_DIR.parent.parent / "apps" / "web" / ".env.local"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                if key.strip() not in os.environ:
                    os.environ[key.strip()] = val.strip()


def acquire_lock():
    """Acquire exclusive lock to prevent overlapping syncs."""
    try:
        lock_fd = open(LOCK_FILE, "w")
        fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        lock_fd.write(str(os.getpid()))
        lock_fd.flush()
        return lock_fd
    except (IOError, OSError):
        log.info("Another sync is running, skipping")
        sys.exit(0)


def escape_sql(s):
    """Escape string for SQLite."""
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"


def gateway_sql(session, gateway_url, token, sql, limit=None, upstream_mode=False, cf_headers=None):
    """Execute SQL via gateway, with retries.

    upstream_mode: if True, hit /tools/parcels.sql (upstream) instead of /parcels/sql (proxy),
                   and parse response without 'data' wrapper. Adds cache-bust param.
    """
    body = {"sql": sql}
    if limit:
        body["limit"] = limit

    if upstream_mode:
        endpoint = f"{gateway_url}/tools/parcels.sql?_cb={int(time.time())}"
    else:
        endpoint = f"{gateway_url}/parcels/sql"

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    if cf_headers:
        headers.update(cf_headers)

    for attempt in range(MAX_RETRIES):
        try:
            resp = session.post(
                endpoint,
                json=body,
                headers=headers,
                timeout=30,
            )
            if resp.status_code != 200:
                log.warning(f"HTTP {resp.status_code}, retry {attempt+1}")
                time.sleep(2 ** attempt)
                continue
            data = resp.json()
            if upstream_mode:
                # Upstream returns {ok, rows, ...} directly
                if not data.get("ok", True):
                    log.error(f"SQL error: {data.get('error', 'unknown')}")
                    return None
                return data.get("rows", [])
            else:
                # Proxy wraps in {data: {ok, rows, ...}}
                if not data.get("data", {}).get("ok", True):
                    err = data["data"].get("error", "unknown")
                    log.error(f"SQL error: {err}")
                    return None
                return data["data"].get("rows", [])
        except Exception as e:
            log.warning(f"Request error: {e}, retry {attempt+1}")
            time.sleep(2 ** attempt)
    return None


def get_d1_state():
    """Get current D1 parcel count and max parcel_id."""
    try:
        result = subprocess.run(
            ["npx", "wrangler", "d1", "execute", WRANGLER_DB,
             "--command", "SELECT count(*) as cnt, max(parcel_id) as max_id FROM parcels",
             "--json"],
            cwd=str(SCRIPT_DIR), capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0:
            data = json.loads(result.stdout)
            row = data[0]["results"][0]
            return row["cnt"], row["max_id"]
    except Exception as e:
        log.warning(f"Failed to read D1 state: {e}")
    return 0, None


def fetch_parcels(gateway_url, token, cursor="", limit=GATEWAY_ROW_LIMIT,
                   upstream_mode=False, cf_headers=None):
    """Fetch parcels using keyset pagination."""
    session = requests.Session()
    kw = dict(upstream_mode=upstream_mode, cf_headers=cf_headers)

    # Get upstream count
    rows = gateway_sql(session, gateway_url, token, "SELECT count(*) as total FROM ebr_parcels", **kw)
    total = rows[0]["total"] if rows else 0
    log.info(f"Upstream parcels: {total}")

    all_parcels = []
    batch_num = 0

    while True:
        if cursor:
            escaped_cursor = cursor.replace("'", "''")
            sql = f"SELECT * FROM ebr_parcels WHERE parcel_id > '{escaped_cursor}' ORDER BY parcel_id"
        else:
            sql = f"SELECT * FROM ebr_parcels ORDER BY parcel_id"

        rows = gateway_sql(session, gateway_url, token, sql, limit=limit, **kw)
        if rows is None:
            log.error(f"Failed to fetch after cursor '{cursor}', stopping")
            break
        if not rows:
            break

        all_parcels.extend(rows)
        cursor = rows[-1]["parcel_id"]
        batch_num += 1

        if batch_num % 20 == 0:
            pct = len(all_parcels) / total * 100 if total else 0
            log.info(f"Fetched {len(all_parcels)}/{total} ({pct:.1f}%) - cursor: {cursor}")

    log.info(f"Fetched {len(all_parcels)} total parcels")
    session.close()
    return all_parcels, total


def push_to_sync_endpoint(gateway_url, sync_token, parcels):
    """Push parcels via /sync/push endpoint (faster than wrangler CLI)."""
    session = requests.Session()
    batches = [parcels[i:i + PUSH_BATCH_SIZE] for i in range(0, len(parcels), PUSH_BATCH_SIZE)]
    success = 0

    for i, batch in enumerate(batches):
        formatted = []
        for p in batch:
            raw_data = {k: v for k, v in p.items() if k not in ("geom", "centroid")}
            formatted.append({
                "parcel_id": p.get("parcel_id"),
                "owner_name": p.get("owner"),
                "site_address": p.get("address"),
                "zoning_type": p.get("zoning_type"),
                "acres": float(p["acreage"]) if p.get("acreage") and str(p["acreage"]) != "None" else None,
                "assessed_value": float(p["assessed_value"]) if p.get("assessed_value") and str(p["assessed_value"]) != "None" else None,
                "raw_json": json.dumps(raw_data, default=str),
            })

        for attempt in range(MAX_RETRIES):
            try:
                resp = session.post(
                    f"{gateway_url}/sync/push",
                    json={"parcels": formatted},
                    headers={"X-Sync-Token": sync_token, "Content-Type": "application/json"},
                    timeout=30,
                )
                if resp.status_code == 200:
                    success += 1
                    break
                log.warning(f"Push batch {i+1} HTTP {resp.status_code}, retry {attempt+1}")
                time.sleep(2 ** attempt)
            except Exception as e:
                log.warning(f"Push batch {i+1} error: {e}, retry {attempt+1}")
                time.sleep(2 ** attempt)
        else:
            log.error(f"Push batch {i+1} failed after {MAX_RETRIES} retries")

        if (i + 1) % 20 == 0:
            log.info(f"Pushed {i+1}/{len(batches)} batches")

    session.close()
    return success, len(batches)


def build_insert_sql(parcels, synced_at):
    """Build INSERT OR REPLACE SQL for a batch of parcels."""
    lines = []
    for p in parcels:
        raw_data = {k: v for k, v in p.items() if k not in ("geom", "centroid")}
        raw = json.dumps(raw_data, default=str)
        acreage = p.get("acreage")
        assessed = p.get("assessed_value")
        vals = ", ".join([
            escape_sql(p.get("parcel_id")),
            escape_sql(p.get("owner")),
            escape_sql(p.get("address")),
            escape_sql(p.get("zoning_type")),
            str(acreage) if acreage is not None and str(acreage) != "None" else "NULL",
            "NULL",
            str(assessed) if assessed is not None and str(assessed) != "None" else "NULL",
            "NULL",
            escape_sql(raw),
            str(synced_at),
        ])
        lines.append(
            f"INSERT OR REPLACE INTO parcels "
            f"(parcel_id, owner_name, site_address, zoning_type, acres, legal_description, assessed_value, geometry, raw_json, synced_at) "
            f"VALUES ({vals});"
        )
    return "\n".join(lines)


def execute_d1_sql(sql_content):
    """Execute SQL against D1 using wrangler."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".sql", delete=False, dir="/tmp") as f:
        f.write(sql_content)
        f.flush()
        try:
            result = subprocess.run(
                ["npx", "wrangler", "d1", "execute", WRANGLER_DB, "--file", f.name, "--yes"],
                cwd=str(SCRIPT_DIR),
                capture_output=True,
                text=True,
                timeout=120,
            )
            if result.returncode != 0:
                log.error(f"wrangler error: {result.stderr[:500]}")
                return False
            return True
        finally:
            os.unlink(f.name)


def write_via_wrangler(parcels, synced_at):
    """Write parcels to D1 using wrangler CLI (fallback)."""
    batches = [parcels[i:i + WRANGLER_BATCH_SIZE] for i in range(0, len(parcels), WRANGLER_BATCH_SIZE)]
    success = 0
    for i, batch in enumerate(batches):
        sql = build_insert_sql(batch, synced_at)
        if execute_d1_sql(sql):
            success += 1
        else:
            log.error(f"Wrangler batch {i+1} failed")
        if (i + 1) % 20 == 0:
            log.info(f"D1 wrangler batch {i+1}/{len(batches)} done")
    return success, len(batches)


def main():
    parser = argparse.ArgumentParser(description="Sync Property DB to D1 from Mac")
    parser.add_argument("--full", action="store_true", help="Full sync (all parcels)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--use-wrangler", action="store_true", help="Force wrangler CLI instead of /sync/push")
    args = parser.parse_args()

    load_env()
    sync_token = os.environ.get("SYNC_TOKEN")
    proxy_url = os.environ.get("GATEWAY_PROXY_URL", "https://gateway.gallagherpropco.com")

    # Fetch from upstream directly (bypasses proxy D1 cache)
    upstream_url = os.environ.get("UPSTREAM_GATEWAY_URL", "https://api.gallagherpropco.com")
    upstream_token = os.environ.get("LOCAL_API_KEY")
    cf_headers = {}
    if os.environ.get("CF_ACCESS_CLIENT_ID"):
        cf_headers["CF-Access-Client-Id"] = os.environ["CF_ACCESS_CLIENT_ID"]
    if os.environ.get("CF_ACCESS_CLIENT_SECRET"):
        cf_headers["CF-Access-Client-Secret"] = os.environ["CF_ACCESS_CLIENT_SECRET"]

    if not upstream_token:
        log.error("LOCAL_API_KEY not set")
        sys.exit(1)

    # Acquire lock
    lock_fd = acquire_lock()

    start = time.time()

    # Determine sync mode — always fetch from upstream
    fetch_kw = dict(upstream_mode=True, cf_headers=cf_headers)

    if args.full:
        log.info("Full sync mode (fetching from upstream)")
        parcels, upstream_total = fetch_parcels(upstream_url, upstream_token, **fetch_kw)
    else:
        # Incremental: check D1 state, only fetch new parcels
        d1_count, d1_max_id = get_d1_state()
        log.info(f"D1 state: {d1_count} parcels, max_id: {d1_max_id}")

        # Quick count check from upstream
        session = requests.Session()
        rows = gateway_sql(session, upstream_url, upstream_token,
                           "SELECT count(*) as total FROM ebr_parcels", **fetch_kw)
        upstream_total = rows[0]["total"] if rows else 0
        session.close()
        log.info(f"Upstream parcels: {upstream_total}")

        if d1_count >= upstream_total and d1_max_id:
            log.info("D1 is up to date, nothing to sync")
            lock_fd.close()
            return

        # Fetch only parcels after the max D1 parcel_id
        cursor = d1_max_id or ""
        log.info(f"Incremental sync from cursor: {cursor}")
        parcels, _ = fetch_parcels(upstream_url, upstream_token, cursor=cursor, **fetch_kw)

        if not parcels:
            log.info("No new parcels found")
            lock_fd.close()
            return

    if args.dry_run:
        elapsed = time.time() - start
        log.info(f"[dry-run] Would sync {len(parcels)} parcels ({elapsed:.0f}s fetch)")
        lock_fd.close()
        return

    synced_at = int(time.time())

    # Try /sync/push on proxy (faster), fall back to wrangler
    if sync_token and not args.use_wrangler:
        log.info(f"Pushing {len(parcels)} parcels via /sync/push...")
        success, total_batches = push_to_sync_endpoint(proxy_url, sync_token, parcels)
        if success < total_batches * 0.5:
            log.warning(f"Push had too many failures ({success}/{total_batches}), falling back to wrangler")
            success, total_batches = write_via_wrangler(parcels, synced_at)
    else:
        log.info(f"Writing {len(parcels)} parcels via wrangler CLI...")
        success, total_batches = write_via_wrangler(parcels, synced_at)

    # Update sync_status via wrangler (always works)
    status_sql = (
        f"INSERT OR REPLACE INTO sync_status (id, last_sync_at, rows_synced, last_error, updated_at) "
        f"VALUES ('main', {synced_at}, {upstream_total}, NULL, {synced_at});"
    )
    execute_d1_sql(status_sql)

    elapsed = time.time() - start
    log.info(f"Done. {success}/{total_batches} batches succeeded. {len(parcels)} parcels in {elapsed:.0f}s")
    lock_fd.close()


if __name__ == "__main__":
    main()
