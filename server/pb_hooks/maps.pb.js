// All browser mutations use the transactional endpoint. Old tabs must refresh rather
// than bypass version checks or permanently delete a map.
onRecordUpdateRequest((e) => {
  if (!e.hasSuperuserAuth()) throw new BadRequestError("Refresh this page to use safe saving.");
  e.record.set("revision", e.record.original().getInt("revision") + 1);
  e.next();
}, "maps");
onRecordDeleteRequest((e) => {
  if (!e.hasSuperuserAuth()) throw new BadRequestError("Refresh this page to move maps to Recently deleted.");
  e.next();
}, "maps");
onRecordCreateRequest((e) => {
  e.record.set("revision", 0);
  e.record.set("deletedAt", "");
  e.next();
}, "maps");

routerAdd("POST", "/api/mtd/maps/{id}/{action}", (e) => {
  const action = e.request.pathValue("action");
  if (!["save", "trash", "restore"].includes(action)) throw new NotFoundError();
  const body = e.requestInfo().body;
  if (!Number.isSafeInteger(body.revision) || body.revision < -1) throw new BadRequestError("A map revision is required.");
  let result;
  // PocketBase's write transaction serializes the read, permission check and write.
  e.app.runInTransaction((tx) => {
    const r = tx.findRecordById("maps", e.request.pathValue("id"));
    const rules = r.collection();
    if (!tx.canAccessRecord(r, e.requestInfo(), rules.viewRule)) throw new NotFoundError();
    if (action !== "save" && !tx.canAccessRecord(r, e.requestInfo(), rules.deleteRule)) throw new ForbiddenError("Only the map author or group owner can restore or delete this map.");
    if (r.getInt("revision") !== body.revision) {
      result = { ok: false, conflict: true };
      return;
    }
    if (action === "save") {
      if (r.getString("deletedAt")) throw new BadRequestError("This map is in Recently deleted. Save your changes as a new map.");
      if (!body.doc || body.doc.version !== 1 || !Array.isArray(body.doc.stations) || !Array.isArray(body.doc.edges) || !Array.isArray(body.doc.lines) || !Array.isArray(body.doc.sections)) throw new BadRequestError("Invalid map document.");
      const title = String(body.doc.title || "Untitled").trim() || "Untitled";
      r.set("title", title);
      r.set("doc", Object.assign({}, body.doc, { title }));
    } else {
      r.set("deletedAt", action === "trash" ? new Date().toISOString() : "");
    }
    r.set("editedBy", e.auth.id);
    r.set("revision", r.getInt("revision") + 1);
    tx.save(r);
    result = { ok: true, revision: r.getInt("revision"), updated: r.getString("updated") };
  });
  return e.json(200, result);
}, $apis.requireAuth("users"));

// The website release waits for the backend contract before exposing its controls.
routerAdd("GET", "/api/mtd/capabilities", (e) => e.json(200, {
  mapRevisionWrites: 1,
  mapRecovery: 1,
}));
