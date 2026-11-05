import { geography, project, isAtSea, type LonLat } from './europeGeography';
import { routeCentre, simplify, type Pt } from './geometry';
import type { StationKind } from './model';
import { placementFrames, stationPulseFrames } from './placement';
import { tokens } from './tokens';

export { geography, project };
export type { LonLat };
export const JOURNEY_DURATION = 36_000;
export type JourneyMode = 'land' | 'ferry' | 'mixed';
export interface JourneyPart { sea: boolean; start: number; end: number; points: Pt[] }
export interface JourneyRoute {
  id: string;
  from: string;
  to: string;
  slot: number;
  mode: JourneyMode;
  start: number;
  duration: number;
  controlPoints: Pt[];
  parts: JourneyPart[];
  points: Pt[];
  distances: number[];
  length: number;
}

const roles: Record<string, StationKind> = { madrid: 'start', paris: 'merge', hamburg: 'merge', copenhagen: 'merge', helsinki: 'stop', oslo: 'stop', london: 'merge', edinburgh: 'stop', belfast: 'stop', budapest: 'stop', milan: 'merge', zagreb: 'merge', belgrade: 'merge', lisbon: 'merge', porto: 'stop', valletta: 'stop', nicosia: 'stop', chisinau: 'stop', istanbul: 'stop' };
export const EUROPE_CITIES = geography.cities.map((city) => ({ ...city, ...project(city.coordinates as [number, number]), kind: roles[city.id] ?? 'step' }));
const cities = new Map(EUROPE_CITIES.map((city) => [city.id, city]));

