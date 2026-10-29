# mind-the-dag
A web editor for metro-map style workflow diagrams (nf-core × Mini Metro inspired)

**Open the editor:** https://marveloushaotian.github.io/mind-the-dag/

## What it does

- Draw a pipeline as a metro map: stations (steps), lines (data streams), sections.
- Lines run at 0°, 45° and 90° with rounded, concentric bends; bundled lines stay
  12 px apart and keep one order across the map.
- Export SVG, PDF (Inter embedded, journal scale 1 px = 0.5 pt) and PNG (300 dpi).
- Drafts save themselves in this browser; the start page can back up all of
  them to one file and restore it, here or on another computer.
- Export › Map file (.json) downloads an
  editable copy to keep or send; Open reads it back, as well as nf-metro `.mmd`
  files (a subset, with a rough first layout to drag into shape).
- Share makes a view-only link. The map travels inside the link (compressed in
  the URL fragment), so nothing is uploaded; whoever opens it can make a copy.
- Where connections cross, the one carrying fewer lines gets a 4 px gap.
- Automatic labels pick one side per run of stations, avoiding lines, stations
  and other labels; bundles stay concentric through 90° turns.

## Using the editor

The start page lists your drafts (kept in this browser); New never replaces an
existing map. In the editor, tools are on the left and the selected item's
settings on the right; with nothing selected, the right panel holds the map's
palette, theme, legend and title block.

| Key | Action |
|---|---|
| V · S · L · R | Select · Station · Connect · Section |
| Click with Station | Place an independent station of the selected type; keep clicking to lay out the map |
| Click A, then B with Connect | Join existing stations with the highlighted line; preview only near another station; continue from B or press Esc to finish |
| Double-click, Enter | Rename a station on the canvas |
| Alt-drag a section | Move it together with the stations inside |
| Drag the bend handle | Slide a selected connection's bend |
| Drag on empty canvas | Select an area (Shift adds) |
| Shift-click | Add to selection |
| ⌘/Ctrl C · X · V · D · A | Copy · cut · paste · duplicate · select all |
| Delete | Delete the selection |
| Arrows | Nudge selected stations |
| Pinch, ⌘/Ctrl + scroll | Zoom around the pointer |
| + · − · 0 | Zoom in · out · 100% |
| Scroll, two-finger scroll, Space-drag, middle button | Pan (Shift + scroll pans sideways) |
| F | Fit to screen |
| ⌘/Ctrl Z, Shift ⌘/Ctrl Z | Undo, redo |
| ⌘/Ctrl O | Open a file |
| ? | Show all shortcuts |

Branches are ordered by their physical approaches; shared runs carry that order
through turns. The Lines list controls the legend and breaks initial ties.

Click anywhere on a line's swatch/name to select it; use its ellipsis to edit it.
New maps start with the Nordic palette. Each line offers Solid, Dashed, Dotted
and Hollow directly; Hollow keeps its centre transparent in every export.
Station types live in the right inspector, both for placement and for editing.
Start and Stop default to a FASTA file badge; intermediate stations default to
no badge. Branching uses multiple connections on an ordinary station.
Drag a single station onto another to preview a fusion, then release to merge;
the destination keeps its type and the whole gesture can be undone once.

## Develop

```sh
npm install
npm run dev      # http://localhost:5173/mind-the-dag/
npm test         # vitest
npm run build    # type-check and build to dist/
```

Every push to `main` is tested, built and deployed to GitHub Pages by
`.github/workflows/deploy.yml`.

## Design

- [Design spec v0.3](docs/design-spec.md) — geometry, stations, labels, palettes, export rules
- [Design tokens](design/tokens.json) — the same values in machine-readable form
- [Interaction principles](docs/interaction-design.md) — control ownership, motion, fusion and design references

## Acknowledgement

The visual language is inspired by the metro-map diagrams of the
[nf-core](https://nf-co.re) community and by the game Mini Metro. mind-the-dag is
an independent project and is not part of, or endorsed by, nf-core.

## Licence

Code: MIT. Inter font files in `public/fonts`: SIL Open Font License 1.1 (see `public/fonts/OFL.txt`).

The faint map behind the sign-in page is drawn by `scripts/nordic-map.mjs` from
[Natural Earth](https://www.naturalearthdata.com) coastlines (public domain, via the
`world-atlas` package); the rail network on it is schematic.
