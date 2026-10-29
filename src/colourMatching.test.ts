import { describe, expect, it } from 'vitest';
import { editColourPair, editPaletteColour, matchingColour, matchPalette } from './colourMatching';
import { contrastRatio, copyPalette, PALETTE_IDS, sectionInk, tints, tokens, validateMapColours, type ColourPair } from './tokens';
import { emptyDoc } from './model';
import { importFile } from './importers';
import { decodeDoc, encodeDoc } from './share';

const samples = ['#000000', '#FFFFFF', '#808080', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#00FFFF', '#FF00FF', '#7A607F', '#A84865', '#3F7D6D', '#EEF3FF', '#202C45'];

describe('theme colour matching', () => {
  it.each(['light', 'dark'] as const)('keeps generated %s lines visible on the canvas and all preset section fills', (theme) => {
    const backgrounds = [tokens.themes[theme].surface, ...PALETTE_IDS.flatMap((p) => tints(p, theme))];
    for (const input of samples) {
      const colour = matchingColour(input, theme, 'line');
      expect(colour).toMatch(/^#[0-9A-F]{6}$/);
      for (const fill of backgrounds) expect(contrastRatio(colour, fill), `${input} → ${colour} on ${fill}`).toBeGreaterThanOrEqual(3);
    }
  });
  it.each(['light', 'dark'] as const)('makes quiet %s fills with readable text, distinct from line colours', (theme) => {
    for (const input of samples) {
      const fill = matchingColour(input, theme, 'fill');
      expect(contrastRatio(fill, sectionInk(fill, theme))).toBeGreaterThanOrEqual(4.5);
      expect(fill).not.toBe(matchingColour(input, theme, 'line'));
      expect(contrastRatio(fill, tokens.themes[theme].surface)).toBeLessThan(2);
    }
  });
  it.each(['light', 'dark'] as const)('keeps primary hue families and neutral colours in %s', (theme) => {
    const rgb = (value: string) => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
    ['#FF0000', '#00FF00', '#0000FF'].forEach((input, i) => {
      const channels = rgb(matchingColour(input, theme, 'line'));
      expect(channels[i]).toBe(Math.max(...channels));
    });
    for (const grey of ['#000000', '#808080', '#FFFFFF']) {
      const channels = rgb(matchingColour(grey, theme, 'line'));
      expect(Math.max(...channels) - Math.min(...channels)).toBeLessThanOrEqual(1);
    }
  });
  it('normalises input, is deterministic and rejects invalid colours', () => {
    expect(matchingColour('#abc', 'dark', 'line')).toBe(matchingColour('#AABBCC', 'dark', 'line'));
    expect(() => matchingColour('not a colour', 'light', 'fill')).toThrow(/hex colour/);
  });
  it('matches in either direction in a single edit while preserving the edited colour', () => {
    const pair: ColourPair = { light: '#7A607F', dark: '#CBB0D1', matchThemes: true };
    const fromLight = editColourPair(pair, 'light', '#A84865', 'line');
    expect(fromLight.light).toBe('#A84865');
    expect(fromLight.dark).toBe(matchingColour('#A84865', 'dark', 'line'));
    const fromDark = editColourPair(fromLight, 'dark', '#86A8D6', 'line');
    expect(fromDark.dark).toBe('#86A8D6');
    expect(fromDark.light).toBe(matchingColour('#86A8D6', 'light', 'line'));
    expect(pair).toEqual({ light: '#7A607F', dark: '#CBB0D1', matchThemes: true });
  });
  it('keeps existing manual pairs independent until matching is explicitly enabled', () => {
    const old = { light: '#7A607F', dark: '#CBB0D1' };
    expect(editColourPair(old, 'light', '#FF0000', 'line').dark).toBe(old.dark);
    const linked = editColourPair(old, 'light', old.light, 'line', true);
    expect(linked.dark).not.toBe(old.dark);
    expect(editColourPair(linked, 'dark', '#AAAAAA', 'line', false).light).toBe(old.light);
  });
  it.each(['line', 'fill'] as const)('changes only the paired palette %s slot without mutating its source', (role) => {
    const palette = copyPalette('nordic');
    const before = structuredClone(palette);
    const edited = editPaletteColour(palette, 'dark', role, 1, '#BD95C5');
    expect(palette).toEqual(before);
    if (role === 'line') {
      expect(edited.lines[1].dark).toBe('#BD95C5');
      expect(edited.lines[1].light).toBe(matchingColour('#BD95C5', 'light', role));
      expect(edited.lines[0]).toEqual(before.lines[0]);
      expect(edited.tints).toEqual(before.tints);
    } else {
      expect(edited.tints.dark[1]).toBe('#BD95C5');
      expect(edited.tints.light[1]).toBe(matchingColour('#BD95C5', 'light', role));
      expect(edited.tints.light[0]).toBe(before.tints.light[0]);
      expect(edited.lines).toEqual(before.lines);
    }
  });
  it('rematches from the visible variant and preserves slot names and patterns', () => {
    const palette = copyPalette('graphite');
    const linked = matchPalette(palette, 'dark');
    expect(linked.lines.map((l) => l.dark)).toEqual(palette.lines.map((l) => l.dark));
    expect(linked.lines[4].pattern).toBe(palette.lines[4].pattern);
    expect(linked.lines[4].name).toBe(palette.lines[4].name);
    expect(linked.tints.dark).toEqual(palette.tints.dark);
    const manual = { ...linked, matchThemes: false };
    expect(editPaletteColour(manual, 'light', 'line', 0, '#112233').lines[0].dark).toBe(linked.lines[0].dark);
    expect(editPaletteColour(manual, 'light', 'fill', 0, '#112233').tints.dark[0]).toBe(linked.tints.dark[0]);
  });
  it('saves both resolved colours and matching preferences in map files and shared copies', async () => {
    const doc = emptyDoc();
    doc.palette = 'custom';
    doc.customPalette = matchPalette(copyPalette('nordic'), 'light');
    doc.lines[0].colour = editColourPair({ light: '#7A607F', dark: '#CBB0D1' }, 'dark', '#86A8D6', 'line', true);
    expect(await importFile(new File([JSON.stringify(doc)], 'matched.json'))).toEqual(doc);
    expect(await decodeDoc(await encodeDoc(doc))).toEqual(doc);
    expect(copyPalette(doc)).toEqual(doc.customPalette);
    expect(copyPalette(doc)).not.toBe(doc.customPalette);
  });
  it('rejects malformed matching preferences instead of silently linking manual colours', () => {
    const doc = emptyDoc();
    doc.customPalette = { ...copyPalette('nordic'), matchThemes: 'yes' as unknown as boolean };
    expect(() => validateMapColours(doc)).toThrow(/custom palette/);
    delete doc.customPalette;
    doc.lines[0].colour = { light: '#112233', dark: '#AABBCC', matchThemes: 'yes' as unknown as boolean };
    expect(() => validateMapColours(doc)).toThrow(/custom colour/);
  });
});
