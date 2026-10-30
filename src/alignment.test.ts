import { describe, expect, it } from 'vitest';
import { alignedPoint, alignAnchors, bendAtCoordinate, bendCoordinate, pointAnchors, sectionAnchors, stationAlignmentTargets } from './alignment';
import { emptyDoc } from './model';

describe('weak object alignment', () => {
  it.each([0.25, 0.5, 1, 1.5, 3])('acquires at four screen pixels at zoom %s, not four world units', (zoom) => {
    const targets = pointAnchors('fixed', { x: 100, y: 200 });
    const near = { x: 100 + 3.9 / zoom, y: 200 - 3.9 / zoom };
    const result = alignAnchors(pointAnchors('moving', near), targets, zoom);
    expect(alignedPoint(near, near, result)).toEqual({ x: 100, y: 200 });
    expect(Object.keys(result.locks)).toEqual(['x', 'y']);
    expect(alignAnchors(pointAnchors('moving', { x: 100 + 4.1 / zoom, y: 230 }), targets, zoom).locks).toEqual({});
  });
  it('holds through minor jitter, releases at seven screen pixels and reacquires independently', () => {
    const targets = pointAnchors('fixed', { x: 100, y: 100 });
    const acquired = alignAnchors(pointAnchors('moving', { x: 103, y: 130 }), targets, 1);
    const held = alignAnchors(pointAnchors('moving', { x: 106.5, y: 130 }), targets, 1, acquired.locks);
    expect(held.locks.x).toEqual(acquired.locks.x);
    const released = alignAnchors(pointAnchors('moving', { x: 107.5, y: 130 }), targets, 1, held.locks);
    expect(released.locks).toEqual({});
    expect(alignAnchors(pointAnchors('moving', { x: 106.5, y: 130 }), targets, 1).locks).toEqual({});
  });
  it('bypasses a held alignment immediately without changing ordinary grid coordinates', () => {
    const p = { x: 103, y: 104 };
    const targets = pointAnchors('fixed', { x: 100, y: 100 });
    const acquired = alignAnchors(pointAnchors('moving', p), targets, 1);
    const bypassed = alignAnchors(pointAnchors('moving', p), targets, 1, acquired.locks, true);
    expect(bypassed.locks).toEqual({});
    expect(alignedPoint(p, { x: 104, y: 102 }, bypassed)).toEqual({ x: 104, y: 102 });
  });
  it('lets an exact imported coordinate win over the grid only on the acquired axis', () => {
    const raw = { x: 99, y: 140 };
    const result = alignAnchors(pointAnchors('moving', raw), pointAnchors('fixed', { x: 100.5, y: 200 }), 1);
    expect(alignedPoint(raw, { x: 96, y: 138 }, result)).toEqual({ x: 100.5, y: 138 });
  });
  it('uses the closest target and retains it when a competing target becomes marginally closer', () => {
    const targets = [...pointAnchors('a', { x: 100, y: 0 }), ...pointAnchors('b', { x: 106, y: 0 })];
    const first = alignAnchors(pointAnchors('moving', { x: 101, y: 40 }), targets, 1);
    const next = alignAnchors(pointAnchors('moving', { x: 104, y: 40 }), targets, 1, first.locks);
    expect(next.locks.x?.target).toBe('a:x');
    expect(next.offset.x).toBe(-4);
  });
  it('uses a shared translation for a group, including an alignment acquired by a non-leading station', () => {
    const moving = [...pointAnchors('lead', { x: 40, y: 40 }), ...pointAnchors('other', { x: 99, y: 60 })];
    const result = alignAnchors(moving, pointAnchors('fixed', { x: 100, y: 200 }), 1);
    expect(result.locks.x?.moving).toBe('other:x');
    expect(result.offset.x).toBe(1);
    expect(alignedPoint({ x: 40, y: 40 }, { x: 40, y: 42 }, result)).toEqual({ x: 41, y: 42 });
  });
  it('aligns opposite section edges without changing width or height', () => {
    const fixed = { id: 'fixed', x: 100, y: 20, w: 200, h: 100 };
    const moving = { id: 'moving', x: 297, y: 200, w: 150, h: 90 };
    const result = alignAnchors(sectionAnchors(moving), sectionAnchors(fixed), 1);
    expect(result.offset.x).toBe(3);
    expect(result.locks.x).toEqual({ moving: 'section:moving:left', target: 'section:fixed:right' });
    expect(moving).toEqual({ id: 'moving', x: 297, y: 200, w: 150, h: 90 });
  });
  it('drops stale locks when a target or moving anchor disappears', () => {
    const moving = pointAnchors('moving', { x: 100, y: 100 });
    const targets = pointAnchors('fixed', { x: 100, y: 100 });
    const acquired = alignAnchors(moving, targets, 1);
    expect(alignAnchors(moving, [], 1, acquired.locks).locks).toEqual({});
    expect(alignAnchors([], targets, 1, acquired.locks).locks).toEqual({});
  });
});

