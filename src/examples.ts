import type { Doc } from './model';

/** Current Nordic showcase; the assembly rail is the shared stations' fixed spine. */
export function metagenomeExample(): Doc {
  return {
    version: 1,
    title: 'mag-lite',
    meta: 'Metagenome workflow · Snakemake',
    showTitle: false,
    titlePos: { x: 24, y: 0 },
    titleAuto: true,
    palette: 'nordic',
    lines: [
      { id: 'P', name: 'Taxonomic profiling', slot: 1 },
      { id: 'A', name: 'Genome recovery', slot: 0 },
      { id: 'M', name: 'Mobile elements', slot: 3, pattern: 'hollow' },
    ],
    stations: [
      { id: 'in', x: 40, y: 240, label: '', kind: 'start', axis: 'h', labelSide: 'auto', anchorLine: 'A', file: { ext: 'fastq', count: 1, caption: 'Raw reads' } },
      { id: 'fastp', x: 136, y: 240, label: 'fastp', kind: 'step', axis: 'h', labelSide: 'below', anchorLine: 'A' },
      { id: 'host', x: 244, y: 240, label: 'Host removal', kind: 'step', axis: 'h', labelSide: 'below', anchorLine: 'A' },
      { id: 'metaphlan', x: 492, y: 104, label: 'MetaPhlAn 4', kind: 'step', axis: 'h', labelSide: 'above', anchorLine: 'P' },
      { id: 'megahit', x: 412, y: 240, label: 'MEGAHIT', kind: 'step', axis: 'h', labelSide: 'below', anchorLine: 'A' },
      { id: 'binning', x: 532, y: 240, label: 'Binning', kind: 'step', axis: 'h', labelSide: 'below', anchorLine: 'A' },
      { id: 'checkm2', x: 648, y: 240, label: 'CheckM2', kind: 'step', axis: 'h', labelSide: 'below', anchorLine: 'A' },
      { id: 'genomad', x: 588, y: 376, label: 'geNomad', kind: 'step', axis: 'h', labelSide: 'below', anchorLine: 'M' },
      { id: 'bakta', x: 704, y: 376, label: 'Bakta', kind: 'step', axis: 'h', labelSide: 'below', anchorLine: 'M' },
      { id: 'multiqc', x: 864, y: 240, label: 'MultiQC', kind: 'merge', axis: 'h', labelSide: 'below', anchorLine: 'A' },
      { id: 'out', x: 960, y: 240, label: '', kind: 'stop', axis: 'h', labelSide: 'auto', anchorLine: 'A', file: { ext: 'html', count: 1, caption: 'Report' } },
    ],
    // Connection order retains the assembly rail when a secondary route joins it.
    edges: [
      { id: 'e1', from: 'in', to: 'fastp', lines: ['A', 'P', 'M'], bend: 0.5 },
      { id: 'e2', from: 'fastp', to: 'host', lines: ['A', 'P', 'M'], bend: 0.5 },
      { id: 'e3', from: 'host', to: 'metaphlan', lines: ['P'], bend: 0.15 },
      { id: 'e4', from: 'host', to: 'megahit', lines: ['A', 'M'], bend: 0.5 },
      { id: 'e5', from: 'megahit', to: 'binning', lines: ['A'], bend: 0.5 },
      { id: 'e6', from: 'binning', to: 'checkm2', lines: ['A'], bend: 0.5 },
      { id: 'e7', from: 'checkm2', to: 'multiqc', lines: ['A'], bend: 0.5 },
      { id: 'e8', from: 'megahit', to: 'genomad', lines: ['M'], bend: 0.5 },
      { id: 'e9', from: 'genomad', to: 'bakta', lines: ['M'], bend: 0.5 },
      { id: 'e10', from: 'bakta', to: 'multiqc', lines: ['M'], bend: 0.5 },
      { id: 'e11', from: 'metaphlan', to: 'multiqc', lines: ['P'], bend: 0.65 },
      { id: 'e12', from: 'multiqc', to: 'out', lines: ['A', 'P', 'M'], bend: 0.5 },
    ],
    // A single rectangular composition: full-height bookends, three equal
    // analysis rows, and the same 16-unit gutter in both directions.
    sections: [
      { id: 's1', name: 'Preprocessing', x: -24, y: 24, w: 316, h: 416, tint: 5 },
      { id: 's2', name: 'Taxonomic profiling', x: 308, y: 24, w: 480, h: 128, tint: 1 },
      { id: 's3', name: 'Genome recovery', x: 308, y: 168, w: 480, h: 128, tint: 0 },
      { id: 's4', name: 'Mobile elements', x: 308, y: 312, w: 480, h: 128, tint: 3 },
      { id: 's5', name: 'Combined report', x: 804, y: 24, w: 220, h: 416, tint: 6 },
    ],
    // Align the legend with the section grid rather than the wider file bounds.
    legend: { x: -24, y: 488, show: true, auto: false, cols: 2 },
  };
}
