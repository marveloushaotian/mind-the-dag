import { describe, expect, it } from 'vitest';
import { changeStationKind, createStation, type StationKind } from './model';

describe('station file defaults', () => {
  it.each(['start', 'stop'] as const)('creates a %s with a single FASTA badge', (kind) => {
    const station = createStation({ x: 19, y: 17 }, kind);
    expect(station).toMatchObject({ kind, x: 16, y: 18, file: { ext: 'fasta', count: 1 } });
  });

  it.each(['step', 'merge'] as const)('creates a %s without a file badge', (kind) => {
    expect(createStation({ x: 0, y: 0 }, kind).file).toBeUndefined();
  });

  it.each(['start', 'stop'] as const)('enables the default badge when a step becomes a %s', (kind) => {
    const station = createStation({ x: 0, y: 0 });
    changeStationKind(station, kind);
    expect(station.file).toEqual({ ext: 'fasta', count: 1 });
  });

  it('preserves a configured format when switching between terminal roles', () => {
    const station = createStation({ x: 0, y: 0 }, 'start');
    station.file = { ext: 'gff', count: 3, caption: 'Annotations' };
    changeStationKind(station, 'stop');
    expect(station.file).toEqual({ ext: 'gff', count: 3, caption: 'Annotations' });
  });

  it('keeps an explicitly configured intermediate file when it becomes a terminal', () => {
    const station = createStation({ x: 0, y: 0 });
    station.file = { ext: 'fastq', count: 2 };
    changeStationKind(station, 'start');
    expect(station.file).toEqual({ ext: 'fastq', count: 2 });
  });

  it.each(['step', 'merge'] as const)('turns the badge off when a terminal becomes a %s', (kind) => {
    const station = createStation({ x: 0, y: 0 }, 'stop');
    changeStationKind(station, kind);
    expect(station.file).toBeUndefined();
  });

  it('does not undo a manual opt-out when the same type is selected again', () => {
    const station = createStation({ x: 0, y: 0 }, 'start');
    delete station.file;
    changeStationKind(station, 'start');
    expect(station.file).toBeUndefined();
  });

  it('keeps explicit intermediate badges across intermediate type changes', () => {
    const station = createStation({ x: 0, y: 0 });
    station.file = { ext: 'tsv', count: 1 };
    changeStationKind(station, 'merge');
    expect(station.file?.ext).toBe('tsv');
  });

  it('gives each newly placed terminal its own badge', () => {
    const a = createStation({ x: 0, y: 0 }, 'start');
    const b = createStation({ x: 0, y: 0 }, 'start');
    a.file!.ext = 'fastq';
    expect(b.file?.ext).toBe('fasta');
  });

  it('converts an existing routing point without dropping its identity or position', () => {
    const station = { ...createStation({ x: 24, y: 24 }), kind: 'junction' as StationKind };
    const id = station.id;
    changeStationKind(station, 'step');
    expect(station).toMatchObject({ id, x: 24, y: 24, kind: 'step' });
  });
});
