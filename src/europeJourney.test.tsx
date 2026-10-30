import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { cameraAt, canvasResolution, cityAppearance, cityArrivals, EUROPE_CITIES, EUROPE_ROUTES, JOURNEY_DURATION, project, routeFront, routeProgress, softenCorridor } from './europeJourney';
import EuropeBackdrop from './EuropeBackdrop';
import { isAtSea, isOnLand as onLand } from './europeGeography';
import { layoutCityLabels } from './europeLabels';

describe('European rail cover', () => {
  it('keeps every primary city on the displayed land with the shared projection', () => {
    expect(EUROPE_CITIES).toHaveLength(26);
    expect(new Set(EUROPE_CITIES.map((city) => city.id)).size).toBe(26);
    expect(EUROPE_CITIES.filter((city) => !onLand(city)).map((city) => city.id)).toEqual([]);
    for (const city of EUROPE_CITIES) {
      const [lon, lat] = city.coordinates;
      expect(lon, city.id).toBeGreaterThan(-12);
      expect(lon, city.id).toBeLessThan(30);
      expect(lat, city.id).toBeGreaterThan(35);
      expect(lat, city.id).toBeLessThan(70);
      expect(city.x).toBeCloseTo(project(city.coordinates as [number, number]).x, 8);
    }
    expect(EUROPE_CITIES.some((city) => /kyiv|moscow/.test(city.id))).toBe(false);
  });

  it('keeps simplified rail corridors on land and separates sea crossings', () => {
    const ferries = EUROPE_ROUTES.filter((route) => route.mode === 'ferry');
    expect(ferries.map((route) => route.id).sort()).toEqual(['stockholm-helsinki', 'tallinn-helsinki']);
    for (const route of EUROPE_ROUTES.filter((route) => route.mode === 'rail')) {
      // Short bridges and the Channel Tunnel are intentional water crossings.
      const landCount = Array.from({ length: 201 }, (_, i) => routeFront(route, i / 200).point).filter(onLand).length;
      expect(landCount / 201, `${route.id} land fraction`).toBeGreaterThan(route.id === 'copenhagen-malmo' ? 0.40 : 0.88);
    }
    const danish = EUROPE_ROUTES.find((route) => route.id === 'hamburg-copenhagen')!;
    expect(danish.parts.some((part) => part.sea)).toBe(true);
    for (const route of EUROPE_ROUTES) {
      const maxLegs = route.id === 'hamburg-copenhagen' ? 6 : route.id === 'stockholm-helsinki' ? 5 : 4;
      expect(route.controlPoints.length - 1, route.id).toBeLessThanOrEqual(maxLegs);
    }
  });

  it('uses one sea style for ferries, bridges and the Channel Tunnel without gaps', () => {
    for (const id of ['paris-london', 'hamburg-copenhagen', 'copenhagen-malmo', 'manchester-dublin', 'stockholm-helsinki', 'tallinn-helsinki']) {
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

  it('ends over Scandinavia and never rewinds, including after resize', () => {
    const north = project([12.6, 58.6]);
    for (const [width, height] of [[390, 844], [1440, 900], [2560, 1080]]) {
      const end = cameraAt(JOURNEY_DURATION, width, height);
      expect(cameraAt(JOURNEY_DURATION * 2, width, height)).toEqual(end);
      expect(end.x + north.x * end.scale).toBeCloseTo(width * (width < 760 ? 0.46 : 0.31), 6);
      expect(end.y + north.y * end.scale).toBeCloseTo(height * 0.63, 6);
      for (let time = 0; time <= JOURNEY_DURATION; time += 100) {
        expect(Object.values(cameraAt(time, width, height)).every(Number.isFinite)).toBe(true);
      }
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
});
