/**
 * Metro-line geometry: octilinear routing between two station ports and
 * rounded, offset paths whose corners are arcs concentric with the bundle's
 * centreline (design spec §1).
 */

export type Pt = { x: number; y: number };
export type Axis = 'h' | 'v';

const EPS = 1e-6;

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v: Pt) => Math.hypot(v.x, v.y);
const norm = (v: Pt): Pt => {
  const l = len(v);
  return l < EPS ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
};
/** Left of travel on screen (y down). */
const left = (u: Pt): Pt => ({ x: u.y, y: -u.x });

/** Drop zero-length segments and collinear interior points. */
export function simplify(points: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const q = out[out.length - 1];
    if (q && Math.abs(p.x - q.x) < EPS && Math.abs(p.y - q.y) < EPS) continue;
    out.push(p);
  }
  for (let i = out.length - 2; i >= 1; i--) {
    const u = norm(sub(out[i], out[i - 1]));
    const v = norm(sub(out[i + 1], out[i]));
    if (Math.abs(u.x * v.y - u.y * v.x) < 1e-9 && u.x * v.x + u.y * v.y > 0) out.splice(i, 1);
  }
  return out;
}

/**
 * Octilinear centreline between port A (station flow axis `a`) and port B
 * (axis `b`). For two horizontal-flow ports the route is horizontal,
 * then 45°, then horizontal; `bend` (0..1) slides the diagonal along the edge.
 */
export function routeCentre(A: Pt, a: Axis, B: Pt, b: Axis, bend = 0.5): Pt[] {
  const t = Math.min(1, Math.max(0, bend));
  if (a === b) {
    // Work in a frame where the flow axis is x.
    const fwd = (p: Pt): Pt => (a === 'h' ? p : { x: p.y, y: p.x });
    const A2 = fwd(A);
    const B2 = fwd(B);
    const dx = B2.x - A2.x;
    const dy = B2.y - A2.y;
    let pts: Pt[];
    if (Math.abs(dy) < EPS || Math.abs(dx) < EPS) {
      pts = [A2, B2];
    } else if (Math.abs(dx) >= Math.abs(dy)) {
      const sx = Math.sign(dx);
      const h1 = (Math.abs(dx) - Math.abs(dy)) * t;
      const P1 = { x: A2.x + sx * h1, y: A2.y };
      const P2 = { x: P1.x + sx * Math.abs(dy), y: B2.y };
      pts = [A2, P1, P2, B2];
    } else {
      // Not enough room for a single 45° run: step across at 90°.
      const mx = A2.x + dx * t;
      pts = [A2, { x: mx, y: A2.y }, { x: mx, y: B2.y }, B2];
    }
    return simplify(pts.map(fwd));
  }
  // Mixed axes: one 90° corner.
  const corner = a === 'h' ? { x: B.x, y: A.y } : { x: A.x, y: B.y };
  return simplify([A, corner, B]);
}

/** Offset a polyline `o` px to the left of travel, mitring the corners. */
export function offsetPolyline(points: Pt[], o: number): Pt[] {
  const n = points.length;
  return points.map((p, i) => {
    if (i === 0 || i === n - 1) {
      const u = i === 0 ? norm(sub(points[1], p)) : norm(sub(p, points[i - 1]));
      const nl = left(u);
      return { x: p.x + o * nl.x, y: p.y + o * nl.y };
    }
    const n1 = left(norm(sub(p, points[i - 1])));
    const n2 = left(norm(sub(points[i + 1], p)));
    const k = 1 + n1.x * n2.x + n1.y * n2.y;
    return { x: p.x + (o * (n1.x + n2.x)) / k, y: p.y + (o * (n1.y + n2.y)) / k };
  });
}

const f = (x: number) => {
  const s = (Math.round(x * 100) / 100).toString();
  return s === '-0' ? '0' : s;
};

export interface RoundOpts {
  r45: number;
  r90: number;
}

/** Whether an offset leaves room for a rounded inner corner on the fixed route. */
export function offsetFitsCorners(points: Pt[], o: number, opts: RoundOpts, minRadius = 8): boolean {
  for (let i = 1; i < points.length - 1; i++) {
    const u = norm(sub(points[i], points[i - 1]));
    const v = norm(sub(points[i + 1], points[i]));
    const cross = u.x * v.y - u.y * v.x;
    if (Math.abs(cross) < EPS) continue;
    const radius = u.x * v.x + u.y * v.y < 0.5 ? opts.r90 : opts.r45;
    if (radius + Math.sign(cross) * o < minRadius) return false;
  }
  return true;
}

