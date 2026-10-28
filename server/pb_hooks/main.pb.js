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

// ---------------------------------------------------------------- invitation links (sign-up)
// A link is valid while it has not expired and fewer people than maxUses (1-20) used it.

// A new link: the server makes the code and the expiry (14 days); a group must be one of yours.
onRecordCreateRequest((e) => {
  e.record.set("code", $security.randomString(32));
  e.record.set("expires", new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().replace("T", " "));
  e.record.set("usedBy", []);
  const n = e.record.getInt("maxUses");
  e.record.set("maxUses", Math.min(20, Math.max(1, n || 1)));
  const g = e.record.getString("group");
  if (g && !e.hasSuperuserAuth()) {
    let member = true;
    try {
      e.app.findFirstRecordByFilter("memberships", "group = {:g} && user = {:u}", { g: g, u: e.auth.id });
    } catch (_) {
      member = false;
    }
    if (!member) throw new ForbiddenError("You can only invite people into your own groups.");
  }
  e.next();
}, "signups");

// New accounts need a link that still has room and has not expired (superusers excepted).
onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) {
    const code = e.record.getString("inviteCode");
    let ok = false;
    if (code) {
      try {
        const s = e.app.findFirstRecordByFilter("signups", "code = {:c}", { c: code });
        const room = s.getStringSlice("usedBy").length < Math.max(1, s.getInt("maxUses"));
        ok = room && new Date(s.getString("expires").replace(" ", "T")) > new Date();
      } catch (_) {
        ok = false;
      }
    }
    if (!ok) throw new BadRequestError("An invitation link is needed to create an account, and this one is not valid any more.");
    e.record.set("admin", false);
  }
  e.next();
}, "users");

// After sign-up: count the use, and join the link's group (if any).
onRecordAfterCreateSuccess((e) => {
  const code = e.record.getString("inviteCode");
  if (code) {
    try {
      const s = e.app.findFirstRecordByFilter("signups", "code = {:c}", { c: code });
      s.set("usedBy+", e.record.id);
      e.app.save(s);
      const g = s.getString("group");
      if (g) {
        const m = new Record(e.app.findCollectionByNameOrId("memberships"));
        m.set("group", g);
        m.set("user", e.record.id);
        m.set("role", "member");
        e.app.save(m);
      }
    } catch (err) {
      e.app.logger().warn("sign-up link not applied", "error", String(err));
    }
    e.record.set("inviteCode", "");
    e.app.save(e.record);
  }
  e.next();
}, "users");

// Group invitations by email are for people who already have an account.
onRecordCreateRequest((e) => {
  const email = e.record.getString("email").trim().toLowerCase();
  let exists = true;
  try {
    e.app.findFirstRecordByFilter("users", "email = {:e}", { e: email });
  } catch (_) {
    exists = false;
  }
  if (!exists) throw new BadRequestError("No one has an account with this email yet. New people join through an invitation link from the admin.");
  e.next();
}, "invitations");

// What a link is for (no sign-in needed): shown on the join page.
routerAdd("GET", "/api/mtd/signups/{code}", (e) => {
  let s;
  try {
    s = $app.findFirstRecordByFilter("signups", "code = {:c}", { c: e.request.pathValue("code") });
  } catch (_) {
    return e.json(200, { valid: false, reason: "unknown" });
  }
  const expired = new Date(s.getString("expires").replace(" ", "T")) <= new Date();
  const used = s.getStringSlice("usedBy").length >= Math.max(1, s.getInt("maxUses"));
  let inviter = "Someone";
  let group = "";
  try {
    inviter = $app.findRecordById("users", s.getString("createdBy")).getString("name") || inviter;
  } catch (_) {}
  try {
    if (s.getString("group")) group = $app.findRecordById("groups", s.getString("group")).getString("name");
  } catch (_) {}
  // The person who made the link sees it as theirs (with its use count), not as an invitation.
  const mine = !!e.auth && e.auth.id === s.getString("createdBy");
  return e.json(200, {
    valid: !expired && !used,
    reason: used ? "used" : expired ? "expired" : "",
    inviter: inviter,
    group: group,
    mine: mine,
    uses: mine ? s.getStringSlice("usedBy").length : undefined,
    maxUses: mine ? Math.max(1, s.getInt("maxUses")) : undefined,
  });
});

// Someone who already has an account opens a link: join its group. A place on the link is
// used only when that adds them to the group; the link's maker, people already in the group,
// and links without a group use nothing.
routerAdd(
  "POST",
  "/api/mtd/signups/{code}/accept",
  (e) => {
    let s;
    try {
      s = $app.findFirstRecordByFilter("signups", "code = {:c}", { c: e.request.pathValue("code") });
    } catch (_) {
      throw new NotFoundError("This invitation link does not exist.");
    }
    const g = s.getString("group");
    if (!g || e.auth.id === s.getString("createdBy")) return e.json(200, { group: g });
    let member = true;
    try {
      $app.findFirstRecordByFilter("memberships", "group = {:g} && user = {:u}", { g: g, u: e.auth.id });
    } catch (_) {
      member = false;
    }
    if (member) return e.json(200, { group: g });
    const users = s.getStringSlice("usedBy");
    const already = users.indexOf(e.auth.id) >= 0;
    if (!already && users.length >= Math.max(1, s.getInt("maxUses"))) throw new BadRequestError("All places on this invitation link have been used.");
    if (new Date(s.getString("expires").replace(" ", "T")) <= new Date()) throw new BadRequestError("This invitation link has expired.");
    $app.runInTransaction((tx) => {
      const m = new Record(tx.findCollectionByNameOrId("memberships"));
      m.set("group", g);
      m.set("user", e.auth.id);
      m.set("role", "member");
      tx.save(m);
      if (!already) {
        s.set("usedBy+", e.auth.id);
        tx.save(s);
      }
    });
    return e.json(200, { group: g });
  },
  $apis.requireAuth("users"),
);
