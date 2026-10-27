import { describe, expect, it } from 'vitest';
import { parseMmd } from './mmd';

const SAMPLE = `
%%metro title: Tiny pipeline
%%metro line: reads | Reads | #24B064
%%metro line: plan | Planned | #24B064 | dashed
%%metro line: vir | Virus | #6a4c93 | dotted
%%metro files: raw | FASTQ | Raw reads
%%metro file: out | TSV
%%metro marker: cand | circle, open
%%metro grid: a | 0,0
%%metro grid: b | 1,0
graph LR
  subgraph a [Assembly]
    raw[ ]
    qc[fastp]
    _split
    raw -->|reads,vir| qc
    qc -->|reads,vir| _split
  end
  subgraph b [Calls]
    %%metro direction: TB
    cand[Candidates]
    out[ ]
    cand -->|reads,plan| out
  end
  _split -->|reads| cand
  _split -->|vir| cand
`;

describe('parseMmd', () => {
  const d = parseMmd(SAMPLE);
  it('reads title, lines, colours and styles', () => {
    expect(d.title).toBe('Tiny pipeline');
    expect(d.lines.map((l) => l.id)).toEqual(['reads', 'plan', 'vir']);
    expect(d.lines[0].slot).toBe(d.lines[1].slot); // same colour, same slot
    expect(d.lines[1].planned).toBe(true);
    expect(d.lines[2].pattern).toBe('dotted');
  });
  it('builds sections, stations and edges', () => {
    expect(d.sections.map((s) => s.name)).toEqual(['Assembly', 'Calls']);
    const byId = new Map(d.stations.map((s) => [s.id, s]));
    expect(byId.get('raw')?.kind).toBe('start');
    expect(byId.get('raw')?.file?.ext).toBe('fastq');
    expect(byId.get('out')?.kind).toBe('stop');
    expect(byId.get('_split')?.kind).toBe('junction');
    expect(byId.get('cand')?.optional).toBe(true);
    expect(byId.get('cand')?.axis).toBe('v');
    expect(d.edges).toHaveLength(5);
    expect(d.sections[1].x).toBeGreaterThan(d.sections[0].x);
  });
  it('keeps stations on the lane grid', () => {
    for (const s of d.stations) {
      const [along, across] = s.axis === 'h' ? [s.x, s.y] : [s.y, s.x];
      expect(along % 8).toBe(0);
      expect(across % 6).toBe(0);
    }
  });
});
