import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { emptyDoc, type Doc } from './model';
import { autoLegendPos, contentBounds, docBounds, MetroMap, reserveAutoLegend } from './render';

function drawing(): Doc {
  const doc = emptyDoc();
  doc.stations = [{ id: 'a', x: 0, y: 0, kind: 'step', label: '', axis: 'h', labelSide: 'auto' }];
  return doc;
}

function origin(doc: Doc, exporting = false) {
  const svg = renderToStaticMarkup(<MetroMap doc={doc} exporting={exporting} />);
  const match = /data-legend-origin="" data-x="([^"]+)" data-y="([^"]+)"/.exec(svg)!;
  return { x: Number(match[1]), y: Number(match[2]) };
}

describe('automatic legend working space', () => {
  it.each([0.5, 1, 1.5])('leaves the first station room to grow at %s× zoom', (k) => {
    const doc = drawing();
    const view = { y: -400 / k, k };
    reserveAutoLegend(doc, view, 800);
    const screenY = (origin(doc).y - view.y) * k;
    expect(screenY).toBeGreaterThanOrEqual(680);
    expect(screenY).toBeLessThanOrEqual(704);
    expect(origin(doc).y - contentBounds(doc)!.y1).toBeGreaterThanOrEqual(96);
  });

  it('clears new stations, sections and file endpoints as a drawing grows', () => {
    const doc = drawing();
    reserveAutoLegend(doc, { y: -400, k: 1 }, 800);
    const before = origin(doc).y;
    doc.stations.push({ ...doc.stations[0], id: 'b', y: 640, kind: 'stop', file: { ext: 'html', count: 1 } });
    doc.sections.push({ id: 'section', name: 'Results', x: -80, y: 500, w: 400, h: 320, tint: 0 });
    expect(origin(doc).y).toBeGreaterThan(before);
    expect(origin(doc).y - contentBounds(doc)!.y1).toBeGreaterThanOrEqual(96);
    expect(doc.legend.auto).toBe(true);
  });

  it('keeps a saved baseline stable through camera changes and a reload', () => {
    const doc = drawing();
    reserveAutoLegend(doc, { y: -400, k: 1 }, 800);
    const before = origin(doc);
    reserveAutoLegend(doc, { y: 900, k: 0.5 }, 500);
    expect(origin(JSON.parse(JSON.stringify(doc)))).toEqual(before);
  });

  it('preserves manually positioned legends, including the aligned example', () => {
    const doc = drawing();
    doc.legend = { x: -24, y: 488, show: true, auto: false };
    reserveAutoLegend(doc, { y: 0, k: 1 }, 800);
    doc.stations[0].y = 1000;
    expect(origin(doc)).toEqual({ x: -24, y: 488 });
    expect(doc.legend.minY).toBeUndefined();
  });

  it('uses identical saved placement for editor, export and document bounds', () => {
    const doc = drawing();
    reserveAutoLegend(doc, { y: -400, k: 1 }, 800);
    expect(origin(doc, true)).toEqual(origin(doc));
    expect(origin(doc)).toEqual(autoLegendPos(contentBounds(doc)!, doc.legend.minY));
    expect(docBounds(doc)!.y1).toBeGreaterThan(origin(doc).y);
  });

  it('waits for real content, leaving an empty document untouched', () => {
    const doc = emptyDoc();
    const before = structuredClone(doc);
    reserveAutoLegend(doc, { y: -400, k: 1 }, 800);
    expect(doc).toEqual(before);
  });
});
