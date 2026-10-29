import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { connectionTarget, connectStations, previewStationMerge, snapTarget } from './interaction';
import { derive, emptyDoc, markerExtent, mergeStations, type Doc, type Station, type StationKind } from './model';
import { edgeGeometry, MetroMap } from './render';

const station = (id: string, x: number, y = 0, axis: Station['axis'] = 'h'): Station => ({
  id, x, y, axis, kind: 'step', label: '', labelSide: 'auto',
});

describe('station fusion', () => {
  const kinds: StationKind[] = ['step', 'merge', 'junction', 'start', 'stop'];
  it.each(kinds.flatMap((from) => kinds.map((into) => [from, into] as const)))('merges %s into %s, keeping the target identity and type', (fromKind, intoKind) => {
    const doc = map();
    doc.stations[0].kind = fromKind;
    doc.stations[1].kind = intoKind;
    doc.edges = [
      { id: 'ab', from: 'A', to: 'B', lines: ['a'], bend: 0.5 },
      { id: 'ac', from: 'A', to: 'C', lines: ['a'], bend: 0.5 },
      { id: 'bc', from: 'B', to: 'C', lines: ['b'], bend: 0.5 },
    ];
    const before = structuredClone(doc);
    const preview = previewStationMerge(doc, 'A', 'B')!;
    expect(doc).toEqual(before);
    expect(preview.stations).toHaveLength(2);
    expect(preview.stations.find((s) => s.id === 'B')).toMatchObject({ kind: intoKind, axis: 'v', x: 160, y: 120 });
    expect(preview.edges).toHaveLength(1);
    expect(new Set(preview.edges[0].lines)).toEqual(new Set(['a', 'b']));
    expect(preview.edges[0]).toMatchObject({ from: 'B', to: 'C' });
    mergeStations(before, 'A', 'B');
    expect(preview).toEqual(before);
  });

  it('copies a missing label and badge only in the provisional result', () => {
    const doc = map();
    doc.stations[0].label = 'Input';
    doc.stations[0].file = { ext: 'fastq', count: 2 };
    const preview = previewStationMerge(doc, 'A', 'B')!;
    expect(preview.stations.find((s) => s.id === 'B')).toMatchObject({ label: 'Input', file: { ext: 'fastq', count: 2 } });
    expect(doc.stations[1]).toMatchObject({ label: '' });
    expect(doc.stations[1].file).toBeUndefined();
  });

  it('does not invent a fusion target for loops or removed stations', () => {
    const doc = map();
    expect(previewStationMerge(doc, 'A', 'A')).toBeNull();
    expect(previewStationMerge(doc, 'A', 'removed')).toBeNull();
    expect(previewStationMerge(doc, 'removed', 'B')).toBeNull();
  });
});
function map(): Doc {
  const doc = emptyDoc();
  doc.legend.show = false;
  doc.lines = [{ id: 'a', name: 'A', slot: 0 }, { id: 'b', name: 'B', slot: 1 }];
  doc.stations = [station('A', 0), station('B', 160, 120, 'v'), station('C', 280, 120, 'v')];
  return doc;
}

describe('station snapping', () => {
  it.each([0.25, 1, 4])('uses the same screen-space capture distance at %s× zoom', (zoom) => {
    const doc = map();
    const dv = derive(doc);
    const edge = markerExtent('step', 0).along;
    expect(snapTarget(doc, dv, { x: edge + 13 / zoom, y: 0 }, zoom, null)?.id).toBe('A');
    expect(snapTarget(doc, dv, { x: edge + 15 / zoom, y: 0 }, zoom, null)).toBeNull();
  });

  it('holds a target near its boundary instead of flickering between neighbours', () => {
    const doc = map();
    doc.stations = [station('A', 0), station('B', 48)];
    const dv = derive(doc);
    expect(snapTarget(doc, dv, { x: 28, y: 0 }, 1, null)?.id).toBe('B');
    expect(snapTarget(doc, dv, { x: 28, y: 0 }, 1, 'A')?.id).toBe('A');
    expect(snapTarget(doc, dv, { x: 34, y: 0 }, 1, 'A')?.id).toBe('B');
  });

  it('excludes the source and safely releases a removed target', () => {
    const doc = map();
    const dv = derive(doc);
    expect(snapTarget(doc, dv, { x: 0, y: 0 }, 1, 'A', 'A')).toBeNull();
    expect(snapTarget(doc, dv, { x: 160, y: 120 }, 1, 'removed')?.id).toBe('B');
  });

  it('captures the full end of a vertical shared station, not only its centre', () => {
    const doc = map();
    doc.edges = [{ id: 'e', from: 'A', to: 'B', lines: ['a', 'b'], bend: 0.5 }];
    // A clockwise turn extends the capsule west of the original vertical line.
    expect(snapTarget(doc, derive(doc), { x: 130, y: 120 }, 1, null)?.id).toBe('B');
  });
});

