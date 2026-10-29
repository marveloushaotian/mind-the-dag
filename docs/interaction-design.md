# Editor interaction principles

These are product decisions for this editor, informed by the primary sources
below. The book reference is an author-published excerpt, not a full-book review.

## One owner for each control

- Left: choose a tool or the active line. Clicking a line's swatch or name has
  the same result: select that line. A persistent ellipsis opens its name,
  colour, pattern, order and deletion controls, without changing the active line.
- Right: station types and properties. Station mode shows the type of the next
  placement, starting at Step whenever the Station tool is entered. Selecting an existing station enters Select and edits that station
  in the same panel. Double-click/Enter focuses the name field there; no second
  canvas name editor appears. Never show two station type pickers at once.
- Canvas: place, connect, move and merge. Hover feedback is temporary; committed
  changes are undoable. The map's file format and export appearance stay stable.

Line choices use a 44 px high target with a visible checkmark and pressed state.
The separate edit target is 32 by 44 px and remains visible without hovering.

Connect keeps a quiet halo on the chosen source. A line preview appears only
when another station is hovered or acquired by the existing snap range; moving
through empty space never draws a line to the pointer. Leaving the target's
release range hides the preview and restores the committed geometry. Clicking
the acquired target commits the same geometry, then makes it the next source.
Escape or a blank-space click ends the chain. Previewing never adds history.

## Cursors describe the next action

Select uses an open-hand toolbar icon and canvas cursor, with a closed hand
while dragging. Edges use a pointing hand for selection. Station uses a plain
crosshair alongside its grey placement preview, avoiding a second station icon.
Connect and Section use crosshair cursors with a small connection or frame mark;
their hotspot stays at the crosshair centre. Hovering
a station in Connect uses a pointing hand, matching the target preview.

Holding Space shows an open hand for temporary canvas panning; dragging closes
it. The active gesture overrides object cursors, while resize and bend handles
keep their appropriate directional/hand affordances. Releasing Space, cancelling
a gesture, changing tabs or losing window focus clears transient cursor state.
Space on a focused toolbar button retains native keyboard activation.

## Motion communicates the operation

- Placement: a grey preview follows continuous pointer positions with 24 ms
  settling and at most 8 screen pixels of lag. Only the committed landing snaps
  to the grid. On click its painted position, complete shape and 40% opacity
  hand over to a 440 ms uniform scale rebound; the badge settles with it. Touch
  retains the small arrival. Width and height always use the same scale; glyphs
  never squash, stretch or skew. Camera changes and reduced motion place the
  preview immediately; leaving the canvas cancels its pending frame.
- Target acquisition: a 240 ms settling halo. The pointer remains immediate.
- Connection: a 340 ms scale rebound at the receiving station and a
  160 ms transition from the provisional stroke to the committed stroke.
- Fusion: a provisional merged map and a short adhesive bridge while hovering;
  release gives a 440 ms settling response at the surviving station.

Motion never writes to the document, blocks input or alters hit targets. Opening
or syncing a map does not replay arrivals. New feedback interrupts older feedback
on the same station. Undo, unmount and reduced-motion preferences cancel feedback
and remove temporary SVG elements. Opacity fades without overshoot; only spatial
properties scale and rebound while preserving the original proportions.

Layout changes use separate, interruptible feedback: capsules grow/shrink by
animating their geometry over 180 ms, preserving outline weight and corner
shape. Type changes cross-fade complete glyphs over 100–160 ms. Labels and file
groups move together over 180 ms; files appear/disappear over 100–140 ms. A
new change continues from the currently painted geometry instead of restarting
from the previous destination. Repeated connection bounces also continue from
their current uniform scale.

Dragged nodes and section members follow the pointer immediately, as do bend
handles and sliders. Hover previews can grow and retract without writing saved
state. Temporary copies are non-interactive, hidden from accessibility, and
removed on finish, interruption, unmount or a reduced-motion change. Exports
use the final static geometry and contain no animation copies.

Hollow strokes use one closed contour, including their rounded caps. Both walls
share the lane's clamped corner radii, so short opposing bends keep a consistent
channel. A change of SVG arc sweep/size cross-fades instead of switching arc
direction halfway through a geometry animation.

