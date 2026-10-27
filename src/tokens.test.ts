import { describe, expect, it } from 'vitest';
import { lineStyle, tints, tokens } from './tokens';

describe('tokens', () => {
  it('exposes the spec constants', () => {
    expect(tokens.grid).toBe(8);
    expect(tokens.line.width).toBe(10);
    expect(tokens.line.pitch).toBe(12);
  });
  it('resolves palette slots, including dashed references', () => {
    expect(lineStyle('forest', 0).color).toBe('#24B064');
    expect(lineStyle('forest', 6, 'dark').color).toBe('#C9CED4');
    const s = lineStyle('graphite', 4);
    expect(s.color).toBe('#1F2328');
    expect(s.pattern).toBe('dashed');
  });
  it('has tints for both themes', () => {
    expect(tints('field').length).toBe(4);
    expect(tints('field', 'dark').length).toBe(4);
  });
});
