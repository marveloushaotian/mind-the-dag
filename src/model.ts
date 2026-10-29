import type { Axis, Pt } from './geometry';
import type { LinePattern, PaletteId } from './tokens';
import { tokens } from './tokens';
import { orderStationLanes } from './lane-order';

export type StationKind = 'step' | 'merge' | 'junction' | 'start' | 'stop';
export type LabelSide = 'auto' | 'above' | 'below' | 'left' | 'right';

export interface FileBadge {
  ext: string;
  count: 1 | 2 | 3;
  caption?: string;
}

export interface Station {
  id: string;
  x: number;
  y: number;
  label: string;
  kind: StationKind;
  /** Flow direction through the station: 'h' = lines run left/right, lanes stack vertically. */
  axis: Axis;
  /** The first connected line stays at (x, y) as the station gains more lanes. */
  anchorLine?: string;
  /** Retain the lane orientation when a connected component is split. */
  laneSign?: 1 | -1;
  /** Last resolved order, used only when shared ports give no physical distinction. */
  laneOrder?: string[];
  labelSide: LabelSide;
  optional?: boolean;
  inactive?: boolean;
  file?: FileBadge;
}

/** Doc.lines orders the legend and provides the initial tie-breaker for indistinguishable lanes. */
export interface Line {
  id: string;
  name: string;
  /** Index into the palette's line list. */
  slot: number;
  /** Stroke style override; normally the palette slot decides. */
  pattern?: LinePattern;
  /** Legacy cased-line flag, retained for saved maps and nf-metro imports. */
  planned?: boolean;
}

export function changeLinePattern(line: Line, pattern: LinePattern): void {
  line.pattern = pattern;
  delete line.planned;
}

export interface Edge {
  id: string;
  from: string;
  to: string;
  lines: string[];
  /** Where the diagonal sits along the edge, 0 = near `from`, 1 = near `to`. */
  bend: number;
  /** Reference ports retained when the original lane is removed from a bundle. */
  route?: { from: number; to: number };
}

export interface Section {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tint: number;
}

export function reverseEdge(edge: Edge): void {
  [edge.from, edge.to] = [edge.to, edge.from];
  edge.bend = 1 - edge.bend;
  if (edge.route) [edge.route.from, edge.route.to] = [edge.route.to, edge.route.from];
}

export interface Doc {
  version: 1;
  title: string;
  meta: string;
  showTitle: boolean;
  titlePos: Pt;
  /** Place the title block above the map until it is dragged. */
  titleAuto?: boolean;
  palette: PaletteId;
  lines: Line[];
  stations: Station[];
  edges: Edge[];
  sections: Section[];
  /** `auto` places the legend below the map until it is dragged. */
  legend: { x: number; y: number; show: boolean; auto?: boolean; /** Columns the line key wraps into (default 1). */ cols?: number };
}

export const PITCH = tokens.line.pitch;
export const GRID = tokens.grid;

