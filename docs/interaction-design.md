# Editor interaction principles

These are product decisions for this editor, informed by the primary sources
below. The book reference is an author-published excerpt, not a full-book review.

## Independent first use

A blank map starts in Select with two explicit actions: Add stations and Use an
example. It does not focus the title, summon a mobile keyboard or open properties
automatically. The example replaces the current drawing as one undoable action;
it does not create a second map or change the map's storage location.

Contextual guidance follows the actual drawing: place the first station, add a
second, connect them, then select a station to name it. Drawing tools have a
visible Done action. There is no mandatory tour or tutorial progress stored in
the document. The workspace explains blank versus editable example maps,
automatic saving, private maps and group copies where those choices occur.

At 900 px or less, four labelled drawing tools remain visible above the canvas,
along with Lines, Properties and the save status. Properties opens only when
requested; double-pressing a station opens its existing name field. Compact
dialogs reuse the desktop controls and have a Back to canvas action. Desktop
rails and compact dialogs never render duplicate property editors. Switching
to desktop closes the compact panel without changing the drawing.

Dragging blank canvas with touch in Select pans the view; mouse dragging still
selects an area. Station and Section retain their explicit placement gestures.
Zoom buttons and Fit remain visible. This does not implement pinch zoom.
Nested colour popovers consume Escape before their containing dialog, and their
horizontal position is clamped inside narrow viewports.

Verification covers ten editor interaction tests, including the first connected
map, property editing, undo, nested Escape, responsive control ownership and
touch versus mouse gestures. Chrome responsive checks also exercise drawing,
custom line and section colours, export feedback and 320 px toolbar containment.
These checks do not replace physical-device or first-time participant testing.

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

## Gentle alignment

Placement and station dragging acquire horizontal/vertical references within
4 screen pixels and release beyond 7, at every zoom. The unsnapped pointer
determines proximity, so ordinary grid rounding never enlarges the magnet.
The matched axis keeps the exact reference coordinate, including imported
off-grid values; the other axis keeps its usual grid behaviour. Stations use
their route anchor, not the midpoint of an expanded multi-line capsule.

Station rows/columns and straight route segments provide references. A group
can acquire a reference with any member but receives one shared translation.
All moving stations and their changing routes are excluded from the frozen
gesture targets. Single-station fusion takes precedence over alignment.

Connection bend handles align to other bends and straight runs along their
editable axis. Grabbing a handle preserves its pointer offset. Snapped bend
parameters retain full precision; ordinary free movement keeps the existing
rounding. Section movement, creation and bottom-right resizing align edges to
other section edges. Minimum resize dimensions remain enforced, and Alt-drag
still moves a section's contents by the same translation.

Alignment is felt through the position alone. It adds no guide lines or
alignment-status popup to the canvas. Hold Command/Control to bypass alignment. Drag
edits continue to own one undo checkpoint, and Escape restores both the map
and its preceding history. Alignment positions objects without connecting or
merging them automatically.

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

## European sign-in and registration cover

The cover uses 80 geographically placed capitals and regional hubs, connected by
80 illustrative links. It includes Iberia, Italy, Malta, Greece, Cyprus and the
Balkans as well as western, central and northern Europe. Germany has 11 nodes,
Switzerland four and Austria five; regional hubs also fill France, Italy, Spain,
Poland and Finland. Each city has one incoming branch except Helsinki, which
retains both sea approaches. Redundant bypasses and regional loops are omitted,
including the old Cologne–Berlin link that overlapped the Hanover branch. Russia and Ukraine have no stations or routes. This remains
a representative network, not an exhaustive list of European countries or cities.

Country outlines and city coordinates share one projection. The generator records
each city's source country and uses pinned Natural Earth v5.1.2 coordinates.
Finer Danish, Swedish, Portuguese, Turkish, Italian, Maltese and Cypriot coasts
keep islands and coastal city centres on the displayed land. Tests check every
city's land containment, network reachability and regional coverage.

Connections use the editor's `routeCentre` router: straight legs are horizontal,
vertical or 45°. Candidate paths favour few bends, proximity to geographical
guides and the appropriate land/sea surface. Short retraced legs are removed.
Circular bends use the same 40 px / 32 px radii as the editor, clamped on short
segments and reduced where a corner would cut a bay or island. Intermediate
waypoints shape corridors without adding station dots.
Tests check angles, turn direction, circular radii and land coverage.

