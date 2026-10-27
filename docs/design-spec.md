# mind-the-dag design spec v0.2

This is the visual language for every map that mind-the-dag draws. It mixes the nf-core metro-map style with the principles behind Mini Metro: shape tells you the role, colours are few and contrasting, the background stays quiet, and less is more.

All values are machine-readable in [`design/tokens.json`](../design/tokens.json). Units are px unless stated otherwise. Everything sits on an **8 px grid**.

## 1. Geometry

- Lines run only at 0°, 45° or 90°. Every bend is an arc. **R45 = 40** and **R90 = 32**, both measured at the centreline.
- Line width is **W = 10**. Lines in a bundle sit **12 apart** (W + 2) and turn on concentric arcs, so they never cross inside the bundle.
- To move from one lane to the next, a line makes an S-curve over 64 px.
- Joins are round and caps are butt.

## 2. Stations

Every station has a 3 px outline, ink on white (the surface colour).

| Role | Glyph |
|---|---|
| Step | circle, r 9 |
| Shared step (several lines) | capsule, 18 wide, grows by 12 per extra line |
| Merge | **solid ink** rounded square, 22 wide, r 5 |
| Optional step | circle with a dashed outline (`4.6 2.47`) and a muted label |
| Inactive | circle outlined in `#B8BEC4`; its line at 30 % opacity |
| Junction | no marker |

The merge is solid so that it never looks like a shared capsule.

## 3. Termini and files

- **Start flag**: a rounded pentagon in ink. The line starts underneath it.
- **Stop bar**: 6 wide, r 2.
- The flag and the bar have the **same height**: they extend 6 px past the outer lines of the bundle.
- **File icons** are 32 × 40 with r 3, a solid folded corner and a 2.5 px outline. Stacks offset each copy by 6, up to 3 copies.
- **File banner**: 40 × 14, ink background. The format is written in lower case at 10 px.
- Icons keep **6 px clear** of any flag or bar.
- A **side output** leaves a station on a stub that ends in a stop bar.
- A **side input** joins under a start flag that points at the line.

## 4. Sections

- Sections are shown as **tinted areas, never outlined**: radius 16, padding of at least 24, and a numbered header chip at the top left.
- Use at most 4 tints per map, taken from the palette's tint row.

## 5. Typography — Inter only

| Role | Weight · size |
|---|---|
| Map title | 700 · 24 |
| Section name | 700 · 14 |
| Station label | 600 · 13 |
| Caption, legend, version line | 400 · 12 |
| File banner | 700 · 10 |

- Inter is used everywhere: in the editor and in every export.
- PDF exports embed a subset of Inter, which the SIL OFL allows.
- SVG exports keep live text, with an option to outline it.
- Fonts are not switched per journal. A journal mode (Arimo, which has the same character widths as Arial and Helvetica) was considered and deferred. It could be added later as a token field without changing the design.

## 6. Colour roles

| Role | Light | Dark |
|---|---|---|
| Ink: text, outlines, solid glyphs | `#1A1D21` | `#E8EAED` |
| Station and icon fill (surface) | `#FFFFFF` | `#16191D` |
| Muted: captions | `#5C636B` | `#9AA2AA` |
| Inactive (never used for a line) | `#B8BEC4` | `#4A5058` |
| Background | transparent | `#16191D` |

- Dark is its own token set, not an inversion of the light one.
- In dark, every line colour must reach at least 3 : 1 contrast against `#16191D`, and also against that palette's dark section tints.
- The dark section tints are **provisional** and have not been reviewed on the canvas yet.

## 7. Labels

- Labels sit **10 px clear** of the line, on the **outer side of the bundle**.
- Along one run, all labels go on one side. They change sides only at a bend or a branch.
- A label never sits on a line. If a crossing cannot be avoided, the label gets a **4 px halo** in the colour of the surface underneath it.

## 8. Crossings and bundle order

- Lines cross only at 90°, away from bends and stations.
- The line that continues straight stays on top. The line underneath breaks with a **4 px gap** on each side (a bridge).
- The order of lines within a bundle is fixed once for the whole map. A line that branches off therefore already sits on the side it leaves from.

## 9. Station rhythm

- Stations on one run are **evenly spaced**.
- The spacing is a multiple of 8 and at least **64**.
- The widest label on the run sets the spacing for the whole run.

## 10. Optional and planned

- A **planned** line is drawn as a cased line: two 3 px walls in the line colour with the surface colour in between.
- Graphite already uses dashes to tell lines apart, so dashes cannot also mean "planned".
- A planned line inside a bundle keeps its lane.
- **Optional** steps: see the Stations table in section 2.

## 11. Legend and title block

- **Title block**, at the top left:
  - pipeline name in 700 · 24;
  - version · date · engine in 400 · 12;
  - an optional 32 px logo, aligned right.
- **Legend**: the lines first, in bundle order from top to bottom (the same order as on the map), then a shape key: step, shared, merge, start, stop, planned.
  - The legend has no frame.
  - It goes in the largest empty corner, at least 32 px from any section.
- Journal export leaves out the title block.

## 12. Print and export

