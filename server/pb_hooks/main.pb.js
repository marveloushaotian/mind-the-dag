/// <reference path="../pb_data/types.d.ts" />
// Server-side checks for workspaces that collection rules cannot express on their own.
// (Each handler runs in its own JS VM, so helpers are inlined.)

// A new group: its creator becomes the owner member.
onRecordAfterCreateSuccess((e) => {
  const m = new Record(e.app.findCollectionByNameOrId("memberships"));
  m.set("group", e.record.id);
  m.set("user", e.record.getString("owner"));
  m.set("role", "owner");
  e.app.save(m);
  e.next();
}, "groups");

// Maps: only members can create a map inside a group.
onRecordCreateRequest((e) => {
  const g = e.record.getString("group");
  if (g && !e.hasSuperuserAuth()) {
    let ok = true;
    try {
      e.app.findFirstRecordByFilter("memberships", "group = {:g} && user = {:u}", { g: g, u: e.auth.id });
    } catch (_) {
      ok = false;
    }
    if (!ok) throw new ForbiddenError("You are not a member of this group.");
  }
  e.next();
}, "maps");

// Invitations: only members can invite; emails are kept lower-case; no invites for existing members.
onRecordCreateRequest((e) => {
  const g = e.record.getString("group");
  if (!e.hasSuperuserAuth()) {
    let member = true;
    try {
      e.app.findFirstRecordByFilter("memberships", "group = {:g} && user = {:u}", { g: g, u: e.auth.id });
    } catch (_) {
      member = false;
    }
    if (!member) throw new ForbiddenError("Only members can invite people to this group.");
  }
  const email = e.record.getString("email").trim().toLowerCase();
  e.record.set("email", email);
  let already = false;
  try {
    const u = e.app.findFirstRecordByFilter("users", "email = {:e}", { e: email });
    e.app.findFirstRecordByFilter("memberships", "group = {:g} && user = {:u}", { g: g, u: u.id });
    already = true;
  } catch (_) {
    already = false;
  }
  if (already) throw new BadRequestError("This person is already in the group.");
  e.next();
}, "invitations");

// Accept an invitation addressed to the signed-in member's email.
routerAdd(
  "POST",
  "/api/mtd/invitations/{id}/accept",
  (e) => {
    const auth = e.auth;
    let inv;
    try {
      inv = $app.findRecordById("invitations", e.request.pathValue("id"));
    } catch (_) {
      throw new NotFoundError("This invitation no longer exists.");
    }
    if (inv.getString("email") !== auth.email().toLowerCase()) throw new ForbiddenError("This invitation is for another email address.");
    const g = inv.getString("group");
    $app.runInTransaction((tx) => {
      let exists = true;
      try {
        tx.findFirstRecordByFilter("memberships", "group = {:g} && user = {:u}", { g: g, u: auth.id });
      } catch (_) {
        exists = false;
      }
      if (!exists) {
        const m = new Record(tx.findCollectionByNameOrId("memberships"));
        m.set("group", g);
        m.set("user", auth.id);
        m.set("role", "member");
        tx.save(m);
      }
      tx.delete(inv);
    });
    return e.json(200, { group: g });
  },
  $apis.requireAuth("users"),
);
