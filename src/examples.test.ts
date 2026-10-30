import { describe, expect, it } from 'vitest';
import { metagenomeExample } from './examples';
import { derive, laneOffset } from './model';
import { edgeGeometry, docBounds } from './render';
import { validateMapColours } from './tokens';

const spine = ['in', 'fastp', 'host', 'megahit', 'binning', 'checkm2', 'multiqc', 'out'];

describe('current example workflow', () => {
  it('keeps the assembly spine straight when routes split and rejoin', () => {
    const doc = metagenomeExample();
    for (const order of [doc.lines, [...doc.lines].reverse()]) {
      doc.lines = order;
      const dv = derive(doc);
      for (const id of spine) {
        const station = dv.byId.get(id)!;
        expect(station.y + laneOffset(dv, id, 'A'), id).toBe(240);
      }
      for (const edge of doc.edges.filter((e) => e.lines.includes('A'))) {
        const geometry = edgeGeometry(dv, edge)!;
        const main = geometry.lines.find((line) => line.id === 'A')!;
        expect(main.d, edge.id).not.toContain(' A ');
        expect(main.centre.every((point) => point.y === main.centre[0].y), edge.id).toBe(true);
      }
    }
  });

  it('uses the current palette, hollow branch and explicit file endpoints', () => {
    const doc = metagenomeExample();
    expect(doc.palette).toBe('nordic');
    expect(doc.lines.find((line) => line.id === 'M')?.pattern).toBe('hollow');
    expect(doc.stations.filter((station) => station.file).map((station) => station.id)).toEqual(['in', 'out']);
    expect(() => validateMapColours(doc)).not.toThrow();
    expect(docBounds(doc)).not.toBeNull();
  });
});
