import type { Pt } from './geometry';
import { derive, stationMarker, mergeStations, type Derived, type Doc, type Station } from './model';

const SNAP_ENTER = 14;
const SNAP_LEAVE = 22;

/** Distance from the pointer to the marker's bounds, measured in screen pixels. */
function markerDistance(s: Station, dv: Derived, p: Pt, zoom: number): number {
  const marker = stationMarker(dv, s);
  return Math.hypot(Math.max(0, Math.abs(p.x - marker.x) - marker.rx), Math.max(0, Math.abs(p.y - marker.y) - marker.ry)) * zoom;
}

/** Keep a target until the pointer leaves its larger release area, avoiding flicker. */
export function snapTarget(doc: Doc, dv: Derived, point: Pt, zoom: number, previous: string | null, exclude: string | null = null): Station | null {
  const eligible = (s: Station) => s.id !== exclude;
  const held = previous ? dv.byId.get(previous) : undefined;
  if (held && eligible(held) && markerDistance(held, dv, point, zoom) <= SNAP_LEAVE) return held;
  let nearest: Station | null = null;
  let distance = SNAP_ENTER;
  for (const s of doc.stations) {
    if (!eligible(s)) continue;
    const d = markerDistance(s, dv, point, zoom);
    if (d < distance) {
      distance = d;
      nearest = s;
    }
  }
  return nearest;
}

/** A mouse may acquire a label that moves when the provisional file layout changes. */
export function connectionTarget(doc: Doc, dv: Derived, point: Pt, zoom: number, pointer: {
  hitId: string | null; hoverId: string | null; sourceId: string | null; pointerType: string;
}): Station | null {
  const hit = pointer.hitId ? dv.byId.get(pointer.hitId) : undefined;
  const acquired = pointer.pointerType === 'mouse' && pointer.hoverId ? dv.byId.get(pointer.hoverId) : undefined;
  return hit ?? acquired ?? snapTarget(doc, dv, point, zoom, pointer.hoverId, pointer.sourceId);
}

export interface ConnectionChange {
  doc: Doc;
  edgeId: string;
}

/** A provisional station fusion; the saved map remains untouched until release. */
export function previewStationMerge(doc: Doc, from: string, into: string): Doc | null {
  if (from === into || !doc.stations.some((s) => s.id === from) || !doc.stations.some((s) => s.id === into)) return null;
  const next = { ...doc, stations: doc.stations.map((s) => ({ ...s })) };
  mergeStations(next, from, into);
  return next;
}

/** The same immutable operation powers the preview and the committed connection. */
export function connectStations(doc: Doc, from: string, to: string, lineId: string, newEdgeId: string): ConnectionChange | null {
  if (from === to || !doc.lines.some((l) => l.id === lineId)) return null;
  if (!doc.stations.some((s) => s.id === from) || !doc.stations.some((s) => s.id === to)) return null;
  const existing = doc.edges.find((e) => (e.from === from && e.to === to) || (e.from === to && e.to === from));
  if (existing?.lines.includes(lineId)) return null;
  const edge = existing
    ? { ...existing, lines: [...existing.lines, lineId] }
    : { id: newEdgeId, from, to, lines: [lineId], bend: 0.5 };
  const before = derive(doc);
  const stations = doc.stations.map((s) => {
    const order = before.stationLines.get(s.id) ?? [];
    const retained = order.length > 1 ? { ...s, laneOrder: [...order] } : s;
    return s.id === from || s.id === to ? { ...retained, anchorLine: before.stationAnchors.get(s.id) ?? lineId } : retained;
  });
  return {
    doc: { ...doc, stations, edges: existing ? doc.edges.map((e) => (e === existing ? edge : e)) : [...doc.edges, edge] },
    edgeId: edge.id,
  };
}
