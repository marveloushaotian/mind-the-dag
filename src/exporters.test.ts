import { describe, expect, it } from 'vitest';
import { journalFit, slug } from './exporters';

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
