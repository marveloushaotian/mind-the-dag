import { describe, expect, it } from 'vitest';
import { offsetPolyline, roundedPath, routeCentre } from './geometry';

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
