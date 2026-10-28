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

[ "$(count users "$TC")" = 1 ] || fail "user list limited to people you share a group with"
[ "$(count users "$TA")" = 2 ] || fail "group owner sees the new member"
ok "user names visible only within shared groups"

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

# --- sign-up only through an invitation link from the admin
s=$(code -X POST "$B/api/collections/users/records" -d '{"email":"x@example.test","password":"ci-user-pass-123","passwordConfirm":"ci-user-pass-123"}')
[ "$s" != 200 ] || fail "sign-up without a link"
s=$(code -X POST "$B/api/collections/invitations/records" -H "Authorization: $TA" -d "{\"group\":\"$(j -X POST "$B/api/collections/groups/records" -H "Authorization: $TA" -d "{\"name\":\"Lab2\",\"owner\":\"$A_ID\"}" | jq -r .id)\",\"email\":\"nobody@example.test\",\"invitedBy\":\"$A_ID\"}")
[ "$s" = 400 ] || fail "group invitation for an email without an account (got $s)"
[ "$(code -X POST "$B/api/collections/signups/records" -H "Authorization: $TA" -d "{\"createdBy\":\"$A_ID\"}")" != 200 ] || fail "non-admin creates a link"
j -X PATCH "$B/api/collections/users/records/$A_ID" -H "Authorization: $SU" -d '{"admin":true}' >/dev/null
[ "$(code -X PATCH "$B/api/collections/users/records/$B_ID" -H "Authorization: $TB" -d '{"admin":true}')" != 200 ] || fail "member makes self admin"
TA=$(login a@example.test)
G2=$(j -X POST "$B/api/collections/groups/records" -H "Authorization: $TA" -d "{\"name\":\"Lab3\",\"owner\":\"$A_ID\"}" | jq -r .id)
L=$(j -X POST "$B/api/collections/signups/records" -H "Authorization: $TA" -d "{\"createdBy\":\"$A_ID\",\"note\":\"Dave\",\"group\":\"$G2\",\"code\":\"chosen-by-client\"}")
CODE=$(echo "$L" | jq -r .code); LID=$(echo "$L" | jq -r .id)
[ "$CODE" != null ] && [ "$CODE" != chosen-by-client ] && [ ${#CODE} -ge 32 ] || fail "admin creates a link with a server-made code ($CODE)"
info=$(j "$B/api/mtd/signups/$CODE")
[ "$(echo "$info" | jq -r .valid)" = true ] && [ "$(echo "$info" | jq -r .group)" = Lab3 ] || fail "link info ($info)"
[ "$(j "$B/api/mtd/signups/nope" | jq -r .valid)" = false ] || fail "unknown link reported valid"
s=$(code -X POST "$B/api/collections/users/records" -d "{\"email\":\"dave@example.test\",\"password\":\"ci-user-pass-123\",\"passwordConfirm\":\"ci-user-pass-123\",\"name\":\"Dave\",\"inviteCode\":\"$CODE\",\"admin\":true}")
[ "$s" = 200 ] || fail "sign-up with a link (got $s)"
TD=$(login dave@example.test); D_ID=$(j "$B/api/collections/users/records?filter=email%3D%27dave%40example.test%27" -H "Authorization: $SU" | jq -r '.items[0].id')
[ "$(j "$B/api/collections/users/records/$D_ID" -H "Authorization: $SU" | jq -r .admin)" = false ] || fail "sign-up cannot make itself admin"
[ "$(j "$B/api/collections/users/records/$D_ID" -H "Authorization: $SU" | jq -r .inviteCode)" = "" ] || fail "invite code cleared after sign-up"
[ "$(count memberships "$TD" "&filter=group%3D%27$G2%27")" -ge 1 ] || fail "joined the link's group"
[ "$(j "$B/api/mtd/signups/$CODE" | jq -r .valid)" = false ] || fail "link used up"
s=$(code -X POST "$B/api/collections/users/records" -d "{\"email\":\"eve@example.test\",\"password\":\"ci-user-pass-123\",\"passwordConfirm\":\"ci-user-pass-123\",\"inviteCode\":\"$CODE\"}")
[ "$s" != 200 ] || fail "second sign-up with a used link"
L2=$(j -X POST "$B/api/collections/signups/records" -H "Authorization: $TA" -d "{\"createdBy\":\"$A_ID\",\"group\":\"$G2\"}" | jq -r .code)
[ "$(code -X POST "$B/api/mtd/signups/$L2/accept" -H "Authorization: $TC")" = 200 ] || fail "existing member accepts a link"
[ "$(count memberships "$TC" "&filter=group%3D%27$G2%27")" -ge 1 ] || fail "existing member joined via link"
[ "$(code -X POST "$B/api/mtd/signups/$L2/accept" -H "Authorization: $TC")" = 200 ] || fail "accept again"
[ "$(code -X POST "$B/api/mtd/signups/$L2/accept" -H "Authorization: $TA")" = 200 ] || fail "maker opens own link"
[ "$(j "$B/api/collections/signups/records?filter=code%3D%27$L2%27" -H "Authorization: $TA" | jq '.items[0].usedBy | length')" = 1 ] || fail "only the new member used a place"
mine=$(j "$B/api/mtd/signups/$L2" -H "Authorization: $TA")
[ "$(echo "$mine" | jq -r .mine)" = true ] && [ "$(echo "$mine" | jq -r .uses)" = 1 ] || fail "maker sees own link ($mine)"
[ "$(j "$B/api/mtd/signups/$L2" -H "Authorization: $TC" | jq -r .mine)" = false ] || fail "others don't see it as theirs"
[ "$(j "$B/api/mtd/signups/$L2" | jq -r '.mine, .uses')" = "$(printf 'false\nnull')" ] || fail "anonymous link info"
[ "$(count signups "$TC")" = 0 ] || fail "links visible to others"
[ "$(code -X DELETE "$B/api/collections/signups/records/$LID" -H "Authorization: $TA")" = 204 ] || fail "admin revokes a link"
M=$(j -X POST "$B/api/collections/signups/records" -H "Authorization: $TA" -d "{\"createdBy\":\"$A_ID\",\"maxUses\":2}")
MC=$(echo "$M" | jq -r .code); [ "$(echo "$M" | jq -r .maxUses)" = 2 ] || fail "link for several people"
for who in f g; do
  s=$(code -X POST "$B/api/collections/users/records" -d "{\"email\":\"$who@example.test\",\"password\":\"ci-user-pass-123\",\"passwordConfirm\":\"ci-user-pass-123\",\"inviteCode\":\"$MC\"}")
  [ "$s" = 200 ] || fail "sign-up $who with a shared link (got $s)"
done
s=$(code -X POST "$B/api/collections/users/records" -d "{\"email\":\"h@example.test\",\"password\":\"ci-user-pass-123\",\"passwordConfirm\":\"ci-user-pass-123\",\"inviteCode\":\"$MC\"}")
[ "$s" != 200 ] || fail "sign-up beyond the link's limit"
[ "$(j "$B/api/collections/signups/records/$(echo "$M" | jq -r .id)" -H "Authorization: $TA" | jq '.usedBy | length')" = 2 ] || fail "uses recorded"
big=$(j -X POST "$B/api/collections/signups/records" -H "Authorization: $TA" -d "{\"createdBy\":\"$A_ID\",\"maxUses\":500}" | jq -r .maxUses)
[ "$big" = 20 ] || fail "limit capped at 20 (got $big)"
ok "invitation links"

# --- settings and CORS
st=$(j "$B/api/settings" -H "Authorization: $SU")
[ "$(echo "$st" | jq -r .backups.cron)" = "0 2 * * *" ] || fail "daily backups"
[ "$(echo "$st" | jq -r .rateLimits.enabled)" = true ] || fail "rate limits"
[ "$(echo "$st" | jq -r '.trustedProxy.headers[0]')" = X-Forwarded-For ] || fail "trusted proxy header"
h=$(curl -s -o /dev/null -D - -H 'Origin: https://marveloushaotian.github.io' "$B/api/health" | grep -i '^access-control-allow-origin' || true)
[ -n "$h" ] || fail "CORS header for the Pages origin"
ok "backups, rate limits, proxy header, CORS"
# --- one-off title renumbering (migration 1793500000), run again over repeated titles
G9=$(j -X POST "$B/api/collections/groups/records" -H "Authorization: $TA" -d "{\"name\":\"Titles\",\"owner\":\"$A_ID\"}" | jq -r .id)
titled() { # title [group]
  sleep 0.05
  j -X POST "$B/api/collections/maps/records" -H "Authorization: $TA" \
    -d "{\"title\":\"$1\",\"doc\":{\"version\":1,\"title\":\"$1\"},\"owner\":\"$A_ID\",\"editedBy\":\"$A_ID\",\"group\":\"${2:-}\"}" | jq -r .id
}
D1=$(titled Dup); D2=$(titled Dup); D3=$(titled "Dup 2"); GD=$(titled Dup "$G9")
docker exec "$C" /pb/pocketbase migrate down 1 --dir=/pb_data --migrationsDir=/pb/pb_migrations >/dev/null
docker exec "$C" /pb/pocketbase migrate up --dir=/pb_data --migrationsDir=/pb/pb_migrations >/dev/null
t() { j "$B/api/collections/maps/records/$1" -H "Authorization: $TA" | jq -r "$2"; }
[ "$(t "$D1" .title)" = Dup ] || fail "oldest keeps its title"
[ "$(t "$D2" .title)" = "Dup 3" ] && [ "$(t "$D2" .doc.title)" = "Dup 3" ] || fail "later repeat numbered around existing numbers ($(t "$D2" .title))"
[ "$(t "$D3" .title)" = "Dup 2" ] || fail "already unique title untouched"
[ "$(t "$GD" .title)" = Dup ] || fail "a group is its own place"
ok "repeated titles renumbered"
echo "smoke test passed"
