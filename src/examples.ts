import type { Doc } from './model';

/**
 * The example map on the sign-in page and behind Use an example. Within a reasonable metagenome
 * workflow it shows most of what a map can hold: shared steps, a merge, an optional step, stacked
 * and intermediate files, a hollow (planned) line, five sections, a title block and a legend.
 * The assembly rail is the shared stations' fixed spine.
 */
export function metagenomeExample(): Doc {
  return {
    version: 1,
    title: 'Metagenome example',
    meta: 'Example map · Snakemake',
    showTitle: true,
    // Title block and legend sit above the sections: their visible tops align, the title's left edge
    // meets the first section and the legend's right edge the last (measured on exported ink).
    titlePos: { x: -57, y: -55.3 },
    titleAuto: false,
    palette: 'nordic',
    lines: [
      { id: 'P', name: 'Taxonomic profiling', slot: 1 },
      { id: 'A', name: 'Genome recovery', slot: 0 },
      { id: 'M', name: 'Mobile elements (planned)', slot: 3, pattern: 'hollow' },
    ],
    stations: [
      { id: 'in', x: 40, y: 240, label: '', kind: 'start', axis: 'h', labelSide: 'auto', anchorLine: 'A', file: { ext: 'fastq', count: 2, caption: 'Paired reads' } },
      { id: 'fastp', x: 136, y: 240, label: 'fastp', kind: 'step', axis: 'h', labelSide: 'below', anchorLine: 'A' },
      { id: 'bowtie2', x: 244, y: 240, label: 'Bowtie 2', kind: 'step', axis: 'h', labelSide: 'below', anchorLine: 'A' },
      { id: 'metaphlan', x: 452, y: 104, label: 'MetaPhlAn 4', kind: 'step', axis: 'h', labelSide: 'above', anchorLine: 'P' },
      { id: 'humann', x: 564, y: 104, label: 'HUMAnN 3', kind: 'step', axis: 'h', labelSide: 'above', anchorLine: 'P', optional: true },
      { id: 'megahit', x: 412, y: 240, label: 'MEGAHIT', kind: 'step', axis: 'h', labelSide: 'below', anchorLine: 'A' },
      { id: 'metabat2', x: 524, y: 240, label: 'MetaBAT 2', kind: 'step', axis: 'h', labelSide: 'below', anchorLine: 'A' },
      { id: 'checkm2', x: 636, y: 240, label: 'CheckM2', kind: 'step', axis: 'h', labelSide: 'below', anchorLine: 'A' },
      { id: 'gtdbtk', x: 748, y: 240, label: 'GTDB-Tk', kind: 'step', axis: 'h', labelSide: 'below', anchorLine: 'A' },
      { id: 'genomad', x: 588, y: 376, label: 'geNomad', kind: 'step', axis: 'h', labelSide: 'below', anchorLine: 'M' },
      { id: 'bakta', x: 704, y: 376, label: 'Bakta', kind: 'step', axis: 'h', labelSide: 'below', anchorLine: 'M', file: { ext: 'gff', count: 1, caption: 'Annotations' } },
      { id: 'multiqc', x: 864, y: 240, label: 'MultiQC', kind: 'merge', axis: 'h', labelSide: 'below', anchorLine: 'A' },
      { id: 'out', x: 960, y: 240, label: '', kind: 'stop', axis: 'h', labelSide: 'auto', anchorLine: 'A', file: { ext: 'html', count: 1, caption: 'Report' } },
    ],
    // Connection order retains the assembly rail when a secondary route joins it.
    edges: [
      { id: 'e1', from: 'in', to: 'fastp', lines: ['A', 'P', 'M'], bend: 0.5 },
      { id: 'e2', from: 'fastp', to: 'bowtie2', lines: ['A', 'P', 'M'], bend: 0.5 },
      { id: 'e3', from: 'bowtie2', to: 'metaphlan', lines: ['P'], bend: 0.15 },
      { id: 'e4', from: 'bowtie2', to: 'megahit', lines: ['A', 'M'], bend: 0.5 },
      { id: 'e5', from: 'megahit', to: 'metabat2', lines: ['A'], bend: 0.5 },
      { id: 'e6', from: 'metabat2', to: 'checkm2', lines: ['A'], bend: 0.5 },
      { id: 'e7', from: 'checkm2', to: 'gtdbtk', lines: ['A'], bend: 0.5 },
      { id: 'e8', from: 'megahit', to: 'genomad', lines: ['M'], bend: 0.5 },
      { id: 'e9', from: 'genomad', to: 'bakta', lines: ['M'], bend: 0.5 },
      { id: 'e10', from: 'bakta', to: 'multiqc', lines: ['M'], bend: 0.5 },
      { id: 'e11', from: 'humann', to: 'multiqc', lines: ['P'], bend: 0.57 },
      { id: 'e12', from: 'multiqc', to: 'out', lines: ['A', 'P', 'M'], bend: 0.5 },
      { id: 'e13', from: 'metaphlan', to: 'humann', lines: ['P'], bend: 0.5 },
      { id: 'e14', from: 'gtdbtk', to: 'multiqc', lines: ['A'], bend: 0.5 },
    ],
    // A single rectangular composition: full-height bookends, three equal
    // analysis rows, and the same 16-unit gutter in both directions.
    sections: [
      { id: 's1', name: 'Preprocessing', x: -56, y: 24, w: 348, h: 416, tint: 5 },
      { id: 's2', name: 'Taxonomic profiling', x: 308, y: 24, w: 480, h: 128, tint: 1 },
      { id: 's3', name: 'Genome recovery', x: 308, y: 168, w: 480, h: 128, tint: 0 },
      { id: 's4', name: 'Mobile elements', x: 308, y: 312, w: 480, h: 128, tint: 3 },
      { id: 's5', name: 'Combined report', x: 804, y: 24, w: 220, h: 416, tint: 6 },
    ],
    legend: { x: 287.7, y: -60.6, show: true, auto: false, cols: 2 },
  };
}