describe('route alignment references', () => {
  function map() {
    const doc = emptyDoc();
    doc.stations = [
      { id: 'a', x: 0, y: 0, axis: 'h', kind: 'step', label: '', labelSide: 'auto' },
      { id: 'b', x: 300, y: 100, axis: 'h', kind: 'step', label: '', labelSide: 'auto' },
      { id: 'c', x: 300, y: 250, axis: 'v', kind: 'step', label: '', labelSide: 'auto' },
    ];
    doc.edges = [{ id: 'ab', from: 'a', to: 'b', lines: ['l1'], bend: 0.5 }, { id: 'bc', from: 'b', to: 'c', lines: ['l1'], bend: 0.5 }];
    return doc;
  }
  it('excludes all moving stations and their changing routes, while keeping independent targets', () => {
    const doc = map();
    const before = structuredClone(doc);
    const targets = stationAlignmentTargets(doc, ['a', 'b']);
    expect(targets.map((t) => t.id)).toEqual(['station:c:x', 'station:c:y']);
    expect(doc).toEqual(before);
    doc.stations[2].x = 500;
    expect(targets[0].value).toBe(300);
  });
  it('includes horizontal and vertical route segments and only requests bend references for bend gestures', () => {
    const targets = stationAlignmentTargets(map());
    expect(targets.some((t) => t.id.startsWith('edge:ab:') && t.axis === 'y')).toBe(true);
    expect(targets.some((t) => t.id.startsWith('edge:bc:') && t.axis === 'x')).toBe(true);
    expect(targets.some((t) => t.id.startsWith('bend:'))).toBe(false);
    expect(stationAlignmentTargets(map(), [], 'bc', true).some((t) => t.id === 'bend:ab')).toBe(true);
    expect(stationAlignmentTargets(map(), [], 'ab', true).some((t) => t.id.includes(':ab'))).toBe(false);
  });
  it.each([
    [{ x: 0, y: 0 }, { x: 300, y: 100 }, 'h'],
    [{ x: 300, y: 100 }, { x: 0, y: 0 }, 'h'],
    [{ x: 0, y: 0 }, { x: 100, y: 300 }, 'h'],
    [{ x: 0, y: 300 }, { x: 100, y: 0 }, 'v'],
    [{ x: 0, y: 0 }, { x: 300, y: 100 }, 'v'],
  ] as const)('converts bend positions exactly in either flow direction (%j, %j, %s)', (A, B, axis) => {
    for (const bend of [0, 0.12345, 0.5, 0.87654, 1]) expect(bendAtCoordinate(A, B, axis, bendCoordinate(A, B, axis, bend))).toBeCloseTo(bend, 10);
  });
  it('handles a degenerate bend and clamps unreachable positions', () => {
    expect(bendAtCoordinate({ x: 0, y: 0 }, { x: 100, y: 100 }, 'h', 50)).toBe(0.5);
    expect(bendAtCoordinate({ x: 0, y: 0 }, { x: 300, y: 100 }, 'h', -100)).toBe(0);
    expect(bendAtCoordinate({ x: 0, y: 0 }, { x: 300, y: 100 }, 'h', 400)).toBe(1);
  });
});
