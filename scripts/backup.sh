#!/bin/sh

set -u

BACKUP_ROOT="${BACKUP_ROOT:-/backups}"
UPLOAD_ROOT="${UPLOAD_ROOT:-/uploads}"
CHECK_INTERVAL_SECONDS="${CHECK_INTERVAL_SECONDS:-3600}"
ONE_WEEK_SECONDS=604800
LAST_SUCCESS_FILE="$BACKUP_ROOT/.last-successful"

log() {
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$*"
}

is_allowed_kind() {
  case "$1" in
    weekly | monthly | yearly | startup | catchup | manual) return 0 ;;
    *) return 1 ;;
  esac
}

backup_exists_for_date() {
  kind="$1"
  backup_date="$2"
  existing="$(find "$BACKUP_ROOT" -maxdepth 1 -type d -name "${kind}_${backup_date}_*" -print -quit 2>/dev/null)"
  [ -n "$existing" ]
}

record_success() {
  marker_temp="$LAST_SUCCESS_FILE.tmp"
  date +%s > "$marker_temp"
  mv "$marker_temp" "$LAST_SUCCESS_FILE"
}

create_backup() {
  kind="$1"
  if ! is_allowed_kind "$kind"; then
    log "Unknown backup kind '$kind'; using 'manual'."
    kind="manual"
  fi

  stamp="$(date '+%Y-%m-%d_%H%M%S')"
  final_dir="$BACKUP_ROOT/${kind}_${stamp}"
  temp_dir="$BACKUP_ROOT/.${kind}_${stamp}.part"

  mkdir -p "$temp_dir"
  log "Starting $kind backup."

  if ! pg_dump --format=custom --file="$temp_dir/database.dump"; then
    log "Database dump failed; incomplete data remains at $temp_dir."
    return 1
  fi

  if [ ! -s "$temp_dir/database.dump" ]; then
    log "Database dump was empty; backup was not marked successful."
    return 1
  fi

  if [ -d "$UPLOAD_ROOT" ]; then
    if ! tar -czf "$temp_dir/uploads.tar.gz" -C "$UPLOAD_ROOT" .; then
      log "Uploads archive failed; backup was not marked successful."
      return 1
    fi
  else
    mkdir -p "$temp_dir/empty-uploads"
    tar -czf "$temp_dir/uploads.tar.gz" -C "$temp_dir/empty-uploads" .
  fi

  (
    cd "$temp_dir" || exit 1
    sha256sum database.dump uploads.tar.gz > SHA256SUMS
  ) || {
    log "Checksum generation failed; backup was not marked successful."
    return 1
  }

  printf 'type=%s\ncreated_at=%s\ndatabase=%s\n' \
    "$kind" \
    "$(date '+%Y-%m-%dT%H:%M:%S%z')" \
    "${PGDATABASE:-furniture_inventory}" > "$temp_dir/manifest.txt"

  if ! mv "$temp_dir" "$final_dir"; then
    log "Could not finalize the backup directory."
    return 1
  fi
  if ! record_success; then
    log "Backup completed, but the last-success marker could not be updated."
    return 1
  fi
  log "Backup completed successfully: $final_dir"
}

is_backup_stale() {
  now="$(date +%s)"

  if [ -f "$LAST_SUCCESS_FILE" ]; then
    last_success="$(cat "$LAST_SUCCESS_FILE" 2>/dev/null || printf '0')"
    case "$last_success" in
      *[!0-9]* | '') last_success=0 ;;
    esac
    [ $((now - last_success)) -gt "$ONE_WEEK_SECONDS" ]
    return
  fi

  recent_dump="$(find "$BACKUP_ROOT" -type f -name database.dump -mtime -7 -print -quit 2>/dev/null)"
  [ -z "$recent_dump" ]
}

run_scheduled_backups() {
  current_date="$(date '+%Y-%m-%d')"
  weekday="$(date '+%u')"
  day_of_month="$(date '+%d')"
  month_and_day="$(date '+%m-%d')"

  if [ "$weekday" = "3" ] && ! backup_exists_for_date weekly "$current_date"; then
    create_backup weekly || log "Weekly backup attempt failed; it will be retried."
  fi

  if [ "$day_of_month" = "01" ] && ! backup_exists_for_date monthly "$current_date"; then
    create_backup monthly || log "Monthly backup attempt failed; it will be retried."
  fi

  if [ "$month_and_day" = "12-31" ] && ! backup_exists_for_date yearly "$current_date"; then
    create_backup yearly || log "Yearly backup attempt failed; it will be retried."
  fi
}

mkdir -p "$BACKUP_ROOT"

case "$CHECK_INTERVAL_SECONDS" in
  *[!0-9]* | '' | 0) CHECK_INTERVAL_SECONDS=3600 ;;
esac

mode="${1:-daemon}"
if [ "$mode" = "once" ]; then
  create_backup "${2:-manual}"
  exit $?
fi

log "Automatic backup service started."
run_scheduled_backups
if is_backup_stale; then
  create_backup startup || log "Startup backup attempt failed."
else
  log "A successful backup exists from within the last seven days."
fi

trap 'log "Automatic backup service stopping."; exit 0' TERM INT

while true; do
  sleep "$CHECK_INTERVAL_SECONDS" &
  wait $!
  run_scheduled_backups
  if is_backup_stale; then
    create_backup catchup || log "Catch-up backup attempt failed."
  fi
done
