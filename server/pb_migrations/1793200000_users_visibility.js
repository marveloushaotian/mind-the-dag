/// <reference path="../pb_data/types.d.ts" />
// Members see the names of people they share a group with (and of whoever invited them),
// not the whole user list.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const rule =
      "@request.auth.collectionName = 'users' && (id = @request.auth.id" +
      " || memberships_via_user.group.memberships_via_group.user ?= @request.auth.id" +
      " || invitations_via_invitedBy.email ?= @request.auth.email:lower)";
    users.listRule = rule;
    users.viewRule = rule;
    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.listRule = "@request.auth.id != ''";
    users.viewRule = "@request.auth.id != ''";
    app.save(users);
  },
);
