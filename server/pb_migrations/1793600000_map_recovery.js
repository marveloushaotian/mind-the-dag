// Versioned writes and recoverable deletion. Existing maps start at revision zero.
migrate((app) => {
  const maps = app.findCollectionByNameOrId("maps");
  maps.fields.add(new NumberField({ name: "revision", onlyInt: true, min: 0 }));
  maps.fields.add(new DateField({ name: "deletedAt" }));
  app.save(maps);
}, (app) => {
  const maps = app.findCollectionByNameOrId("maps");
  maps.fields.removeByName("revision");
  maps.fields.removeByName("deletedAt");
  app.save(maps);
});
