import { describe, expect, it } from 'vitest';
import { exportError, journalFit, slug } from './exporters';

describe('journal fit (1 px = 0.5 pt)', () => {
  it('maps the spec widths onto columns', () => {
    expect(journalFit(504).fits).toMatch(/single/);
    expect(journalFit(771).fits).toMatch(/1\.5/);
    expect(journalFit(1037).fits).toMatch(/double/);
    expect(journalFit(1100).fits).toBeNull();
    expect(journalFit(1037).mm).toBeCloseTo(182.9, 1);
  });
  it('makes file names', () => {
    expect(slug('nf-core/mag lite!')).toBe('nf-core-mag-lite');
  });
});

describe('export failure messages', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://example.test/export-old.js',
    'Importing a module script failed.',
    'error loading dynamically imported module',
  ])('gives an actionable recovery when an old tab cannot load export tools (%s)', (message) => {
    expect(exportError(new TypeError(message))).toContain('Reload this page');
  });
  it('preserves the actual failure instead of turning it into a size warning', () => {
    expect(exportError(new Error('font Inter 400 not found'))).toContain('Check your connection and try again');
    expect(exportError('PNG encoding failed')).toBe('Export failed: PNG encoding failed');
  });
  it('explains how to recover when the drawing is empty', () => {
    expect(exportError(new Error('the map is empty'))).toContain('Add a station or section');
  });
});
