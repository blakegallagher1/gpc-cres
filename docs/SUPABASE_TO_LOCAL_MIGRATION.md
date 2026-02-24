# Supabase → Local Self-Hosted Migration

Moves app Postgres and evidence storage from Supabase to the local Windows HP Server. Result: zero external DB dependencies, lower latency, full data ownership.

## Phase 1: Local Postgres (App DB)

### 1A) Add app-db to production Docker Compose

On the Windows HP server (`C:\gpc-cres-backend\docker-compose.yml`), add:

```yaml
app-db:
  image: pgvector/pgvector:pg16
  container_name: entitlement-os-db
  restart: unless-stopped
  ports:
    - "127.0.0.1:5433:5432"
  environment:
    POSTGRES_DB: entitlement_os
    POSTGRES_USER: postgres
    POSTGRES_PASSWORD: ${APP_DB_PASSWORD}
  volumes:
    - app-db-data:/var/lib/postgresql/data
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U postgres -d entitlement_os"]
    interval: 10s
    timeout: 5s
    retries: 5

volumes:
  app-db-data:
```

Port 5433 avoids conflict with cres_db (5432). `pgvector` is required for `KnowledgeEmbedding` (vector column).

### 1B) Start and enable pgvector

```powershell
cd C:\gpc-cres-backend
docker compose up -d app-db
docker exec entitlement-os-db psql -U postgres -d entitlement_os -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### 1C–1F) Dump, restore, switch

See the migration plan for dump/restore commands. After restore, set:

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5433/entitlement_os"
DIRECT_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5433/entitlement_os"
```

### 1G) Nightly backups

- **PowerShell**: `infra/scripts/backup-app-db.ps1` (run via Task Scheduler)
- **Bash**: `infra/scripts/backup-app-db.sh`
- Register via `infra/scripts/setup_scheduled_tasks.ps1` (adds `AgentOS-AppDB-Backup` at 1:00 AM)

Set `APP_DB_PASSWORD` for the scheduled task. Optionally sync backups to B2 for off-site redundancy.

---

## Phase 2: Evidence Storage (Supabase → B2 via Gateway)

### 2D) Supabase read fallback (implemented)

`apps/web/app/api/evidence/snapshots/[snapshotId]/download/route.ts` uses cutoff-based routing:

- `retrievedAt < 2026-02-24` → Supabase signed URL (legacy)
- `retrievedAt >= 2026-02-24` → B2 via gateway

### 2E) Migration script

```bash
DATABASE_URL="..." LOCAL_API_URL="..." LOCAL_API_KEY="..." \
SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." \
GATEWAY_SERVICE_USER_ID="..." \
pnpm exec tsx packages/evidence/src/scripts/migrate-supabase-to-b2.ts [--dry-run] [--concurrency 5]
```

Run `--dry-run` first to verify key format and counts. After migration completes with 0 failures, remove the Supabase fallback (2F).

### 2F) Cleanup (post-migration)

1. Remove `MIGRATION_CUTOFF` branch from download route — always use B2
2. Remove `supabaseAdmin` from evidence download flow
3. Remove `@supabase/supabase-js` from evidence package only if no other usage

---

## Risk mitigations

- **Nightly pg_dump to B2** — add `b2 sync` or equivalent to backup script for off-site copies
- **Migration script** — run `--dry-run` before actual migration to verify object keys
- **Prisma** — does not use RLS; no raw SQL referencing Supabase auth functions
