# Supabase → Local PostGIS Migration

Migrates real estate spatial data from Supabase (gpc-dashboard) to local PostGIS for Martin tile server.

## Setup

```bash
pip install -r requirements.txt
```

## Usage

```bash
# Dry run (discover tables, count rows)
python migrate_supabase_to_local.py --dry-run

# Full migration
python migrate_supabase_to_local.py
```

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `SUPABASE_DATABASE_URI` | — | Source Postgres URI (or use `DIRECT_DATABASE_URL` / `DATABASE_URL` from `.env`) |
| `LOCAL_DATABASE_URI` | `postgresql://postgres:Nola0528!@localhost:5432/cres_db` | Target local PostGIS |

## Tables Migrated

- `ebr_parcels` — EBR parcel boundaries (~199K rows)
- `epa_facilities` — EPA facility locations
- `fema_flood` — FEMA flood zones
- `soils` — Soil survey polygons
- `wetlands` — NWI wetlands

Each geometry column gets a GIST spatial index for map rendering.

## Local PostGIS (Docker)

If local Postgres is not running:

```bash
docker compose -f docker-compose.postgis.yml up -d
```

Credentials: `postgres:Nola0528!@localhost:5432/cres_db` (matches Martin config).
