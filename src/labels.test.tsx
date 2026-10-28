import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { emptyDoc, type Station } from './model';
import { MetroMap } from './render';

const st = (id: string, x: number, y: number, label: string): Station => ({ id, x, y, label, kind: 'step', axis: 'h', labelSide: 'auto' });
const labelY = (svg: string, text: string) => Number(new RegExp(`y="([\\d.]+)"[^>]*>${text}<`).exec(svg)![1]);

describe('automatic label sides', () => {
  it('moves a whole run below when a line passes just above it', () => {
    const d = emptyDoc();
    d.legend.show = false;
    d.lines = [{ id: 'a', name: 'A', slot: 0 }, { id: 'b', name: 'B', slot: 1 }];
    d.stations = [st('p', 0, 96, 'Alpha'), st('q', 160, 96, 'Beta'), st('r', -40, 66, ''), st('s', 240, 66, '')];
    d.edges = [
      { id: 'run', from: 'p', to: 'q', lines: ['a'], bend: 0.5 },
      { id: 'over', from: 'r', to: 's', lines: ['b'], bend: 0.5 },
    ];
    const svg = renderToStaticMarkup(<MetroMap doc={d} exporting />);
    expect(labelY(svg, 'Alpha')).toBeGreaterThan(96);
    expect(labelY(svg, 'Beta')).toBeGreaterThan(96);
  });
  it('keeps labels above when nothing is in the way', () => {
    const d = emptyDoc();
    d.legend.show = false;
    d.stations = [st('p', 0, 96, 'Alpha'), st('q', 160, 96, 'Beta')];
    d.edges = [{ id: 'run', from: 'p', to: 'q', lines: ['l1'], bend: 0.5 }];
    const svg = renderToStaticMarkup(<MetroMap doc={d} exporting />);
    expect(labelY(svg, 'Alpha')).toBeLessThan(96);
  });
});

describe('multi-line labels', () => {
  it('draws the first line as the name and later lines as smaller detail lines', () => {
    const d = emptyDoc();
    d.legend.show = false;
    d.stations = [st('p', 0, 96, 'Callers\nVIBRANT · geNomad'), st('q', 160, 96, '')];
    d.edges = [{ id: 'run', from: 'p', to: 'q', lines: ['l1'], bend: 0.5 }];
    const svg = renderToStaticMarkup(<MetroMap doc={d} exporting />);
    expect(svg).toContain('>Callers<');
    expect(svg).toMatch(/font-size="12"[^>]*>VIBRANT · geNomad</);
  });
});

describe('legend columns', () => {
  it('wraps the line key into the requested number of columns', async () => {
    const { legendLayout } = await import('./render');
    const d = emptyDoc();
    const names = ['A', 'B', 'C', 'D', 'E'];
    d.legend.cols = 1;
    const one = legendLayout(d, names, ['step']);
    d.legend.cols = 3;
    const three = legendLayout(d, names, ['step']);
    expect(new Set(one.lines.map((p) => p.dx)).size).toBe(1);
    expect(new Set(three.lines.map((p) => p.dx)).size).toBe(3);
    expect(three.height).toBeLessThan(one.height);
  });
});
