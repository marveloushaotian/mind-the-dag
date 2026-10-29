import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { emptyDoc, derive } from './model';
import { copyPalette, linePaint, lineStyle, normaliseColour, PALETTE_IDS, sectionFill, sectionInk, contrastRatio, tints, validateMapColours } from './tokens';
import { edgeGeometry, MetroMap } from './render';
import { importFile } from './importers';
import { decodeDoc, encodeDoc } from './share';
import { TOOLS } from './panels';

function map() {
  const doc = emptyDoc();
  doc.stations = [
    { id: 'a', x: 0, y: 0, label: 'Input', kind: 'step', axis: 'h', labelSide: 'auto' },
    { id: 'b', x: 240, y: 80, label: 'Output', kind: 'step', axis: 'h', labelSide: 'auto' },
  ];
  doc.edges = [{ id: 'ab', from: 'a', to: 'b', lines: ['l1'], bend: 0.5 }];
  doc.sections = [{ id: 's', x: -60, y: -70, w: 400, h: 220, name: 'Analysis', tint: 0 }];
  return doc;
}

describe('custom colours', () => {
  it.each([['abc', '#AABBCC'], ['#7c3aed', '#7C3AED'], ['  #123456  ', '#123456'], ['#fff', '#FFFFFF']])('normalises %s', (input, result) => {
    expect(normaliseColour(input)).toBe(result);
  });
  it.each(['red', '#12', '#12345678', 'url(https://example.test)', '#GGGGGG'])('rejects incomplete or non-hex %s', (input) => {
    expect(normaliseColour(input)).toBeNull();
  });
  it.each(PALETTE_IDS)('provides eight paired section fills without changing existing slots (%s)', (palette) => {
    expect(tints(palette, 'light')).toHaveLength(8);
    expect(tints(palette, 'dark')).toHaveLength(8);
    expect(new Set(tints(palette))).toHaveProperty('size', 8);
  });
  it('copies referenced Graphite colours and dash patterns into an independent custom palette', () => {
    const doc = emptyDoc();
    doc.customPalette = copyPalette('graphite');
    doc.palette = 'custom';
    expect(linePaint(doc, 4, 'light')).toEqual(linePaint('graphite', 4, 'light'));
    doc.customPalette.lines[0].light = '#334455';
    expect(lineStyle('graphite', 0).color).toBe('#1F2328');
  });
  it.each(['light', 'dark'] as const)('applies line and fill overrides identically on the canvas and exported SVG (%s)', (theme) => {
    const doc = map();
    const before = edgeGeometry(derive(doc), doc.edges[0]);
    doc.customPalette = copyPalette('nordic');
    doc.customPalette.lines[0] = { name: 'Rose', light: '#A84865', dark: '#EFB7CA' };
    doc.palette = 'custom';
    doc.lines[0].pattern = 'hollow';
    doc.lines[0].colour = { light: '#6D28D9', dark: '#C4B5FD' };
    doc.sections[0].fill = { light: '#0B2230', dark: '#F4E3C8' };
    expect(edgeGeometry(derive(doc), doc.edges[0])).toEqual(before);
    const colour = doc.lines[0].colour[theme];
    for (const exporting of [false, true]) {
      const svg = renderToStaticMarkup(<MetroMap doc={doc} theme={theme} exporting={exporting} />);
      expect((svg.match(new RegExp(`fill="none" stroke="${colour}"`, 'g')) ?? [])).toHaveLength(2);
      expect(svg).toContain(`fill="${doc.sections[0].fill[theme]}"`);
      expect(svg).toContain(`fill="${sectionInk(doc.sections[0].fill[theme], theme)}"`);
    }
    delete doc.lines[0].colour;
    delete doc.sections[0].fill;
    expect(lineStyle(doc, 0, theme).color).toBe(doc.customPalette.lines[0][theme]);
    expect(sectionFill(doc, doc.sections[0], theme)).toBe(doc.customPalette.tints[theme][0]);
  });
  it.each(['#000000', '#FFFFFF', '#7C3AED', '#FFF1A0'])('keeps section headers readable on %s in either theme', (fill) => {
    for (const theme of ['light', 'dark'] as const) expect(contrastRatio(fill, sectionInk(fill, theme))).toBeGreaterThanOrEqual(4.5);
  });
  it('round-trips custom palettes and per-object colours through map files and share links', async () => {
    const doc = map();
    doc.palette = 'custom';
    doc.customPalette = copyPalette('nordic');
    doc.lines[0].colour = { light: '#6D28D9', dark: '#C4B5FD' };
    doc.sections[0].fill = { light: '#EEF3FF', dark: '#202C45' };
    expect(await importFile(new File([JSON.stringify(doc)], 'colours.json'))).toEqual(doc);
    expect(await decodeDoc(await encodeDoc(doc))).toEqual(doc);
  });
  it('rejects a missing custom palette or malformed imported colours', async () => {
    const doc = map();
    doc.palette = 'custom';
    expect(() => validateMapColours(doc)).toThrow(/custom palette/i);
    doc.customPalette = copyPalette('nordic');
    doc.customPalette.tints.dark.pop();
    await expect(importFile(new File([JSON.stringify(doc)], 'invalid.json'))).rejects.toThrow(/matching slots/i);
    doc.palette = 'nordic';
    delete doc.customPalette;
    doc.lines[0].colour = { light: 'red', dark: '#FFFFFF' };
    await expect(decodeDoc(await encodeDoc(doc))).rejects.toThrow(/invalid custom colour/i);
  });
  it('keeps old map files valid without adding custom state', async () => {
    const doc = map();
    expect(await importFile(new File([JSON.stringify(doc)], 'old.json'))).toEqual(doc);
    expect(doc).not.toHaveProperty('customPalette');
  });
});

it('places Station and Connect together on S and C, without shortcut collisions', () => {
  expect(TOOLS.find((t) => t.id === 'station')?.key).toBe('S');
  expect(TOOLS.find((t) => t.id === 'line')?.key).toBe('C');
  expect(new Set(TOOLS.map((t) => t.key)).size).toBe(TOOLS.length);
});
