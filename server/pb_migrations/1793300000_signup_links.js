/// <reference path="../pb_data/types.d.ts" />
// New accounts only through an invitation link that the admin creates (GitHub or email and
// password, the person's choice). Members can still invite people who already have an
// account into their groups by email.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const groups = app.findCollectionByNameOrId("groups");
    users.fields.add(new BoolField({ name: "admin" }));
    users.fields.add(new TextField({ name: "inviteCode", max: 64 }));
    users.createRule = ""; // pb_hooks require a valid invitation link (or a superuser)
    users.updateRule = "id = @request.auth.id && @request.body.admin:isset = false && @request.body.inviteCode:isset = false";
    app.save(users);

    try {
      const me = app.findFirstRecordByFilter("users", "email = {:e}", { e: "marveloushaotian@icloud.com" });
      me.set("admin", true);
      app.save(me);
    } catch (_) {
      /* fresh install (CI): the admin flag is set by the superuser */
    }

    const signups = new Collection({
      type: "base",
      name: "signups",
      fields: [
        { name: "code", type: "text", required: true, max: 64 },
        { name: "note", type: "text", max: 120 },
        { name: "group", type: "relation", collectionId: groups.id, maxSelect: 1, cascadeDelete: true },
        { name: "createdBy", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
        { name: "expires", type: "date", required: true },
        { name: "usedBy", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_signups_code ON signups (code)"],
      listRule: "@request.auth.collectionName = 'users' && createdBy = @request.auth.id",
      viewRule: "@request.auth.collectionName = 'users' && createdBy = @request.auth.id",
      createRule: "@request.auth.collectionName = 'users' && @request.auth.admin = true && @request.body.createdBy = @request.auth.id",
      updateRule: null,
      deleteRule: "@request.auth.collectionName = 'users' && createdBy = @request.auth.id",
    });
    app.save(signups);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("signups"));
    const users = app.findCollectionByNameOrId("users");
    users.fields.removeByName("admin");
    users.fields.removeByName("inviteCode");
    users.createRule = "@request.context = 'oauth2' && @collection.invitations.email ?= @request.body.email:lower";
    users.updateRule = "id = @request.auth.id";
    app.save(users);
  },
);
