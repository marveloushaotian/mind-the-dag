import { describe, expect, it } from 'vitest';
import { pathTopology } from './motion';

describe('layout path compatibility', () => {
  const path = 'M 0 0 L 20 0 A 8 8 0 0 1 28 8 L 28 40 Z';
  it('allows position and radius changes within the same turn', () => {
    expect(pathTopology(path)).toBe(pathTopology('M 10 10 L 30 10 A 16 16 0 0 1 46 26 L 46 50 Z'));
  });
  it('rejects a change of arc sweep or size that would pop halfway through a morph', () => {
    expect(pathTopology(path)).not.toBe(pathTopology(path.replace('0 0 1', '0 0 0')));
    expect(pathTopology(path)).not.toBe(pathTopology(path.replace('0 0 1', '0 1 1')));
  });
  it('rejects open versus closed outlines and extra subpaths', () => {
    expect(pathTopology(path)).not.toBe(pathTopology(path.slice(0, -1)));
    expect(pathTopology(path)).not.toBe(pathTopology(`${path} M 1 1 L 2 2`));
  });
});
