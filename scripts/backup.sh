#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-compose.yaml}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
UPLOADS_HOST_DIR="${UPLOADS_HOST_DIR:-}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Compose file not found: $COMPOSE_FILE" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

echo "Writing PostgreSQL backup to $BACKUP_DIR/postgres-$STAMP.sql.gz"
docker compose -f "$COMPOSE_FILE" exec -T postgres pg_dump -U "${POSTGRES_USER:-collab_studio}" "${POSTGRES_DB:-collab_studio}" | gzip > "$BACKUP_DIR/postgres-$STAMP.sql.gz"

if [[ -n "$UPLOADS_HOST_DIR" && -d "$UPLOADS_HOST_DIR" ]]; then
  echo "Writing uploads backup to $BACKUP_DIR/uploads-$STAMP.tar.gz"
  tar -C "$UPLOADS_HOST_DIR" -czf "$BACKUP_DIR/uploads-$STAMP.tar.gz" .
else
  echo "UPLOADS_HOST_DIR is not set or does not exist; skipping uploads backup" >&2
fi