// Intermediate coordinates describe corridors only: they never become stations.
// Operator maps and their limits are documented in docs/interaction-design.md.
const corridors: { from: string; to: string; slot: number; start: number; duration: number; via: LonLat[]; mode?: JourneyMode; keepVia?: boolean }[] = [
  { from: 'madrid', to: 'barcelona', slot: 0, start: 0.5, duration: 2.4, via: [[-0.89, 41.65], [0.62, 41.61]] },
  { from: 'barcelona', to: 'paris', slot: 0, start: 3.1, duration: 4.1, via: [[2.98, 43.18], [4.36, 43.84], [4.84, 45.76]] },
  { from: 'paris', to: 'brussels', slot: 0, start: 7.4, duration: 1.6, via: [[3.06, 50.63]] },
  { from: 'paris', to: 'london', slot: 1, start: 7.5, duration: 2.0, via: [[2.80, 50.54], [1.81, 50.92], [1.14, 51.10]] },
  { from: 'london', to: 'manchester', slot: 2, start: 9.8, duration: 1.8, via: [[-1.51, 52.40], [-2.43, 53.09]] },
  { from: 'manchester', to: 'edinburgh', slot: 2, start: 11.9, duration: 2.0, via: [[-2.70, 54.30], [-2.94, 54.90]] },
  // The invisible Holyhead waypoint separates rail from the Irish Sea ferry.
  { from: 'manchester', to: 'dublin', slot: 2, mode: 'mixed', start: 11.9, duration: 2.3, via: [[-2.90, 53.20], [-4.63, 53.31]] },
  { from: 'dublin', to: 'belfast', slot: 2, start: 14.5, duration: 1.5, via: [[-6.33, 54.18]] },
  { from: 'brussels', to: 'amsterdam', slot: 0, start: 9.2, duration: 1.4, via: [[4.77, 51.59], [4.48, 51.92]] },
  { from: 'amsterdam', to: 'hamburg', slot: 0, start: 10.8, duration: 2.3, via: [[8.05, 52.28], [8.81, 53.08]] },
  { from: 'brussels', to: 'cologne', slot: 3, start: 9.3, duration: 1.6, via: [[5.57, 50.63]] },
  { from: 'berlin', to: 'prague', slot: 4, start: 14.0, duration: 1.7, via: [[13.74, 51.05]] },
  { from: 'prague', to: 'vienna', slot: 4, start: 16.0, duration: 1.6, via: [[16.61, 49.20]] },
  { from: 'vienna', to: 'budapest', slot: 4, start: 17.9, duration: 1.5, via: [[17.64, 47.68]] },
  { from: 'berlin', to: 'warsaw', slot: 5, start: 14.2, duration: 2.0, via: [[16.92, 52.40]] },
  { from: 'warsaw', to: 'vilnius', slot: 5, start: 16.5, duration: 2.0, via: [[22.93, 54.10], [23.90, 54.90]] },
  { from: 'vilnius', to: 'riga', slot: 5, start: 18.8, duration: 1.6, via: [[23.31, 55.93]] },
  { from: 'riga', to: 'tallinn', slot: 5, start: 20.7, duration: 2.2, via: [[26.05, 57.78], [26.72, 58.38]] },
  { from: 'tallinn', to: 'helsinki', slot: 5, mode: 'ferry', start: 23.2, duration: 2.2, via: [[24.75, 59.85]] },
  // Keep the Little/Great Belt bridge approaches instead of cutting the Baltic.
  { from: 'hamburg', to: 'copenhagen', slot: 0, start: 13.4, duration: 3.4, keepVia: true,
    via: [[9.48, 55.50], [9.73, 55.50], [10.79, 55.33], [11.14, 55.33], [11.79, 55.44]] },
  { from: 'copenhagen', to: 'malmo', slot: 0, start: 17.0, duration: 1.2, via: [[12.60, 55.63], [12.83, 55.57]] },
  { from: 'malmo', to: 'stockholm', slot: 0, start: 18.5, duration: 3.6, via: [[14.69, 57.65], [16.18, 58.59]] },
  { from: 'malmo', to: 'gothenburg', slot: 3, start: 18.6, duration: 2.2, via: [[13.05, 56.70], [12.35, 57.11]] },
  { from: 'gothenburg', to: 'oslo', slot: 3, start: 21.1, duration: 2.4, via: [[12.30, 58.28], [11.39, 59.12], [10.87, 59.72]] },
  { from: 'stockholm', to: 'helsinki', slot: 1, mode: 'ferry', start: 22.6, duration: 4.4,
    via: [[18.75, 59.45], [19.94, 60.10], [22.0, 59.72], [24.70, 60.04]] },
  { from: 'madrid', to: 'lisbon', slot: 6, start: 0.5, duration: 2.2, via: [[-6.3, 39.5], [-8.3, 39.0]] },
  { from: 'lisbon', to: 'porto', slot: 6, start: 2.9, duration: 1.5, via: [[-8.5, 40.0]] },
  { from: 'paris', to: 'luxembourg', slot: 6, start: 7.5, duration: 1.5, via: [[4.0, 49.1]] },
  { from: 'paris', to: 'bern', slot: 4, start: 7.5, duration: 1.5, via: [[5.0, 47.3]] },
  { from: 'bern', to: 'milan', slot: 4, start: 9.2, duration: 1.5, via: [[8.0, 46.2]] },
  { from: 'milan', to: 'venice', slot: 4, start: 10.9, duration: 1.2, via: [[11.3, 45.4]] },
  { from: 'rome', to: 'naples', slot: 6, start: 14.5, duration: 1.1, via: [[13.4, 41.5]] },
  { from: 'naples', to: 'valletta', slot: 6, mode: 'mixed', start: 15.8, duration: 2.5,
    via: [[15.4, 40.5], [16.2, 39.0], [15.7, 38.1], [15.1, 37.5], [14.8, 36.7]] },
  { from: 'venice', to: 'ljubljana', slot: 4, start: 12.3, duration: 1.2, via: [[13.4, 45.9]] },
  { from: 'ljubljana', to: 'zagreb', slot: 4, start: 13.7, duration: 1.0, via: [] },
  { from: 'zagreb', to: 'sarajevo', slot: 4, start: 14.9, duration: 1.2, via: [[17.2, 45.0]] },
  { from: 'sarajevo', to: 'podgorica', slot: 4, start: 16.3, duration: 1.0, via: [] },
  { from: 'podgorica', to: 'tirana', slot: 4, start: 17.5, duration: 0.9, via: [] },
  { from: 'tirana', to: 'skopje', slot: 4, start: 18.6, duration: 1.0, via: [] },
  { from: 'skopje', to: 'thessaloniki', slot: 4, start: 19.8, duration: 1.0, via: [[22.5, 41.3]] },
  { from: 'thessaloniki', to: 'athens', slot: 4, start: 21.0, duration: 1.8,
    via: [[22.6, 40.1], [22.4, 39.4], [22.6, 38.6], [23.5, 38.3]] },
  { from: 'athens', to: 'nicosia', slot: 4, mode: 'mixed', start: 23.0, duration: 2.5,
    via: [[25.5, 36.0], [29.5, 34.3], [32.5, 34.3], [33.1, 34.7]] },
  { from: 'zagreb', to: 'belgrade', slot: 5, start: 14.9, duration: 1.6, via: [[18.7, 45.1]] },
  { from: 'belgrade', to: 'bucharest', slot: 5, start: 16.7, duration: 1.8, via: [[22.6, 44.6]] },
  { from: 'bucharest', to: 'chisinau', slot: 5, start: 18.7, duration: 1.6, via: [[27.1, 45.5]] },
  { from: 'belgrade', to: 'sofia', slot: 3, start: 16.7, duration: 1.8, via: [[21.9, 43.3]] },
  { from: 'sofia', to: 'istanbul', slot: 3, start: 18.7, duration: 2.0, via: [[25.6, 42.1], [27.5, 41.7]] },
  { from: 'vienna', to: 'bratislava', slot: 3, start: 17.9, duration: 0.6, via: [] },
  { from: 'cologne', to: 'frankfurt', slot: 1, start: 11.1, duration: 1.2, via: [] },
  { from: 'frankfurt', to: 'stuttgart', slot: 1, start: 12.5, duration: 1.1, via: [] },
  { from: 'stuttgart', to: 'munich', slot: 1, start: 13.8, duration: 1.2, via: [[10.2, 48.4]] },
  { from: 'frankfurt', to: 'nuremberg', slot: 1, start: 12.5, duration: 1.4, via: [] },
  { from: 'nuremberg', to: 'leipzig', slot: 1, start: 14.1, duration: 1.2, via: [] },
  { from: 'leipzig', to: 'dresden', slot: 1, start: 15.5, duration: 0.9, via: [] },
  { from: 'cologne', to: 'hanover', slot: 3, start: 11.1, duration: 1.4, via: [] },
  { from: 'hanover', to: 'bremen', slot: 3, start: 12.7, duration: 0.9, via: [] },
  { from: 'hanover', to: 'berlin', slot: 3, start: 12.7, duration: 1.0, via: [] },
  { from: 'bern', to: 'basel', slot: 2, start: 9.2, duration: 0.8, via: [] },
  { from: 'bern', to: 'zurich', slot: 2, start: 9.2, duration: 0.9, via: [] },
  { from: 'bern', to: 'geneva', slot: 2, start: 9.2, duration: 1.1, via: [] },
  { from: 'zurich', to: 'innsbruck', slot: 2, start: 10.3, duration: 1.8, via: [[9.6, 47.3]] },
  { from: 'innsbruck', to: 'salzburg', slot: 2, start: 12.3, duration: 1.2, via: [] },
  { from: 'salzburg', to: 'linz', slot: 2, start: 13.7, duration: 1.0, via: [] },
  { from: 'vienna', to: 'graz', slot: 2, start: 17.9, duration: 1.3, via: [[15.9, 47.5]] },
  { from: 'paris', to: 'lyon', slot: 6, start: 7.5, duration: 1.5, via: [] },
  { from: 'lyon', to: 'marseille', slot: 6, start: 9.2, duration: 1.6, via: [[4.8, 44.1]] },
  { from: 'lyon', to: 'turin', slot: 6, start: 9.2, duration: 1.5, via: [[6.5, 45.3]] },
  { from: 'paris', to: 'bordeaux', slot: 6, start: 7.5, duration: 1.8, via: [] },
  { from: 'paris', to: 'strasbourg', slot: 2, start: 7.5, duration: 1.5, via: [] },
  { from: 'milan', to: 'bologna', slot: 6, start: 10.9, duration: 1.0, via: [] },
  { from: 'bologna', to: 'florence', slot: 6, start: 12.1, duration: 0.8, via: [] },
  { from: 'florence', to: 'rome', slot: 6, start: 13.1, duration: 1.2, via: [] },
  { from: 'barcelona', to: 'valencia', slot: 6, start: 3.1, duration: 1.5, via: [[0.5, 40.7]] },
  { from: 'madrid', to: 'seville', slot: 6, start: 0.5, duration: 1.7, via: [[-4.8, 38.0]] },
  { from: 'dresden', to: 'wroclaw', slot: 5, start: 16.6, duration: 1.4, via: [] },
  { from: 'wroclaw', to: 'krakow', slot: 5, start: 18.2, duration: 1.3, via: [] },
  { from: 'warsaw', to: 'gdansk', slot: 5, start: 16.4, duration: 1.8, via: [] },
  { from: 'helsinki', to: 'turku', slot: 0, start: 27.2, duration: 1.3, via: [] },
  { from: 'turku', to: 'tampere', slot: 0, start: 28.7, duration: 1.1, via: [] },
  { from: 'oslo', to: 'bergen', slot: 3, start: 23.7, duration: 2.0, via: [[8.5, 60.5]] },
];

