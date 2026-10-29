import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { connectStations, previewStationMerge, snapTarget } from './interaction';
import { changeStationKind, derive, emptyDoc, laneOffset, preserveSurvivingPorts, reverseEdge, stationMarker, type Doc, type Station } from './model';
import { contentBounds, edgeGeometry, MetroMap } from './render';

const station = (id: string, x: number, y: number, axis: Station['axis'] = 'h'): Station => ({
  id, x, y, axis, label: '', labelSide: 'above', kind: 'step',
});
function map(to: Station = station('B', 400, 0)): Doc {
  const doc = emptyDoc();
  doc.legend.show = false;
  doc.lines = [{ id: 'a', name: 'A', slot: 0 }, { id: 'b', name: 'B', slot: 1 }, { id: 'c', name: 'C', slot: 2 }];
  doc.stations = [station('A', 0, 0), to, station('C', 800, 180)];
  return doc;
}
const path = (doc: Doc, edge: string, line = 'a') => edgeGeometry(derive(doc), doc.edges.find((e) => e.id === edge)!)!.lines.find((l) => l.id === line)!.d;

describe('stable routing anchors', () => {
  it.each([
    station('B', 400, 0), station('B', 400, 160), station('B', 400, -160),
    station('B', -400, 160), station('B', 120, 400),
    station('B', 400, 160, 'v'), station('B', -400, -160, 'v'),
  ])('keeps the original complete path when another line joins ($x, $y, $axis)', (to) => {
    const first = connectStations(map(to), 'A', 'B', 'a', 'ab')!.doc;
    const before = path(first, 'ab');
    const extra = connectStations(first, 'A', 'B', 'b', 'unused')!.doc;
    const third = connectStations(extra, 'A', 'B', 'c', 'unused')!.doc;
    expect(path(extra, 'ab')).toBe(before);
    expect(path(third, 'ab')).toBe(before);
  });

  it('keeps a curved route intact when a separate branch joins one end', () => {
    const first = connectStations(map(station('B', 400, 160)), 'A', 'B', 'a', 'ab')!.doc;
    const before = path(first, 'ab');
    const next = connectStations(first, 'C', 'B', 'b', 'cb')!.doc;
    expect(path(next, 'ab')).toBe(before);
    expect(next.stations.map((s) => s.kind)).toEqual(['step', 'step', 'step']);
  });

  it('keeps a later-ordered original line anchored when an earlier line joins', () => {
    const first = connectStations(map(), 'A', 'B', 'b', 'ab')!.doc;
    const before = path(first, 'ab', 'b');
    const next = connectStations(first, 'A', 'B', 'a', 'unused')!.doc;
    expect(path(next, 'ab', 'b')).toBe(before);
    expect(laneOffset(derive(next), 'B', 'a')).toBe(-12);
    expect(laneOffset(derive(next), 'B', 'b')).toBe(0);
  });

  it('preserves the destination connection and bend when an older source edge merges into it', () => {
    const doc = map(station('B', 400, 160));
    doc.stations.push(station('D', 420, 180));
    const source = connectStations(doc, 'A', 'D', 'b', 'source')!.doc;
    const target = connectStations(source, 'A', 'B', 'a', 'target')!.doc;
    target.edges.find((e) => e.id === 'target')!.bend = 0.2;
    const before = path(target, 'target');
    const merged = previewStationMerge(target, 'D', 'B')!;
    expect(merged.edges).toHaveLength(1);
    expect(merged.edges[0]).toMatchObject({ id: 'target', from: 'A', to: 'B', bend: 0.2, lines: ['a', 'b'] });
    expect(path(merged, 'target')).toBe(before);
    expect(derive(merged).stationAnchors.get('B')).toBe('a');
  });

  it('infers a deterministic anchor for old maps without rewriting them', () => {
    const doc = map();
    doc.edges = [{ id: 'ab', from: 'A', to: 'B', lines: ['b', 'a'], bend: 0.5 }];
    const before = structuredClone(doc);
    const dv = derive(doc);
    expect(laneOffset(dv, 'A', 'b')).toBe(0);
    expect(laneOffset(dv, 'A', 'a')).toBe(-12);
    expect(doc).toEqual(before);
  });

  it('keeps an established anchor after its first edge is removed and recovers from a deleted line', () => {
    let doc = connectStations(map(), 'A', 'B', 'a', 'first')!.doc;
    doc = connectStations(doc, 'A', 'C', 'a', 'second')!.doc;
    doc = connectStations(doc, 'A', 'C', 'b', 'unused')!.doc;
    doc.edges = doc.edges.filter((e) => e.id !== 'first');
    expect(laneOffset(derive(doc), 'A', 'a')).toBe(0);
    doc.lines = doc.lines.filter((l) => l.id !== 'a');
    expect(laneOffset(derive(doc), 'A', 'b')).toBe(0);
  });

  it('keeps wide outer lanes concentric without enlarging the original corner', () => {
    const doc = map(station('B', 400, 160, 'v'));
    doc.lines.push({ id: 'd', name: 'D', slot: 3 });
    let next = connectStations(doc, 'A', 'B', 'd', 'ab')!.doc;
    const before = path(next, 'ab', 'd');
    for (const id of ['a', 'b', 'c']) next = connectStations(next, 'A', 'B', id, 'unused')!.doc;
    const geometry = edgeGeometry(derive(next), next.edges[0])!;
    expect(path(next, 'ab', 'd')).toBe(before);
    expect(geometry.lines.find((l) => l.id === 'a')!.d).toContain('A 68 68');
    expect(geometry.lines.every((l) => l.centre === geometry.lines[0].centre)).toBe(true);
  });

  it('gives an exhausted inner lane a rounded route while preserving the original corner', () => {
    const doc = map(station('B', 400, 160, 'v'));
    doc.lines.push({ id: 'd', name: 'D', slot: 3 });
    let next = connectStations(doc, 'A', 'B', 'a', 'ab')!.doc;
    const before = path(next, 'ab');
    for (const id of ['b', 'c', 'd']) next = connectStations(next, 'A', 'B', id, 'unused')!.doc;
    expect(path(next, 'ab')).toBe(before);
    const inner = path(next, 'ab', 'd');
    expect(inner).toContain('A 32 32');
    expect(inner).toMatch(/^M 0 36 .* L 364 160$/);
  });
});