- The default export has a transparent background, and the preview is shown on white.
- Formats: SVG, PDF and PNG (300 dpi).
- **Journal export uses 1 px = 0.5 pt.** At that scale all map text falls between 5 and 7 pt:

| Text role | px | pt |
|---|---|---|
| File banner | 10 | 5 |
| Caption, legend | 12 | 6 |
| Station label | 13 | 6.5 |
| Section name | 14 | 7 |

- At the same scale, lines come out at 5 pt and station outlines at 1.5 pt.

| Column | mm | Max map width (px) |
|---|---|---|
| Single | 89 | 504 |
| 1.5 column | 120 · 136 | 680 · 771 |
| Double | 183 | 1037 |

- If a map is wider than its column, the editor warns and offers to split it into an overview figure and a detail figure.

## 13. Palettes

- Each palette is listed in the order its colours are assigned.
- A map uses at most 7 line colours.
- The CVD figures are the smallest pairwise colour difference (ΔE in CAM02-UCS) found under normal vision and under full-severity simulation of deuteranomaly, protanomaly and tritanomaly.

**Forest**: nf-core green leads, deep blue and amber follow, ink comes last. Light ≥ 11 ΔE · dark ≥ 10 ΔE.

| # | Name | Light | Dark |
|---|---|---|---|
| 1 | nf-core green | `#24B064` | `#24B064` |
| 2 | Deep blue | `#1F6FAE` | `#2A75B5` |
| 3 | Amber | `#D98A2B` | `#D98A2B` |
| 4 | Brick | `#B44A3A` | `#BC5040` |
| 5 | Sky | `#7FC0E6` | `#7FC0E6` |
| 6 | Mauve | `#A8739A` | `#A8739A` |
| 7 | Ink | `#3D4650` | `#C9CED4` |

Tints: `#EEF7F1` `#EEF2F6` `#FBF3E8` `#F2F3F4`

**Graphite**: ink and green only, extended with dash patterns; meant for print and strict journals. The 4 solid colours: light ≥ 13 ΔE · dark ≥ 14 ΔE.

| # | Name | Light | Dark |
|---|---|---|---|
| 1 | Ink | `#1F2328` | `#C9CED4` |
| 2 | nf-core green | `#24B064` | `#24B064` |
| 3 | Deep green | `#0E5F3A` | `#2F7D55` |
| 4 | Steel | `#5B6E80` | `#8496A8` |
| 5 | Ink dashed | dashes `12 8` | |
| 6 | Green dashed | dashes `12 8` | |
| 7 | Deep green dotted | dots `2 10`, round cap | |

Tints: `#F2F3F4` `#EDF5F0` `#EAECEE`

**Field**: earth tones. Light ≥ 15 ΔE · dark ≥ 10 ΔE.

| # | Name | Light | Dark |
|---|---|---|---|
| 1 | Rust | `#92431B` | `#AE5A31` |
| 2 | Slate | `#618EB5` | `#618EB5` |
| 3 | Ochre | `#A58024` | `#BC9634` |
| 4 | Plum | `#7A4E71` | `#906387` |
| 5 | Moss | `#9AB96F` | `#9AB96F` |
| 6 | Seafoam | `#76C2BC` | `#76C2BC` |
| 7 | Ink | `#2E3135` | `#E6E1D3` |

Tints: `#F1F3EC` `#EFF3F7` `#F6F1E3` `#F7EEE9`

## Hard rules

1. No sharp corners: every bend is an arc, with R45 = 40 and R90 = 32 at the centreline.
2. Bundled lines sit 12 apart, turn on concentric arcs and keep one order across the whole map.
3. One outline width for each kind of element: 3 px for stations, 2.5 px for icons.
4. Circle = step, capsule = shared step, solid rounded square = merge, no marker = junction.
5. The start flag and the stop bar are the same height; icons stay 6 px clear of both.
6. Labels are Inter 600 · 13 in ink, 10 px clear, on one side per run, and never on a line.
7. Lines cross only at 90°, away from bends and stations, with a 4 px bridge gap.
8. Stations on a run are evenly spaced, on multiples of 8 and at least 64 apart.
9. Sections are tinted, never outlined, with at most 4 tints per map.
10. Light grey `#B8BEC4` means inactive and is never used for a line.
11. At most 7 line colours, assigned in palette order; planned = cased line, optional = dashed outline.
12. The legend lists lines in bundle order, then the shape key, with no frame.
13. Exports have a transparent background; dark mode comes from its own tokens.
14. Inter only, everywhere; PDF exports embed it.
15. Journal export uses 1 px = 0.5 pt, so all text is 5–7 pt; the editor warns when a map is too wide for its column.

## Sources

- nf-core metro-map components sheet (CC0, v1.1.0) and nf-core brand guidelines (green `#24B064`; Inter for body text).
- Mini Metro design principles.
- Nature figure guidelines: text 5–7 pt in a sans-serif font; 89 mm single column, 183 mm double column.
- Schematic-map layout criteria: octilinearity, few bends, even edge lengths, few crossings, labels on the same side (survey arXiv:2208.07301).