/** Use the editor's octilinear router, preferring few bends and land corridors. */
export function metroCorridor(guides: Pt[], mode: JourneyMode, keepVia = false): Pt[] {
  const distanceToSegment = (p: Pt, a: Pt, b: Pt) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    const point = { x: a.x + t * dx, y: a.y + t * dy };
    return { point, distance: Math.hypot(p.x - point.x, p.y - point.y) };
  };
  const score = (path: Pt[], corridor: Pt[]) => {
    let cost = (path.length - 2) * 26;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], length = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.ceil(length / 8);
      cost += length;
      for (let j = 0; j < steps; j++) {
        const t = (j + 0.5) / steps, p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        const nearest = corridor.slice(1).map((end, k) => distanceToSegment(p, corridor[k], end)).reduce((a, b) => a.distance < b.distance ? a : b);
        const sea = isAtSea(p);
        const wrongSurface = mode === 'land' ? sea : mode === 'ferry' ? !sea : sea !== isAtSea(nearest.point);
        cost += length / steps * (nearest.distance * 0.06 + (wrongSurface ? mode === 'land' ? 40 : 18 : 0));
      }
    }
    return cost;
  };
  const best = guides.map(() => ({ cost: Infinity, points: [] as Pt[] }));
  best[0] = { cost: 0, points: [guides[0]] };
  for (let end = 1; end < guides.length; end++) {
    for (let start = keepVia ? end - 1 : 0; start < end; start++) {
      for (const axis of ['h', 'v'] as const) for (const bend of [0, 0.5, 1]) {
        const path = routeCentre(guides[start], axis, guides[end], axis, bend);
        const points = simplify([...best[start].points, ...path.slice(1)]);
        const cost = best[start].cost + score(path, guides.slice(start, end + 1))
          + Math.max(0, points.length - best[start].points.length - path.length + 2) * 26;
        if (cost < best[end].cost) best[end] = { cost, points };
      }
    }
  }
  const points = best.at(-1)!.points;
  // Adjacent coastal guides can otherwise produce a short out-and-back leg.
  for (let i = points.length - 2; i > 0; i--) {
    const a = points[i - 1], p = points[i], b = points[i + 1];
    const ux = p.x - a.x, uy = p.y - a.y, vx = b.x - p.x, vy = b.y - p.y;
    if (Math.abs(ux * vy - uy * vx) < 1e-8) points.splice(i, 1);
  }
  return simplify(points);
}

