// Generate the decorative European geography; no runtime map service is used.
// Natural Earth / world-atlas geography is public domain.
// Run: node scripts/europe-map.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
const topo = JSON.parse(readFileSync(require.resolve('world-atlas/countries-50m.json'), 'utf8'));
const land = feature(topo, topo.objects.countries);

// A schematic European frame with a shared, reversible city projection.
const LON0 = 12, LAT0 = 54, K = 56;
const W = 2800, H = 2800;
const kx = K * Math.cos((LAT0 * Math.PI) / 180);
const P = ([lon, lat]) => [W / 2 + (lon - LON0) * kx, H / 2 - (lat - LAT0) * K];
const r1 = (v) => Math.round(v * 2) / 2;

// Capitals and a small number of major rail hubs, on the same projection as land.
const citySource = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_populated_places_simple.geojson';
const response = await fetch(citySource);
if (!response.ok) throw new Error(`City dataset: ${response.status}`);
const places = (await response.json()).features;
const names = ['Madrid', 'Barcelona', 'Paris', 'London', 'Manchester', 'Edinburgh', 'Dublin', 'Belfast',
  'Brussels', 'Amsterdam', 'Cologne', 'Hamburg', 'Berlin', 'Prague', 'Vienna', 'Budapest', 'Warsaw',
  'Vilnius', 'Riga', 'Tallinn', 'Copenhagen', 'Malmö', 'Gothenburg', 'Oslo', 'Stockholm', 'Helsinki'];
const aliases = { Gothenburg: 'Göteborg', Cologne: 'Köln', Copenhagen: 'København' };
const cities = names.map((name) => {
  const city = places.find(({ properties: p, geometry }) => {
    const [lon, lat] = geometry.coordinates;
    return lon > -12 && lon < 30 && lat > 35 && lat < 70
      && (p.name === name || p.namepar === name || p.name === aliases[name]);
  });
  if (!city) throw new Error(`Missing city: ${name}`);
  const [x, y] = P(city.geometry.coordinates).map(r1);
  return { id: name === 'Malmö' ? 'malmo' : name.toLowerCase(), name, coordinates: city.geometry.coordinates, x, y, capital: city.properties.adm0cap === 1 };
});
// Resolve capital-city islands that the 1:50m coastline cannot represent.
const coastSource = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_0_countries.geojson';
const coastResponse = await fetch(coastSource);
if (!coastResponse.ok) throw new Error(`Coastline dataset: ${coastResponse.status}`);
const fineCoasts = new Map((await coastResponse.json()).features
  .filter((f) => ['Denmark', 'Sweden'].includes(f.properties.ADMIN))
  .map((f) => [f.properties.ADMIN, f.geometry]));

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
const countries = [];
for (const f of land.features) {
  let d = '';
  const geometry = fineCoasts.get(f.properties.name) ?? f.geometry;
  const polys = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.type === 'MultiPolygon' ? geometry.coordinates : [];
  for (const poly of polys)
    for (const ring of poly) {
      // Keep Europe and the surrounding coasts for geographical context.
      if (!ring.some(([lon, lat]) => lon > -14 && lon < 31 && lat > 35 && lat < 72)) continue;
      // unwrap the antimeridian (Russia's far east) so it falls outside the frame
      const projected = clip(ring.map(([lon, lat]) => P([lon < -100 ? lon + 360 : lon, lat])));
      const nearCity = cities.some((city) => projected.some(([x, y]) => Math.hypot(x - city.x, y - city.y) < 12));
      const pts = simplify(projected, nearCity ? 0.12 : 1.4);
      if (pts.length < 3) continue;
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      if (!nearCity && Math.max(...xs) - Math.min(...xs) < 4 && Math.max(...ys) - Math.min(...ys) < 4) continue; // distant specks
      d += 'M' + pts.map((p) => `${r1(p[0])} ${r1(p[1])}`).join('L') + 'Z';
    }
  if (d) countries.push({ id: String(f.id ?? f.properties.name), name: f.properties.name, path: d });
}


const result = { width: W, height: H, projection: { lon: LON0, lat: LAT0, scale: K }, source: citySource, coastSource, countries, cities };
const json = JSON.stringify(result);
writeFileSync(new URL('../src/assets/europe-geography.json', import.meta.url), json + '\n');
console.log(`europe-geography.json: ${(json.length / 1024).toFixed(1)} KB, ${countries.length} land shapes, ${cities.length} cities`);
