import { describe, expect, it } from 'vitest';
import { connectStations } from './interaction';
import { derive, emptyDoc, laneOffset, preserveSurvivingPorts, type Doc, type Station } from './model';
import { edgeGeometry } from './render';

const station = (id: string, x: number, y: number, axis: Station['axis'] = 'h'): Station => ({
  id, x, y, axis, kind: 'step', label: '', labelSide: 'auto',
});
const permutations = <T,>(items: T[]): T[][] => items.length < 2 ? [items]
  : items.flatMap((item, i) => permutations(items.filter((_, j) => j !== i)).map((rest) => [item, ...rest]));

/** The reported layout: green straight, yellow higher than blue, yellow added last. */
function branches(): Doc {
  const doc = emptyDoc();
  doc.lines = [{ id: 'green', name: 'Green', slot: 0 }, { id: 'blue', name: 'Blue', slot: 1 }, { id: 'yellow', name: 'Yellow', slot: 2 }];
  doc.stations = [station('input', -500, 0), station('merge', 0, 0), station('output', 500, 0), station('blue', -300, 400), station('yellow', -500, 160)];
  doc.edges = [
    { id: 'main', from: 'input', to: 'merge', lines: ['green'], bend: 0.5 },
    { id: 'out', from: 'merge', to: 'output', lines: ['green'], bend: 0.5 },
    { id: 'blue-in', from: 'blue', to: 'merge', lines: ['blue'], bend: 0.5 },
    { id: 'yellow-in', from: 'yellow', to: 'merge', lines: ['yellow'], bend: 0.5 },
  ];
  return doc;
}
const order = (doc: Doc, id = 'merge') => derive(doc).stationLines.get(id);

