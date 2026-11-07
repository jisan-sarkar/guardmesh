#!/usr/bin/env sh
set -eu

backup_dir="${BACKUP_DIR:-./artifacts/backups}"
project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
mkdir -p "$backup_dir"

case "${1:-}" in
  backup)
    database_url="${DATABASE_URL:?DATABASE_URL is required for backup}"
    pg_dump --format=custom --no-owner --no-acl --file="$backup_dir/guardmesh.dump" "$database_url"
    git -C "$project_root" rev-parse HEAD > "$backup_dir/source-commit.txt"
    tar -czf "$backup_dir/guardmesh-config.tar.gz" -C "$project_root" \
      README.md compose.yaml .env.example pnpm-lock.yaml \
      infra/keycloak/guardmesh-realm.json \
      infra/rabbitmq/definitions.json infra/rabbitmq/rabbitmq.conf \
      packages/guardmesh-policy/policy \
      packages/guardmesh-orders-service/migrations \
      packages/guardmesh-inventory-service/migrations \
      packages/guardmesh-security-service/migrations
    echo "Backup written to $backup_dir/guardmesh.dump"
    echo "Configuration bundle written to $backup_dir/guardmesh-config.tar.gz"
    ;;
  restore)
    dump_file="${2:?restore requires a dump file path}"
    restore_database_url="${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required for restore; refusing to use the source URL implicitly}"
    [ -f "$dump_file" ] || { echo "restore dump does not exist: $dump_file" >&2; exit 1; }
    pg_restore --clean --if-exists --exit-on-error --single-transaction --no-owner --no-acl \
      --dbname="$restore_database_url" "$dump_file"
    echo "Restore completed into the explicitly supplied target database."
    ;;
  *)
    echo "usage:" >&2
    echo "  DATABASE_URL=... BACKUP_DIR=... $0 backup" >&2
    echo "  RESTORE_DATABASE_URL=... $0 restore <dump-file>" >&2
    exit 2
    ;;
esac