let counter = 0;
export function uid(prefix: string): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}`;
}

export function defaultFileBadge(): FileBadge {
  return { ext: 'fasta', count: 1 };
}

const isTerminus = (kind: StationKind) => kind === 'start' || kind === 'stop';

/** Defaults apply to explicit creation/type changes, never when loading an old map. */
export function createStation(point: Pt, kind: StationKind = 'step'): Station {
  return { id: uid('s'), ...snapStation(point, 'h'), label: '', kind, axis: 'h', labelSide: 'auto',
    ...(isTerminus(kind) ? { file: defaultFileBadge() } : {}) };
}

export function changeStationKind(station: Station, kind: StationKind): void {
  if (station.kind === kind) return;
  const wasTerminus = isTerminus(station.kind);
  station.kind = kind;
  if (isTerminus(kind)) station.file ??= defaultFileBadge();
  else if (wasTerminus) delete station.file;
}

export function emptyDoc(): Doc {
  return {
    version: 1,
    title: 'Untitled pipeline',
    meta: 'v0.1 · Snakemake',
    showTitle: false,
    titlePos: { x: 24, y: 48 },
    titleAuto: true,
    palette: 'nordic',
    lines: [{ id: 'l1', name: 'Line 1', slot: 0 }],
    stations: [],
    edges: [],
    sections: [],
    legend: { x: 24, y: 400, show: true, auto: true },
  };
}

// ---------------------------------------------------------------------------
// Derived structure

export interface Derived {
  byId: Map<string, Station>;
  /** Lines present at each station, ordered by physical approaches and bundle continuity. */
  stationLines: Map<string, string[]>;
  /** Explicit anchor, or the first incident line for maps created before anchors. */
  stationAnchors: Map<string, string>;
  lineOrder: Map<string, number>;
  /**
   * Lane orientation per station (+1 or −1). Horizontal stations stack lanes top to
   * bottom in bundle order; a vertical station reached through a 90° turn takes whatever
   * orientation keeps the bundle concentric, so lines never cross at the turn.
   */
  sigma: Map<string, number>;
}

export function derive(doc: Doc): Derived {
  const byId = new Map(doc.stations.map((s) => [s.id, s]));
  const lineOrder = new Map(doc.lines.map((l, i) => [l.id, i]));
  const sets = new Map<string, Set<string>>();
  for (const s of doc.stations) sets.set(s.id, new Set());
  for (const e of doc.edges) {
    for (const l of e.lines) {
      if (!lineOrder.has(l)) continue;
      sets.get(e.from)?.add(l);
      sets.get(e.to)?.add(l);
    }
  }
  const stationLines = new Map<string, string[]>();
  const stationAnchors = new Map<string, string>();
  for (const [id, set] of sets) {
    const cached = (byId.get(id)?.laneOrder ?? []).filter((line, i, all) => set.has(line) && all.indexOf(line) === i);
    const known = new Set(cached);
    let index = 0;
    const base = [...set].sort((a, b) => lineOrder.get(a)! - lineOrder.get(b)!);
    stationLines.set(id, base.map((line) => known.has(line) ? cached[index++] : line));
    const anchor = byId.get(id)?.anchorLine;
    const first = anchor && set.has(anchor) ? anchor : set.values().next().value;
    if (first) stationAnchors.set(id, first);
  }
  // Orientation: propagate across connections. Same-axis connections keep it; a
  // horizontal/vertical connection maps it by the turn direction (−sx·sy).
  const adj = new Map<string, { to: string; f: number }[]>();
  for (const s of doc.stations) adj.set(s.id, []);
  for (const e of doc.edges) {
    const A = byId.get(e.from);
    const B = byId.get(e.to);
    if (!A || !B || A === B) continue;
    let f = 1;
    if (A.axis !== B.axis) {
      const sx = Math.sign(B.x - A.x);
      const sy = Math.sign(B.y - A.y);
      if (sx && sy) f = -sx * sy;
    }
    adj.get(A.id)!.push({ to: B.id, f });
    adj.get(B.id)!.push({ to: A.id, f });
  }
  const sigma = new Map<string, number>();
  const roots = [...doc.stations.filter((s) => s.laneSign !== undefined), ...doc.stations.filter((s) => s.laneSign === undefined && s.axis === 'h'), ...doc.stations.filter((s) => s.laneSign === undefined && s.axis !== 'h')];
  for (const r of roots) {
    if (sigma.has(r.id)) continue;
    sigma.set(r.id, r.laneSign === -1 ? -1 : 1);
    const queue = [r.id];
    while (queue.length) {
      const id = queue.shift()!;
      for (const { to, f } of adj.get(id) ?? []) {
        if (sigma.has(to)) continue;
        sigma.set(to, byId.get(to)?.laneSign ?? sigma.get(id)! * f);
        queue.push(to);
      }
    }
  }
  orderStationLanes(doc, stationLines, sigma);
  return { byId, stationLines, stationAnchors, lineOrder, sigma };
}

/** Offset across the flow; the original line remains at the station's anchor. */
export function laneOffset(d: Derived, stationId: string, lineId: string): number {
  const ls = d.stationLines.get(stationId) ?? [];
  const i = ls.indexOf(lineId);
  if (i < 0) return 0;
  const anchor = ls.indexOf(d.stationAnchors.get(stationId) ?? ls[0]);
  return (d.sigma.get(stationId) ?? 1) * (i - Math.max(0, anchor)) * PITCH;
}

export function lanePoint(s: Station, off: number): Pt {
  return s.axis === 'h' ? { x: s.x, y: s.y + off } : { x: s.x + off, y: s.y };
}

/** Half-extents of a station marker, shared by rendering and pointer snapping. */
export function markerExtent(kind: StationKind, n: number) {
  const k = Math.max(n, 1);
  switch (kind) {
    case 'merge':
      return { across: (22 + PITCH * (k - 1)) / 2 + 1.5, along: 12.5 };
    case 'junction':
      return { across: (tokens.line.width + PITCH * (k - 1)) / 2, along: 0 };
    case 'start': {
      const height = tokens.line.width + PITCH * (k - 1) + 2 * tokens.terminus.overhang;
      return { across: height / 2, along: 4.5 + Math.round(height * 0.33) };
    }
    case 'stop':
      return { across: (tokens.line.width + PITCH * (k - 1)) / 2 + 6, along: 6 };
    default:
      return { across: (18 + PITCH * (k - 1)) / 2 + 1.5, along: 10.5 };
  }
}

/** Visual footprint, separate from the fixed routing anchor at (s.x, s.y). */
export function stationMarker(d: Derived, s: Station) {
  const lines = d.stationLines.get(s.id) ?? [];
  const offsets = lines.map((id) => laneOffset(d, s.id, id));
  const shift = offsets.length ? (Math.min(...offsets) + Math.max(...offsets)) / 2 : 0;
  const centre = lanePoint(s, shift);
  const ext = markerExtent(s.kind, lines.length);
  const rx = s.axis === 'h' ? ext.along : ext.across;
  const ry = s.axis === 'h' ? ext.across : ext.along;
  return { ...centre, ...ext, rx, ry, x0: centre.x - rx, y0: centre.y - ry, x1: centre.x + rx, y1: centre.y + ry };
}

/** Removing a lane must not recenter its surviving neighbour or replace its arcs. */
export function preserveSurvivingPorts(before: Doc, next: Doc): void {
  const nextEdges = new Map(next.edges.map((e) => [e.id, e]));
  const validLines = new Set(next.lines.map((l) => l.id));
  const removed = before.edges.some((e) => {
    const current = nextEdges.get(e.id);
    return !current || current.from !== e.from || current.to !== e.to || e.lines.some((id) => !validLines.has(id) || !current.lines.includes(id));
  });
  if (!removed) return;
  const old = derive(before);
  for (const s of next.stations) {
    if (old.byId.get(s.id)?.axis === s.axis) s.laneSign = old.sigma.get(s.id) as 1 | -1;
    const order = old.stationLines.get(s.id);
    if (order && order.length > 1) s.laneOrder = [...order];
  }
  const current = derive(next);
  const affected = new Set<string>();
  for (const s of next.stations) {
    const previous = old.byId.get(s.id);
    if (!previous || previous.axis !== s.axis) continue;
    const had = old.stationLines.get(s.id) ?? [];
    const has = current.stationLines.get(s.id) ?? [];
    if (!had.some((id) => !has.includes(id))) continue;
    affected.add(s.id);
    const survivor = had.find((id) => has.includes(id));
    if (!survivor || has.includes(old.stationAnchors.get(s.id)!) || previous.x !== s.x || previous.y !== s.y) continue;
    const delta = laneOffset(old, s.id, survivor) - laneOffset(current, s.id, survivor);
    if (s.axis === 'h') s.y += delta;
    else s.x += delta;
    s.anchorLine = current.stationAnchors.get(s.id);
  }
  for (const e of before.edges) {
    const currentEdge = nextEdges.get(e.id);
    if (!currentEdge || currentEdge.from !== e.from || currentEdge.to !== e.to) continue;
    const laneRemoved = e.lines.some((id) => !validLines.has(id) || !currentEdge.lines.includes(id));
    if (!laneRemoved && !affected.has(e.from) && !affected.has(e.to)) continue;
    const A = old.byId.get(e.from), B = old.byId.get(e.to);
    const a = current.byId.get(e.from), b = current.byId.get(e.to);
    const first = e.lines.find((id) => old.lineOrder.has(id));
    if (!A || !B || !a || !b || !first) continue;
    currentEdge.route = {
      from: (e.route?.from ?? laneOffset(old, A.id, first)) + (A.axis === 'h' ? A.y - a.y : A.x - a.x),
      to: (e.route?.to ?? laneOffset(old, B.id, first)) + (B.axis === 'h' ? B.y - b.y : B.x - b.x),
    };
  }
}

/** Snap a station: flow axis to the 8 px grid, lane axis to half the pitch so lanes line up. */
export function snapStation(p: Pt, axis: Axis): Pt {
  const half = PITCH / 2;
  const g = (v: number, step: number) => Math.round(v / step) * step;
  return axis === 'h' ? { x: g(p.x, GRID), y: g(p.y, half) } : { x: g(p.x, half), y: g(p.y, GRID) };
}

export function snap(v: number, step = GRID): number {
  return Math.round(v / step) * step;
}

// ---------------------------------------------------------------------------
// Edits that keep the document tidy

/** Lines drawn on at least one connection. */
export function usedLines(d: Doc): Set<string> {
  return new Set(d.edges.flatMap((e) => e.lines));
}

/**
 * Drop lines that were on the map before an edit and are not any more, so the Lines list
 * follows what is drawn. Lines never drawn (just added) stay; one line always remains.
 */
export function pruneLines(d: Doc, before: Set<string>): string[] {
  const now = usedLines(d);
  const gone = d.lines.filter((l) => before.has(l.id) && !now.has(l.id)).map((l) => l.id);
  if (!gone.length) return [];
  const keep = d.lines.filter((l) => !gone.includes(l.id));
  if (!keep.length) {
    // Keep the first of the removed lines so there is always something to draw with.
    keep.push(d.lines.find((l) => l.id === gone[0])!);
    gone.shift();
  }
  d.lines = keep;
  return gone;
}

/** The station another one would land on at `p` (within `r`), ignoring `except`. */
export function stationAt(d: Doc, p: Pt, except: Set<string>, r = 10): Station | undefined {
  let best: Station | undefined;
  let bestD = r;
  for (const s of d.stations) {
    if (except.has(s.id)) continue;
    const dist = Math.hypot(s.x - p.x, s.y - p.y);
    if (dist <= bestD) {
      best = s;
      bestD = dist;
    }
  }
  return best;
}

/**
 * Merge station `fromId` into `intoId`: its connections move over, connections that now
 * join the same two stations become one (their lines combined), and loops are dropped.
 * The kept station takes the other's label or file badge only where it has none.
 */
export function mergeStations(d: Doc, fromId: string, intoId: string): void {
  const from = d.stations.find((s) => s.id === fromId);
  const into = d.stations.find((s) => s.id === intoId);
  if (!from || !into || from === into) return;
  const original = { ...d, stations: d.stations.map((s) => ({ ...s })) };
  // Preserve all established ports, even if a source edge predates a target edge.
  const before = derive(d);
  for (const s of d.stations) {
    s.anchorLine = before.stationAnchors.get(s.id);
    const order = before.stationLines.get(s.id);
    if (order && order.length > 1) s.laneOrder = [...order];
  }
  if (!into.label && from.label) into.label = from.label;
  if (!into.file && from.file) into.file = from.file;
  const edges: Edge[] = [];
  const byPair = new Map<string, Edge>();
  // A duplicate keeps the destination's connection identity, direction and bend.
  const ordered = [...d.edges.filter((e) => e.from !== fromId && e.to !== fromId), ...d.edges.filter((e) => e.from === fromId || e.to === fromId)];
  for (const e of ordered) {
    const a = e.from === fromId ? intoId : e.from;
    const b = e.to === fromId ? intoId : e.to;
    if (a === b) continue;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    const same = byPair.get(key);
    if (same) {
      for (const l of e.lines) if (!same.lines.includes(l)) same.lines.push(l);
      continue;
    }
    const next = { ...e, from: a, to: b, lines: [...e.lines] };
    byPair.set(key, next);
    edges.push(next);
  }
  const order = new Map(d.edges.map((e, i) => [e.id, i]));
  d.edges = edges.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  d.stations = d.stations.filter((s) => s.id !== fromId);
  preserveSurvivingPorts(original, d);
}

/**
 * A title not yet taken in `taken`: "Untitled pipeline", then "Untitled pipeline 2", "… 3".
 * A title that already ends in a number keeps counting from its base.
 */
export function uniqueTitle(title: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((t) => t.trim().toLowerCase()));
  const t = title.trim() || 'Untitled pipeline';
  if (!used.has(t.toLowerCase())) return t;
  const base = t.replace(/\s+\d+$/, '');
  for (let n = 2; ; n++) {
    const c = `${base} ${n}`;
    if (!used.has(c.toLowerCase())) return c;
  }
}

/**
 * Make titles unique within one place: the oldest keeps a repeated title, later ones get the
 * next free number. Returns the new title for each map that changes. (Mirrored by the server
 * migration 1793500000_unique_titles.js.)
 */
export function renumberTitles(maps: { id: string; title: string; created: string }[]): Map<string, string> {
  const norm = (t: string) => t.trim().toLowerCase();
  const sorted = [...maps].sort((a, b) => (a.created < b.created ? -1 : 1));
  const used = new Set<string>();
  const later: typeof maps = [];
  for (const m of sorted) {
    const t = m.title.trim() || 'Untitled pipeline';
    if (used.has(norm(t))) later.push(m);
    else used.add(norm(t));
  }
  const out = new Map<string, string>();
  for (const m of later) {
    const base = (m.title.trim() || 'Untitled pipeline').replace(/\s+\d+$/, '');
    let n = 2;
    while (used.has(norm(`${base} ${n}`))) n++;
    const title = `${base} ${n}`;
    used.add(norm(title));
    out.set(m.id, title);
  }
  return out;
}
