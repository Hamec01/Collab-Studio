#!/usr/bin/env bash
set -euo pipefail
umask 077

COMPOSE_FILE="${COMPOSE_FILE:-compose.yaml}"
BACKUP_DIR="${BACKUP_DIR:-/home/deploy/backups/collab-studio}"
ENV_FILE="${ENV_FILE:-/home/deploy/secrets/collab-studio.env}"
UPLOADS_HOST_DIR="${UPLOADS_HOST_DIR:-/home/deploy/app-data/collab-studio/uploads}"
POSTGRES_DUMP="${1:-}"
UPLOADS_ARCHIVE="${2:-}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

resolve_backup_input() {
  local candidate="$1"
  if [[ -f "$candidate" ]]; then
    printf '%s' "$candidate"
    return
  fi
  if [[ -f "$BACKUP_DIR/$candidate" ]]; then
    printf '%s' "$BACKUP_DIR/$candidate"
    return
  fi
  printf '%s' "$candidate"
}

if [[ -z "$POSTGRES_DUMP" || -z "$UPLOADS_ARCHIVE" ]]; then
  echo "Usage: npm run restore -- <postgres.sql.gz> <uploads.tar.gz>" >&2
  exit 1
fi
POSTGRES_DUMP="$(resolve_backup_input "$POSTGRES_DUMP")"
UPLOADS_ARCHIVE="$(resolve_backup_input "$UPLOADS_ARCHIVE")"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Compose file not found: $COMPOSE_FILE" >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE" >&2
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

if [[ -L "$POSTGRES_DUMP" || -L "$UPLOADS_ARCHIVE" ]]; then
  echo "Restore input must not be a symlink" >&2
  exit 1
fi

dump_base="$(basename "$POSTGRES_DUMP")"
uploads_base="$(basename "$UPLOADS_ARCHIVE")"
if [[ "$dump_base" != postgres-*.sql.gz || "$uploads_base" != uploads-*.tar.gz ]]; then
  echo "Restore filenames must follow postgres-<timestamp>.sql.gz and uploads-<timestamp>.tar.gz" >&2
  exit 1
fi

dump_stamp="${dump_base#postgres-}"
dump_stamp="${dump_stamp%.sql.gz}"
uploads_stamp="${uploads_base#uploads-}"
uploads_stamp="${uploads_stamp%.tar.gz}"
if [[ "$dump_stamp" != "$uploads_stamp" ]]; then
  echo "Restore inputs must share the same timestamp" >&2
  exit 1
fi

manifest_dir="$(dirname "$POSTGRES_DUMP")"
if [[ "$manifest_dir" != "$(dirname "$UPLOADS_ARCHIVE")" ]]; then
  echo "Restore inputs must be in the same directory as the manifest" >&2
  exit 1
fi
manifest_path="$manifest_dir/manifest-$dump_stamp.sha256"
if [[ ! -f "$manifest_path" || -L "$manifest_path" ]]; then
  echo "Required manifest is missing or unsafe: $manifest_path" >&2
  exit 1
fi

if grep -q '/' "$manifest_path"; then
  echo "Manifest must contain basenames only" >&2
  exit 1
fi

(
  cd "$manifest_dir"
  sha256sum -c "$(basename "$manifest_path")" >/dev/null
)

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

compose stop app
compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-collab_studio}" "${POSTGRES_DB:-collab_studio}" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
gunzip -c "$POSTGRES_DUMP" | compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-collab_studio}" "${POSTGRES_DB:-collab_studio}"

restore_parent="$(dirname "$UPLOADS_HOST_DIR")"
restore_stage="${UPLOADS_HOST_DIR}.restore-${STAMP}"
mkdir -p "$restore_parent" "$restore_stage"
tar --no-same-owner --no-same-permissions -xzf "$UPLOADS_ARCHIVE" -C "$restore_stage"
if [[ -e "$UPLOADS_HOST_DIR" ]]; then
  mv "$UPLOADS_HOST_DIR" "${UPLOADS_HOST_DIR}.pre-restore-${STAMP}"
fi
mv "$restore_stage" "$UPLOADS_HOST_DIR"
echo "Restore completed. Verify ownership, permissions, and data before starting app."
