# mind-the-dag design spec v0.3

This is the visual language for every map that mind-the-dag draws. It mixes the nf-core metro-map style with the principles behind Mini Metro: shape tells you the role, colours are few and contrasting, the background stays quiet, and less is more.

All values are machine-readable in [`design/tokens.json`](../design/tokens.json). Units are px unless stated otherwise. Everything sits on an **8 px grid**.

**What changed in v0.3:** branch points (formerly "junction"); termini that orient themselves; file icons on any station, stacked up-right; automatic label sides per run; bridges at crossings; concentric bundles through 90° turns; legend and title block that follow the map until it is rearranged; full Inter 4.1 character set; the brand mark (section 14).

## 1. Geometry

- Lines run only at 0°, 45° or 90°. Every bend is an arc. **R45 = 40** and **R90 = 32**, measured on the connection's original line.
- Line width is **W = 10**. Lines in a bundle sit **12 apart** (W + 2) and turn on concentric arcs, so they never cross inside the bundle.
- To move from one lane to the next, a line makes an S-curve over 64 px.
- Joins are round. Solid lines have butt caps; dashed and dotted lines have round caps.
- At W = 10, dashed lines use a `24 20` dash/gap rhythm. Dotted lines use `0 22`
  with round caps, producing separate circular marks. Swatches scale these
  lengths with weight, and the canvas, legend and exports share these rules.
- Through a 90° turn, a bundle stays concentric: each station's lane order is set so the turn never crosses lines. On a return leg (a serpentine), the order is mirrored, which is what a concentric turn produces.
- A station's position anchors its first connected line. Additional lanes extend
  the marker instead of re-centring the original line. Physical approaches decide
  which side each lane occupies; vertical/return runs follow their lane
  orientation. A joining/leaving lane or
  an inner lane too wide for an existing corner takes its own rounded route.

## 2. Stations

Every station has a 3 px outline, ink on white (the surface colour).

| Role | Glyph |
|---|---|
| Step | circle, r 9 |
| Shared step (several lines) | capsule, 18 wide, grows by 12 per extra line |
| Merge | **solid ink** rounded square, 22 wide, r 5 |
| Optional step | circle with a dashed outline (`4.6 2.47`) and a muted label |
| Inactive | circle outlined in `#B8BEC4`; its line at 30 % opacity |
| Existing routing point (legacy files) | no marker; the editor shows a small dot so it can be picked; not offered for new placements |

The merge is solid so that it never looks like a shared capsule. Start and Stop
are manual roles and retain their glyphs even with connections on both sides.
New maps express branching by connecting several paths to an ordinary station.
Entering the Station tool defaults to Step. Placement order and graph endpoints
never assign terminal roles. Marker outlines, selection, snapping, labels and
files share the same footprint as a capsule extends away from its anchor.

## 3. Termini and files

- **Start flag**: a rounded pentagon in ink. The line starts underneath it, and the flag points at the side its line is on, whichever way the line was drawn.
- **Stop bar**: 6 wide, r 2, on the open side of the line end.
- Newly placed Start/Stop stations enable one FASTA badge. Type changes apply the
  same default; existing configured formats are preserved between terminal roles.
  Returning to an intermediate role disables the badge. Intermediate placements
  default to no badge, and existing files are not rewritten on load.
- The flag and the bar have the **same height**: they extend 6 px past the outer lines of the bundle.
- **File icons** are 32 × 40 with r 3, a solid folded corner and a 2.5 px outline. Stacks offset each copy by 6 towards the **upper right**, up to 3 copies.
- Any station except a branch point can carry a file icon:
  - a start or stop puts it on its **open end**, with the station name above the icon as the heading of that file group and the caption below;
  - other stations put the name above and the icon below (or the other way round when something is in the way).
- An icon that would collide with a station, a label, a line, a section header or another icon moves above, then below, the station.
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
- The font files are Inter 4.1 (SIL OFL), subset to Latin, Latin Extended, Greek, punctuation, super- and subscripts, arrows and mathematical operators, so names like "α-diversity ≥ 2" export correctly. The editor and the exports use the same files.
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
- **Detail lines.** A label can have more lines (Shift+Enter). The first line is the station name (600 · 13, ink); each further line is a detail line (400 · 12, muted) on a 16 px pitch, used to list the tools in a tool group. Above the line the block grows upwards; left or right of it the block is centred on the station.
- Along one run, all labels go on one side. They change sides only at a bend or a branch.
- A label never sits on a line. If a crossing cannot be avoided, the label gets a **4 px halo** in the colour of the surface underneath it.
- **Automatic sides.** Stations joined by straight connections along the same axis form a run, and every label set to Auto in a run takes the same side. Horizontal runs try above, then below, and only then right or left; vertical runs try right, then left. The first side with no collision wins; otherwise the one with the fewest, where another label counts 20, a station, icon or section header 5 and a line 1. Labels with a fixed side are placed first.

## 8. Crossings and bundle order

