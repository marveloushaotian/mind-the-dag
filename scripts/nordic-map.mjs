// Draws the faint background of the landing page: an abstract Nordic coastline with a
// schematic rail network around Copenhagen, Stockholm and Helsinki.
// Coastlines: Natural Earth 1:50m via world-atlas (public domain). Output: src/assets/nordic-rail.svg
// Run: node scripts/nordic-map.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
const topo = JSON.parse(readFileSync(require.resolve('world-atlas/countries-50m.json'), 'utf8'));
const land = feature(topo, topo.objects.countries);

// --- projection: equirectangular around 61°N, so the shapes read right at this latitude
const LON0 = 17.5, LAT0 = 61, K = 46; // px per degree of latitude
const W = 1600, H = 1000;
const kx = K * Math.cos((LAT0 * Math.PI) / 180);
const P = ([lon, lat]) => [W / 2 + (lon - LON0) * kx, H / 2 - (lat - LAT0) * K];

// --- clip a ring to the frame (Sutherland-Hodgman), then simplify (Douglas-Peucker)
const PAD = 40;
const edges = [
  (p) => p[0] >= -PAD, (p) => p[0] <= W + PAD, (p) => p[1] >= -PAD, (p) => p[1] <= H + PAD,
];
const cut = [
  (a, b) => { const t = (-PAD - a[0]) / (b[0] - a[0]); return [-PAD, a[1] + t * (b[1] - a[1])]; },
  (a, b) => { const t = (W + PAD - a[0]) / (b[0] - a[0]); return [W + PAD, a[1] + t * (b[1] - a[1])]; },
  (a, b) => { const t = (-PAD - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), -PAD]; },
  (a, b) => { const t = (H + PAD - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), H + PAD]; },
];
function clip(ring) {
  let out = ring;
  for (let e = 0; e < 4; e++) {
    const inp = out;
    out = [];
    for (let i = 0; i < inp.length; i++) {
      const a = inp[(i + inp.length - 1) % inp.length], b = inp[i];
      const ina = edges[e](a), inb = edges[e](b);
      if (inb) { if (!ina) out.push(cut[e](a, b)); out.push(b); } else if (ina) out.push(cut[e](a, b));
    }
    if (!out.length) break;
  }
  return out;
}
function simplify(pts, tol) {
  // a closed ring repeats its first point: drop it, or every point would measure 0 from the 'line'
  if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts = pts.slice(0, -1);
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let max = 0, idx = -1;
    const [x1, y1] = pts[s], [x2, y2] = pts[e];
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / len;
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const r1 = (v) => Math.round(v * 2) / 2;
const countries = [];
for (const f of land.features) {
  let d = '';
  const polys = f.geometry?.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry?.type === 'MultiPolygon' ? f.geometry.coordinates : [];
  for (const poly of polys)
    for (const ring of poly) {
      // only shapes that reach into the Nordic frame (drops Antarctica, the Americas, …)
      if (!ring.some(([lon, lat]) => lon > -5 && lon < 45 && lat > 50 && lat < 75)) continue;
      // unwrap the antimeridian (Russia's far east) so it falls outside the frame
      const pts = simplify(clip(ring.map(([lon, lat]) => P([lon < -100 ? lon + 360 : lon, lat]))), 0.9);
      if (pts.length < 3) continue;
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      if (Math.max(...xs) - Math.min(...xs) < 4 && Math.max(...ys) - Math.min(...ys) < 4) continue; // specks
      d += 'M' + pts.map((p) => `${r1(p[0])} ${r1(p[1])}`).join('L') + 'Z';
    }
  if (d) countries.push(d);
}

// --- the rail network: schematic, between real city positions
const C = {
  cph: [12.57, 55.68], sto: [18.07, 59.33], hel: [24.94, 60.17],
  mal: [13.0, 55.6], got: [11.97, 57.71], osl: [10.75, 59.91], ber: [5.32, 60.39], trd: [10.4, 63.43],
  ost: [14.64, 63.18], sun: [17.31, 62.39], ume: [20.26, 63.83], lul: [22.15, 65.58], kir: [20.23, 67.86],
  nar: [17.43, 68.44], tor: [24.15, 65.84], oul: [25.47, 65.01], tam: [23.76, 61.5], tku: [22.27, 60.45],
  kuo: [27.68, 62.89], rov: [25.73, 66.5], tll: [24.75, 59.44], aar: [10.2, 56.16], ham: [9.99, 53.55],
  nrk: [16.19, 58.59], jkp: [14.16, 57.78], ore: [15.21, 59.27], gav: [17.14, 60.67], lah: [25.66, 60.98],
};
const lines = [
  { c: '#24B064', via: ['ham', 'aar', 'cph', 'mal', 'jkp', 'nrk', 'sto'] },
  { c: '#2A6FB5', via: ['cph', 'got', 'osl', 'ber'] },
  { c: '#E08A2E', via: ['sto', 'gav', 'sun', 'ume', 'lul', 'kir', 'nar'] },
  { c: '#C2453A', via: ['hel', 'tam', 'oul', 'rov'] },
  { c: '#C2453A', via: ['oul', 'tor', 'lul'] },
  { c: '#7B5EA7', via: ['osl', 'ore', 'sto'] },
  { c: '#7B5EA7', via: ['trd', 'ost', 'sun'] },
  { c: '#2F8F8A', via: ['tku', 'hel', 'lah', 'kuo'] },
];
const ferries = [['sto', 'tku'], ['hel', 'tll'], ['osl', 'cph']];
const xy = (k) => P(C[k]).map(r1);
const path = (ks) => 'M' + ks.map((k) => xy(k).join(' ')).join('L');
const main = ['cph', 'sto', 'hel'];
const label = { cph: ['Copenhagen', 14, 22], sto: ['Stockholm', 14, -14], hel: ['Helsinki', 14, -14] };

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">
<g fill="#e3e8ec" stroke="#d6dde3" stroke-width="1" fill-rule="evenodd">
${countries.map((d) => `<path d="${d}"/>`).join('\n')}
</g>
<g fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.55">
${lines.map((l) => `<path d="${path(l.via)}" stroke="${l.c}" stroke-width="5"/>`).join('\n')}
${ferries.map((f) => `<path d="${path(f)}" stroke="#8a96a3" stroke-width="2.5" stroke-dasharray="2 9"/>`).join('\n')}
</g>
<g fill="#fff" stroke="#8a96a3" stroke-width="2.5" opacity="0.8">
${Object.keys(C).filter((k) => !main.includes(k)).map((k) => `<circle cx="${xy(k)[0]}" cy="${xy(k)[1]}" r="5"/>`).join('\n')}
${main.map((k) => `<circle cx="${xy(k)[0]}" cy="${xy(k)[1]}" r="9" stroke="#1a1d21" stroke-width="3.5"/>`).join('\n')}
</g>
<g font-family="Inter, system-ui, sans-serif" font-size="15" font-weight="600" fill="#1a1d21" opacity="0.45">
${main.map((k) => `<text x="${xy(k)[0] + label[k][1]}" y="${xy(k)[1] + label[k][2]}">${label[k][0]}</text>`).join('\n')}
</g>
</svg>
`;
writeFileSync(new URL('../src/assets/nordic-rail.svg', import.meta.url), svg);
console.log(`nordic-rail.svg: ${(svg.length / 1024).toFixed(1)} KB`);
