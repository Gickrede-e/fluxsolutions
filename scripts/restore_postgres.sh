#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <backup-file.sql.gz>"
  exit 1
fi

BACKUP_FILE="$1"
if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  echo "Missing .env file in $ROOT_DIR"
  exit 1
fi

source .env

echo "Restoring database ${POSTGRES_DB} from ${BACKUP_FILE}"
gunzip -c "$BACKUP_FILE" | docker compose exec -T fluxsolutions-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

echo "Restore completed"
