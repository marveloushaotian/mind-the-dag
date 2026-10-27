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
  palette: PaletteId;
  lines: Line[];
  stations: Station[];
  edges: Edge[];
  sections: Section[];
  /** `auto` places the legend below the map until it is dragged. */
  legend: { x: number; y: number; show: boolean; auto?: boolean };
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
  return { byId, stationLines, lineOrder };
}

/** Offset of `line` across the flow at station `s` (0 = centre). */
export function laneOffset(d: Derived, stationId: string, lineId: string): number {
  const ls = d.stationLines.get(stationId) ?? [];
  const i = ls.indexOf(lineId);
  if (i < 0) return 0;
  return (i - (ls.length - 1) / 2) * PITCH;
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
