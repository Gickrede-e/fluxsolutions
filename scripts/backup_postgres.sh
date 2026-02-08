#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  echo "Missing .env file in $ROOT_DIR"
  exit 1
fi

source .env

mkdir -p backups
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="backups/fluxsolutions_postgres_${TIMESTAMP}.sql.gz"

echo "Creating backup: ${BACKUP_FILE}"
docker compose exec -T fluxsolutions-postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "$BACKUP_FILE"

echo "Backup completed: ${BACKUP_FILE}"
