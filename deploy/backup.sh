#!/bin/sh
# Backs up the two stores separately, because they fail separately: a database
# dump cannot restore an attachment, and an object copy cannot restore a task.
# Restoring is likewise two independent operations.
#
#     cd deploy && ./backup.sh /srv/backups           # the server
#     COMPOSE_FILE=../docker-compose.yml ENV_FILE=../.env \
#       ./backup.sh                                    # the development stack
#
# Set COMPOSE_PROJECT_NAME too if the stack does not run under the directory's
# own name, or this reaches whichever stack the directory implies.
set -eu

OUT="${1:-./backups}"
COMPOSE_FILE="${COMPOSE_FILE:-compose.yml}"
ENV_FILE="${ENV_FILE:-.env}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

# shellcheck disable=SC1090
# Not "./$ENV_FILE": that prefix breaks an absolute path.
. "$ENV_FILE"

DB_USER="${APP_DB_USER:-$POSTGRES_USER}"
DB_NAME="${POSTGRES_DB:-app}"

mkdir -p "$OUT/db" "$OUT/objects"

# ── database ─────────────────────────────────────────────────────────────────
# Ask before dumping. A backup of the wrong database is worse than none,
# because it looks like one. `|| true` so a psql failure reaches the refusal
# below rather than exiting on set -e with a connection error.
echo "checking the target"
applied="$(compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -tAc \
  'SELECT count(*) FROM migrations' 2>/dev/null | tr -d '[:space:]' || true)"
if [ "${applied:-0}" -eq 0 ]; then
  echo "refusing: $DB_NAME on this stack has no migrations applied" >&2
  exit 1
fi
echo "  $DB_NAME, $applied migrations applied"

# Custom format: compressed, and restorable table by table with pg_restore.
echo "dumping $DB_NAME"
compose exec -T postgres pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc \
  > "$OUT/db/$DB_NAME-$STAMP.dump"

# A dump that cannot be read back is not a backup. --list fails on the
# truncated file a broken pipe leaves behind.
docker run --rm -v "$(cd "$OUT/db" && pwd):/db:ro" postgres:18-alpine \
  pg_restore --list "/db/$DB_NAME-$STAMP.dump" > /dev/null
echo "  ok: $OUT/db/$DB_NAME-$STAMP.dump"

# ── objects ──────────────────────────────────────────────────────────────────
# Plain files rather than Garage's data directory, so restoring needs no
# working Garage and any S3 target will take them. `garage meta snapshot` is
# the other option, for rebuilding the node rather than the files in it.
echo "syncing s3://$S3_BUCKET"
GARAGE_CONTAINER="$(compose ps --format '{{.Name}}' garage | head -1)"

docker run --rm \
  --network "container:$GARAGE_CONTAINER" \
  -e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" \
  -e AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" \
  -e AWS_DEFAULT_REGION="${S3_REGION:-us-east-1}" \
  -v "$(cd "$OUT/objects" && pwd):/out" \
  amazon/aws-cli:latest \
  s3 sync "s3://$S3_BUCKET" "/out/$S3_BUCKET" --endpoint-url http://127.0.0.1:3900 --only-show-errors

echo "  ok: $OUT/objects/$S3_BUCKET ($(find "$OUT/objects/$S3_BUCKET" -type f 2>/dev/null | wc -l | tr -d ' ') files)"
echo "done"
