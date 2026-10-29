import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { changeLinePattern, derive, emptyDoc, preserveSurvivingPorts, type Station } from './model';
import { connectStations } from './interaction';
import { Swatch } from './panels';
import { edgeGeometry, LineStroke, MetroMap } from './render';
import { linePaint, lineStyle, tokens } from './tokens';

function map() {
  const doc = emptyDoc();
  doc.stations = [
    { id: 'a', x: 0, y: 0, label: '', kind: 'step' as const, axis: 'h' as const, labelSide: 'auto' as const },
    { id: 'b', x: 240, y: 0, label: '', kind: 'step' as const, axis: 'h' as const, labelSide: 'auto' as const },
  ];
  doc.edges = [{ id: 'ab', from: 'a', to: 'b', lines: ['l1'], bend: 0.5 }];
  return doc;
}
const strokes = (svg: string) => [...svg.matchAll(/<path\b([^>]*)>/g)].map((match) => {
  const attr = (name: string) => new RegExp(`${name}="([^"]*)"`).exec(match[1])?.[1];
  return { width: Number(attr('stroke-width')), dash: attr('stroke-dasharray'), cap: attr('stroke-linecap') };
});

describe('coherent line patterns', () => {
  it('lets an explicit solid choice override a dashed palette slot', () => {
    expect(linePaint('graphite', 4).pattern).toBe('dashed');
    expect(linePaint('graphite', 4, 'light', 'solid')).toMatchObject({ pattern: 'solid', dash: undefined, cap: 'butt' });
    const doc = map();
    doc.palette = 'graphite';
    doc.lines[0].slot = 4;
    doc.lines[0].pattern = 'solid';
    expect(strokes(renderToStaticMarkup(<MetroMap doc={doc} exporting />)).every((s) => s.dash === undefined)).toBe(true);
  });

  it.each(['dashed', 'dotted'] as const)('uses the same %s rhythm on the map and its legend', (pattern) => {
    const doc = map();
    doc.lines[0].pattern = pattern;
    const paths = strokes(renderToStaticMarkup(<MetroMap doc={doc} exporting />));
    expect(paths).toHaveLength(2);
    expect(paths[0]).toEqual(paths[1]);
    expect(paths[0].cap).toBe('round');
    const small = strokes(renderToStaticMarkup(<Swatch doc={doc} slot={0} pattern={pattern} theme="light" />))[0];
    const normalised = (stroke: typeof small) => stroke.dash!.split(' ').map((n) => Number(n) / stroke.width);
    expect(normalised(small)).toEqual(normalised(paths[0]));
    expect(small.cap).toBe(paths[0].cap);
  });

  it('separates circular dots and rounded dashes after accounting for round caps', () => {
    expect(tokens.line.patterns.dotted.dash[0]).toBe(0);
    expect(tokens.line.patterns.dotted.dash[1] - tokens.line.width).toBeGreaterThan(tokens.line.width / 2);
    expect(tokens.line.patterns.dashed[1] - tokens.line.width).toBeGreaterThan(tokens.line.width / 2);
  });

  it('keeps the chosen rhythm on both walls of a planned line', () => {
    const doc = map();
    doc.lines[0].pattern = 'dashed';
    doc.lines[0].planned = true;
    const paths = strokes(renderToStaticMarkup(<MetroMap doc={doc} exporting />));
    expect(paths).toHaveLength(4);
    expect(paths.every((path) => path.dash === linePaint(doc, 0, 'light', 'dashed').dash)).toBe(true);
  });

  it.each(['light', 'dark'] as const)('renders a transparent hollow stroke consistently on the canvas, legend and swatch (%s)', (theme) => {
    const doc = map();
    doc.lines[0].pattern = 'hollow';
    doc.sections = [{ id: 'section', x: -24, y: -32, w: 300, h: 96, name: '', tint: 0 }];
    const svg = renderToStaticMarkup(<MetroMap doc={doc} theme={theme} exporting />);
    const paths = strokes(svg);
    expect(paths).toHaveLength(2);
    expect(paths.every((path) => path.width === tokens.planned.wall && path.dash === undefined)).toBe(true);
    const colour = lineStyle(doc, 0, theme).color;
    expect((svg.match(new RegExp(`fill="none" stroke="${colour}"`, 'g')) ?? [])).toHaveLength(2);
    expect(svg).not.toContain(`stroke="${tokens.themes[theme].surface}"`);
    expect((svg.match(/A 3.5 3.5 0 0 1/g) ?? [])).toHaveLength(4);
    const small = strokes(renderToStaticMarkup(<Swatch doc={doc} slot={0} pattern="hollow" theme={theme} />));
    expect(small).toHaveLength(1);
    expect(small[0].width / tokens.planned.wall).toBeCloseTo(4 / tokens.line.width);
  });

  it('overrides palette dashes with a hollow stroke', () => {
    expect(linePaint('graphite', 4, 'light', 'hollow')).toMatchObject({ pattern: 'hollow', dash: undefined });
  });

  it.each(['solid', 'dashed', 'dotted', 'hollow'] as const)('makes explicit %s selection authoritative over a legacy Planned flag', (pattern) => {
    const doc = map();
    doc.lines[0].planned = true;
    changeLinePattern(doc.lines[0], pattern);
    expect(doc.lines[0].pattern).toBe(pattern);
    expect(doc.lines[0]).not.toHaveProperty('planned');
  });

  it('changes no lane geometry when a bundled line becomes hollow', () => {
    const doc = map();
    doc.stations[1].x = 360;
    doc.stations[1].y = 160;
    doc.stations[1].axis = 'v';
    doc.lines.push({ id: 'second', name: 'Second', slot: 1 });
    doc.edges[0].lines.push('second');
    const before = edgeGeometry(derive(doc), doc.edges[0]);
    changeLinePattern(doc.lines[1], 'hollow');
    expect(edgeGeometry(derive(doc), doc.edges[0])).toEqual(before);
    const restored = JSON.parse(JSON.stringify(doc));
    expect(renderToStaticMarkup(<MetroMap doc={restored} exporting />)).toContain('data-line-pattern="hollow"');
  });

  it.each(['h', 'v'] as const)('keeps hollow joins, splits and target previews identical to committed paths (%s)', (axis) => {
    const doc = map();
    doc.legend.show = false;
    const s = (id: string, x: number, y: number): Station => ({ id, x: axis === 'h' ? x : y, y: axis === 'h' ? y : x, axis, kind: 'step', label: '', labelSide: 'auto' });
    doc.stations = [s('a', 0, 0), s('b', 240, 80), s('c', 480, 0), s('branch', 0, 160), s('split', 480, 160)];
    doc.lines.push({ id: 'hollow', name: 'Hollow', slot: 1, pattern: 'hollow' }, { id: 'third', name: 'Third', slot: 2 });
    doc.edges = [
      { id: 'ab', from: 'a', to: 'b', lines: ['l1', 'hollow', 'third'], bend: 0.5 },
      { id: 'bc', from: 'b', to: 'c', lines: ['l1', 'third'], bend: 0.5 },
      { id: 'join', from: 'branch', to: 'b', lines: ['third'], bend: 0.5 },
      { id: 'split', from: 'b', to: 'split', lines: ['third'], bend: 0.5 },
    ];
    const paths = (markup: string) => [...markup.matchAll(/<path\s[^>]*\bd="([^"]+)"/g)].map((m) => m[1]);
    const candidate = connectStations(doc, 'c', 'b', 'hollow', 'preview')!;
    const committed = connectStations(doc, 'c', 'b', 'hollow', 'commit')!;
    const preview = renderToStaticMarkup(<MetroMap doc={candidate.doc} previewConnection={{ edgeId: candidate.edgeId, lineId: 'hollow' }} />);
    const final = renderToStaticMarkup(<MetroMap doc={committed.doc} />);
    expect(paths(preview)).toEqual(paths(final));
    expect(preview).toContain('data-connection-preview');
    const before = edgeGeometry(derive(committed.doc), committed.doc.edges[0])!.lines.find((l) => l.id === 'hollow')!;
    const removed = structuredClone(committed.doc);
    removed.lines = removed.lines.filter((l) => l.id !== 'l1');
    removed.edges.forEach((e) => { e.lines = e.lines.filter((id) => id !== 'l1'); });
    preserveSurvivingPorts(committed.doc, removed);
    const after = edgeGeometry(derive(removed), removed.edges[0])!.lines.find((l) => l.id === 'hollow')!;
    // Compare the actual hollow outline, not only the routing centreline.
    const draw = (doc: typeof removed, lane: typeof after) => renderToStaticMarkup(<LineStroke geometry={edgeGeometry(derive(doc), doc.edges[0])!} path={lane} line={doc.lines.find((l) => l.id === 'hollow')!} palette={doc} theme="light" />);
    expect(draw(removed, after)).toBe(draw(committed.doc, before));
  });
});
