#!/usr/bin/env python3
"""
Migrate real estate data from Supabase (gpc-dashboard) to local PostGIS (cres_db).

Uses SQLAlchemy + GeoAlchemy2 for schema handling and psycopg2 for geometry-preserving
batch copy. Parallelizes table migration across CPU cores for speed.

Usage:
  python migrate_supabase_to_local.py [--dry-run]

Env:
  SUPABASE_DATABASE_URI  — Source (default: DIRECT_DATABASE_URL or DATABASE_URL)
  LOCAL_DATABASE_URI     — Target (default: postgresql://postgres:Nola0528!@localhost:5432/cres_db)
"""

from __future__ import annotations

import argparse
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import contextmanager
from typing import Generator

import warnings

from dotenv import load_dotenv
from geoalchemy2 import Geometry
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import SAWarning

warnings.filterwarnings("ignore", message="Did not recognize type 'vector'", category=SAWarning)
from sqlalchemy.engine import Engine
from sqlalchemy.engine.reflection import Inspector

# Load .env from repo root
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

# Default target — Martin tile server expects cres_db
DEFAULT_LOCAL_URI = "postgresql://postgres:Nola0528!@localhost:5432/cres_db"

# Tables known to have geometry columns (for GIST index creation)
GEOMETRY_TABLE_HINTS: dict[str, list[str]] = {
    "ebr_parcels": ["geom"],
    "epa_facilities": ["geom"],
    "fema_flood": ["geom"],
    "soils": ["geom"],
    "wetlands": ["geom"],
    "traffic_counts": ["geom"],
    "ldeq_permits": ["geom"],
}

BATCH_SIZE = 5000
MAX_WORKERS = 8  # 12-core i7: leave headroom for I/O


def _normalize_uri(uri: str) -> str:
    """Strip schema= from query string; psycopg2 does not support it."""
    if "?" in uri:
        base, qs = uri.split("?", 1)
        params = [p for p in qs.split("&") if not p.lower().startswith("schema=")]
        if params:
            return f"{base}?{'&'.join(params)}"
        return base
    return uri


def get_source_uri() -> str:
    uri = (
        os.environ.get("SUPABASE_DATABASE_URI")
        or os.environ.get("DIRECT_DATABASE_URL")
        or os.environ.get("DATABASE_URL")
        or ""
    ).strip()
    if not uri:
        print(
            "[migrate] Set SUPABASE_DATABASE_URI, DIRECT_DATABASE_URL, or DATABASE_URL",
            file=sys.stderr,
        )
        sys.exit(1)
    return _normalize_uri(uri)


def get_target_uri() -> str:
    uri = (
        os.environ.get("LOCAL_DATABASE_URI") or DEFAULT_LOCAL_URI
    ).strip()
    return _normalize_uri(uri)


@contextmanager
def engine_ctx(uri: str) -> Generator[Engine, None, None]:
    eng = create_engine(
        uri,
        pool_pre_ping=True,
        pool_size=2,
        max_overflow=4,
    )
    try:
        yield eng
    finally:
        eng.dispose()


def ensure_postgis(engine: Engine) -> None:
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
        conn.commit()


def list_spatial_tables(engine: Engine) -> list[str]:
    """Discover tables that have geometry columns."""
    inspector: Inspector = inspect(engine)
    tables = inspector.get_table_names(schema="public")
    spatial: list[str] = []
    for t in tables:
        cols = inspector.get_columns(t, schema="public")
        for c in cols:
            if isinstance(c.get("type"), Geometry) or (
                hasattr(c.get("type"), "name")
                and str(c.get("type").name).lower() == "geometry"
            ):
                spatial.append(t)
                break
        else:
            # Check by querying pg_attribute for geometry
            with engine.connect() as conn:
                r = conn.execute(
                    text("""
                        SELECT 1 FROM information_schema.columns c
                        JOIN pg_type pt ON pt.typname = c.udt_name
                        WHERE c.table_schema = 'public' AND c.table_name = :t
                        AND (pt.typname = 'geometry' OR c.udt_name = 'geometry')
                        LIMIT 1
                    """),
                    {"t": t},
                )
                if r.scalar():
                    spatial.append(t)
    return spatial