describe('asymmetric station footprints', () => {
  it.each(['step', 'merge', 'start', 'stop'] as const)('extends a %s below the original lane without moving its top', (kind) => {
    let doc = connectStations(map(), 'A', 'B', 'a', 'ab')!.doc;
    doc.stations[1].kind = kind;
    const initial = stationMarker(derive(doc), doc.stations[1]);
    doc = connectStations(doc, 'A', 'B', 'b', 'unused')!.doc;
    const extended = stationMarker(derive(doc), doc.stations[1]);
    expect(extended.y0).toBe(initial.y0);
    expect(extended.y1).toBe(initial.y1 + 12);
    expect(doc.stations[1]).toMatchObject({ x: 400, y: 0 });
  });

  it('uses the extended footprint for snapping, the glyph, selection and export bounds', () => {
    let doc = connectStations(map(), 'A', 'B', 'a', 'ab')!.doc;
    doc = connectStations(doc, 'A', 'B', 'b', 'unused')!.doc;
    doc = connectStations(doc, 'A', 'B', 'c', 'unused')!.doc;
    const dv = derive(doc);
    expect(snapTarget(doc, dv, { x: 400, y: 47 }, 1, null)?.id).toBe('B');
    expect(snapTarget(doc, dv, { x: 400, y: -26 }, 1, null)).toBeNull();
    const svg = renderToStaticMarkup(<MetroMap doc={doc} selected={new Set(['station:B'])} />);
    expect(svg).toContain('x="391" y="-9" width="18" height="42"');
    expect(svg).toContain('x="384" y="-16" width="32" height="56"');
    expect(contentBounds(doc)!.y1).toBeGreaterThanOrEqual(stationMarker(dv, doc.stations[1]).y1 + 40);
  });

  it('respects manually chosen terminal roles even with connections on both sides', () => {
    const doc = map();
    doc.stations = [station('A', -200, 0), station('B', 0, 0), station('C', 200, 0)];
    for (const kind of ['start', 'stop'] as const) {
      changeStationKind(doc.stations[1], kind);
      const left = connectStations(doc, 'A', 'B', 'a', 'ab')!.doc;
      const joined = connectStations(left, 'B', 'C', 'a', 'bc')!.doc;
      expect(joined.stations[1]).toMatchObject({ kind, file: { ext: 'fasta', count: 1 } });
      const svg = renderToStaticMarkup(<MetroMap doc={joined} exporting />);
      expect(svg).toContain(`data-sel="station:B" data-station-kind="${kind}"`);
      expect(svg).toContain('>fasta</text>');
    }
  });
});