/**
 * SVG path for one line following centreline `points`, displaced `o` px to
 * the left of travel. Corner radii are measured on the centreline and
 * adjusted by the offset, so every line in a bundle turns concentrically.
 * Radii shrink only when a segment is too short to hold the arc.
 */
export function roundedPath(points: Pt[], o: number, opts: RoundOpts): string {
  return roundedRail(points, o, opts);
}

/** Clamp corners once on the lane, then offset its walls around those same arcs. */
function roundedRail(points: Pt[], o: number, opts: RoundOpts, rail = 0): string {
  if (points.length < 2) return '';
  const lane = offsetPolyline(points, o);
  const pts = rail === 0 ? lane : offsetPolyline(points, o + rail);
  const segLen = lane.slice(1).map((p, i) => len(sub(p, lane[i])));
  const d: string[] = [`M ${f(pts[0].x)} ${f(pts[0].y)}`];
  for (let i = 1; i < pts.length - 1; i++) {
    const u = norm(sub(points[i], points[i - 1]));
    const v = norm(sub(points[i + 1], points[i]));
    const cos = Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y));
    const theta = Math.acos(cos);
    if (theta < 1e-6) continue;
    const R = theta > (60 * Math.PI) / 180 ? opts.r90 : opts.r45;
    const cross = u.x * v.y - u.y * v.x;
    // Centre of the turn lies to the right of travel when cross > 0.
    const cdir = cross > 0 ? { x: -u.y, y: u.x } : { x: u.y, y: -u.x };
    const nl = left(u);
    const toward = nl.x * cdir.x + nl.y * cdir.y;
    let r = toward > 0 ? R - o : R + o;
    const tan = Math.tan(theta / 2);
    // Each neighbouring segment can give at most half of itself to a corner
    // (all of itself at the ends of the path).
    const before = i === 1 ? segLen[0] : segLen[i - 1] / 2;
    const after = i === pts.length - 2 ? segLen[i] : segLen[i] / 2;
    const tMax = Math.min(before, after);
    if (r * tan > tMax) r = tMax / tan;
    r += Math.sign(cross) * rail;
    if (r < 0.5) {
      d.push(`L ${f(pts[i].x)} ${f(pts[i].y)}`);
      continue;
    }
    const t = r * tan;
    const p = pts[i];
    const a = { x: p.x - u.x * t, y: p.y - u.y * t };
    const b = { x: p.x + v.x * t, y: p.y + v.y * t };
    d.push(`L ${f(a.x)} ${f(a.y)}`);
    d.push(`A ${f(r)} ${f(r)} 0 0 ${cross > 0 ? 1 : 0} ${f(b.x)} ${f(b.y)}`);
  }
  const last = pts[pts.length - 1];
  d.push(`L ${f(last.x)} ${f(last.y)}`);
  return d.join(' ');
}

/** Two concentric walls with round end caps; the middle remains transparent. */
export function hollowPath(points: Pt[], offset: number, opts: RoundOpts, width: number, wall: number): string {
  points = simplify(points);
  if (points.length < 2) return '';
  const radius = (width - wall) / 2;
  const leftWall = offsetPolyline(points, offset + radius);
  const rightWall = offsetPolyline(points, offset - radius);
  // Reverse travel on the return wall so both caps join one closed contour.
  // Removing its initial move leaves a continuous stroke, without butt seams.
  const right = roundedRail([...points].reverse(), -offset, opts, radius);
  const cap = (to: Pt) => `A ${f(radius)} ${f(radius)} 0 0 1 ${f(to.x)} ${f(to.y)}`;
  return [
    roundedRail(points, offset, opts, radius),
    cap(rightWall.at(-1)!),
    right.slice(right.indexOf(' L ')).trimStart(),
    cap(leftWall[0]),
    'Z',
  ].join(' ');
}

/** Left-of-travel offset that puts a line `r` px along the lane axis of a port. */
export function laneToLeftOffset(points: Pt[], axis: Axis, r: number): number {
  const u = norm(sub(points[1], points[0]));
  const nl = left(u);
  const disp = axis === 'h' ? { x: 0, y: r } : { x: r, y: 0 };
  return disp.x * nl.x + disp.y * nl.y;
}
