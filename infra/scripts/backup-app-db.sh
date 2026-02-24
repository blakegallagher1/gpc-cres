#!/usr/bin/env bash
# Nightly backup of entitlement_os Postgres.
# Usage: APP_DB_PASSWORD=... ./backup-app-db.sh [BACKUP_DIR]
# Default: BACKUP_DIR=/var/backups/app-db or ./backups/app-db

set -euo pipefail

BACKUP_DIR="${1:-${BACKUP_DIR:-./backups/app-db}}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
HOST="${DB_HOST:-localhost}"
PORT="${DB_PORT:-5433}"
DB_NAME="${DB_NAME:-entitlement_os}"
USER="${DB_USER:-postgres}"

: "${APP_DB_PASSWORD:?Set APP_DB_PASSWORD}"

mkdir -p "$BACKUP_DIR"
timestamp=$(date +%Y-%m-%d-%H%M)
dump_file="$BACKUP_DIR/entitlement_os_${timestamp}.sql.gz"

PGPASSWORD="$APP_DB_PASSWORD" pg_dump -h "$HOST" -p "$PORT" -U "$USER" -d "$DB_NAME" | gzip > "$dump_file"
echo "Backup complete: $dump_file ($(du -h "$dump_file" | cut -f1))"

# Prune old backups
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true
