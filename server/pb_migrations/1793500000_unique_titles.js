/// <reference path="../pb_data/types.d.ts" />
// One-off: map titles become unique within each place (a person's My maps, or a group).
// In each place the oldest map keeps a repeated title; later ones get the next free number
// ("TEDPLEX workflow overview 2"). Titles that are already unique are not touched.
// Same rule as renumberTitles() in src/model.ts (tested there).
migrate(
  (app) => {
    const places = {};
    for (const r of app.findAllRecords("maps")) {
      const key = r.getString("group") ? "g:" + r.getString("group") : "u:" + r.getString("owner");
      (places[key] = places[key] || []).push(r);
    }
    const norm = (t) => t.trim().toLowerCase();
    for (const key of Object.keys(places)) {
      const maps = places[key].sort((a, b) => (a.getString("created") < b.getString("created") ? -1 : 1));
      const used = {};
      const later = [];
      for (const r of maps) {
        const t = r.getString("title").trim() || "Untitled pipeline";
        if (used[norm(t)]) later.push(r);
        else used[norm(t)] = true;
      }
      for (const r of later) {
        const base = (r.getString("title").trim() || "Untitled pipeline").replace(/\s+\d+$/, "");
        let n = 2;
        while (used[norm(base + " " + n)]) n++;
        const title = base + " " + n;
        used[norm(title)] = true;
        let doc = {};
        try {
          doc = JSON.parse(r.getString("doc") || "{}");
        } catch (_) {}
        doc.title = title;
        r.set("title", title);
        r.set("doc", doc);
        app.save(r);
      }
    }
  },
  (_app) => {},
);
