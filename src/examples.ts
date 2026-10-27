import type { Doc } from './model';

/** The example map from the design canvas (Forest palette board). */
export function metagenomeExample(): Doc {
  return {
    version: 1,
    title: 'mag-lite',
    meta: 'v0.3.1 · 2026-10 · Snakemake',
    showTitle: false,
    titlePos: { x: 24, y: 40 },
    titleAuto: true,
    palette: 'forest',
    // Bundle order, top to bottom. Slots follow the palette order by importance.
    lines: [
      { id: 'P', name: 'Taxonomic profiling', slot: 1 },
      { id: 'A', name: 'Assembly', slot: 0 },
      { id: 'M', name: 'Mobile elements', slot: 2 },
    ],
    stations: [
      { id: 'in', x: 80, y: 264, label: '', kind: 'start', axis: 'h', labelSide: 'auto', file: { ext: 'fastq', count: 1, caption: 'Raw reads' } },
      { id: 'fastp', x: 200, y: 264, label: 'fastp', kind: 'step', axis: 'h', labelSide: 'auto' },
      { id: 'host', x: 320, y: 264, label: 'Host removal', kind: 'step', axis: 'h', labelSide: 'auto' },
      { id: 'megahit', x: 520, y: 270, label: 'MEGAHIT', kind: 'step', axis: 'h', labelSide: 'auto' },
      { id: 'metaphlan', x: 600, y: 120, label: 'MetaPhlAn 4', kind: 'step', axis: 'h', labelSide: 'auto' },
      { id: 'binning', x: 656, y: 264, label: 'Binning', kind: 'step', axis: 'h', labelSide: 'auto' },
      { id: 'checkm2', x: 792, y: 264, label: 'CheckM2', kind: 'step', axis: 'h', labelSide: 'auto' },
      { id: 'genomad', x: 736, y: 402, label: 'geNomad', kind: 'step', axis: 'h', labelSide: 'below' },
      { id: 'bakta', x: 800, y: 402, label: 'Bakta', kind: 'step', axis: 'h', labelSide: 'below' },
      { id: 'multiqc', x: 1016, y: 264, label: 'MultiQC', kind: 'merge', axis: 'h', labelSide: 'auto' },
      { id: 'out', x: 1064, y: 264, label: '', kind: 'stop', axis: 'h', labelSide: 'auto', file: { ext: 'html', count: 1, caption: 'Report' } },
    ],
    edges: [
      { id: 'e1', from: 'in', to: 'fastp', lines: ['P', 'A', 'M'], bend: 0.5 },
      { id: 'e2', from: 'fastp', to: 'host', lines: ['P', 'A', 'M'], bend: 0.5 },
      { id: 'e3', from: 'host', to: 'metaphlan', lines: ['P'], bend: 0.2 },
      { id: 'e4', from: 'host', to: 'megahit', lines: ['A', 'M'], bend: 0.5 },
      { id: 'e5', from: 'megahit', to: 'binning', lines: ['A'], bend: 0.5 },
      { id: 'e6', from: 'binning', to: 'checkm2', lines: ['A'], bend: 0.5 },
      { id: 'e7', from: 'checkm2', to: 'multiqc', lines: ['A'], bend: 0.5 },
      { id: 'e8', from: 'megahit', to: 'genomad', lines: ['M'], bend: 0.1 },
      { id: 'e9', from: 'genomad', to: 'bakta', lines: ['M'], bend: 0.5 },
      { id: 'e10', from: 'bakta', to: 'multiqc', lines: ['M'], bend: 0.9 },
      { id: 'e11', from: 'metaphlan', to: 'multiqc', lines: ['P'], bend: 0.8 },
      { id: 'e12', from: 'multiqc', to: 'out', lines: ['P', 'A', 'M'], bend: 0.5 },
    ],
    sections: [
      { id: 's1', name: 'Preprocessing', x: 16, y: 168, w: 400, h: 184, tint: 0 },
      { id: 's2', name: 'Analysis', x: 432, y: 40, w: 520, h: 432, tint: 1 },
      { id: 's3', name: 'Report', x: 968, y: 168, w: 168, h: 184, tint: 3 },
    ],
    legend: { x: 24, y: 392, show: true },
  };
}