- Avoid crossings; where two connections must cross, cross away from bends and stations.
- The connection carrying **more lines stays on top**; on a tie, the horizontal or vertical one; then the later one. The one underneath breaks with a **4 px gap** on each side of the top bundle (a bridge). The gap is cut out, not painted, so it stays transparent in exports.
- Connections that share a station never count as crossing.
- Distinct branches are ordered by their physical approach to the station,
  measured across its flow axis. A higher approach takes a higher lane on a
  horizontal station; vertical stations use the corresponding left/right order.
  Connection creation time and legend order do not override that geometry.
- A shared run carries the pair's relative order to its other end, including
  through turns. Separate junctions can order the same colours differently when
  those colours do not share a run between them.
- Physically indistinguishable lanes retain their last resolved relative order.
  Before an order exists, the Lines list breaks ties. If opposing branch layouts
  conflict, the stronger angular separation wins deterministically; some graphs
  necessarily retain crossings.

## 9. Station rhythm

- Stations on one run are **evenly spaced**.
- The spacing is a multiple of 8 and at least **64**.
- The widest label on the run sets the spacing for the whole run.

## 10. Optional and planned

- **Hollow** is a direct stroke style: two 3 px walls, a transparent 4 px channel,
  and rounded closed ends within the same 10 px footprint as Solid. It shares
  the existing concentric routing, including at bends and inside bundles.
- Legacy **planned** lines keep their cased appearance. The separate Planned
  control is replaced by the Hollow style choice; explicitly choosing a style
  clears the old flag.
- Graphite already uses dashes to tell lines apart, so dashes cannot also mean "planned".
- A planned line inside a bundle keeps its lane.
- **Optional** steps: see the Stations table in section 2.

## 11. Legend and title block

- **Title block**, at the top left:
  - pipeline name in 700 · 24;
  - version · date · engine in 400 · 12;
  - an optional 32 px logo, aligned right.
- The title block sits above the map and the legend below it, both left-aligned, until either is moved. As soon as stations or sections are moved or resized, both stay where they are.
- **Legend**: the lines first, in the order of the Lines list, then a shape key:
  step, shared, merge, start, stop, planned. Local physical lane order may differ.
  - The legend has no frame.
  - The line key can wrap into 2–4 columns (column-major), with the shape key in the columns after it, so a wide map keeps a short legend.
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

**Nordic** (new-map default): five primary colours with sea and ink extensions.
Canvas and section-fill contrast is at least 3:1 in both themes; this is not a
claim that colour-vision simulation or print review has been completed.

| Name | Light | Dark |
|---|---|---|
| Pine | `#3F7D6D` | `#70B7A2` |
| Mist blue | `#4D6F9E` | `#86A8D6` |
| Ochre gold | `#B47D30` | `#DDB06A` |
| Heather | `#88618D` | `#BD95C5` |
| Terracotta | `#AF624C` | `#DB947D` |
| Sea | `#1C7A90` | `#78BDCE` |
| Nordic ink | `#424D5C` | `#B6C2D0` |

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

## 14. Brand

- **Wordmark**: "mind-the-dag" in Inter 700, tracking −0.02 em; "mind-the-" in nf-core green `#24B064`, "dag" in ink. It is the home link in the editor's top bar.
- **Favicon**: a green tile (radius 8 on 32) with a white Inter Bold "d".
- mind-the-dag is independent of nf-core: it never uses the nf-core logo or apple-core mark, and credits nf-core and Mini Metro as inspiration.

## Hard rules

1. No sharp corners: every bend is an arc, with R45 = 40 and R90 = 32 at the centreline.
2. Bundled lines sit 12 apart and carry physical branch order through their shared runs and concentric turns.
3. One outline width for each kind of element: 3 px for stations, 2.5 px for icons.
4. Circle = step, capsule = shared step, solid rounded square = merge, no marker = branch point.
5. The start flag and the stop bar are the same height and orient themselves to their line; file icons sit on the open side, 6 px clear, stacked up-right.
6. Labels are Inter 600 · 13 in ink, 10 px clear, on one side per run, and never on a line.
7. Where connections cross, the one with fewer lines breaks with a 4 px gap each side.
8. Stations on a run are evenly spaced, on multiples of 8 and at least 64 apart.
9. Sections are tinted, never outlined, with at most 4 tints per map.
10. Light grey `#B8BEC4` means inactive and is never used for a line.
11. At most 7 line colours, assigned in palette order; planned = cased line, optional = dashed outline.
12. The legend follows the Lines list, then the shape key, with no frame.
13. Exports have a transparent background; dark mode comes from its own tokens.
14. Inter only, everywhere; PDF exports embed it.
15. Journal export uses 1 px = 0.5 pt, so all text is 5–7 pt; the editor warns when a map is too wide for its column.
16. The wordmark is "mind-the-" in green and "dag" in ink; never the nf-core logo.

## Sources

- nf-core metro-map components sheet (CC0, v1.1.0) and nf-core brand guidelines (green `#24B064`; Inter for body text).
- Mini Metro design principles.
- Nature figure guidelines: text 5–7 pt in a sans-serif font; 89 mm single column, 183 mm double column.
- Schematic-map layout criteria: octilinearity, few bends, even edge lengths, few crossings, labels on the same side (survey arXiv:2208.07301).