The [official Mini Metro launch trailer](https://www.youtube.com/watch?v=Zbk_msu-iYI)
is a visual reference for identifiable geometric symbols and quiet movement.
Our timings and curves are tuned for this editor, not taken from a published
Mini Metro animation specification.

## Station roles and file defaults

The creation palette contains Step, Merge, Start and Stop. A Step can have
several incoming/outgoing connections, so branching needs no separate creation
mode. Existing invisible routing points (`junction`) remain readable and retain
their connections. Their inspector explains the existing role and offers the
four ordinary station types for explicit conversion.

Start and Stop are explicit user choices. Placement order, connection direction,
node degree and endpoint position never assign or replace a role. A manually
chosen terminal keeps its flag/bar even with connections on both sides.

New Start and Stop stations have one FASTA file badge by default. Explicitly
changing another type into Start/Stop enables that default when no badge has
already been configured. Switching between Start and Stop preserves the chosen
format, count and caption. Returning from a terminal to an intermediate role
turns the badge off. New intermediate stations have no badge; users can opt in.
Selecting the same type again respects a manual opt-out. Loading existing maps
does not rewrite previous badge choices.

## A shared line-pattern language

All line styles share the same colour, weight and path geometry. At 10 px
weight, dashed strokes use a 24/20 rhythm and round caps; dotted strokes use
zero-length round-capped marks every 22 px, leaving clear space between circles.
The dash/gap rhythm scales with stroke weight in compact swatches. Canvas,
legend, pattern choices, live preview and export use the same paint resolver.
The legend samples are long enough to show more than one dash.

An explicit Solid selection overrides palette-provided dashes. An omitted
override continues to inherit the palette. Planned line walls also respect the
selected pattern. These rules use standard [SVG stroke semantics](https://www.w3.org/TR/SVG/painting#StrokeDashing).

Nordic is the default for new maps: pine, mist blue, ochre gold, heather and
terracotta are the primary colours, with sea and ink available for larger maps.
Light/dark colours and eight section tints are defined together. Existing maps
retain their selected palette; choosing Nordic is an explicit, undoable edit.

Each map can also save one named custom palette, with paired light/dark line
colours and section fills. Editing starts from a copy of the current palette;
Cancel leaves the map unchanged and Apply is a single undo step. Switching to
a preset retains the saved custom palette so it can be reactivated later.
Map files and shared copies carry these colours with them.

Line colours belong in the existing line editor, and section fills belong in
the section inspector. Both offer a native colour picker and a hex field,
with independent light/dark values. Partial or invalid hex text never reaches
the document. A custom value overrides its palette slot; choosing a slot or
Use palette colour removes the override. Section text adapts to its fill for
readability. Canvas, legend, previews and exports share the same colour resolver.

Auto match themes links custom colours in either direction. The edited theme
is authoritative for that edit; its partner is generated once, without a
feedback effect. Matching preserves Oklab hue while adjusting lightness and
chroma for the theme. Lines remain distinct from their background; fills stay
quiet. Out-of-gamut colours reduce chroma rather than clipping RGB channels.
The matching preference and both resolved hex colours are saved with the map.
New custom pairs and newly copied preset palettes start linked. Existing manual
pairs stay independent until matching is explicitly enabled. Turning it off
preserves both colours for independent adjustment. Enabling it regenerates
the partner from the currently visible theme; a palette editor does this only
in its draft, so Cancel still changes nothing.

Station (S) and Connect (C) are neighbouring shortcuts. In Select, pressing or
dragging on empty canvas never changes the grid dots. The selection rectangle
owns its fill and stroke; the root gesture class only selects the cursor.

Hollow is a direct fourth stroke choice beside Solid, Dashed and Dotted. It
keeps the 10 px lane footprint, with two 3 px walls and closed rounded ends;
the 4 px channel is transparent, including over section fills and in exports.
Canvas, near-target previews, legend and miniature samples share the same
outline geometry. Changing stroke style does not change routing or lane order.

The former Planned toggle is no longer shown separately. Saved maps and
nf-metro imports with the legacy flag keep their cased appearance, including
legacy dashes. Choosing any explicit stroke style clears that flag so it cannot
silently override a new Solid/Dashed/Dotted/Hollow selection.

## Fusion rules

Dragging one station close to another previews fusion. The acquisition/release
areas use screen pixels at every zoom level. Moving away restores the separate
view; only release merges records. Group drags do not merge stations.

The target keeps its ID, position, direction and type, including when the two
types differ. Its existing label and file badge win; missing ones can be filled
from the incoming station. Connections move to the target, duplicate pairs
combine their lines and self-loops disappear. The entire drag/fusion is one undo
step. Intersecting lines continue to follow the existing crossing rules.
Escape or pointer cancellation restores the map and the preceding undo/redo
history; abandoning a provisional fusion is not recorded as another edit.

## Stable lanes and growing markers

A station's saved position is its routing anchor, not the centre of a growing
capsule. Its first connected line stays on that anchor. Additional lanes follow
their physical approaches at 12 px spacing; the capsule grows to enclose them.
For example, a third yellow branch arriving between a straight green route and
a lower blue branch enters the middle lane, regardless of creation time. Blue
moves outward with a layout transition while green stays on its anchor.
Through turns, the expansion follows the existing lane orientation.

Geometry comes first. Distinct approaches on the same side of a station establish
pairwise lane order; common paths carry that order to other stations and around
turns. Lines that do not share a run can be ordered differently at separate
junctions. This is derived from saved station positions, never from animated SVG
positions, avoiding feedback loops during previews.

When geometry provides no distinction, shared lanes retain the last resolved
relative order, including after detaching a branch. The Lines list is the initial
tie-breaker and controls the legend. Contradictory branch arrangements use the
stronger angular separation and deterministic tie-breaking; arbitrary graphs
are not guaranteed to be crossing-free. Viewing does not rewrite saved records.

Each connection routes its original line first, with fixed bend radii. Adding
parallel lanes does not re-centre that path or change its corners. A joining or
leaving line with different ports takes its own rounded route. If a wide inner
lane exhausts a corner's radius, that lane takes its own route instead of
changing the established line. When fusion folds duplicate connections together,
the target's connection ID, direction, original line and bend win.

The glyph, labels, file placement, hit area, snap halo, selection frame, motion
origin and export bounds use the same offset marker footprint. Previews and
committed edits use the same geometry. Existing maps infer missing anchors from
their first incident connection; viewing a map never rewrites the saved data.

Removing the original lane retains the surviving neighbour's port and the
connection's original routing reference, including its corner radii. Lane
orientation survives component splits and horizontal/vertical fusion. Remaining
lanes may close an internal gap, using the same short layout transition. These
retained ports and orientations are optional version-1 fields and survive
save/load, copy/paste and undo/redo. Reversing a connection swaps both reference
ports.

## Sources and their application

| Primary source | Principle used here |
|---|---|
| [Don Norman, Signifiers, not affordances (ACM Interactions)](https://jnd.org/signifiers-not-affordances/) | Make selection and editing visibly different actions. |
| [Shneiderman et al., Designing the User Interface, sixth-edition excerpt](https://www.cs.umd.edu/users/ben/goldenrules.html) | Consistent actions, informative feedback, closure and easy reversal. |
| [Nielsen, Ten Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) | Visible state, consistency and fewer competing controls. |
| [Tognazzini, First Principles of Interaction Design](https://asktog.com/atc/principles-of-interaction-design/) | Discoverability, forgiving manipulation and user control. |
| [Material 3, Motion physics system](https://m3.material.io/styles/motion) | Expressive spatial response; opacity and colour do not bounce. |
| [Apple Human Interface Guidelines, Motion](https://developer.apple.com/design/human-interface-guidelines/motion) | Brief, purposeful, interruptible feedback and reduced-motion support. |
| [IBM Carbon, Data table guidelines](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines) | Distinct click targets for selection and row-specific actions. |
| [W3C, Understanding WCAG 2.2 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | Comfortable, separated targets rather than tiny ambiguous controls. |
| [Yale, Memory-Free Interaction](https://usability.yale.edu/ux/best-practices/memory-free-interaction) | Keep active choices visible and instructions contextual. |
