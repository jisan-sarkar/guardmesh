#!/usr/bin/env sh
set -eu

backup_dir="${BACKUP_DIR:-./artifacts/backups}"
database_url="${DATABASE_URL:?DATABASE_URL is required}"
mkdir -p "$backup_dir"

case "${1:-}" in
  backup)
    pg_dump --format=custom --file="$backup_dir/guardmesh.dump" "$database_url"
    echo "Backup written to $backup_dir/guardmesh.dump"
    ;;
  restore)
    dump_file="${2:?restore requires a dump file path}"
    pg_restore --clean --if-exists --exit-on-error --dbname="$database_url" "$dump_file"
    echo "Restore completed; verify synthetic order, reservation, outbox, and security-event records."
    ;;
  *)
    echo "usage: DATABASE_URL=... $0 {backup|restore <dump-file>}" >&2
    exit 2
    ;;
esac
