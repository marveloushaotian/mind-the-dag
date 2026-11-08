import { describe, expect, it } from 'vitest';
import { metagenomeExample } from './examples';
import { derive, laneOffset } from './model';
import { edgeGeometry, docBounds } from './render';
import { validateMapColours } from './tokens';

const spine = ['in', 'fastp', 'bowtie2', 'megahit', 'metabat2', 'checkm2', 'gtdbtk', 'multiqc', 'out'];

describe('example workflow', () => {
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

  it('shows the map features it is meant to demonstrate', () => {
    const doc = metagenomeExample();
    expect(doc.palette).toBe('nordic');
    expect(doc.title).toMatch(/example/i);
    expect(doc.showTitle).toBe(true);
    expect(doc.lines.find((line) => line.id === 'M')?.pattern).toBe('hollow');
    expect(doc.stations.filter((station) => station.file).map((station) => station.id)).toEqual(['in', 'bakta', 'out']);
    expect(doc.stations.find((station) => station.id === 'in')?.file?.count).toBe(2);
    expect(doc.stations.filter((station) => station.optional).map((station) => station.id)).toEqual(['humann']);
    expect(doc.stations.filter((station) => station.kind === 'merge').map((station) => station.id)).toEqual(['multiqc']);
    // One tool per station: a single-line label naming the software.
    for (const station of doc.stations.filter((s) => s.label)) expect(station.label, station.id).not.toContain('\n');
    expect(() => validateMapColours(doc)).not.toThrow();
    expect(docBounds(doc)).not.toBeNull();
  });
});
