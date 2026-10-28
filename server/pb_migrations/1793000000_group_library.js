/// <reference path="../pb_data/types.d.ts" />
// Group library schema: members sign in (accounts are created by the admin only),
// every member can read every shared map, and only its owner can change or delete it.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.createRule = null; // no self sign-up
    users.listRule = "@request.auth.id != ''"; // members can see each other's names
    users.viewRule = "@request.auth.id != ''";
    users.updateRule = "id = @request.auth.id";
    users.deleteRule = null;
    users.authAlert.enabled = false; // no mail server: skip new-device alert mails
    app.save(users);

    const member = "@request.auth.collectionName = 'users'";
    const maps = new Collection({
      type: "base",
      name: "maps",
      listRule: member,
      viewRule: member,
      createRule: `${member} && @request.body.owner = @request.auth.id`,
      updateRule: `${member} && owner = @request.auth.id && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)`,
      deleteRule: `${member} && owner = @request.auth.id`,
      fields: [
        { name: "title", type: "text", required: true, max: 300 },
        { name: "doc", type: "json", required: true, maxSize: 4000000 },
        { name: "owner", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE INDEX idx_maps_updated ON maps (updated)"],
    });
    app.save(maps);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("maps"));
    const users = app.findCollectionByNameOrId("users");
    users.createRule = "";
    users.listRule = "id = @request.auth.id";
    users.viewRule = "id = @request.auth.id";
    users.deleteRule = "id = @request.auth.id";
    users.authAlert.enabled = true;
    app.save(users);
  },
);
