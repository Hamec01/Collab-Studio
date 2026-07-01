#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-compose.yaml}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
UPLOADS_HOST_DIR="${UPLOADS_HOST_DIR:-/home/deploy/app-data/collab-studio/uploads}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
POSTGRES_BACKUP="$BACKUP_DIR/postgres-$STAMP.sql.gz"
UPLOADS_BACKUP="$BACKUP_DIR/uploads-$STAMP.tar.gz"
POSTGRES_PARTIAL="$POSTGRES_BACKUP.partial-$$"
UPLOADS_PARTIAL="$UPLOADS_BACKUP.partial-$$"

cleanup_partial() {
  local status=$?
  rm -f -- "$POSTGRES_PARTIAL" "$UPLOADS_PARTIAL"
  if (( status != 0 )); then
    echo "Backup failed; partial artifacts were removed and the app remains stopped." >&2
  fi
  return "$status"
}
trap cleanup_partial EXIT

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Compose file not found: $COMPOSE_FILE" >&2
  exit 1
fi
if [[ ! -d "$UPLOADS_HOST_DIR" ]]; then
  echo "Uploads directory not found: $UPLOADS_HOST_DIR" >&2
  exit 1
fi

if find "$UPLOADS_HOST_DIR" -type l -print -quit | grep -q .; then
  echo "Uploads directory contains symlinks. Refusing backup until symlinks are removed." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

echo "Stopping app service before backup; it will remain stopped after completion."
docker compose -f "$COMPOSE_FILE" stop app

echo "Writing PostgreSQL backup to $POSTGRES_BACKUP"
docker compose -f "$COMPOSE_FILE" exec -T postgres pg_dump -U "${POSTGRES_USER:-collab_studio}" "${POSTGRES_DB:-collab_studio}" | gzip -c > "$POSTGRES_PARTIAL"

echo "Writing uploads backup to $UPLOADS_BACKUP"
tar --no-xattrs --no-acls -C "$UPLOADS_HOST_DIR" -czf "$UPLOADS_PARTIAL" .

mv -f -- "$POSTGRES_PARTIAL" "$POSTGRES_BACKUP"
mv -f -- "$UPLOADS_PARTIAL" "$UPLOADS_BACKUP"

trap - EXIT
cleanup_partial

echo "Backup completed. Verify both artifacts before restarting app; the app remains stopped."
