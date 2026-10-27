# mind-the-dag
A web editor for metro-map style workflow diagrams (nf-core × Mini Metro inspired)

**Open the editor:** https://marveloushaotian.github.io/mind-the-dag/

## What it does

- Draw a pipeline as a metro map: stations (steps), lines (data streams), sections.
- Lines run at 0°, 45° and 90° with rounded, concentric bends; bundled lines stay
  12 px apart and keep one order across the map.
- Export SVG, PDF (Inter embedded, journal scale 1 px = 0.5 pt) and PNG (300 dpi).
- Open and save `.json` map files; import nf-metro `.mmd` files (a subset, with a
  rough first layout to drag into shape).
- Your current map is kept in this browser between visits. Save a `.json` file to
  keep it anywhere else.

## Using the editor

| Key | Tool or action |
|---|---|
| V | Select: click to select, drag to move, drag empty space to pan |
| S | Station: click to add a station |
| C | Connect: click two stations to join them with the active line (click an existing connection's stations again to add or remove that line); click empty space to add and join a new station |
| R | Section: drag to draw a section |
| Delete | Remove the selection |
| Arrows | Nudge selected stations |
| F | Fit the map to the screen |
| ⌘/Ctrl Z, Shift ⌘/Ctrl Z | Undo, redo |

The line order in the left panel is the bundle order (top to bottom) for the whole
map. Station kind, flow direction, label side, optional/inactive and file icons
are set in the right panel.

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

- [Design spec v0.2](docs/design-spec.md) — geometry, stations, labels, palettes, export rules
- [Design tokens](design/tokens.json) — the same values in machine-readable form

## Licence

Code: MIT. Inter font files in `public/fonts`: SIL Open Font License 1.1 (see `public/fonts/OFL.txt`).
