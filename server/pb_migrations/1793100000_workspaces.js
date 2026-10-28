/// <reference path="../pb_data/types.d.ts" />
// Workspaces: every member has private maps ("My maps"); anyone can start a group and
// invite people by email; group maps are visible to and editable by the group's members.
// New accounts come only from an invitation, signing in with GitHub or Google.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const maps = app.findCollectionByNameOrId("maps");

    const groups = new Collection({
      type: "base",
      name: "groups",
      fields: [
        { name: "name", type: "text", required: true, max: 120 },
        { name: "owner", type: "relation", required: true, collectionId: users.id, maxSelect: 1 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(groups);

    const memberships = new Collection({
      type: "base",
      name: "memberships",
      fields: [
        { name: "group", type: "relation", required: true, collectionId: groups.id, maxSelect: 1, cascadeDelete: true },
        { name: "user", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
        { name: "role", type: "select", required: true, maxSelect: 1, values: ["owner", "member"] },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_memberships_group_user ON memberships (`group`, user)"],
    });
    app.save(memberships);

    const invitations = new Collection({
      type: "base",
      name: "invitations",
      fields: [
        { name: "group", type: "relation", required: true, collectionId: groups.id, maxSelect: 1, cascadeDelete: true },
        { name: "email", type: "email", required: true },
        { name: "invitedBy", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_invitations_group_email ON invitations (`group`, email)"],
    });
    app.save(invitations);

    const isMember = (path) => `${path}.memberships_via_group.user ?= @request.auth.id`;
    const signedIn = "@request.auth.collectionName = 'users'";

    groups.listRule = `${signedIn} && (memberships_via_group.user ?= @request.auth.id || invitations_via_group.email ?= @request.auth.email:lower)`;
    groups.viewRule = groups.listRule;
    groups.createRule = `${signedIn} && @request.body.owner = @request.auth.id`;
    groups.updateRule = `${signedIn} && owner = @request.auth.id && @request.body.owner:isset = false`;
    groups.deleteRule = `${signedIn} && owner = @request.auth.id`;
    app.save(groups);

    memberships.listRule = `${signedIn} && (user = @request.auth.id || ${isMember("group")})`;
    memberships.viewRule = memberships.listRule;
    memberships.createRule = null; // added by the server: group owner on create, members on accepting
    memberships.updateRule = null;
    memberships.deleteRule = `${signedIn} && ((user = @request.auth.id && role != 'owner') || (group.owner = @request.auth.id && user != @request.auth.id))`;
    app.save(memberships);

    invitations.listRule = `${signedIn} && (email = @request.auth.email:lower || ${isMember("group")})`;
    invitations.viewRule = invitations.listRule;
    invitations.createRule = `${signedIn} && @request.body.invitedBy = @request.auth.id`; // membership checked in pb_hooks
    invitations.updateRule = null;
    invitations.deleteRule = `${signedIn} && (email = @request.auth.email:lower || invitedBy = @request.auth.id || group.owner = @request.auth.id)`;
    app.save(invitations);

    maps.fields.add(new RelationField({ name: "group", collectionId: groups.id, maxSelect: 1, cascadeDelete: false }));
    maps.fields.add(new RelationField({ name: "editedBy", collectionId: users.id, maxSelect: 1, cascadeDelete: false }));
    const canSee = `${signedIn} && ((group = '' && owner = @request.auth.id) || (group != '' && ${isMember("group")}))`;
    maps.listRule = canSee;
    maps.viewRule = canSee;
    maps.createRule = `${signedIn} && @request.body.owner = @request.auth.id`; // group membership checked in pb_hooks
    maps.updateRule = `${canSee} && @request.body.owner:isset = false && @request.body.group:isset = false && (@request.body.editedBy:isset = false || @request.body.editedBy = @request.auth.id)`;
    maps.deleteRule = `${signedIn} && ((group = '' && owner = @request.auth.id) || (group != '' && ${isMember("group")} && (owner = @request.auth.id || group.owner = @request.auth.id)))`;
    app.save(maps);

    // New accounts only through an invitation, and only via GitHub / Google sign-in.
    users.createRule = "@request.context = 'oauth2' && @collection.invitations.email ?= @request.body.email:lower";
    app.save(users);

    const s = app.settings();
    s.backups.cron = "0 2 * * *"; // daily at 02:00 UTC, kept on the data volume
    s.backups.cronMaxKeep = 7;
    s.trustedProxy.headers = ["X-Forwarded-For"]; // Rahti's router appends the client IP
    s.trustedProxy.useLeftmostIP = false;
    s.rateLimits.enabled = true;
    app.save(s);
  },
  (app) => {
    const maps = app.findCollectionByNameOrId("maps");
    maps.fields.removeByName("group");
    maps.fields.removeByName("editedBy");
    const member = "@request.auth.collectionName = 'users'";
    maps.listRule = member;
    maps.viewRule = member;
    maps.createRule = `${member} && @request.body.owner = @request.auth.id`;
    maps.updateRule = `${member} && owner = @request.auth.id && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)`;
    maps.deleteRule = `${member} && owner = @request.auth.id`;
    app.save(maps);
    for (const name of ["invitations", "memberships", "groups"]) app.delete(app.findCollectionByNameOrId(name));
    const users = app.findCollectionByNameOrId("users");
    users.createRule = null;
    app.save(users);
  },
);
