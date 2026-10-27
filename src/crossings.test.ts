import { describe, expect, it } from 'vitest';
import { derive, emptyDoc, type Station } from './model';
import { edgeGeometry, findCrossings, type EdgeGeometry } from './render';

const st = (id: string, x: number, y: number, axis: 'h' | 'v' = 'h'): Station => ({ id, x, y, label: id, kind: 'step', axis, labelSide: 'auto' });

describe('crossings', () => {
  const d = emptyDoc();
  d.lines = [{ id: 'a', name: 'A', slot: 0 }, { id: 'b', name: 'B', slot: 1 }, { id: 'c', name: 'C', slot: 2 }];
  d.stations = [st('h1', 0, 96), st('h2', 400, 96), st('v1', 200, 0, 'v'), st('v2', 200, 192, 'v'), st('x', 400, 0)];
  d.edges = [
    { id: 'H', from: 'h1', to: 'h2', lines: ['a', 'b'], bend: 0.5 },
    { id: 'V', from: 'v1', to: 'v2', lines: ['c'], bend: 0.5 },
    { id: 'S', from: 'h2', to: 'x', lines: ['a'], bend: 0.5 },
  ];
  const dv = derive(d);
  const geoms = new Map<string, EdgeGeometry>();
  for (const e of d.edges) geoms.set(e.id, edgeGeometry(dv, e)!);
  const cs = findCrossings(d, geoms);
  it('cuts the connection with fewer lines', () => {
    expect(cs).toHaveLength(1);
    expect(cs[0].under).toBe('V');
  });
  it('leaves a 4 px gap each side of the two-line bundle', () => {
    const ys = cs[0].poly.map((p) => p.y);
    // bundle is 22 px wide (two lines, 12 apart, 10 wide) centred on y = 96 → gap from 81 to 111
    expect(Math.min(...ys)).toBeCloseTo(81, 5);
    expect(Math.max(...ys)).toBeCloseTo(111, 5);
  });
});
