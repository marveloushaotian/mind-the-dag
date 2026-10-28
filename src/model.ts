import type { Axis, Pt } from './geometry';
import type { PaletteId } from './tokens';
import { tokens } from './tokens';

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
  labelSide: LabelSide;
  optional?: boolean;
  inactive?: boolean;
  file?: FileBadge;
}

/** Order of `Doc.lines` is the bundle order for the whole map (spec §8). */
export interface Line {
  id: string;
  name: string;
  /** Index into the palette's line list. */
  slot: number;
  /** Dash pattern override; normally the palette slot decides. */
  pattern?: 'dashed' | 'dotted';
  planned?: boolean;
}

export interface Edge {
  id: string;
  from: string;
  to: string;
  lines: string[];
  /** Where the diagonal sits along the edge, 0 = near `from`, 1 = near `to`. */
  bend: number;
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

export function emptyDoc(): Doc {
  return {
    version: 1,
    title: 'Untitled pipeline',
    meta: 'v0.1 · Snakemake',
    showTitle: false,
    titlePos: { x: 24, y: 48 },
    titleAuto: true,
    palette: 'forest',
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
  /** Lines present at each station, in bundle order. */
  stationLines: Map<string, string[]>;
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
  for (const [id, set] of sets) {
    stationLines.set(id, [...set].sort((a, b) => lineOrder.get(a)! - lineOrder.get(b)!));
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
  const roots = [...doc.stations.filter((s) => s.axis === 'h'), ...doc.stations.filter((s) => s.axis !== 'h')];
  for (const r of roots) {
    if (sigma.has(r.id)) continue;
    sigma.set(r.id, 1);
    const queue = [r.id];
    while (queue.length) {
      const id = queue.shift()!;
      for (const { to, f } of adj.get(id) ?? []) {
        if (sigma.has(to)) continue;
        sigma.set(to, sigma.get(id)! * f);
        queue.push(to);
      }
    }
  }
  return { byId, stationLines, lineOrder, sigma };
}

/** Offset of `line` across the flow at station `s` (0 = centre). */
export function laneOffset(d: Derived, stationId: string, lineId: string): number {
  const ls = d.stationLines.get(stationId) ?? [];
  const i = ls.indexOf(lineId);
  if (i < 0) return 0;
  return (d.sigma.get(stationId) ?? 1) * (i - (ls.length - 1) / 2) * PITCH;
}

export function lanePoint(s: Station, off: number): Pt {
  return s.axis === 'h' ? { x: s.x, y: s.y + off } : { x: s.x + off, y: s.y };
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
  if (!into.label && from.label) into.label = from.label;
  if (!into.file && from.file) into.file = from.file;
  const edges: Edge[] = [];
  const byPair = new Map<string, Edge>();
  for (const e of d.edges) {
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
  d.edges = edges;
  d.stations = d.stations.filter((s) => s.id !== fromId);
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
