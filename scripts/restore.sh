#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-compose.yaml}"
UPLOADS_HOST_DIR="${UPLOADS_HOST_DIR:-/home/deploy/app-data/collab-studio/uploads}"
POSTGRES_DUMP="${1:-}"
UPLOADS_ARCHIVE="${2:-}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

if [[ -z "$POSTGRES_DUMP" || -z "$UPLOADS_ARCHIVE" ]]; then
  echo "Usage: npm run restore -- <postgres.sql.gz> <uploads.tar.gz>" >&2
  exit 1
fi
if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Compose file not found: $COMPOSE_FILE" >&2
  exit 1
fi
if [[ ! -f "$POSTGRES_DUMP" || ! -f "$UPLOADS_ARCHIVE" ]]; then
  echo "Restore input file not found" >&2
  exit 1
fi
if [[ "$UPLOADS_HOST_DIR" != /* || "$UPLOADS_HOST_DIR" == "/" ]]; then
  echo "UPLOADS_HOST_DIR must be a safe absolute path" >&2
  exit 1
fi

while IFS= read -r entry; do
  if [[ "$entry" == /* || "$entry" == *\\* || "/$entry/" == *"/../"* || "/$entry/" == *"/./"* ]]; then
    echo "Uploads archive contains an unsafe path" >&2
    exit 1
  fi
done < <(tar -tzf "$UPLOADS_ARCHIVE")
while IFS= read -r listing; do
  case "${listing:0:1}" in
    l|h) echo "Uploads archive must not contain links" >&2; exit 1 ;;
  esac
done < <(tar -tvzf "$UPLOADS_ARCHIVE")

echo "The app service must remain stopped for the entire restore."
read -r -p "Type RESTORE to replace PostgreSQL data and uploads: " confirmation
if [[ "$confirmation" != "RESTORE" ]]; then
  echo "Restore cancelled" >&2
  exit 1
fi

docker compose -f "$COMPOSE_FILE" stop app
docker compose -f "$COMPOSE_FILE" exec -T postgres psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-collab_studio}" "${POSTGRES_DB:-collab_studio}" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
gunzip -c "$POSTGRES_DUMP" | docker compose -f "$COMPOSE_FILE" exec -T postgres psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-collab_studio}" "${POSTGRES_DB:-collab_studio}"

restore_parent="$(dirname "$UPLOADS_HOST_DIR")"
restore_stage="${UPLOADS_HOST_DIR}.restore-${STAMP}"
mkdir -p "$restore_parent" "$restore_stage"
tar --no-same-owner --no-same-permissions -xzf "$UPLOADS_ARCHIVE" -C "$restore_stage"
if [[ -e "$UPLOADS_HOST_DIR" ]]; then
  mv "$UPLOADS_HOST_DIR" "${UPLOADS_HOST_DIR}.pre-restore-${STAMP}"
fi
mv "$restore_stage" "$UPLOADS_HOST_DIR"
echo "Restore completed. Verify ownership, permissions, and data before starting app."