def get_geometry_columns(engine: Engine, table: str) -> list[str]:
    """Return geometry column names for a table."""
    with engine.connect() as conn:
        r = conn.execute(
            text("""
                SELECT c.column_name
                FROM information_schema.columns c
                WHERE c.table_schema = 'public' AND c.table_name = :t
                AND c.udt_name = 'geometry'
            """),
            {"t": table},
        )
        return [row[0] for row in r]


def get_create_table_ddl(engine: Engine, table: str) -> str:
    """Build CREATE TABLE DDL from pg_catalog (avoids pg_dump version mismatch)."""
    with engine.connect() as conn:
        r = conn.execute(
            text("""
                SELECT
                    a.attname,
                    pg_catalog.format_type(a.atttypid, a.atttypmod) AS typ,
                    NOT a.attnotnull AS nullable,
                    pg_get_expr(d.adbin, d.adrelid) AS default_expr
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                JOIN pg_attribute a ON a.attrelid = c.oid
                LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
                WHERE n.nspname = 'public' AND c.relname = :t
                AND a.attnum > 0 AND NOT a.attisdropped
                ORDER BY a.attnum
            """),
            {"t": table},
        )
        rows = r.fetchall()
    if not rows:
        return ""
    col_defs = []
    pkey_cols: list[str] = []
    for attname, typ, nullable, default_expr in rows:
        qname = f'"{attname}"' if attname.lower() != attname or attname in ("user", "order") else attname
        parts = [qname, typ]
        if not nullable:
            parts.append("NOT NULL")
        if default_expr:
            parts.append(f"DEFAULT {default_expr}")
        col_defs.append(" ".join(parts))
    with engine.connect() as conn:
        r = conn.execute(
            text("""
                SELECT a.attname FROM pg_index i
                JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
                JOIN pg_class c ON c.oid = i.indrelid
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relname = :t
                AND i.indisprimary AND a.attnum > 0 AND NOT a.attisdropped
            """),
            {"t": table},
        )
        pkey_cols = [row[0] for row in r.fetchall()]
    if pkey_cols:
        pk_list = ", ".join(f'"{c}"' for c in pkey_cols)
        col_defs.append(f"PRIMARY KEY ({pk_list})")

    # Replace nextval('table_id_seq'::regclass) with plain SERIAL-like: create sequence first
    ddl = f'CREATE TABLE public."{table}" (\n  ' + ",\n  ".join(col_defs) + "\n)"
    import re
    seq_match = re.search(r"nextval\('([^']+_seq)'::regclass\)", ddl)
    if seq_match:
        seq_name = seq_match.group(1)
        ddl = ddl.replace(
            f"nextval('{seq_name}'::regclass)",
            f"nextval('public.{seq_name}'::regclass)",
        )
        # Prepend CREATE SEQUENCE so it exists before CREATE TABLE
        ddl = f"CREATE SEQUENCE IF NOT EXISTS public.{seq_name};\n" + ddl
    return ddl


def create_table_from_source(source: Engine, target: Engine, table: str) -> bool:
    """Create table on target using source schema. Drops existing table first."""
    ddl = get_create_table_ddl(source, table)
    if not ddl:
        return False
    with target.connect() as conn:
        conn.execute(text(f'DROP TABLE IF EXISTS public."{table}" CASCADE'))
        conn.execute(text(f'DROP SEQUENCE IF EXISTS public."{table}_id_seq" CASCADE'))
        for stmt in ddl.split(";"):
            stmt = stmt.strip()
            if stmt and not stmt.startswith("--"):
                conn.execute(text(stmt))
        conn.commit()
    return True


def ensure_gist_indexes(target: Engine, table: str, geom_cols: list[str]) -> None:
    for col in geom_cols:
        idx = f"idx_{table}_{col}_gist"
        with target.connect() as conn:
            conn.execute(
                text(
                    f'CREATE INDEX IF NOT EXISTS {idx} ON public.{table} USING gist ("{col}")'
                )
            )
            conn.commit()


