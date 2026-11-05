import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { cameraAt, canvasResolution, cityAppearance, cityArrivals, EUROPE_CITIES, EUROPE_ROUTES, JOURNEY_DURATION, project, routeFront, routeProgress, softenCorridor } from './europeJourney';
import EuropeBackdrop from './EuropeBackdrop';
import { isAtSea, isOnLand as onLand } from './europeGeography';
import { layoutCityLabels } from './europeLabels';

describe('European metro-map cover', () => {
  it('keeps every primary city on the displayed land with the shared projection', () => {
    expect(EUROPE_CITIES).toHaveLength(80);
    expect(new Set(EUROPE_CITIES.map((city) => city.id)).size).toBe(EUROPE_CITIES.length);
    expect(EUROPE_CITIES.filter((city) => !onLand(city)).map((city) => city.id)).toEqual([]);
    for (const city of EUROPE_CITIES) {
      const [lon, lat] = city.coordinates;
      expect(lon, city.id).toBeGreaterThan(-12);
      expect(lon, city.id).toBeLessThan(36);
      expect(lat, city.id).toBeGreaterThan(35);
      expect(lat, city.id).toBeLessThan(70);
      expect(city.x).toBeCloseTo(project(city.coordinates as [number, number]).x, 8);
    }
    expect(EUROPE_CITIES.some((city) => /kyiv|moscow/.test(city.id))).toBe(false);
  });

  it('covers southern Europe and connects every city to the journey', () => {
    const countries = new Set(EUROPE_CITIES.map((city) => city.country));
    for (const country of ['Portugal', 'Italy', 'Greece', 'Malta', 'Cyprus', 'Switzerland', 'Slovakia', 'Slovenia', 'Croatia', 'Bosnia and Herzegovina', 'Serbia', 'Montenegro', 'Albania', 'North Macedonia', 'Bulgaria', 'Romania', 'Moldova', 'Turkey', 'Luxembourg']) {
      expect(countries.has(country), country).toBe(true);
    }
    const reached = new Set(['madrid']);
    for (const route of [...EUROPE_ROUTES].sort((a, b) => a.start - b.start)) {
      expect(reached.has(route.from), route.id).toBe(true);
      reached.add(route.to);
    }
    expect(reached.size).toBe(EUROPE_CITIES.length);
  });

  it('fills central Europe with connected regional hubs rather than capitals alone', () => {
    for (const [country, ids] of [
      ['Germany', ['berlin', 'hamburg', 'cologne', 'frankfurt', 'stuttgart', 'munich', 'nuremberg', 'leipzig', 'dresden', 'hanover', 'bremen']],
      ['Switzerland', ['bern', 'zurich', 'basel', 'geneva']],
      ['Austria', ['vienna', 'salzburg', 'innsbruck', 'graz', 'linz']],
    ] as const) {
      expect(EUROPE_CITIES.filter((city) => city.country === country).map((city) => city.id).sort()).toEqual([...ids].sort());
      for (const id of ids) expect(EUROPE_ROUTES.some((route) => route.from === id || route.to === id), id).toBe(true);
    }
    for (const id of ['lyon', 'marseille', 'bordeaux', 'strasbourg', 'turin', 'bologna', 'florence', 'valencia', 'seville', 'wroclaw', 'krakow', 'gdansk', 'turku', 'tampere', 'bergen']) {
      expect(EUROPE_CITIES.some((city) => city.id === id), id).toBe(true);
    }
  });

  it('keeps schematic land corridors on land and separates sea crossings', () => {
    const ferries = EUROPE_ROUTES.filter((route) => route.mode === 'ferry');
    expect(ferries.map((route) => route.id).sort()).toEqual(['stockholm-helsinki', 'tallinn-helsinki']);
    for (const route of EUROPE_ROUTES.filter((route) => route.mode === 'land')) {
      // Short bridges and the Channel Tunnel are intentional water crossings.
      const landCount = Array.from({ length: 201 }, (_, i) => routeFront(route, i / 200).point).filter(onLand).length;
      expect(landCount / 201, `${route.id} land fraction`).toBeGreaterThan(route.id === 'copenhagen-malmo' ? 0.40 : 0.88);
    }
    const danish = EUROPE_ROUTES.find((route) => route.id === 'hamburg-copenhagen')!;
    expect(danish.parts.some((part) => part.sea)).toBe(true);
    for (const route of EUROPE_ROUTES) {
      expect(route.controlPoints.length - 1, route.id).toBeLessThanOrEqual(route.id === 'hamburg-copenhagen' ? 12 : 10);
      for (let i = 1; i < route.controlPoints.length; i++) {
        const a = route.controlPoints[i - 1], b = route.controlPoints[i];
        const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
        expect(Math.min(dx, dy, Math.abs(dx - dy)), route.id).toBeLessThan(1e-8);
        expect(Math.hypot(dx, dy), route.id).toBeGreaterThan(0.01);
        if (i > 1) {
          const previous = route.controlPoints[i - 2];
          expect((a.x - previous.x) * (b.x - a.x) + (a.y - previous.y) * (b.y - a.y), `${route.id} turn`).toBeGreaterThanOrEqual(-1e-8);
        }
      }
    }
  });

  it('uses one sea style for ferries, bridges and the Channel Tunnel without gaps', () => {
    for (const id of ['paris-london', 'hamburg-copenhagen', 'copenhagen-malmo', 'manchester-dublin', 'stockholm-helsinki', 'tallinn-helsinki', 'naples-valletta', 'athens-nicosia']) {
      const route = EUROPE_ROUTES.find((r) => r.id === id)!;
      expect(route.parts.some((part) => part.sea), id).toBe(true);
      if (route.mode !== 'ferry') expect(route.parts.some((part) => !part.sea), id).toBe(true);
    }
    for (const route of EUROPE_ROUTES) {
      expect(route.parts[0].start).toBe(0);
      expect(route.parts.at(-1)!.end).toBeCloseTo(route.length, 6);
      route.parts.forEach((part, i) => {
        expect(part.points.length).toBeGreaterThanOrEqual(2);
        const length = part.points.slice(1).reduce((sum, p, j) => sum + Math.hypot(p.x - part.points[j].x, p.y - part.points[j].y), 0);
        expect(length, route.id).toBeCloseTo(part.end - part.start, 6);
        if (i) {
          const before = route.parts[i - 1];
          expect(part.start).toBeCloseTo(before.end, 8);
          expect(part.points[0].x).toBeCloseTo(before.points.at(-1)!.x, 8);
          expect(part.points[0].y).toBeCloseTo(before.points.at(-1)!.y, 8);
        }
      });
    }
    expect(isAtSea(project([-5.4, 53.33]))).toBe(true);
    expect(isAtSea(project([24.8, 59.85]))).toBe(true);
    expect(isAtSea(project([16.4, 48.2]))).toBe(false);
    // A Swedish lake is not a sea crossing.
    expect(isAtSea(project([13.3, 58.8]))).toBe(false);
  });

  it('places all measured labels clear of other labels and every city marker', () => {
    for (const letterWidth of [8.4, 10]) {
      const labels = [...layoutCityLabels(EUROPE_CITIES, (name) => name.length * letterWidth).values()];
      expect(labels).toHaveLength(EUROPE_CITIES.length);
      labels.forEach((label, i) => {
        for (const other of labels.slice(i + 1)) {
          const overlap = label.x0 < other.x1 && label.x1 > other.x0 && label.y0 < other.y1 && label.y1 > other.y0;
          expect(overlap).toBe(false);
        }
        for (const city of EUROPE_CITIES) {
          const overlap = label.x0 < city.x + 12 && label.x1 > city.x - 12 && label.y0 < city.y + 12 && label.y1 > city.y - 12;
          expect(overlap, city.id).toBe(false);
        }
      });
    }
  });

  it('draws from arrived cities, then stays complete at and beyond the end', () => {
    for (const route of EUROPE_ROUTES) {
      expect(route.start).toBeGreaterThanOrEqual(cityArrivals(route.from)[0] + 0.1);
      expect((route.start + route.duration) * 1000).toBeLessThan(JOURNEY_DURATION);
      expect(routeProgress(route, 0)).toBe(0);
      expect(routeProgress(route, JOURNEY_DURATION)).toBe(1);
      expect(routeProgress(route, JOURNEY_DURATION * 2)).toBe(1);
      expect(routeFront(route, 0).point.x).toBeCloseTo(route.points[0].x, 8);
      expect(routeFront(route, 1).point.y).toBeCloseTo(route.points.at(-1)!.y, 8);
      expect(route.distances.every((d, i) => Number.isFinite(d) && d >= (route.distances[i - 1] ?? 0))).toBe(true);
    }
  });

  it('keeps city glyphs absent until arrival and uses uniform elastic scaling', () => {
    for (const city of EUROPE_CITIES) {
      const arrival = cityArrivals(city.id)[0] * 1000;
      expect(cityAppearance(city.id, arrival - 1).opacity).toBe(0);
      expect(cityAppearance(city.id, arrival + 140).scale).toBeGreaterThan(1.2);
      expect(cityAppearance(city.id, JOURNEY_DURATION)).toEqual({ opacity: 1, scale: 1 });
    }
  });

  it('rounds corners without overshooting their corridor', () => {
    const result = softenCorridor([{ x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 0 }], 3);
    expect(result[0]).toEqual({ x: 0, y: 10 });
    expect(result.at(-1)).toEqual({ x: 10, y: 0 });
    expect(result.every((point) => point.x >= 0 && point.x <= 10 && point.y >= 0 && point.y <= 10)).toBe(true);
  });

  it('uses circular bends with the editor\'s radii', () => {
    const rightAngle = softenCorridor([{ x: 0, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 0 }]);
    for (const point of rightAngle.slice(1, -1)) {
      expect(Math.hypot(point.x - 68, point.y - 68)).toBeCloseTo(32, 8);
    }
    const diagonal = softenCorridor([{ x: 0, y: 100 }, { x: 100, y: 100 }, { x: 200, y: 0 }]);
    const trim = 40 * Math.tan(Math.PI / 8);
    for (const point of diagonal.slice(1, -1)) {
      expect(Math.hypot(point.x - (100 - trim), point.y - 60)).toBeCloseTo(40, 8);
    }
  });

  it('pans northeast once at a fixed scale and holds Helsinki through resize', () => {
    const madrid = EUROPE_CITIES.find((city) => city.id === 'madrid')!;
    const helsinki = EUROPE_CITIES.find((city) => city.id === 'helsinki')!;
    for (const compact of [false, true]) {
      for (const [width, height] of [[320, 320], [390, 320], [844, 460], [1440, 900], [2560, 1080]]) {
        const anchor = { x: width * (compact ? 0.5 : 0.31), y: height * (compact ? 0.5 : 0.63) };
        const first = cameraAt(0, width, height, compact);
        expect(first.x + madrid.x * first.scale).toBeCloseTo(anchor.x, 8);
        expect(first.y + madrid.y * first.scale).toBeCloseTo(anchor.y, 8);
        let previous = first;
        for (let time = 100; time <= JOURNEY_DURATION; time += 100) {
          const current = cameraAt(time, width, height, compact);
          expect(Object.values(current).every(Number.isFinite)).toBe(true);
          expect(current.scale).toBe(first.scale);
          expect(current.x).toBeLessThanOrEqual(previous.x);
          expect(current.y).toBeGreaterThanOrEqual(previous.y);
          previous = current;
        }
        const end = cameraAt(27000, width, height, compact);
        expect(end.x + helsinki.x * end.scale).toBeCloseTo(anchor.x, 8);
        expect(end.y + helsinki.y * end.scale).toBeCloseTo(anchor.y, 8);
        expect(cameraAt(JOURNEY_DURATION * 2, width, height, compact)).toEqual(end);
      }
    }
  });

  it('keeps all cities connected without redundant central loops or bypasses', () => {
    for (const city of EUROPE_CITIES) {
      // Two sea approaches to Helsinki are intentional; other cities have one incoming branch.
      expect(EUROPE_ROUTES.filter((route) => route.to === city.id).length, city.id)
        .toBe(city.id === 'madrid' ? 0 : city.id === 'helsinki' ? 2 : 1);
    }
    expect(EUROPE_ROUTES.some((route) => route.id === 'cologne-berlin')).toBe(false);
    for (const id of ['cologne-hanover', 'hanover-berlin']) {
      expect(EUROPE_ROUTES.some((route) => route.id === id), id).toBe(true);
    }
  });

  it('bounds Retina pixel cost and renders one canvas without per-route SVG masks', () => {
    for (const [width, height, dpr] of [[390, 844, 3], [2276, 1295, 2], [3840, 2160, 2]]) {
      const ratio = canvasResolution(width, height, dpr);
      expect(width * height * ratio * ratio).toBeLessThanOrEqual(4_000_001);
      expect(ratio).toBeLessThanOrEqual(1.5);
    }
    const markup = renderToStaticMarkup(<EuropeBackdrop />);
    expect(markup.match(/<canvas/g)).toHaveLength(1);
    expect(markup).not.toContain('<mask');
    expect(markup).not.toContain('One connection at a time');
  });

  it('finishes with the complete Helsinki label at a readable compact scale', () => {
    const city = EUROPE_CITIES.find((city) => city.id === 'helsinki')!;
    const label = layoutCityLabels(EUROPE_CITIES, (name) => name.length * 10).get(city.id)!;
    for (const [width, height] of [[320, 320], [390, 320], [844, 460], [860, 460]]) {
      const camera = cameraAt(JOURNEY_DURATION, width, height, true);
      expect(16 * camera.scale).toBeGreaterThanOrEqual(12);
      expect(4 * camera.scale).toBeGreaterThanOrEqual(3);
      expect(camera.x + (label.x0 - 4) * camera.scale).toBeGreaterThan(12);
      expect(camera.x + (label.x1 + 4) * camera.scale).toBeLessThan(width - 12);
      expect(camera.y + (label.y0 - 4) * camera.scale).toBeGreaterThan(12);
      expect(camera.y + (label.y1 + 4) * camera.scale).toBeLessThan(height - 12);
    }
  });
});