describe('click-to-connect', () => {
  it('keeps a mouse-acquired label target when the provisional file layout moves it', () => {
    const doc = map();
    expect(connectionTarget(doc, derive(doc), { x: 160, y: 40 }, 1,
      { hitId: null, hoverId: 'B', sourceId: 'A', pointerType: 'mouse' })?.id).toBe('B');
  });

  it('uses a directly hit station before a previously acquired label', () => {
    const doc = map();
    expect(connectionTarget(doc, derive(doc), { x: 280, y: 120 }, 1,
      { hitId: 'C', hoverId: 'B', sourceId: 'A', pointerType: 'mouse' })?.id).toBe('C');
  });

  it('does not use stale mouse acquisition for touch or a removed station', () => {
    const doc = map();
    const p = { x: 1000, y: 1000 };
    expect(connectionTarget(doc, derive(doc), p, 1,
      { hitId: null, hoverId: 'B', sourceId: 'A', pointerType: 'touch' })).toBeNull();
    expect(connectionTarget(doc, derive(doc), p, 1,
      { hitId: null, hoverId: 'removed', sourceId: 'A', pointerType: 'mouse' })).toBeNull();
  });

  it('previews without mutating the saved document', () => {
    const doc = map();
    const original = structuredClone(doc);
    const candidate = connectStations(doc, 'A', 'B', 'a', 'preview')!;
    expect(candidate.doc.edges).toHaveLength(1);
    expect(doc).toEqual(original);
    expect(candidate.doc.stations[0].anchorLine).toBe('a');
    expect(candidate.doc.stations[1].anchorLine).toBe('a');
    expect(candidate.doc.stations[2]).toBe(doc.stations[2]);
  });

  it('adds a line to a reverse connection, preserving its bend and direction', () => {
    const doc = map();
    doc.edges = [{ id: 'existing', from: 'B', to: 'A', lines: ['b'], bend: 0.2 }];
    const change = connectStations(doc, 'A', 'B', 'a', 'unused')!;
    expect(change.doc.edges).toEqual([{ id: 'existing', from: 'B', to: 'A', lines: ['b', 'a'], bend: 0.2 }]);
    expect(doc.edges[0].lines).toEqual(['b']);
    expect(change.edgeId).toBe('existing');
  });

  it('makes repeated connections a no-op, without removing a line from a bundle', () => {
    const doc = map();
    doc.edges = [{ id: 'e', from: 'A', to: 'B', lines: ['a', 'b'], bend: 0.5 }];
    expect(connectStations(doc, 'A', 'B', 'a', 'unused')).toBeNull();
    expect(connectStations(doc, 'B', 'A', 'a', 'unused')).toBeNull();
    expect(doc.edges[0].lines).toEqual(['a', 'b']);
  });

  it('rejects loops, removed stations and removed lines', () => {
    const doc = map();
    for (const [from, to, line] of [['A', 'A', 'a'], ['A', 'missing', 'a'], ['A', 'B', 'missing']]) {
      expect(connectStations(doc, from, to, line, 'e')).toBeNull();
    }
  });

  it('keeps all paths identical when a multi-line 90° preview is committed', () => {
    const doc = map();
    doc.edges = [
      { id: 'ab', from: 'A', to: 'B', lines: ['b'], bend: 0.3 },
      { id: 'bc', from: 'B', to: 'C', lines: ['a', 'b'], bend: 0.5 },
    ];
    const candidate = connectStations(doc, 'A', 'B', 'a', 'preview')!;
    const committed = connectStations(doc, 'A', 'B', 'a', 'real')!;
    for (const edge of committed.doc.edges) {
      expect(edgeGeometry(derive(candidate.doc), candidate.doc.edges.find((e) => e.id === edge.id)!))
        .toEqual(edgeGeometry(derive(committed.doc), edge));
    }
    const preview = renderToStaticMarkup(<MetroMap doc={candidate.doc} previewConnection={{ edgeId: candidate.edgeId, lineId: 'a' }} />);
    const final = renderToStaticMarkup(<MetroMap doc={committed.doc} />);
    const paths = (markup: string) => [...markup.matchAll(/<path\s[^>]*\bd="([^"]+)"/g)].map((m) => m[1]);
    expect(paths(preview)).toEqual(paths(final));
    expect(preview).toContain('data-connection-preview');
    expect(final).not.toContain('data-connection-preview');
  });

  it('keeps editor motion and candidate styling out of exports', () => {
    const doc = map();
    doc.lines[0].planned = true;
    const candidate = connectStations(doc, 'A', 'B', 'a', 'preview')!;
    const svg = renderToStaticMarkup(<MetroMap doc={candidate.doc} exporting
      previewConnection={{ edgeId: candidate.edgeId, lineId: 'a' }} />);
    expect(svg).not.toContain('station-glyph');
    expect(svg).not.toContain('data-connection-preview');
    expect(svg).not.toContain('opacity="0.55"');
    expect((svg.match(/<path /g) ?? [])).toHaveLength(2);
  });
});
