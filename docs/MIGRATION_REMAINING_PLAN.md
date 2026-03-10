# Migration Remaining Items — Step 2 & Step 4

> **Status: Completed migration record (historical, non-authoritative for current operations).**
> This document is retained for audit traceability and contains completed one-time migration procedures.
> Use current operational docs (`README.md`, `ROADMAP.md`, `docs/SPEC.md`) for live runbooks.

Plan for the Supabase → local migration. **All steps complete** (2026-02-24).

---

## Step 2: DB Migration (Supabase → entitlement-db)

**Status:** ✅ Done (2026-02-24). 61 public tables + data_agent_validation schemas restored. Key counts: deals 1, conversations 70, messages 136, runs 316, users 9, ebr_parcels 198K. Expected errors: Supabase-only extensions (pg_cron, pg_graphql, supabase_vault, vector) skipped; postgis/pg_trgm kept; geo tables already present. Dump file deleted, proxy stopped. **Rotate Supabase DB password.**

### Prerequisites

- Supabase direct database password (Dashboard → Settings → Database → Connection string / Database password)
- `pg_dump` 17+ (Supabase runs PG 17; older pg_dump will fail with version mismatch)
- Mac: `/opt/homebrew/opt/postgresql@17/bin/pg_dump` or `brew install postgresql@17`
- Cloudflare Tunnel `db.gallagherpropco.com` route configured (see `docs/CLOUDFLARE.md`)

### 2a. Dump from Supabase (from Mac)

Exclude geo tables (already in cres_db): `ebr_parcels`, `fema_flood`, `soils`, `wetlands`, `epa_facilities`, `spatial_ref_sys`.

```bash
# Replace YOUR_SUPABASE_PASSWORD with the actual password (from dashboard; do not commit)
/opt/homebrew/opt/postgresql@17/bin/pg_dump \
  "postgresql://postgres:YOUR_SUPABASE_PASSWORD@db.yjddspdbxuseowxndrak.supabase.co:5432/postgres" \
  --no-owner --no-privileges --clean --if-exists \
  -N auth -N storage -N supabase_* -N _realtime \
  -T ebr_parcels -T fema_flood -T soils -T wetlands -T epa_facilities -T spatial_ref_sys \
  -f ~/supabase_dump_app.sql
```

Expected output: ~3–5 MB (app data only).

### 2b. Restore via Cloudflare Tunnel (from Mac)

**Terminal 1 — start the proxy (leave running):**

```bash
cloudflared access tcp --hostname db.gallagherpropco.com --url localhost:54399
```

First run may open a browser for Cloudflare Access (24h session).

**Terminal 2 — restore:**

```bash
psql "postgresql://postgres:postgres@localhost:54399/entitlement_os" -f ~/supabase_dump_app.sql
```

Use the actual entitlement_os password if it is not `postgres`.

### 2c. Run Prisma migrations (optional)

If schema drift exists:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:54399/entitlement_os" \
DIRECT_DATABASE_URL="postgresql://postgres:postgres@localhost:54399/entitlement_os" \
pnpm db:migrate
```

### 2d. Verify

```bash
psql "postgresql://postgres:postgres@localhost:54399/entitlement_os" -c "SELECT COUNT(*) FROM deals;"
```

### 2e. Cleanup

- Stop the cloudflared proxy (Ctrl+C in Terminal 1)
- Delete the dump: `rm ~/supabase_dump_app.sql`
- Rotate the Supabase database password in the dashboard (recommended after migration)

---

## Step 4: Nightly Backups on BG

**Status:** ✅ Done (2026-02-24). Script uses `docker exec` to run pg_dump inside `entitlement-os-postgres` container (pg_dump/gzip are NOT on the Windows host). Deployed to `C:\gpc-cres-backend\scripts\backup-app-db.ps1`. Scheduled task `AgentOS-AppDB-Backup` registered at 1:00 AM daily. Manual + scheduled runs verified — backup size ~403 MB (includes geo tables). Retention: 30 days. Backups at `C:\backups\app-db\`.

### How it works

The backup script (`infra/scripts/backup-app-db.ps1`) does:
1. Verifies `entitlement-os-postgres` container is running
2. Runs `pg_dump | gzip` inside the container to `/tmp/`
3. Uses `docker cp` to extract the compressed dump to the host
4. Cleans up the container temp file
5. Prunes backups older than 30 days

No host-level `pg_dump` or `gzip` required. No `APP_DB_PASSWORD` env var needed (pg_dump runs as postgres user inside container).

### Deployed files on BG

| Location | Purpose |
|----------|---------|
| `C:\gpc-cres-backend\scripts\backup-app-db.ps1` | Backup script (docker exec approach) |
| `C:\backups\app-db\` | Backup output directory |

### Scheduled task

Task: `AgentOS-AppDB-Backup` — daily at 1:00 AM.

```powershell
# Check status
Get-ScheduledTask -TaskName "AgentOS-AppDB-Backup"

# Manual trigger
Start-ScheduledTask -TaskName "AgentOS-AppDB-Backup"

# View last run result
Get-ScheduledTaskInfo -TaskName "AgentOS-AppDB-Backup"
```

### B2 sync (optional, not yet configured)

```powershell
# After backup, sync to B2:
b2 sync C:\backups\app-db b2://gallagher-documents/backups/app-db/
```

---

## Summary

| Step | Blocker | Action |
|------|---------|--------|
| 2 | ✅ Done | Completed 2026-02-24. Rotate Supabase password. |
| 4 | ✅ Done | Completed 2026-02-24. Script deployed, task registered, verified. |

---

## Related docs

- `docs/CLOUDFLARE.md` — Remote DB access via `db.gallagherpropco.com`
- `scripts/migrate_supabase_to_local/README.md` — Original migration steps (pre–Cloudflare Tunnel)
- `docs/SUPABASE_TO_LOCAL_MIGRATION.md` — Full migration overview
- `infra/scripts/setup_scheduled_tasks.ps1` — Registers AgentOS-AppDB-Backup (and other tasks)