def copy_table_batched(
    source_uri: str,
    target_uri: str,
    table: str,
    dry_run: bool,
) -> int:
    """Copy table data in batches. Returns row count."""
    import psycopg2
    from psycopg2.extras import execute_values

    if dry_run:
        with psycopg2.connect(source_uri) as src:
            with src.cursor() as cur:
                cur.execute(f'SELECT COUNT(*) FROM public."{table}"')
                return cur.fetchone()[0]

    src = psycopg2.connect(source_uri)
    tgt = psycopg2.connect(target_uri)
    try:
        with src.cursor() as cur:
            cur.execute(f'SELECT * FROM public."{table}" LIMIT 1')
            cols = [d[0] for d in cur.description]
        col_list = ", ".join(f'"{c}"' for c in cols)
        placeholders = ", ".join("%s" for _ in cols)
        insert_sql = f'INSERT INTO public."{table}" ({col_list}) VALUES %s'

        total = 0
        offset = 0
        while True:
            with src.cursor() as cur:
                cur.execute(
                    f'SELECT * FROM public."{table}" ORDER BY ctid LIMIT %s OFFSET %s',
                    (BATCH_SIZE, offset),
                )
                rows = cur.fetchall()
            if not rows:
                break
            with tgt.cursor() as cur:
                execute_values(
                    cur, insert_sql, rows,
                    template=f"({placeholders})",
                    page_size=BATCH_SIZE,
                )
            tgt.commit()
            total += len(rows)
            offset += BATCH_SIZE
            print(f"  {table}: {total} rows...", end="\r")
            if len(rows) < BATCH_SIZE:
                break
        return total
    finally:
        src.close()
        tgt.close()


def migrate_table(
    source_uri: str,
    target_uri: str,
    table: str,
    dry_run: bool,
) -> tuple[str, int, str | None]:
    """Migrate one table. Returns (table_name, row_count, error)."""
    try:
        if dry_run:
            count = copy_table_batched(source_uri, target_uri, table, dry_run=True)
            return (table, count, None)
        with engine_ctx(source_uri) as src_eng, engine_ctx(target_uri) as tgt_eng:
            ensure_postgis(tgt_eng)
            create_table_from_source(src_eng, tgt_eng, table)
            geom_cols = get_geometry_columns(src_eng, table)
            if not geom_cols and table in GEOMETRY_TABLE_HINTS:
                geom_cols = GEOMETRY_TABLE_HINTS[table]
            if geom_cols:
                ensure_gist_indexes(tgt_eng, table, geom_cols)
            count = copy_table_batched(source_uri, target_uri, table, dry_run=False)
            return (table, count, None)
    except Exception as e:
        return (table, 0, str(e))


