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

# Layout weights, not settings anyone needs to choose. Garage only acts on a
# zone when it has several nodes to spread replicas across, and this deployment
# is one node at replication_factor = 1 — so the name is a label nothing reads,
# and capacity only ever competes with itself. Both are here rather than in
# .env to keep a deployment's location out of a file people copy.
ZONE="${GARAGE_ZONE:-dc1}"
CAPACITY="${GARAGE_CAPACITY:-10000000000}"

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
    "{\"roles\":[{\"id\":\"$node\",\"zone\":\"$ZONE\",\"capacity\":$CAPACITY,\"tags\":[]}]}" >/dev/null
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
