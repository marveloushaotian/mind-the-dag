#!/usr/bin/env bash
# Smoke test for the group library container: schema, hooks and every access rule.
# Usage: smoke.sh BASE_URL CONTAINER   (CI only; throwaway test accounts)
set -euo pipefail
B=$1; C=$2
j() { curl -s -H 'Content-Type: application/json' "$@"; }
code() { curl -s -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' "$@"; }
fail() { echo "FAIL: $*"; exit 1; }
ok() { echo "ok   $*"; }

for i in $(seq 1 30); do curl -sf "$B/api/health" >/dev/null && break; sleep 1; done
docker exec "$C" /pb/pocketbase superuser upsert --dir=/pb_data admin@example.test 'ci-admin-pass-123' >/dev/null
SU=$(j -X POST "$B/api/collections/_superusers/auth-with-password" -d '{"identity":"admin@example.test","password":"ci-admin-pass-123"}' | jq -r .token)
[ "$SU" != null ] || fail "superuser sign-in"

# accounts made by the admin (superuser bypasses the invite-only create rule)
mk() { j -X POST "$B/api/collections/users/records" -H "Authorization: $SU" \
  -d "{\"email\":\"$1\",\"password\":\"ci-user-pass-123\",\"passwordConfirm\":\"ci-user-pass-123\",\"name\":\"$2\"}" | jq -r .id; }
A_ID=$(mk a@example.test Alice); B_ID=$(mk b@example.test Bob); C_ID=$(mk c@example.test Carol)
login() { sleep 1.6; j -X POST "$B/api/collections/users/auth-with-password" -d "{\"identity\":\"$1\",\"password\":\"ci-user-pass-123\"}" | jq -r .token; }
TA=$(login a@example.test); TB=$(login b@example.test); TC=$(login c@example.test)
[ "$TA" != null ] && [ "$TB" != null ] && [ "$TC" != null ] || fail "member sign-in"; ok "admin-made accounts sign in"

DOC='{"version":1,"title":"T","stations":[],"edges":[],"lines":[],"sections":[]}'
newmap() { # token owner [group]
  local g=${3:-}
  j -X POST "$B/api/collections/maps/records" -H "Authorization: $1" -d "{\"title\":\"T\",\"doc\":$DOC,\"owner\":\"$2\",\"editedBy\":\"$2\",\"group\":\"$g\"}" | jq -r .id
}
count() { j "$B/api/collections/$1/records?perPage=200${3:-}" -H "Authorization: $2" | jq '.items | length'; }

# --- personal maps are private
MA=$(newmap "$TA" "$A_ID"); [ "$MA" != null ] || fail "create personal map"
[ "$(count maps "$TB")" = 0 ] || fail "personal map visible to someone else"
[ "$(code "$B/api/collections/maps/records/$MA" -H "Authorization: $TB")" = 404 ] || fail "view other's personal map"
[ "$(count maps "")" = 0 ] || fail "anonymous list"
s=$(code -X POST "$B/api/collections/maps/records" -H "Authorization: $TB" -d "{\"title\":\"X\",\"doc\":$DOC,\"owner\":\"$A_ID\"}")
[ "$s" != 200 ] || fail "create on behalf of someone else"; ok "personal maps are private"

# --- groups: creator becomes owner
G=$(j -X POST "$B/api/collections/groups/records" -H "Authorization: $TA" -d "{\"name\":\"Lab\",\"owner\":\"$A_ID\"}" | jq -r .id)
[ "$G" != null ] || fail "create group"
role=$(j "$B/api/collections/memberships/records?filter=group%3D%27$G%27" -H "Authorization: $TA" | jq -r '.items[0].role')
[ "$role" = owner ] || fail "owner membership on create (got $role)"
[ "$(count groups "$TB")" = 0 ] || fail "non-member sees group"
s=$(code -X POST "$B/api/collections/maps/records" -H "Authorization: $TB" -d "{\"title\":\"X\",\"doc\":$DOC,\"owner\":\"$B_ID\",\"group\":\"$G\"}")
[ "$s" != 200 ] || fail "non-member creates map in group"
s=$(code -X POST "$B/api/collections/memberships/records" -H "Authorization: $TB" -d "{\"group\":\"$G\",\"user\":\"$B_ID\",\"role\":\"member\"}")
[ "$s" != 200 ] || fail "self-join without invitation"; ok "groups: owner membership, closed to non-members"

# --- invitations
s=$(code -X POST "$B/api/collections/invitations/records" -H "Authorization: $TC" -d "{\"group\":\"$G\",\"email\":\"x@example.test\",\"invitedBy\":\"$C_ID\"}")
[ "$s" != 200 ] || fail "non-member invites"
INV=$(j -X POST "$B/api/collections/invitations/records" -H "Authorization: $TA" -d "{\"group\":\"$G\",\"email\":\"B@Example.TEST\",\"invitedBy\":\"$A_ID\"}" | jq -r .id)
[ "$INV" != null ] || fail "member invites"
em=$(j "$B/api/collections/invitations/records/$INV" -H "Authorization: $TB" | jq -r .email)
[ "$em" = b@example.test ] || fail "invitee sees invitation (lower-cased email), got $em"
[ "$(code "$B/api/collections/groups/records/$G" -H "Authorization: $TB")" = 200 ] || fail "invitee sees group name"
[ "$(count invitations "$TC")" = 0 ] || fail "others see invitation"
[ "$(code -X POST "$B/api/mtd/invitations/$INV/accept" -H "Authorization: $TC")" = 403 ] || fail "accept someone else's invitation"
[ "$(code -X POST "$B/api/mtd/invitations/$INV/accept" -H "Authorization: $TB")" = 200 ] || fail "accept invitation"
[ "$(count invitations "$TB")" = 0 ] || fail "invitation removed after accepting"
s=$(code -X POST "$B/api/collections/invitations/records" -H "Authorization: $TA" -d "{\"group\":\"$G\",\"email\":\"b@example.test\",\"invitedBy\":\"$A_ID\"}")
[ "$s" = 400 ] || fail "invite an existing member (got $s)"; ok "invitations"

# --- group maps
MB=$(newmap "$TB" "$B_ID" "$G"); [ "$MB" != null ] || fail "member creates group map"
[ "$(count maps "$TA" "&filter=group%3D%27$G%27")" = 1 ] || fail "group map visible to members"
[ "$(code "$B/api/collections/maps/records/$MB" -H "Authorization: $TC")" = 404 ] || fail "group map hidden from non-members"
[ "$(code -X PATCH "$B/api/collections/maps/records/$MB" -H "Authorization: $TA" -d "{\"title\":\"T2\",\"editedBy\":\"$A_ID\"}")" = 200 ] || fail "member edits group map"
[ "$(code -X PATCH "$B/api/collections/maps/records/$MB" -H "Authorization: $TA" -d "{\"editedBy\":\"$B_ID\"}")" != 200 ] || fail "edit in someone else's name"
[ "$(code -X PATCH "$B/api/collections/maps/records/$MB" -H "Authorization: $TB" -d '{"group":""}')" != 200 ] || fail "move group map out"
[ "$(code -X PATCH "$B/api/collections/maps/records/$MB" -H "Authorization: $TB" -d "{\"owner\":\"$A_ID\"}")" != 200 ] || fail "owner transfer"
MA2=$(newmap "$TA" "$A_ID" "$G")
[ "$(code -X DELETE "$B/api/collections/maps/records/$MA2" -H "Authorization: $TB")" != 204 ] || fail "member deletes another member's group map"
MB2=$(newmap "$TB" "$B_ID" "$G")
[ "$(code -X DELETE "$B/api/collections/maps/records/$MB2" -H "Authorization: $TA")" = 204 ] || fail "group owner deletes a group map"
ok "group maps"

# --- leaving and removing
MSA=$(j "$B/api/collections/memberships/records?filter=user%3D%27$A_ID%27" -H "Authorization: $TA" | jq -r '.items[0].id')
[ "$(code -X DELETE "$B/api/collections/memberships/records/$MSA" -H "Authorization: $TA")" != 204 ] || fail "owner leaves own group"
MSB=$(j "$B/api/collections/memberships/records?filter=user%3D%27$B_ID%27" -H "Authorization: $TB" | jq -r '.items[0].id')
[ "$(code -X DELETE "$B/api/collections/memberships/records/$MSB" -H "Authorization: $TB")" = 204 ] || fail "member leaves"
[ "$(code "$B/api/collections/maps/records/$MB" -H "Authorization: $TB")" = 404 ] || fail "left member still sees group map"
INV2=$(j -X POST "$B/api/collections/invitations/records" -H "Authorization: $TA" -d "{\"group\":\"$G\",\"email\":\"b@example.test\",\"invitedBy\":\"$A_ID\"}" | jq -r .id)
[ "$(code -X POST "$B/api/mtd/invitations/$INV2/accept" -H "Authorization: $TB")" = 200 ] || fail "re-accept"
MSB=$(j "$B/api/collections/memberships/records?filter=user%3D%27$B_ID%27" -H "Authorization: $TB" | jq -r '.items[0].id')
[ "$(code -X DELETE "$B/api/collections/memberships/records/$MSB" -H "Authorization: $TA")" = 204 ] || fail "owner removes member"
ok "leave and remove"

# --- deleting a group keeps its maps (they fall back to their authors)
[ "$(code -X DELETE "$B/api/collections/groups/records/$G" -H "Authorization: $TB")" != 204 ] || fail "non-owner deletes group"
[ "$(code -X DELETE "$B/api/collections/groups/records/$G" -H "Authorization: $TA")" = 204 ] || fail "owner deletes group"
g=$(j "$B/api/collections/maps/records/$MB" -H "Authorization: $SU" | jq -r .group)
[ "$g" = "" ] || fail "map kept after group delete (group=$g)"
[ "$(code "$B/api/collections/maps/records/$MB" -H "Authorization: $TB")" = 200 ] || fail "author keeps map after group delete"
ok "group delete keeps maps"

# --- sign-up is invite-only and OAuth-only
s=$(code -X POST "$B/api/collections/users/records" -d '{"email":"x@example.test","password":"ci-user-pass-123","passwordConfirm":"ci-user-pass-123"}')
[ "$s" != 200 ] || fail "password sign-up"; ok "no password sign-up"

# --- settings and CORS
st=$(j "$B/api/settings" -H "Authorization: $SU")
[ "$(echo "$st" | jq -r .backups.cron)" = "0 2 * * *" ] || fail "daily backups"
[ "$(echo "$st" | jq -r .rateLimits.enabled)" = true ] || fail "rate limits"
[ "$(echo "$st" | jq -r '.trustedProxy.headers[0]')" = X-Forwarded-For ] || fail "trusted proxy header"
h=$(curl -s -o /dev/null -D - -H 'Origin: https://marveloushaotian.github.io' "$B/api/health" | grep -i '^access-control-allow-origin' || true)
[ -n "$h" ] || fail "CORS header for the Pages origin"
ok "backups, rate limits, proxy header, CORS"
echo "smoke test passed"
