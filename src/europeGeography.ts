import geography from './assets/europe-geography.json';
import type { Pt } from './geometry';

export { geography };
export type LonLat = readonly [number, number];
export function project([lon, lat]: LonLat): Pt {
  const p = geography.projection;
  return { x: geography.width / 2 + (lon - p.lon) * p.scale * Math.cos(p.lat * Math.PI / 180),
    y: geography.height / 2 - (lat - p.lat) * p.scale };
}

interface Ring { points: Pt[]; x0: number; y0: number; x1: number; y1: number; area: number }
const countries = geography.countries.map((country) => {
  const rings: Ring[] = [...country.path.matchAll(/M([^Z]+)Z/g)].map((match) => {
    const points = match[1].split('L').map((point) => { const [x, y] = point.split(' ').map(Number); return { x, y }; });
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    const area = points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p.x * q.y - q.x * p.y; }, 0);
    return { points, area, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  });
  // Both source scales preserve ring winding. Lake holes have the opposite
  // winding to the largest exterior ring; they must not become sea crossings.
  const largest = rings.reduce((a, b) => Math.abs(a.area) > Math.abs(b.area) ? a : b);
  return { rings, exteriors: rings.filter((ring) => ring.area * largest.area > 0) };
});

function inside(p: Pt, ring: Ring): boolean {
  if (p.x < ring.x0 || p.x > ring.x1 || p.y < ring.y0 || p.y > ring.y1) return false;
  let result = false;
  for (let i = 0, j = ring.points.length - 1; i < ring.points.length; j = i++) {
    const a = ring.points[i], b = ring.points[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

export function isOnLand(point: Pt): boolean {
  return countries.some(({ rings }) => rings.reduce((parity, ring) => parity !== inside(point, ring), false));
}
export function isAtSea(point: Pt): boolean {
  return !countries.some(({ exteriors }) => exteriors.some((ring) => inside(point, ring)));
}