Land sections are solid; the same fine dashed stroke marks sea sections,
including bridges, tunnels and island connections. Sea boundaries are computed
against exterior coastal rings once, so inland lakes do not turn land connections
into sea links. Dash phase stays fixed while a route grows, and adjacent style
sections share exact endpoints. The network is a geographical workflow
illustration, not surveyed railway track or a claim about current train/ferry
services. The [Interrail map](https://www.interrail.com/en/plan-your-trip/interrail-railway-map)
provides broad transport context; its
[Greece guidance](https://www.interrail.com/en/plan-your-trip/tips-and-tricks/trains-europe/trains-country/trains-greece)
also illustrates why geographic connections must not be treated as live services.

The 36-second journey starts in Madrid and makes one smooth northeast pan
to Helsinki, arriving at 27 seconds and holding there. Its scale stays fixed
throughout playback; there is no regional tour or final overview zoom. Both
desktop and compact layouts use the same direction. It plays once, remains still
and never rewinds. Nordic colours and uniform station landing/connection pulses
match the editor; simultaneous arrivals produce one pulse. A moving capsule
follows each growing route at constant distance speed.

Labels use one deterministic layout based on actual text widths, reserving space
around every city marker. They try nearby positions before more distant ones and
never reflow as the camera moves or cities appear. Tests check label/label and
label/marker overlap at multiple text widths. The example workflow and sign-in
options remain on the page.

On desktop, the example card uses a 45% white background and 65% section fills
so the moving geography and routes remain visible through it. The workflow's
ink, labels and station markers remain opaque. The left background wash is
lighter; sign-in controls retain a solid card. Compact layouts keep a solid
example card because their animation already has a separate area.

At viewport widths of 860 px or less, matching the single-column landing layout,
the animation occupies a separate 320–460 px high area below the header, above
the page content. Cards cannot cover it. The camera follows the same northeast
pan as desktop. Its minimum
0.75 scale keeps city labels at least
12 px and sea strokes at least 3 px. Side branches enter and leave the view as
the journey advances; labels appear only when their full outline fits, and the
compact view uses stronger contrast without the background wash. The final
frame stays at Helsinki. Changing layouts preserves playback progress.

One requestAnimationFrame player draws the cover; there are no per-route SVG
masks, native animation players or per-frame React updates. Land is rasterised
once, complete route/style paths and a 2× label atlas are cached, and the backing canvas is capped at four
million pixels and 1.5× pixel density. The player releases its frame callback on
completion, manual pause, form input or a hidden tab. Reduced motion displays the
final still. Resize preserves elapsed time. Development-only canvas attributes
expose drawing cost, frame counts and playback state for verification.

Cloud login discovery must be tested from the server's allowed local origin,
`http://localhost:5173`; a new port or `127.0.0.1` is a different origin and cannot
read provider options. The cover does not change account configuration or OAuth.

## Legend working space and invitation requests

An automatic legend reserves a lower-page baseline from the current viewport
when content is first added or an existing automatic layout is first moved.
The baseline is saved in map coordinates, so pan, zoom, reopening and export do
not redock it. The legend stays at least 96 map units below the content bounds
as stations and sections grow. Moving diagram content does not disable this
avoidance; dragging the legend itself switches to manual positioning. Existing
manual layouts, including the aligned landing example, retain their positions.

Invitation requests use a mailto link with a subject and a plain-text template
for name, institution or affiliation, and intended use. The mail client opens
the draft; the visitor chooses what to fill in and when to send it.

## Account profiles

The required profile is one display name, with the account email shown read-only
for identification. A display name may use any language or a preferred name;
leading/trailing whitespace is removed and the limit is 120 characters. Group
membership and account permissions are separate from the person's name.

After the saved session is refreshed, an account without a name gets a gentle
completion prompt. It can be dismissed for the current session and reopened from
the account button. The same profile dialog is available on the workspace and
through the compact account button in the editor and viewer. Saving sends only
the current user's name, updates the shared session, and shows confirmation.
Failed requests keep the form open for retry. Group lists use “Name not set” for
an incomplete profile, rather than repeating “Member” as both name and role.

This follows the preferred-name editing described by
[Notion](https://www.notion.com/help/account-settings) and the independent profile
name described by [GitHub](https://docs.github.com/en/account-and-profile/tutorials/personalize-your-profile).
[Slack](https://slack.com/help/articles/204092246-Edit-your-profile) provides more
directory fields, but those do not serve a current workflow in this small diagram
editor. Avatars, affiliation and biography remain optional future additions.

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

## Workspace workflows

See [Workflow design review](workflow-design-review.md) for the registration, group,
sharing, export and modal navigation decisions and their primary references.

## Cover-to-content transition

The landing and invitation pages share the map's sea colour (#F4F7F5) as their
page surface. On compact layouts, a 112 px bottom gradient reaches that exact
colour before the separate map canvas ends. A 64 px top gradient also softens
cropped geography below the header on compact and desktop layouts. These layers
are decorative and do not intercept input or change the animation's camera.

Authentication and invitation cards use a quiet white surface, light border and
broad, low-opacity shadow. The desktop example retains its existing translucent
surface. Text and controls keep their full opacity. Chrome checks at 320, 390,
860, 861 and 1440 px confirmed that the invitation card fits without horizontal
overflow and that the compact-to-desktop transition uses the same page colour.

## Saving and recovery

Local save feedback follows the result of both document and map-list writes.
Failures retain the current drawing, show Retry saving and Download map file,
and prevent the All maps button from silently abandoning unsaved changes.
Cloud failures distinguish confirmed browser storage from memory-only edits;
network/server failures never imply that a browser backup succeeded.
Opening a map without editing does not create a new save or revision.
Content comparisons ignore object identity and JSON property order. Reapplying
an existing setting or reverting an edit before transmission does not write.
The server also treats identical saves as no-ops, preserving the last content
editor, timestamp and revision. Real reverts after a completed save are edits.
Trash and restore preserve the last content editor; they still advance the
revision to protect open editors. The creator shown on group cards is separate
from the last editor and does not change when someone views the map.

Cloud saves, trash and restore operations use one server write transaction.
The client supplies a monotonically increasing revision; permissions and the
revision are checked inside that transaction before writing. Two concurrent
writers cannot both overwrite the same revision. Old clients using direct
record updates/deletes are rejected and told to refresh. Offline drafts retain
their original revision even after the server advances, so reopening recovers
them into a conflict rather than silently discarding them. Pending drafts use
separate storage keys for editor instances.

Recently deleted keeps the original record, document, owner and group. No
automatic purge or permanent-delete UI is provided. The map author or group
owner can restore a group map while still a member; other members can see who
can restore it. Removed members have no access. Browser drafts use a tombstone
and can be restored in the same browser. Moving a draft to the cloud does not
leave a redundant copy in Recently deleted.

Deployment requires the new PocketBase migration and hooks before the updated
frontend. Existing open clients must refresh after the backend update. A
frontend-only release is insufficient. Run server/save_smoke.py with the pinned
PocketBase executable to exercise real simultaneous requests, stale writers,
recovery and revoked membership. Never run these fixtures against production.

The Pages deployment waits for the public backend capability check before
publishing these controls. If the backend rollout is delayed or fails, the
existing website remains online rather than serving an incompatible frontend.

### Touch editing and shared-map navigation

- One finger selects or drags an object; blank canvas pans in Select mode. Touch
  movement has an 8 CSS-pixel threshold before changing an object, and nearby
  station selection uses screen-space distance rather than a shrinking SVG hit area.
- Two fingers move and zoom the canvas in every drawing mode and in the read-only
  viewer. The point under the midpoint stays anchored as the fingers spread or
  move. An in-progress object drag is cancelled with its undo checkpoint restored.
- Touch placement and connection commit on release. A second finger, cancellation
  or dragged tap cannot create a stray station, connection or section. A remaining
  finger stays in navigation mode until all fingers lift. Capture loss, focus loss,
  a third finger and Safari gesture events do not resume stale document edits.
- Touch users edit names through Properties; quick repeated taps do not unexpectedly
  open the keyboard. Desktop double-click renaming and wheel navigation remain.
- Compact controls use finger-sized primary targets. Landscape phones use a
  shallower tool row, while narrow portrait headers avoid excess wrapping. Fit to
  screen reserves room for guidance and zoom controls; all zoom methods share the
  10–400% range. Input text is 16px in compact properties to avoid iOS focus zoom.

Validation covers camera anchoring, zoom limits, interrupted gestures, touch
placement/selection, undo preservation, shared viewing and desktop wheel behavior.
Browser checks use Chrome touch input simulation and portrait/landscape viewport
sizes; these checks do not substitute for physical iOS or Android device testing.
