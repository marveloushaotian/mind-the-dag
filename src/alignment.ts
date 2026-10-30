import type { Pt } from './geometry';
import { derive, type Doc, type Section } from './model';
import { edgeGeometry } from './render';

type Coordinate = 'x' | 'y';
export interface AlignmentAnchor {
  id: string;
  axis: Coordinate;
  value: number;
  from: number;
  to: number;
  priority?: number;
}
export type AlignmentLocks = Partial<Record<Coordinate, { moving: string; target: string }>>;
export interface AlignmentResult {
  offset: Pt;
  locks: AlignmentLocks;
}
const ENTER = 4;
const RELEASE = 7;

export function pointAnchors(id: string, p: Pt): AlignmentAnchor[] {
  return [{ id: `${id}:x`, axis: 'x', value: p.x, from: p.y, to: p.y },
    { id: `${id}:y`, axis: 'y', value: p.y, from: p.x, to: p.x }];
}

export function sectionAnchors(s: Pick<Section, 'id' | 'x' | 'y' | 'w' | 'h'>): AlignmentAnchor[] {
  return [
    { id: `section:${s.id}:left`, axis: 'x', value: s.x, from: s.y, to: s.y + s.h },
    { id: `section:${s.id}:right`, axis: 'x', value: s.x + s.w, from: s.y, to: s.y + s.h },
    { id: `section:${s.id}:top`, axis: 'y', value: s.y, from: s.x, to: s.x + s.w },
    { id: `section:${s.id}:bottom`, axis: 'y', value: s.y + s.h, from: s.x, to: s.x + s.w },
  ];
}

/** Freeze these at gesture start. A moving route must never attract itself. */
export function stationAlignmentTargets(doc: Doc, moving: readonly string[] = [], excludedEdge?: string, bends = false): AlignmentAnchor[] {
  const excluded = new Set(moving);
  const anchors = doc.stations.filter((s) => !excluded.has(s.id)).flatMap((s) => pointAnchors(`station:${s.id}`, s));
  const dv = derive(doc);
  for (const edge of doc.edges) {
    if (edge.id === excludedEdge || excluded.has(edge.from) || excluded.has(edge.to)) continue;
    const geometry = edgeGeometry(dv, edge);
    if (!geometry) continue;
    const points = geometry.centre;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const axis = Math.abs(a.x - b.x) < 1e-6 ? 'x' : Math.abs(a.y - b.y) < 1e-6 ? 'y' : null;
      if (!axis) continue;
      const other = axis === 'x' ? 'y' : 'x';
      if (Math.abs(a[other] - b[other]) < 1e-6) continue;
      anchors.push({ id: `edge:${edge.id}:${i}`, axis, value: a[axis], from: Math.min(a[other], b[other]), to: Math.max(a[other], b[other]), priority: 1 });
    }
    if (bends && points.length === 4) {
      const station = dv.byId.get(edge.from);
      if (!station || station.axis !== dv.byId.get(edge.to)?.axis) continue;
      const axis = station.axis === 'h' ? 'x' : 'y';
      const other = axis === 'x' ? 'y' : 'x';
      anchors.push({ id: `bend:${edge.id}`, axis, value: (points[1][axis] + points[2][axis]) / 2,
        from: Math.min(points[1][other], points[2][other]), to: Math.max(points[1][other], points[2][other]), priority: 1 });
    }
  }
  return anchors;
}

/** Weak, screen-sized acquisition with a small release margin to avoid flicker. */
export function alignAnchors(moving: readonly AlignmentAnchor[], targets: readonly AlignmentAnchor[], zoom: number,
  previous: AlignmentLocks = {}, bypass = false): AlignmentResult {
  const result: AlignmentResult = { offset: { x: 0, y: 0 }, locks: {} };
  if (bypass) return result;
  const scale = Math.max(0.01, zoom);
  for (const axis of ['x', 'y'] as const) {
    const lock = previous[axis];
    const heldMoving = lock && moving.find((m) => m.id === lock.moving && m.axis === axis);
    const heldTarget = lock && targets.find((t) => t.id === lock.target && t.axis === axis);
    let best = heldMoving && heldTarget && Math.abs(heldTarget.value - heldMoving.value) * scale <= RELEASE
      ? { moving: heldMoving, target: heldTarget } : undefined;
    if (!best) {
      let score = [Infinity, Infinity, Infinity];
      for (const m of moving) for (const t of targets) {
        if (m.axis !== axis || t.axis !== axis) continue;
        const distance = Math.abs(t.value - m.value) * scale;
        if (distance > ENTER) continue;
        const gap = Math.max(0, t.from - m.to, m.from - t.to);
        const next = [distance, t.priority ?? 0, gap];
        if (next[0] < score[0] || (next[0] === score[0] && (next[1] < score[1] || (next[1] === score[1] && next[2] < score[2])))) {
          best = { moving: m, target: t };
          score = next;
        }
      }
    }
    if (!best) continue;
    result.offset[axis] = best.target.value - best.moving.value;
    result.locks[axis] = { moving: best.moving.id, target: best.target.id };
  }
  return result;
}

/** Object alignment wins on its axis; the ordinary grid remains the fallback. */
export function alignedPoint(raw: Pt, grid: Pt, result: AlignmentResult): Pt {
  return { x: result.locks.x ? raw.x + result.offset.x : grid.x, y: result.locks.y ? raw.y + result.offset.y : grid.y };
}

export function bendCoordinate(A: Pt, B: Pt, axis: 'h' | 'v', bend: number): number {
  const u = axis === 'h' ? 'x' : 'y', v = axis === 'h' ? 'y' : 'x';
  const du = B[u] - A[u], dv = Math.abs(B[v] - A[v]);
  return Math.abs(du) >= dv ? A[u] + Math.sign(du) * (dv / 2 + (Math.abs(du) - dv) * bend) : A[u] + du * bend;
}

export function bendAtCoordinate(A: Pt, B: Pt, axis: 'h' | 'v', coordinate: number): number {
  const u = axis === 'h' ? 'x' : 'y', v = axis === 'h' ? 'y' : 'x';
  const du = B[u] - A[u], dv = Math.abs(B[v] - A[v]);
  const span = Math.abs(du) >= dv ? Math.abs(du) - dv : du;
  if (Math.abs(span) < 1e-6) return 0.5;
  const bend = Math.abs(du) >= dv ? (Math.sign(du) * (coordinate - A[u]) - dv / 2) / span : (coordinate - A[u]) / span;
  return Math.max(0, Math.min(1, bend));
}