def create_mv_parcel_intelligence(target: Engine) -> None:
    """Create materialized view for Martin tile performance (matches production)."""
    with target.connect() as conn:
        conn.execute(text("""
            CREATE MATERIALIZED VIEW IF NOT EXISTS mv_parcel_intelligence AS
            SELECT
                p.id, p.parcel_id, p.address, p.area_sqft, p.owner, p.assessed_value,
                p.geom,
                ST_Centroid(p.geom) AS centroid,
                ST_XMin(p.geom) AS bbox_minx, ST_YMin(p.geom) AS bbox_miny,
                ST_XMax(p.geom) AS bbox_maxx, ST_YMax(p.geom) AS bbox_maxy
            FROM ebr_parcels p
            WHERE p.geom IS NOT NULL
        """))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_parcel_intelligence_parcel_id ON mv_parcel_intelligence (parcel_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_mv_parcel_intelligence_geom ON mv_parcel_intelligence USING gist (geom)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_mv_parcel_intelligence_centroid ON mv_parcel_intelligence USING gist (centroid)"))
        conn.commit()


def create_get_parcel_mvt(target: Engine) -> None:
    """Create get_parcel_mvt RPC for vector tiles (used by /api/map/tiles)."""
    with target.connect() as conn:
        conn.execute(text("""
            CREATE OR REPLACE FUNCTION get_parcel_mvt(z int, x int, y int)
            RETURNS bytea
            LANGUAGE plpgsql STABLE PARALLEL SAFE
            AS $$
            DECLARE tile_extent geometry; tile_bbox_4326 geometry; result bytea;
            BEGIN
              IF z < 10 THEN RETURN NULL; END IF;
              tile_extent := ST_TileEnvelope(z, x, y);
              tile_bbox_4326 := ST_Transform(tile_extent::geometry, 4326);
              SELECT ST_AsMVT(tile, 'parcels', 4096, 'geom')::bytea INTO result
              FROM (
                SELECT parcel_id, address, area_sqft, owner, assessed_value,
                  ST_AsMVTGeom(ST_Transform(ST_CurveToLine(geom), 3857), tile_extent::geometry, 4096, 256, true) AS geom
                FROM mv_parcel_intelligence
                WHERE geom IS NOT NULL AND ST_Intersects(geom, tile_bbox_4326)
              ) tile;
              RETURN result;
            END;
            $$;
        """))
        conn.commit()


def ensure_local_db_exists(target_uri: str) -> None:
    """Create cres_db if missing. Connects to postgres DB to create."""
    import urllib.parse
    parsed = urllib.parse.urlparse(target_uri)
    path_part = (parsed.path or "/postgres").lstrip("/").split("?")[0]
    dbname = path_part or "postgres"
    if dbname == "postgres":
        return
    # Build URI for default postgres DB
    base = f"{parsed.scheme}://{parsed.netloc}/"
    admin_uri = urllib.parse.urlunparse(parsed._replace(path=f"/postgres"))
    admin_uri = _normalize_uri(admin_uri)
    try:
        with engine_ctx(admin_uri) as eng:
            with eng.connect() as conn:
                r = conn.execute(text("SELECT 1 FROM pg_database WHERE datname = :d"), {"d": dbname})
                if not r.scalar():
                    conn.execute(text(f'CREATE DATABASE "{dbname}"'))
                    conn.commit()
                    print(f"[migrate] Created database {dbname}")
    except Exception as e:
        print(f"[migrate] Could not ensure DB exists (will try anyway): {e}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate Supabase real estate data to local PostGIS")
    parser.add_argument("--dry-run", action="store_true", help="Discover tables only, no copy")
    args = parser.parse_args()

    source_uri = get_source_uri()
    target_uri = get_target_uri()

    print(f"[migrate] Source: {source_uri.split('@')[1] if '@' in source_uri else '***'}")
    print(f"[migrate] Target: {target_uri.split('@')[1] if '@' in target_uri else target_uri}")

    # Pre-flight: ensure local DB exists and is reachable
    if not args.dry_run:
        try:
            ensure_local_db_exists(target_uri)
        except Exception as e:
            print(f"[migrate] Local DB unreachable: {e}")
            print("[migrate] Start Postgres (e.g. Docker or local install) and ensure cres_db exists.")
            sys.exit(1)
    if args.dry_run:
        print("[migrate] DRY RUN — no data copy")

    with engine_ctx(source_uri) as src_eng:
        tables = list_spatial_tables(src_eng)
        if not tables:
            # Fallback to known tables
            tables = list(GEOMETRY_TABLE_HINTS.keys())
            with src_eng.connect() as conn:
                existing = []
                for t in tables:
                    r = conn.execute(text(
                        "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=:t"
                    ), {"t": t})
                    if r.scalar():
                        existing.append(t)
                tables = existing
        print(f"[migrate] Tables to migrate: {tables}")

    if not tables:
        print("[migrate] No spatial tables found. Exiting.")
        sys.exit(0)

    results: list[tuple[str, int, str | None]] = []
    with ThreadPoolExecutor(max_workers=min(MAX_WORKERS, len(tables))) as ex:
        futures = {
            ex.submit(migrate_table, source_uri, target_uri, t, args.dry_run): t
            for t in tables
        }
        for fut in as_completed(futures):
            results.append(fut.result())

    print("\n[migrate] Summary:")
    for table, count, err in sorted(results, key=lambda x: x[0]):
        if err:
            print(f"  {table}: ERROR — {err}")
        else:
            print(f"  {table}: {count} rows")

    # Post-migration: create mv_parcel_intelligence + get_parcel_mvt for tile serving
    if not args.dry_run and not any(r[2] for r in results if r[0] == "ebr_parcels"):
        try:
            with engine_ctx(target_uri) as tgt_eng:
                create_mv_parcel_intelligence(tgt_eng)
                create_get_parcel_mvt(tgt_eng)
                print("[migrate] Created mv_parcel_intelligence + get_parcel_mvt (tile-ready)")
        except Exception as e:
            print(f"[migrate] post-migration: {e}")

    errors = [r for r in results if r[2]]
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
