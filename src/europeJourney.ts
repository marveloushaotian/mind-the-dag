import { geography, project, isAtSea, type LonLat } from './europeGeography';
import type { Pt } from './geometry';
import type { StationKind } from './model';
import { placementFrames, stationPulseFrames } from './placement';

export { geography, project };
export type { LonLat };
export const JOURNEY_DURATION = 28_000;
export type JourneyMode = 'rail' | 'ferry' | 'mixed';
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

const roles: Record<string, StationKind> = { madrid: 'start', paris: 'merge', hamburg: 'merge', copenhagen: 'merge', helsinki: 'stop', oslo: 'stop', london: 'merge', edinburgh: 'stop', belfast: 'stop', budapest: 'stop' };
export const EUROPE_CITIES = geography.cities.map((city) => ({ ...city, ...project(city.coordinates as [number, number]), kind: roles[city.id] ?? 'step' }));
const cities = new Map(EUROPE_CITIES.map((city) => [city.id, city]));

// Intermediate coordinates describe corridors only: they never become stations.
// Operator maps and their limits are documented in docs/interaction-design.md.
const corridors: { from: string; to: string; slot: number; start: number; duration: number; via: LonLat[]; mode?: JourneyMode }[] = [
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
  { from: 'cologne', to: 'berlin', slot: 3, start: 11.2, duration: 2.5, via: [[7.47, 51.52], [9.74, 52.38]] },
  { from: 'berlin', to: 'hamburg', slot: 3, start: 14.0, duration: 1.8, via: [[11.75, 53.00]] },
  { from: 'berlin', to: 'prague', slot: 4, start: 14.0, duration: 1.7, via: [[13.74, 51.05]] },
  { from: 'prague', to: 'vienna', slot: 4, start: 16.0, duration: 1.6, via: [[16.61, 49.20]] },
  { from: 'vienna', to: 'budapest', slot: 4, start: 17.9, duration: 1.5, via: [[17.64, 47.68]] },
  { from: 'berlin', to: 'warsaw', slot: 5, start: 14.2, duration: 2.0, via: [[16.92, 52.40]] },
  { from: 'warsaw', to: 'vilnius', slot: 5, start: 16.5, duration: 2.0, via: [[22.93, 54.10], [23.90, 54.90]] },
  { from: 'vilnius', to: 'riga', slot: 5, start: 18.8, duration: 1.6, via: [[23.31, 55.93]] },
  { from: 'riga', to: 'tallinn', slot: 5, start: 20.7, duration: 2.2, via: [[26.05, 57.78], [26.72, 58.38]] },
  { from: 'tallinn', to: 'helsinki', slot: 5, mode: 'ferry', start: 23.2, duration: 2.2, via: [[24.75, 59.85]] },
  // Keep the Little/Great Belt bridge approaches instead of cutting the Baltic.
  { from: 'hamburg', to: 'copenhagen', slot: 0, start: 13.4, duration: 3.4,
    via: [[9.48, 55.49], [9.73, 55.50], [10.79, 55.31], [11.14, 55.33], [11.79, 55.44]] },
  { from: 'copenhagen', to: 'malmo', slot: 0, start: 17.0, duration: 1.2, via: [[12.60, 55.63], [12.83, 55.57]] },
  { from: 'malmo', to: 'stockholm', slot: 0, start: 18.5, duration: 3.6, via: [[14.69, 57.65], [16.18, 58.59]] },
  { from: 'malmo', to: 'gothenburg', slot: 3, start: 18.6, duration: 2.2, via: [[13.05, 56.70], [12.35, 57.11]] },
  { from: 'gothenburg', to: 'oslo', slot: 3, start: 21.1, duration: 2.4, via: [[12.30, 58.28], [11.39, 59.12], [10.87, 59.72]] },
  { from: 'stockholm', to: 'helsinki', slot: 1, mode: 'ferry', start: 22.6, duration: 4.4,
    via: [[18.75, 59.45], [19.94, 60.10], [22.0, 59.72], [24.70, 60.04]] },
];

/** Round within the corridor's corners, without a spline's coastal overshoot. */
export function softenCorridor(points: Pt[], radius = 12): Pt[] {
  const output = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1], p = points[i], b = points[i + 1];
    const before = Math.hypot(p.x - a.x, p.y - a.y), after = Math.hypot(b.x - p.x, b.y - p.y);
    if (before < 0.01 || after < 0.01) continue;
    const r = Math.min(radius, before / 3, after / 3);
    const entry = { x: p.x + (a.x - p.x) * r / before, y: p.y + (a.y - p.y) * r / before };
    const exit = { x: p.x + (b.x - p.x) * r / after, y: p.y + (b.y - p.y) * r / after };
    output.push(entry);
    for (let step = 1; step <= 6; step++) {
      const t = step / 6, u = 1 - t;
      output.push({ x: u * u * entry.x + 2 * u * t * p.x + t * t * exit.x,
        y: u * u * entry.y + 2 * u * t * p.y + t * t * exit.y });
    }
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
  const controlPoints = [from, ...route.via.map(project), to];
  const points = softenCorridor(controlPoints);
  const distances = [0];
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  const mode = route.mode ?? 'rail';
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
  : EUROPE_ROUTES.filter((route) => route.to === city.id).map((route) => route.start + route.duration).sort((a, b) => a - b)]));
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

/** End over Scandinavia, west of Helsinki; never recenter on eastern Europe. */
const poses = [
  { at: 0, centre: [-3.7, 40.4], zoom: 1 },
  { at: 0.08, centre: [-3.7, 40.4], zoom: 1 },
  { at: 0.38, centre: [2.35, 48.86], zoom: 1.01 },
  { at: 0.62, centre: [10.0, 53.55], zoom: 1.02 },
  { at: 0.94, centre: [12.6, 58.6], zoom: 0.94 },
  { at: 1, centre: [12.6, 58.6], zoom: 0.94 },
];
export function cameraAt(time: number, width: number, height: number): { x: number; y: number; scale: number } {
  const progress = Math.max(0, Math.min(1, time / JOURNEY_DURATION));
  const right = Math.max(1, poses.findIndex((pose) => pose.at >= progress));
  const a = poses[right - 1], b = poses[right];
  const linear = (progress - a.at) / (b.at - a.at), t = linear * linear * (3 - 2 * linear);
  const centre = project([a.centre[0] + (b.centre[0] - a.centre[0]) * t, a.centre[1] + (b.centre[1] - a.centre[1]) * t]);
  const scale = Math.max(width / 2800, height / 2100) * (a.zoom + (b.zoom - a.zoom) * t);
  return { x: width * (width < 760 ? 0.46 : 0.31) - centre.x * scale, y: height * 0.63 - centre.y * scale, scale };
}

/** Decoration has a bounded drawing cost even on a large Retina monitor. */
export function canvasResolution(width: number, height: number, pixelRatio: number): number {
  return Math.min(pixelRatio, 1.5, Math.sqrt(4_000_000 / Math.max(1, width * height)));
}
