import type { Pt } from './geometry';

interface City extends Pt { id: string; name: string; capital: boolean }
interface Box { x0: number; y0: number; x1: number; y1: number }
export interface CityLabel extends Box { x: number; y: number; align: 'left' | 'right' | 'center' }
export const CITY_FONT = '500 16px Inter, system-ui, sans-serif';
const LINE_HEIGHT = 20;
const intersects = (a: Box, b: Box) => a.x0 < b.x1 + 3 && a.x1 > b.x0 - 3 && a.y0 < b.y1 + 3 && a.y1 > b.y0 - 3;

/** Solve once with measured text, never reflow labels as the camera moves. */
export function layoutCityLabels(cities: readonly City[], measure: (name: string) => number): Map<string, CityLabel> {
  const occupied: Box[] = cities.map((city) => ({ x0: city.x - 12, x1: city.x + 12, y0: city.y - 12, y1: city.y + 12 }));
  const output = new Map<string, CityLabel>();
  const preferLeft = new Set(['london', 'manchester', 'edinburgh', 'dublin', 'belfast', 'amsterdam', 'oslo', 'gothenburg', 'copenhagen', 'berlin']);
  const ordered = [...cities].sort((a, b) => Number(b.capital) - Number(a.capital) || a.id.localeCompare(b.id));
  for (const city of ordered) {
    const width = measure(city.name);
    let chosen: CityLabel | undefined;
    for (const gap of [18, 26, 38, 54, 74]) {
      const candidate = (dx: number, dy: number, align: CityLabel['align']): CityLabel => {
        const x = city.x + dx, y = city.y + dy;
        const x0 = align === 'left' ? x : align === 'right' ? x - width : x - width / 2;
        return { x, y, align, x0, x1: x0 + width, y0: y - LINE_HEIGHT / 2, y1: y + LINE_HEIGHT / 2 };
      };
      const right = candidate(gap, 0, 'left'), left = candidate(-gap, 0, 'right');
      const candidates = [
        ...(preferLeft.has(city.id) ? [left, right] : [right, left]),
        candidate(0, -gap - LINE_HEIGHT / 2, 'center'), candidate(0, gap + LINE_HEIGHT / 2, 'center'),
        candidate(gap, -gap, 'left'), candidate(-gap, -gap, 'right'),
        candidate(gap, gap, 'left'), candidate(-gap, gap, 'right'),
      ];
      chosen = candidates.find((box) => !occupied.some((obstacle) => intersects(box, obstacle)));
      if (chosen) break;
    }
    if (!chosen) throw new Error(`Cannot place cover label: ${city.name}`);
    output.set(city.id, chosen); occupied.push(chosen);
  }
  return output;
}
