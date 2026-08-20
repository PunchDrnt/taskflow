#!/bin/sh
# Brings a fresh Garage node to the state the API expects: a layout, a key with
# the credentials from .env, and the bucket.
#
# Everything goes through the admin API rather than the garage CLI, because the
# image is a bare binary with no shell to run a script in — which is also why
# it is 66 MB.
#
# Re-running is safe: each step checks first, and the API answers 409 for a key
# or bucket that already exists.
set -eu

ADMIN="http://garage:3903"
API="curl -sS -H \"Authorization: Bearer $GARAGE_ADMIN_TOKEN\" -H 'Content-Type: application/json'"

api() {
  # $1 method, $2 path, $3 body (optional)
  if [ $# -ge 3 ]; then
    curl -sS -X "$1" -H "Authorization: Bearer $GARAGE_ADMIN_TOKEN" \
      -H 'Content-Type: application/json' -d "$3" "$ADMIN$2"
  else
    curl -sS -X "$1" -H "Authorization: Bearer $GARAGE_ADMIN_TOKEN" "$ADMIN$2"
  fi
}

echo "waiting for garage"
until api GET /v2/GetClusterStatus >/dev/null 2>&1; do sleep 1; done

status=$(api GET /v2/GetClusterStatus)
version=$(echo "$status" | sed -n 's/.*"layoutVersion": *\([0-9]*\).*/\1/p' | head -1)

if [ "${version:-0}" -eq 0 ]; then
  node=$(echo "$status" | sed -n 's/.*"id": *"\([0-9a-f]*\)".*/\1/p' | head -1)
  echo "assigning layout to $node"
  api POST /v2/UpdateClusterLayout \
    "{\"roles\":[{\"id\":\"$node\",\"zone\":\"$GARAGE_ZONE\",\"capacity\":$GARAGE_CAPACITY,\"tags\":[]}]}" >/dev/null
  api POST /v2/ApplyClusterLayout '{"version":1}' >/dev/null
else
  echo "layout already at version $version"
fi

echo "importing key $S3_ACCESS_KEY"
api POST /v2/ImportKey \
  "{\"accessKeyId\":\"$S3_ACCESS_KEY\",\"secretAccessKey\":\"$S3_SECRET_KEY\",\"name\":\"api\"}" >/dev/null || true

echo "creating bucket $S3_BUCKET"
api POST /v2/CreateBucket "{\"globalAlias\":\"$S3_BUCKET\"}" >/dev/null || true

bucket=$(api GET "/v2/GetBucketInfo?globalAlias=$S3_BUCKET" |
  sed -n 's/.*"id": *"\([0-9a-f]*\)".*/\1/p' | head -1)

echo "granting $S3_ACCESS_KEY on $bucket"
api POST /v2/AllowBucketKey \
  "{\"bucketId\":\"$bucket\",\"accessKeyId\":\"$S3_ACCESS_KEY\",\"permissions\":{\"read\":true,\"write\":true,\"owner\":true}}" >/dev/null

echo "garage ready"