describe('physical lane ordering', () => {
  it.each(permutations(['green', 'blue', 'yellow']))('uses approach positions regardless of legend order (%j, %j, %j)', (...ids) => {
    const doc = branches();
    doc.lines = ids.map((id) => doc.lines.find((l) => l.id === id)!);
    expect(order(doc)).toEqual(['green', 'yellow', 'blue']);
  });

  it.each(permutations(['main', 'out', 'blue-in', 'yellow-in']))('ignores connection creation order (%j, %j, %j, %j)', (...ids) => {
    const doc = branches();
    doc.edges = ids.map((id) => doc.edges.find((e) => e.id === id)!);
    expect(order(doc)).toEqual(['green', 'yellow', 'blue']);
  });

  it('inserts yellow between green and blue while preserving the original green path', () => {
    const doc = branches();
    const yellow = doc.edges.pop()!;
    const before = edgeGeometry(derive(doc), doc.edges[0])!.lines[0].d;
    expect(order(doc)).toEqual(['green', 'blue']);
    const next = connectStations(doc, yellow.from, yellow.to, 'yellow', yellow.id)!.doc;
    const dv = derive(next);
    expect(order(next)).toEqual(['green', 'yellow', 'blue']);
    expect(laneOffset(dv, 'merge', 'green')).toBe(0);
    expect(laneOffset(dv, 'merge', 'yellow')).toBe(12);
    expect(laneOffset(dv, 'merge', 'blue')).toBe(24);
    expect(edgeGeometry(dv, next.edges[0])!.lines[0].d).toBe(before);
  });

  it('reorders when the actual branch positions swap, without changing labels or saved line order', () => {
    const doc = branches();
    doc.stations.find((s) => s.id === 'yellow')!.y = 800;
    const before = structuredClone(doc);
    expect(order(doc)).toEqual(['green', 'blue', 'yellow']);
    expect(doc).toEqual(before);
    const restored = JSON.parse(JSON.stringify(doc)) as Doc;
    expect(order(restored)).toEqual(order(doc));
  });

  it.each(['right', 'vertical', 'above'] as const)('handles %s approaches', (layout) => {
    const doc = branches();
    if (layout === 'right') for (const s of doc.stations) s.x = -s.x;
    if (layout === 'vertical') for (const s of doc.stations) { [s.x, s.y] = [s.y, s.x]; s.axis = 'v'; }
    if (layout === 'above') for (const s of doc.stations) s.y = -s.y;
    expect(order(doc)).toEqual(layout === 'above' ? ['blue', 'yellow', 'green'] : ['green', 'yellow', 'blue']);
  });

  it('extends physical order along a shared run and around a concentric 90 degree turn', () => {
    const doc = branches();
    doc.edges[1].lines = ['green', 'blue', 'yellow'];
    doc.stations.push(station('vertical', 800, 300, 'v'));
    doc.edges.push({ id: 'turn', from: 'output', to: 'vertical', lines: ['green', 'blue', 'yellow'], bend: 0.5 });
    const dv = derive(doc);
    for (const id of ['merge', 'output', 'vertical']) expect(dv.stationLines.get(id)).toEqual(['green', 'yellow', 'blue']);
    expect(laneOffset(dv, 'vertical', 'yellow')).toBe(-12);
    expect(laneOffset(dv, 'vertical', 'blue')).toBe(-24);
    const g = edgeGeometry(dv, doc.edges.find((e) => e.id === 'turn')!)!;
    expect(g.lines.every((line) => line.centre === g.lines[0].centre)).toBe(true);
  });

  it('allows separate junctions to order the same colours differently when the colours do not share a run', () => {
    const doc = branches();
    doc.stations.push(station('blue2', 800, 160), station('yellow2', 800, 400));
    doc.edges.push(
      { id: 'b2', from: 'output', to: 'blue2', lines: ['blue'], bend: 0.5 },
      { id: 'y2', from: 'output', to: 'yellow2', lines: ['yellow'], bend: 0.5 },
    );
    expect(order(doc, 'merge')).toEqual(['green', 'yellow', 'blue']);
    expect(order(doc, 'output')).toEqual(['green', 'blue', 'yellow']);
  });

  it('uses stable legend order when parallel lanes have no distinct physical approaches', () => {
    const doc = branches();
    doc.edges = [{ id: 'parallel', from: 'input', to: 'output', lines: ['yellow', 'blue', 'green'], bend: 0.5 }];
    expect(order(doc, 'input')).toEqual(['green', 'blue', 'yellow']);
    expect(order(doc, 'output')).toEqual(['green', 'blue', 'yellow']);
  });

  it('does not depend on the direction the connections were drawn', () => {
    const doc = branches();
    for (const edge of doc.edges) [edge.from, edge.to] = [edge.to, edge.from];
    expect(order(doc)).toEqual(['green', 'yellow', 'blue']);
  });

  it('keeps the resolved order when removing a branch makes a shared pair physically indistinguishable', () => {
    const doc = branches();
    doc.edges[1].lines = ['green', 'blue', 'yellow'];
    expect(order(doc)).toEqual(['green', 'yellow', 'blue']);
    const before = edgeGeometry(derive(doc), doc.edges[1])!;
    const next = structuredClone(doc);
    next.edges = next.edges.filter((e) => e.id !== 'yellow-in');
    preserveSurvivingPorts(doc, next);
    expect(order(next)).toEqual(['green', 'yellow', 'blue']);
    const after = edgeGeometry(derive(next), next.edges.find((e) => e.id === 'out')!)!;
    expect(after.lines.map((line) => line.d)).toEqual(before.lines.map((line) => line.d));
    expect(order(JSON.parse(JSON.stringify(next)) as Doc)).toEqual(order(next));
  });

  it('uses physical approaches ahead of a previously remembered order', () => {
    const doc = branches();
    doc.stations.find((s) => s.id === 'merge')!.laneOrder = ['blue', 'yellow', 'green'];
    expect(order(doc)).toEqual(['green', 'yellow', 'blue']);
  });

  it('places a perpendicular branch outside the shallower approaches', () => {
    const doc = branches();
    doc.stations.find((s) => s.id === 'blue')!.x = 0;
    expect(order(doc)).toEqual(['green', 'yellow', 'blue']);
  });
});
