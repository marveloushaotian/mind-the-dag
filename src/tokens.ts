import raw from '../design/tokens.json';

/** Design tokens (design/tokens.json) with a few typed accessors. */
export const tokens = raw;

export type PaletteId = keyof typeof raw.palettes;
export type ThemeId = keyof typeof raw.themes;
export type LinePattern = 'solid' | 'dashed' | 'dotted' | 'hollow';
export type ColourPair = Record<ThemeId, string> & { matchThemes?: boolean };
export interface CustomPalette {
  name: string;
  matchThemes?: boolean;
  lines: (ColourPair & { name: string; pattern?: 'dashed' | 'dotted' })[];
  tints: Record<ThemeId, string[]>;
}
export interface PaletteDocument {
  palette: PaletteId | 'custom';
  customPalette?: CustomPalette;
}
export type PaletteSource = PaletteId | PaletteDocument;

/** Store plain sRGB hex colours, safe to reuse in CSS, SVG and PDF. */
export function normaliseColour(value: string): string | null {
  const hex = value.trim().replace(/^#/, '');
  if (/^[\da-f]{3}$/i.test(hex)) return '#' + [...hex].map((c) => c + c).join('').toUpperCase();
  return /^[\da-f]{6}$/i.test(hex) ? '#' + hex.toUpperCase() : null;
}

function custom(source: PaletteSource): CustomPalette | undefined {
  if (typeof source === 'string' || source.palette !== 'custom') return undefined;
  if (!source.customPalette) throw new Error('The custom palette is missing.');
  return source.customPalette;
}
const preset = (source: PaletteSource): PaletteId => typeof source === 'string' ? source : source.palette as PaletteId;

export interface PaletteLine {
  name: string;
  light?: string;
  dark?: string;
  ref?: string;
  pattern?: 'dashed' | 'dotted';
}

export function paletteLines(source: PaletteSource): PaletteLine[] {
  return custom(source)?.lines ?? raw.palettes[preset(source)].lines as PaletteLine[];
}

/** Resolve palette slot `index` to a stroke colour and dash pattern for a theme. */
export function lineStyle(source: PaletteSource, index: number, theme: ThemeId = 'light', override?: ColourPair) {
  const lines = paletteLines(source);
  const slot = lines[((index % lines.length) + lines.length) % lines.length];
  const base = slot.ref ? lines.find((l) => l.name === slot.ref)! : slot;
  const color = override?.[theme] ?? (theme === 'dark' ? base.dark : base.light) ?? base.light ?? '#000000';
  const pattern = slot.pattern ?? null;
  return { color, pattern, name: slot.name };
}

/** One stroke language for canvas, legend, previews and exports, scaled by weight. */
export function linePaint(source: PaletteSource, index: number, theme: ThemeId = 'light', override?: LinePattern, width: number = tokens.line.width, colour?: ColourPair) {
  const style = lineStyle(source, index, theme, colour);
  const pattern = override ?? style.pattern ?? 'solid';
  const lengths = pattern === 'dashed' ? tokens.line.patterns.dashed : pattern === 'dotted' ? tokens.line.patterns.dotted.dash : null;
  const cap: 'butt' | 'round' = pattern === 'solid' || pattern === 'hollow' ? 'butt' : 'round';
  const dash = lengths?.map((value) => Math.round(value * width / tokens.line.width * 1000) / 1000).join(' ');
  return { color: style.color, pattern, dash, cap };
}

export function tints(source: PaletteSource, theme: ThemeId = 'light'): string[] {
  return custom(source)?.tints[theme] ?? raw.palettes[preset(source)].tints[theme];
}

export function copyPalette(source: PaletteSource): CustomPalette {
  const lines = paletteLines(source);
  const active = custom(source);
  if (active) return structuredClone(active);
  return {
    name: 'My palette',
    matchThemes: true,
    lines: lines.map((line, i) => ({ name: `Colour ${i + 1}`, light: lineStyle(source, i, 'light').color,
      dark: lineStyle(source, i, 'dark').color, ...(line.pattern ? { pattern: line.pattern } : {}) })),
    tints: { light: [...tints(source, 'light')], dark: [...tints(source, 'dark')] },
  };
}

export function sectionFill(source: PaletteSource, section: { tint: number; fill?: ColourPair }, theme: ThemeId): string {
  const colours = tints(source, theme);
  return section.fill?.[theme] ?? colours[((section.tint % colours.length) + colours.length) % colours.length];
}

const luminance = (hex: string) => {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
export function contrastRatio(a: string, b: string): number {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function sectionInk(fill: string, theme: ThemeId): string {
  const preferred = tokens.themes[theme].ink;
  if (contrastRatio(fill, preferred) >= 4.5) return preferred;
  return contrastRatio(fill, '#000000') >= contrastRatio(fill, '#FFFFFF') ? '#000000' : '#FFFFFF';
}

const isPair = (value: unknown): value is ColourPair => {
  const pair = value as ColourPair | undefined;
  return !!pair && (pair.matchThemes === undefined || typeof pair.matchThemes === 'boolean')
    && (['light', 'dark'] as const).every((theme) => typeof pair[theme] === 'string' && /^#[\da-f]{6}$/i.test(pair[theme]));
};
/** Older maps need no migration; new optional colour data must be well formed. */
export function validateMapColours(doc: { palette?: unknown; customPalette?: unknown; lines?: unknown; sections?: unknown }): void {
  if (doc.palette === 'custom' || doc.customPalette !== undefined) {
    const p = doc.customPalette as CustomPalette | undefined;
    if (!p || typeof p.name !== 'string' || !p.name.trim() || (p.matchThemes !== undefined && typeof p.matchThemes !== 'boolean')
      || !Array.isArray(p.lines) || !p.lines.length || p.lines.length > 32
      || !p.lines.every((l) => isPair(l) && typeof l.name === 'string' && (!l.pattern || ['dashed', 'dotted'].includes(l.pattern)))
      || !p.tints || !(['light', 'dark'] as const).every((theme) => Array.isArray(p.tints[theme]) && p.tints[theme].length > 0 && p.tints[theme].length <= 32
        && p.tints[theme].every((c) => typeof c === 'string' && /^#[\da-f]{6}$/i.test(c))))
      throw new Error('The custom palette needs valid light and dark hex colours.');
    if (p.tints.light.length !== p.tints.dark.length) throw new Error('Light and dark section fills must have matching slots.');
  }
  for (const line of Array.isArray(doc.lines) ? doc.lines : [])
    if (line.colour !== undefined && !isPair(line.colour)) throw new Error('A line has an invalid custom colour.');
  for (const section of Array.isArray(doc.sections) ? doc.sections : [])
    if (section.fill !== undefined && !isPair(section.fill)) throw new Error('A section has an invalid custom fill.');
}

export const PALETTE_IDS = Object.keys(raw.palettes) as PaletteId[];
