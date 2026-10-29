import { describe, expect, it } from 'vitest';
import { hollowPath, offsetPolyline, roundedPath, routeCentre } from './geometry';

describe('routeCentre', () => {
  it('runs straight when ports are level', () => {
    expect(routeCentre({ x: 0, y: 0 }, 'h', { x: 100, y: 0 }, 'h')).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
  });
  it('uses one 45° run between two horizontal ports', () => {
    const pts = routeCentre({ x: 0, y: 0 }, 'h', { x: 200, y: -80 }, 'h', 0.5);
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 140, y: -80 },
      { x: 200, y: -80 },
    ]);
  });
  it('turns once at 90° between mixed axes', () => {
    expect(routeCentre({ x: 0, y: 0 }, 'h', { x: 100, y: 100 }, 'v')).toHaveLength(3);
  });
});

describe('roundedPath', () => {
  it('offsets parallel lines by the lane distance', () => {
    const o = offsetPolyline([{ x: 0, y: 0 }, { x: 100, y: 0 }], 12);
    expect(o[0].y).toBeCloseTo(-12);
  });
  it('draws concentric arcs: inner radius = R - offset, outer = R + offset', () => {
    const pts = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }];
    const inner = roundedPath(pts, -12, { r45: 40, r90: 32 });
    const outer = roundedPath(pts, 12, { r45: 40, r90: 32 });
    expect(inner).toContain('A 20 20');
    expect(outer).toContain('A 44 44');
  });
  it('matches the reference 45° bend from the design canvas', () => {
    const d = roundedPath(
      [{ x: 88, y: 248 }, { x: 384, y: 248 }, { x: 512, y: 120 }, { x: 1064, y: 120 }],
      0,
      { r45: 40, r90: 32 },
    );
    expect(d.startsWith('M 88 248 L 367.43 248 A 40 40 0 0 0 395.72 236.28')).toBe(true);
  });
});

describe('hollowPath', () => {
  const radii = { r45: 40, r90: 32 };
  it('joins both walls and caps in one closed contour without butt seams', () => {
    const d = hollowPath([{ x: 0, y: 0 }, { x: 100, y: 0 }], 0, radii, 10, 3);
    expect(d).toBe('M 0 -3.5 L 100 -3.5 A 3.5 3.5 0 0 1 100 3.5 L 0 3.5 A 3.5 3.5 0 0 1 0 -3.5 Z');
    expect(d.match(/M /g)).toHaveLength(1);
  });

  it.each([1, -1])('keeps a 7 px channel around short opposing turns (%s)', (direction) => {
    const d = hollowPath([{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 16 * direction }, { x: 120, y: 16 * direction }], 0, radii, 10, 3);
    const arcs = [...d.matchAll(/A ([\d.]+) [\d.]+ 0 0 ([01]) ([\d.-]+) ([\d.-]+)/g)];
    const firstRadius = Number(arcs[0][1]);
    const secondRadius = Number(arcs[1][1]);
    expect(Math.abs(firstRadius - secondRadius)).toBeCloseTo(7);
    expect((firstRadius + secondRadius) / 2).toBeCloseTo(8);
    expect(Number(arcs[0][3]) - firstRadius).toBeCloseTo(52);
    expect(d).not.toMatch(/NaN|Infinity/);
  });

  it('ignores duplicate points and draws nothing for coincident ports', () => {
    const p = { x: 12, y: 18 };
    expect(hollowPath([p, p], 0, radii, 10, 3)).toBe('');
    expect(hollowPath([p, p, { x: 112, y: 18 }], 0, radii, 10, 3)).not.toMatch(/NaN|Infinity/);
  });
});

import { derive, emptyDoc, type Station } from './model';

describe('lane orientation at 90° turns', () => {
  const st = (id: string, x: number, y: number, axis: 'h' | 'v'): Station => ({ id, x, y, label: id, kind: 'step', axis, labelSide: 'auto' });
  it('keeps a bundle concentric when it turns down on the right and down on the left', () => {
    const d = emptyDoc();
    d.lines = [{ id: 'a', name: 'A', slot: 0 }, { id: 'b', name: 'B', slot: 1 }];
    d.stations = [st('h1', 0, 0, 'h'), st('v1', 200, 120, 'v'), st('h2', 0, 240, 'h'), st('v2', -200, 360, 'v')];
    d.edges = [
      { id: '1', from: 'h1', to: 'v1', lines: ['a', 'b'], bend: 0.5 },
      { id: '2', from: 'v1', to: 'h2', lines: ['a', 'b'], bend: 0.5 },
      { id: '3', from: 'h2', to: 'v2', lines: ['a', 'b'], bend: 0.5 },
    ];
    const s = derive(d).sigma;
    // right then down is a clockwise turn: the top lane ends up on the outside (east)
    expect(s.get('h1')).toBe(1);
    expect(s.get('v1')).toBe(-1);
    // coming back leftwards the bundle is mirrored, then turns down on the left
    expect(s.get('h2')).toBe(-1);
    expect(s.get('v2')).toBe(-1);
  });
});
