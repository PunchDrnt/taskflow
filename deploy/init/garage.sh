#!/bin/sh
# Brings a fresh Garage node to the state the API expects: a layout, a key with
# the credentials from .env, and the bucket.
#
# Everything goes through the admin API rather than the garage CLI, because the
# image is a bare binary with no shell to run a script in — which is also why
# it is 66 MB.
#
# The exception is the CORS rule at the bottom, which the admin API has no
# endpoint for at all (measured: `/v2/PutBucketCors` answers "Unknown API
# endpoint", and `GetBucketInfo` returns no CORS field). It is an S3 call, so
# it has to be SigV4-signed by hand.
#
# Re-running is safe: each step checks first, the API answers 409 for a key or
# bucket that already exists, and PutBucketCors replaces rather than appends.
set -eu

ADMIN="http://garage:3903"

# Defaulted here as well as in compose, so the script still runs on its own.
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

# ── CORS ─────────────────────────────────────────────────────────────────────
#
# The browser PUTs an avatar straight to the bucket, which makes that request
# cross-origin: the page is served from the site's own origin and the upload
# goes to Garage's. Without a rule Garage refuses the preflight outright —
# "403 Forbidden: This CORS request is not allowed" — and the browser never
# sends the PUT at all, so nothing reaches a log anywhere.
#
# ⚠️ This is also the reason the whole direct-upload path needs Garage to be
# *reachable* from a browser. A rule permits an origin; it does not publish a
# port. `deploy/compose.yml` publishes only Caddy, so on the server this rule
# is necessary and not sufficient — see .claude/checklists/phase-1.md §2.
#
# Signed by hand because there is no alternative: the admin API has no CORS
# endpoint, and `PutBucketCors` is an S3 request, which means SigV4.
apk add --no-cache openssl >/dev/null 2>&1 || true

S3_ENDPOINT="http://garage:3900"
S3_ENDPOINT_HOST="garage:3900"
REGION="${S3_REGION:-us-east-1}"

# Comma-separated, because a deployment can serve the app and the back-office
# from two registrable domains and both upload.
ORIGINS="${S3_CORS_ORIGINS:-http://localhost:3000}"

allowed=""
for origin in $(echo "$ORIGINS" | tr ',' ' '); do
  allowed="$allowed<AllowedOrigin>$origin</AllowedOrigin>"
done

# PUT only. The download side is an `<img>` following a 302 to a presigned GET,
# which the browser does not treat as a cross-origin fetch, so widening this to
# GET would grant something nothing asks for.
cors="<CORSConfiguration><CORSRule>$allowed<AllowedMethod>PUT</AllowedMethod><AllowedHeader>content-type</AllowedHeader><MaxAgeSeconds>3000</MaxAgeSeconds></CORSRule></CORSConfiguration>"

# `s/^.*= /` rather than a fixed prefix: OpenSSL 1.x prints `(stdin)= …` and
# OpenSSL 3.x prints `SHA2-256(stdin)= …`.
sha256() { printf '%s' "$1" | openssl dgst -sha256 | sed 's/^.*= //'; }
hmac() { printf '%s' "$2" | openssl dgst -sha256 -mac HMAC -macopt "$1" | sed 's/^.*= //'; }

amz_date=$(date -u +%Y%m%dT%H%M%SZ)
stamp=$(date -u +%Y%m%d)
payload_hash=$(sha256 "$cors")
scope="$stamp/$REGION/s3/aws4_request"

# The canonical request, exactly as SigV4 defines it: method, path, canonical
# query (`cors` with an empty value), the signed headers sorted and
# lower-cased, a blank line, the signed-header list, then the payload hash.
canonical="PUT
/$S3_BUCKET
cors=
host:$S3_ENDPOINT_HOST
x-amz-content-sha256:$payload_hash
x-amz-date:$amz_date

host;x-amz-content-sha256;x-amz-date
$payload_hash"

to_sign="AWS4-HMAC-SHA256
$amz_date
$scope
$(sha256 "$canonical")"

# The signing key is four chained HMACs. The first takes a literal string key;
# every one after it takes the previous digest as raw bytes, which is what
# `hexkey:` means — passing the hex digest as a *string* key silently produces
# a different, wrong signature.
signing_key=$(hmac "key:AWS4$S3_SECRET_KEY" "$stamp")
signing_key=$(hmac "hexkey:$signing_key" "$REGION")
signing_key=$(hmac "hexkey:$signing_key" "s3")
signing_key=$(hmac "hexkey:$signing_key" "aws4_request")
signature=$(hmac "hexkey:$signing_key" "$to_sign")

echo "allowing browser uploads from $ORIGINS"
curl -sS -f -X PUT "$S3_ENDPOINT/$S3_BUCKET?cors" \
  -H "x-amz-date: $amz_date" \
  -H "x-amz-content-sha256: $payload_hash" \
  -H "Authorization: AWS4-HMAC-SHA256 Credential=$S3_ACCESS_KEY/$scope, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=$signature" \
  --data-binary "$cors"

echo "garage ready"
