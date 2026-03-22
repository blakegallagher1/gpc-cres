# Database Backup Runbook

## Overview

Two Postgres containers run on the Windows server (BG). Each needs nightly backups with 30-day retention.

| Database | Container | Port | Backup Script | Schedule |
|----------|-----------|------|---------------|----------|
| App DB | `entitlement-os-postgres` | 54323 | `infra/scripts/backup-app-db.ps1` | Daily 1:00 AM |
| Property DB | `local-postgis` | 5433 | `infra/scripts/backup-property-db.ps1` | Daily 1:30 AM |

Backups are `pg_dump | gzip` run inside the container via `docker exec`, then `docker cp` to the host. No host-level `pg_dump` or `gzip` required.

## Deploy (first time or after adding Property DB backup)

SSH to the server and run:

```powershell
ssh ssh.gallagherpropco.com
cd C:\gpc-cres-backend
git pull --ff-only

# Register all scheduled tasks (requires Admin PowerShell)
powershell -ExecutionPolicy Bypass -File infra\scripts\setup_scheduled_tasks.ps1 -RepoRoot "C:\gpc-cres-backend"
```

## Verify backups are running

```powershell
# Check task status
schtasks /query /tn "AgentOS-AppDB-Backup" /fo LIST
schtasks /query /tn "AgentOS-PropertyDB-Backup" /fo LIST

# Check backup files exist
powershell -ExecutionPolicy Bypass -File infra\scripts\verify-backups.ps1

# Manual test run
powershell -ExecutionPolicy Bypass -File infra\scripts\backup-app-db.ps1
powershell -ExecutionPolicy Bypass -File infra\scripts\backup-property-db.ps1
```

## Restore

```powershell
# App DB
docker exec -i entitlement-os-postgres bash -c "gunzip -c - | psql -U postgres entitlement_os" < C:\backups\app-db\entitlement_os_YYYY-MM-DD-HHMM.sql.gz

# Property DB
docker exec -i local-postgis bash -c "gunzip -c - | psql -U postgres postgres" < C:\backups\property-db\property_db_YYYY-MM-DD-HHMM.sql.gz
```

## Off-site (future)

Uncomment the B2 sync line in each backup script once a B2 bucket is provisioned:
```
b2 sync C:\backups\app-db b2://gallagher-documents/backups/app-db/
b2 sync C:\backups\property-db b2://gallagher-documents/backups/property-db/
```
