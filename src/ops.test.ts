import { describe, expect, it } from 'vitest';
import { emptyDoc, mergeStations, pruneLines, stationAt, uniqueTitle, usedLines, type Doc } from './model';

const st = (id: string, x: number, y: number, label = id) => ({ id, x, y, label, kind: 'step' as const, axis: 'h' as const, labelSide: 'auto' as const });
function doc(): Doc {
  const d = emptyDoc();
  d.lines = [
    { id: 'a', name: 'A', slot: 0 },
    { id: 'b', name: 'B', slot: 1 },
    { id: 'c', name: 'C (never drawn)', slot: 2 },
  ];
  d.stations = [st('s1', 0, 0), st('s2', 100, 0), st('s3', 200, 0), st('s4', 100, 0, '')];
  d.edges = [
    { id: 'e1', from: 's1', to: 's2', lines: ['a'], bend: 0.5 },
    { id: 'e2', from: 's2', to: 's3', lines: ['b'], bend: 0.5 },
    { id: 'e3', from: 's1', to: 's4', lines: ['b'], bend: 0.5 },
  ];
  return d;
}

describe('pruneLines', () => {
  it('drops a line whose last connection was deleted, keeps never-drawn ones', () => {
    const d = doc();
    const before = usedLines(d);
    d.edges = d.edges.filter((e) => e.id !== 'e1');
    expect(pruneLines(d, before)).toEqual(['a']);
    expect(d.lines.map((l) => l.id)).toEqual(['b', 'c']);
  });
  it('always keeps one line', () => {
    const d = doc();
    d.lines = d.lines.filter((l) => l.id === 'a');
    const before = usedLines(d);
    d.edges = [];
    pruneLines(d, before);
    expect(d.lines.map((l) => l.id)).toEqual(['a']);
  });
});

describe('mergeStations', () => {
  it('moves connections over, combines duplicates and drops loops', () => {
    const d = doc();
    mergeStations(d, 's4', 's2');
    expect(d.stations.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
    // s1→s4 (b) joins s1→s2 (a): one connection carrying both lines
    expect(d.edges).toHaveLength(2);
    expect(d.edges.find((e) => e.id === 'e1')!.lines).toEqual(['a', 'b']);
    expect(d.stations.find((s) => s.id === 's2')!.label).toBe('s2');
  });
  it('drops the connection between the two merged stations', () => {
    const d = doc();
    mergeStations(d, 's2', 's3');
    expect(d.edges.some((e) => e.from === e.to)).toBe(false);
    expect(d.edges.find((e) => e.id === 'e1')).toMatchObject({ from: 's1', to: 's3' });
  });
  it('takes the label when the kept station has none', () => {
    const d = doc();
    mergeStations(d, 's2', 's4');
    expect(d.stations.find((s) => s.id === 's4')!.label).toBe('s2');
  });
});

describe('stationAt', () => {
  it('finds a station under a point, ignoring the dragged one', () => {
    const d = doc();
    expect(stationAt(d, { x: 102, y: 3 }, new Set(['s4']))?.id).toBe('s2');
    expect(stationAt(d, { x: 150, y: 0 }, new Set())).toBeUndefined();
  });
});

describe('uniqueTitle', () => {
  it('numbers repeated titles', () => {
    expect(uniqueTitle('Untitled pipeline', [])).toBe('Untitled pipeline');
    expect(uniqueTitle('Untitled pipeline', ['Untitled pipeline'])).toBe('Untitled pipeline 2');
    expect(uniqueTitle('Untitled pipeline', ['untitled pipeline', 'Untitled pipeline 2'])).toBe('Untitled pipeline 3');
    expect(uniqueTitle('Untitled pipeline 2', ['Untitled pipeline 2'])).toBe('Untitled pipeline 3');
    expect(uniqueTitle('  ', [])).toBe('Untitled pipeline');
  });
});