/** Circular bends share the editor's radii, with extra clearance at coastlines. */
export function softenCorridor(points: Pt[], radius?: number, mode?: JourneyMode): Pt[] {
  const wrongSurfaceLength = (path: Pt[]) => {
    let total = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], length = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.ceil(length / 2);
      for (let j = 0; j < steps; j++) {
        const t = (j + 0.5) / steps;
        const sea = isAtSea({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        if (mode === 'land' ? sea : !sea) total += length / steps;
      }
    }
    return total;
  };
  const output = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1], p = points[i], b = points[i + 1];
    const before = Math.hypot(p.x - a.x, p.y - a.y), after = Math.hypot(b.x - p.x, b.y - p.y);
    if (before < 0.01 || after < 0.01) continue;
    const u = { x: (p.x - a.x) / before, y: (p.y - a.y) / before };
    const v = { x: (b.x - p.x) / after, y: (b.y - p.y) / after };
    const theta = Math.acos(Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y)));
    if (theta < 1e-6) continue;
    const turn = Math.sign(u.x * v.y - u.y * v.x);
    const wanted = radius ?? (theta > Math.PI / 3 ? tokens.line.radius90 : tokens.line.radius45);
    const trim = Math.min(wanted * Math.tan(theta / 2), i === 1 ? before : before / 2, i === points.length - 2 ? after : after / 2);
    let r = trim / Math.tan(theta / 2);
    const steps = Math.ceil(theta / (Math.PI / 32));
    const arcAt = (r: number) => {
      const trim = r * Math.tan(theta / 2);
      const entry = { x: p.x - u.x * trim, y: p.y - u.y * trim };
      const centre = { x: entry.x - u.y * turn * r, y: entry.y + u.x * turn * r };
      const angle = Math.atan2(entry.y - centre.y, entry.x - centre.x);
      return Array.from({ length: steps + 1 }, (_, step) => {
        const at = angle + turn * theta * step / steps;
        return { x: centre.x + Math.cos(at) * r, y: centre.y + Math.sin(at) * r };
      });
    };
    let arc = arcAt(r);
    if (mode && mode !== 'mixed') {
      // Keep a circular corner from cutting a bay or clipping an island.
      const cornerOnCorrectSurface = mode === 'land' ? !isAtSea(p) : isAtSea(p);
      for (let attempt = 0; attempt < 5; attempt++) {
        const allowed = cornerOnCorrectSurface ? 0 : wrongSurfaceLength([arc[0], p, arc.at(-1)!]);
        if (wrongSurfaceLength(arc) <= allowed + 0.25) break;
        r /= 2;
        arc = arcAt(r);
      }
    }
    output.push(...arc);
  }
  output.push(points.at(-1)!);
  return output;
}

