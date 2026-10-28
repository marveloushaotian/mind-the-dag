#!/usr/bin/env bash
# Smoke test for the group library container: schema, sign-in and access rules.
# Usage: smoke.sh BASE_URL CONTAINER   (CI only; uses throwaway test accounts)
set -euo pipefail
B=$1; C=$2
j() { curl -s -H 'Content-Type: application/json' "$@"; }
code() { curl -s -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' "$@"; }
fail() { echo "FAIL: $*"; exit 1; }

for i in $(seq 1 30); do curl -sf "$B/api/health" >/dev/null && break; sleep 1; done
docker exec "$C" /pb/pocketbase superuser upsert --dir=/pb_data admin@example.test 'ci-admin-pass-123' >/dev/null
SU=$(j -X POST "$B/api/collections/_superusers/auth-with-password" -d '{"identity":"admin@example.test","password":"ci-admin-pass-123"}' | jq -r .token)

mk() { j -X POST "$B/api/collections/users/records" -H "Authorization: $SU" \
  -d "{\"email\":\"$1\",\"password\":\"ci-user-pass-123\",\"passwordConfirm\":\"ci-user-pass-123\",\"name\":\"$2\"}" | jq -r .id; }
A_ID=$(mk a@example.test Alice); B_ID=$(mk b@example.test Bob)
login() { j -X POST "$B/api/collections/users/auth-with-password" -d "{\"identity\":\"$1\",\"password\":\"ci-user-pass-123\"}" | jq -r .token; }
TA=$(login a@example.test); TB=$(login b@example.test)
[ "$TA" != null ] && [ "$TB" != null ] || fail "member sign-in"

s=$(code -X POST "$B/api/collections/users/records" -d '{"email":"x@example.test","password":"ci-user-pass-123","passwordConfirm":"ci-user-pass-123"}')
[ "$s" != 200 ] || fail "self sign-up should be closed (got $s)"

DOC='{"version":1,"title":"T","stations":[],"edges":[],"lines":[],"sections":[]}'
M=$(j -X POST "$B/api/collections/maps/records" -H "Authorization: $TA" -d "{\"title\":\"T\",\"doc\":$DOC,\"owner\":\"$A_ID\"}" | jq -r .id)
[ "$M" != null ] || fail "owner create"

s=$(code -X POST "$B/api/collections/maps/records" -H "Authorization: $TB" -d "{\"title\":\"X\",\"doc\":$DOC,\"owner\":\"$A_ID\"}")
[ "$s" != 200 ] || fail "create on behalf of someone else (got $s)"

n=$(j "$B/api/collections/maps/records?expand=owner" -H "Authorization: $TB" | jq '.items | length')
[ "$n" = 1 ] || fail "member list (got $n)"
name=$(j "$B/api/collections/maps/records?expand=owner" -H "Authorization: $TB" | jq -r '.items[0].expand.owner.name')
[ "$name" = Alice ] || fail "owner name visible to members (got $name)"

n=$(j "$B/api/collections/maps/records" | jq '.items | length')
[ "$n" = 0 ] || fail "anonymous list should be empty (got $n)"

s=$(code -X PATCH "$B/api/collections/maps/records/$M" -H "Authorization: $TB" -d '{"title":"hijack"}')
[ "$s" != 200 ] || fail "non-owner update (got $s)"
s=$(code -X DELETE "$B/api/collections/maps/records/$M" -H "Authorization: $TB")
[ "$s" != 204 ] || fail "non-owner delete (got $s)"
s=$(code -X PATCH "$B/api/collections/maps/records/$M" -H "Authorization: $TA" -d "{\"owner\":\"$B_ID\"}")
[ "$s" != 200 ] || fail "owner transfer (got $s)"
s=$(code -X PATCH "$B/api/collections/maps/records/$M" -H "Authorization: $TA" -d '{"title":"T2"}')
[ "$s" = 200 ] || fail "owner update (got $s)"
s=$(code -X DELETE "$B/api/collections/maps/records/$M" -H "Authorization: $TA")
[ "$s" = 204 ] || fail "owner delete (got $s)"

h=$(curl -s -o /dev/null -D - -H 'Origin: https://marveloushaotian.github.io' "$B/api/health" | grep -i '^access-control-allow-origin' || true)
[ -n "$h" ] || fail "CORS header for the Pages origin"
echo "smoke test passed"
