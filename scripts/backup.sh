#!/usr/bin/env bash
set -euo pipefail
umask 077

COMPOSE_FILE="${COMPOSE_FILE:-compose.yaml}"
BACKUP_DIR="${BACKUP_DIR:-/home/deploy/backups/collab-studio}"
ENV_FILE="${ENV_FILE:-/home/deploy/secrets/collab-studio.env}"
UPLOADS_HOST_DIR="${UPLOADS_HOST_DIR:-/home/deploy/app-data/collab-studio/uploads}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
POSTGRES_BACKUP="$BACKUP_DIR/postgres-$STAMP.sql.gz"
UPLOADS_BACKUP="$BACKUP_DIR/uploads-$STAMP.tar.gz"
MANIFEST_FILE="$BACKUP_DIR/manifest-$STAMP.sha256"
POSTGRES_PARTIAL="$POSTGRES_BACKUP.partial"
UPLOADS_PARTIAL="$UPLOADS_BACKUP.partial"
MANIFEST_PARTIAL="$MANIFEST_FILE.partial"
APP_WAS_RUNNING="no"

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

is_app_running() {
  compose ps --status running --services | grep -Fxq app
}

restore_app_if_needed() {
  if [[ "$APP_WAS_RUNNING" == "yes" ]]; then
    echo "Attempting to restore app service to running state..."
    compose up -d app >/dev/null
  fi
}

wait_for_app_healthy() {
  local deadline=$((SECONDS + 180))
  while (( SECONDS < deadline )); do
    if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1 && curl -fsS http://127.0.0.1:3000/api/ready >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

cleanup_partial() {
  local status=$?
  rm -f -- "$POSTGRES_PARTIAL" "$UPLOADS_PARTIAL" "$MANIFEST_PARTIAL"
  if (( status != 0 )); then
    restore_app_if_needed || true
    echo "Backup failed; partial artifacts were removed." >&2
  fi
  return "$status"
}
trap cleanup_partial EXIT

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Compose file not found: $COMPOSE_FILE" >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE" >&2
  exit 1
fi
if [[ ! -d "$UPLOADS_HOST_DIR" ]]; then
  echo "Uploads directory not found: $UPLOADS_HOST_DIR" >&2
  exit 1
fi
if [[ -L "$BACKUP_DIR" ]]; then
  echo "Backup directory must not be a symlink: $BACKUP_DIR" >&2
  exit 1
fi

if find "$UPLOADS_HOST_DIR" -type l -print -quit | grep -q .; then
  echo "Uploads directory contains symlinks. Refusing backup until symlinks are removed." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

for path in "$POSTGRES_BACKUP" "$UPLOADS_BACKUP" "$MANIFEST_FILE" "$POSTGRES_PARTIAL" "$UPLOADS_PARTIAL" "$MANIFEST_PARTIAL"; do
  if [[ -L "$path" ]]; then
    echo "Refusing to use symlink output path: $path" >&2
    exit 1
  fi
done

for path in "$POSTGRES_BACKUP" "$UPLOADS_BACKUP" "$MANIFEST_FILE"; do
  if [[ -e "$path" ]]; then
    echo "Backup artifact already exists: $path" >&2
    exit 1
  fi
done

if is_app_running; then
  APP_WAS_RUNNING="yes"
fi

if [[ "$APP_WAS_RUNNING" == "yes" ]]; then
  echo "Stopping app service before backup."
  compose stop app
else
  echo "App service is already stopped; preserving stopped state."
fi

echo "Writing PostgreSQL backup to $POSTGRES_BACKUP"
compose exec -T postgres pg_dump -U "${POSTGRES_USER:-collab_studio}" "${POSTGRES_DB:-collab_studio}" | gzip -c > "$POSTGRES_PARTIAL"

if [[ ! -s "$POSTGRES_PARTIAL" ]]; then
  echo "PostgreSQL dump is empty" >&2
  exit 1
fi
gzip -t "$POSTGRES_PARTIAL"

echo "Writing uploads backup to $UPLOADS_BACKUP"
tar --no-xattrs --no-acls -C "$UPLOADS_HOST_DIR" -czf "$UPLOADS_PARTIAL" .
if [[ ! -s "$UPLOADS_PARTIAL" ]]; then
  echo "Uploads archive is empty" >&2
  exit 1
fi
tar -tzf "$UPLOADS_PARTIAL" >/dev/null

mv -- "$POSTGRES_PARTIAL" "$POSTGRES_BACKUP"
mv -- "$UPLOADS_PARTIAL" "$UPLOADS_BACKUP"
chmod 600 "$POSTGRES_BACKUP" "$UPLOADS_BACKUP"

(
  cd "$BACKUP_DIR"
  sha256sum "$(basename "$POSTGRES_BACKUP")" "$(basename "$UPLOADS_BACKUP")" > "$(basename "$MANIFEST_PARTIAL")"
  if grep -q '/' "$(basename "$MANIFEST_PARTIAL")"; then
    echo "Manifest must contain basenames only" >&2
    exit 1
  fi
  sha256sum -c "$(basename "$MANIFEST_PARTIAL")" >/dev/null
)
mv -- "$MANIFEST_PARTIAL" "$MANIFEST_FILE"
chmod 600 "$MANIFEST_FILE"

if [[ "$APP_WAS_RUNNING" == "yes" ]]; then
  compose up -d app >/dev/null
  if ! wait_for_app_healthy; then
    echo "App did not become healthy after backup." >&2
    exit 1
  fi
fi

trap - EXIT
cleanup_partial

if [[ "$APP_WAS_RUNNING" == "yes" ]]; then
  echo "Backup completed and app service was restored to running state."
else
  echo "Backup completed; app service remained stopped as it was before backup."
fi