/** Resolve coast transitions once, retaining only corners and coast cut points. */
export function coastalParts(points: Pt[], mode: JourneyMode): JourneyPart[] {
  const parts: JourneyPart[] = [];
  let current: JourneyPart | undefined, distance = 0;
  const append = (part: JourneyPart, p: Pt) => {
    const last = part.points.at(-1)!;
    if (Math.hypot(last.x - p.x, last.y - p.y) > 1e-8) part.points.push(p);
  };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 1e-8) continue;
    const steps = Math.ceil(length / 1.5);
    for (let step = 0; step < steps; step++) {
      const mid = (step + 0.5) / steps;
      const sea = mode === 'ferry' || isAtSea({ x: a.x + (b.x - a.x) * mid, y: a.y + (b.y - a.y) * mid });
      if (!current || sea !== current.sea) {
        const t = step / steps, start = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        if (current) { append(current, start); current.end = distance + t * length; }
        current = { sea, start: distance + t * length, end: 0, points: [start] };
        parts.push(current);
      }
    }
    if (current) append(current, b);
    distance += length;
  }
  if (current) current.end = distance;
  return parts;
}

export const EUROPE_ROUTES: JourneyRoute[] = corridors.map((route) => {
  const from = cities.get(route.from)!, to = cities.get(route.to)!;
  const mode = route.mode ?? 'land';
  const controlPoints = metroCorridor([from, ...route.via.map(project), to], mode, route.keepVia);
  const points = softenCorridor(controlPoints, undefined, mode);
  const distances = [0];
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  return { ...route, id: `${route.from}-${route.to}`, mode, controlPoints, points, parts: coastalParts(points, mode), distances, length: distances.at(-1)! };
});

