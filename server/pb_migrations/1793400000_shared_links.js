/// <reference path="../pb_data/types.d.ts" />
// Invitation links can be shared by several people (up to 20 each): usedBy becomes a list.
migrate(
  (app) => {
    const signups = app.findCollectionByNameOrId("signups");
    signups.fields.add(new NumberField({ name: "maxUses", min: 1, max: 20, onlyInt: true }));
    const usedBy = signups.fields.getByName("usedBy");
    usedBy.maxSelect = 20;
    app.save(signups);
  },
  (app) => {
    const signups = app.findCollectionByNameOrId("signups");
    signups.fields.removeByName("maxUses");
    signups.fields.getByName("usedBy").maxSelect = 1;
    app.save(signups);
  },
);
