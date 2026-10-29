import { describe, expect, it } from 'vitest';
import { lineStyle, paletteLines, tints, tokens } from './tokens';
import { emptyDoc } from './model';

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
    expect(tints('field').length).toBe(8);
    expect(tints('field', 'dark').length).toBe(8);
  });

  it('starts new maps in Nordic and retains the five proposed primary colours', () => {
    expect(emptyDoc().palette).toBe('nordic');
    expect(paletteLines('nordic').slice(0, 5).map((line) => line.light)).toEqual([
      '#3F7D6D', '#4D6F9E', '#B47D30', '#88618D', '#AF624C',
    ]);
    expect(new Set(paletteLines('nordic').map((line) => line.light)).size).toBe(7);
  });

  it.each(['light', 'dark'] as const)('keeps Nordic lines readable against the canvas and section fills (%s)', (theme) => {
    const luminance = (hex: string) => {
      const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    const backgrounds = [tokens.themes[theme].surface, ...tints('nordic', theme)];
    for (let i = 0; i < paletteLines('nordic').length; i++) {
      const foreground = luminance(lineStyle('nordic', i, theme).color);
      for (const bg of backgrounds) {
        const background = luminance(bg);
        expect((Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