export function routeProgress(route: JourneyRoute, time: number): number {
  return Math.max(0, Math.min(1, (time / 1000 - route.start) / route.duration));
}

/** A distance-based moving front: small route segments never speed up the train. */
export function routeFront(route: JourneyRoute, progress: number): { index: number; point: Pt; angle: number } {
  const target = Math.max(0, Math.min(1, progress)) * route.length;
  let lo = 1, hi = route.distances.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (route.distances[mid] < target) lo = mid + 1; else hi = mid;
  }
  const a = route.points[lo - 1], b = route.points[lo];
  const length = route.distances[lo] - route.distances[lo - 1];
  const t = length === 0 ? 0 : (target - route.distances[lo - 1]) / length;
  return { index: lo, point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

const arrivalsByCity = new Map(EUROPE_CITIES.map((city) => [city.id, city.id === 'madrid' ? [0.2]
  : [...new Set(EUROPE_ROUTES.filter((route) => route.to === city.id)
    .map((route) => Math.round((route.start + route.duration) * 1000) / 1000))].sort((a, b) => a - b)]));
export function cityArrivals(id: string): number[] { return arrivalsByCity.get(id)!; }

const readScale = (frame: Keyframe) => Number(String(frame.transform).match(/scale\(([\d.]+)\)/)![1]);
const landing = placementFrames().map((frame) => ({ t: Number(frame.offset) * 440, scale: readScale(frame) }));
const connection = stationPulseFrames('connect').map((frame) => ({ t: Number(frame.offset) * 340, scale: readScale(frame) }));
export function cityAppearance(id: string, time: number): { opacity: number; scale: number } {
  const arrivals = cityArrivals(id);
  if (time < arrivals[0] * 1000) return { opacity: 0, scale: 0.15 };
  let scale = 1;
  arrivals.forEach((arrival, index) => {
    const elapsed = time - arrival * 1000, frames = index === 0 ? landing : connection;
    if (elapsed < 0 || elapsed > frames.at(-1)!.t) return;
    const right = frames.findIndex((frame) => frame.t >= elapsed);
    const a = frames[Math.max(0, right - 1)], b = frames[right];
    const t = b.t === a.t ? 1 : 1 - (1 - (elapsed - a.t) / (b.t - a.t)) ** 3;
    scale = a.scale + (b.scale - a.scale) * t;
  });
  return { opacity: Math.min(1, (time - arrivals[0] * 1000) / 100), scale };
}

/** One northeast pan, followed by a still view of Helsinki. No return tour or zoom-out. */
export function cameraAt(time: number, width: number, height: number, compact = false): { x: number; y: number; scale: number } {
  const progress = Math.max(0, Math.min(1, (time - 2200) / (27000 - 2200)));
  const eased = progress * progress * (3 - 2 * progress);
  const from = cities.get('madrid')!, to = cities.get('helsinki')!;
  const centre = { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased };
  const scale = compact ? Math.max(0.75, Math.min(1, width / 800, height / 500)) : Math.max(width / 2800, height / 2100);
  return { x: width * (compact ? 0.5 : 0.31) - centre.x * scale,
    y: height * (compact ? 0.5 : 0.63) - centre.y * scale, scale };
}

/** Decoration has a bounded drawing cost even on a large Retina monitor. */
export function canvasResolution(width: number, height: number, pixelRatio: number): number {
  return Math.min(pixelRatio, 1.5, Math.sqrt(4_000_000 / Math.max(1, width * height)));
}