describe('removing lanes without recentering survivors', () => {
  function remove(doc: Doc, line: string) {
    const next = structuredClone(doc);
    next.lines = next.lines.filter((l) => l.id !== line);
    next.edges = next.edges.map((e) => ({ ...e, lines: e.lines.filter((id) => id !== line) })).filter((e) => e.lines.length);
    preserveSurvivingPorts(doc, next);
    return next;
  }

  it.each([station('B', 400, 0), station('B', 400, 160), station('B', 400, 160, 'v'), station('B', -400, -160, 'v')])('keeps the entire surviving path after removing the original line ($x, $y, $axis)', (to) => {
    let doc = connectStations(map(to), 'A', 'B', 'a', 'ab')!.doc;
    doc = connectStations(doc, 'A', 'B', 'b', 'unused')!.doc;
    const before = path(doc, 'ab', 'b');
    const next = remove(doc, 'a');
    expect(path(next, 'ab', 'b')).toBe(before);
    expect(next.stations[0].anchorLine).toBe('b');
    const roundtrip = JSON.parse(JSON.stringify(next)) as Doc;
    expect(path(roundtrip, 'ab', 'b')).toBe(before);
  });

  it('preserves surviving branches when their anchor connection is deleted', () => {
    let doc = connectStations(map(station('B', 400, 160)), 'A', 'B', 'a', 'ab')!.doc;
    doc = connectStations(doc, 'B', 'C', 'b', 'bc')!.doc;
    const before = path(doc, 'bc', 'b');
    const next = structuredClone(doc);
    next.edges = next.edges.filter((e) => e.id !== 'ab');
    preserveSurvivingPorts(doc, next);
    expect(path(next, 'bc', 'b')).toBe(before);
  });

  it('does not accumulate reference offsets over repeated remove/add cycles', () => {
    let doc = connectStations(map(station('B', 400, 160)), 'A', 'B', 'a', 'ab')!.doc;
    doc = connectStations(doc, 'A', 'B', 'b', 'unused')!.doc;
    const before = path(doc, 'ab', 'b');
    for (let i = 0; i < 5; i++) {
      doc = remove(doc, 'a');
      expect(path(doc, 'ab', 'b')).toBe(before);
      doc.lines.unshift({ id: 'a', name: 'A', slot: 0 });
      doc = connectStations(doc, 'A', 'B', 'a', 'unused')!.doc;
      expect(path(doc, 'ab', 'b')).toBe(before);
    }
  });

  it('keeps the established path when a non-anchor lane is removed', () => {
    let doc = connectStations(map(station('B', 400, 160)), 'A', 'B', 'a', 'ab')!.doc;
    for (const id of ['b', 'c']) doc = connectStations(doc, 'A', 'B', id, 'unused')!.doc;
    expect(path(remove(doc, 'b'), 'ab')).toBe(path(doc, 'ab'));
    expect(path(remove(doc, 'c'), 'ab')).toBe(path(doc, 'ab'));
  });

  it('reverses retained reference ports without moving the surviving lane', () => {
    let doc = connectStations(map(station('B', 400, 160, 'v')), 'A', 'B', 'a', 'ab')!.doc;
    doc = connectStations(doc, 'A', 'B', 'b', 'unused')!.doc;
    doc = remove(doc, 'a');
    const before = path(doc, 'ab', 'b');
    reverseEdge(doc.edges[0]);
    expect(path(doc, 'ab', 'b')).toMatch(/^M 388 160 .* L 0 12$/);
    reverseEdge(doc.edges[0]);
    expect(path(doc, 'ab', 'b')).toBe(before);
  });

  it.each(['disconnect', 'delete'] as const)('keeps a vertical bundle oriented after its horizontal root is removed (%s)', (operation) => {
    const doc = map(station('B', 400, 160, 'v'));
    doc.stations[2] = station('C', 400, 480, 'v');
    doc.edges = [
      { id: 'ab', from: 'A', to: 'B', lines: ['a', 'b', 'c'], bend: 0.5 },
      { id: 'bc', from: 'B', to: 'C', lines: ['a', 'b', 'c'], bend: 0.5 },
    ];
    const before = ['a', 'b', 'c'].map((id) => path(doc, 'bc', id));
    const next = structuredClone(doc);
    next.edges = next.edges.filter((e) => e.id !== 'ab');
    if (operation === 'delete') next.stations = next.stations.filter((s) => s.id !== 'A');
    preserveSurvivingPorts(doc, next);
    expect(['a', 'b', 'c'].map((id) => path(next, 'bc', id))).toEqual(before);
    expect(derive(next).sigma.get('B')).toBe(-1);
  });

  it('keeps the target bundle orientation when a horizontal source joins a vertical component', () => {
    const doc = map();
    doc.stations = [station('S', 0, 0), station('F', 420, 180), station('T', 400, 160, 'v'), station('U', 400, 480, 'v')];
    doc.edges = [
      { id: 'source', from: 'S', to: 'F', lines: ['c'], bend: 0.5 },
      { id: 'target', from: 'T', to: 'U', lines: ['a', 'b'], bend: 0.5 },
    ];
    const before = ['a', 'b'].map((id) => path(doc, 'target', id));
    const next = previewStationMerge(doc, 'F', 'T')!;
    expect(['a', 'b'].map((id) => path(next, 'target', id))).toEqual(before);
    expect(derive(next).sigma.get('T')).toBe(1);
  });

  it('keeps a partially detached curve when the removed lane still visits both endpoints elsewhere', () => {
    let doc = connectStations(map(station('B', 400, 160)), 'A', 'B', 'a', 'ab')!.doc;
    doc = connectStations(doc, 'A', 'B', 'b', 'unused')!.doc;
    doc.stations.push(station('D', 800, 400));
    doc = connectStations(doc, 'A', 'C', 'a', 'ac')!.doc;
    doc = connectStations(doc, 'B', 'D', 'a', 'bd')!.doc;
    const before = path(doc, 'ab', 'b');
    const next = structuredClone(doc);
    next.edges.find((e) => e.id === 'ab')!.lines = ['b'];
    preserveSurvivingPorts(doc, next);
    expect(path(next, 'ab', 'b')).toBe(before);
    expect(next.stations.map((s) => [s.x, s.y])).toEqual(doc.stations.map((s) => [s.x, s.y]));
  });
});
