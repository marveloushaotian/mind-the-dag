import raw from '../design/tokens.json';

/** Design tokens (design/tokens.json) with a few typed accessors. */
export const tokens = raw;

export type PaletteId = keyof typeof raw.palettes;
export type ThemeId = keyof typeof raw.themes;

export interface PaletteLine {
  name: string;
  light?: string;
  dark?: string;
  ref?: string;
  pattern?: 'dashed' | 'dotted';
}

export function paletteLines(id: PaletteId): PaletteLine[] {
  return raw.palettes[id].lines as PaletteLine[];
}

/** Resolve palette slot `index` to a stroke colour and dash pattern for a theme. */
export function lineStyle(id: PaletteId, index: number, theme: ThemeId = 'light') {
  const lines = paletteLines(id);
  const slot = lines[((index % lines.length) + lines.length) % lines.length];
  const base = slot.ref ? lines.find((l) => l.name === slot.ref)! : slot;
  const color = (theme === 'dark' ? base.dark : base.light) ?? base.light ?? '#000000';
  const pattern = slot.pattern ?? null;
  return { color, pattern, name: slot.name };
}

export function tints(id: PaletteId, theme: ThemeId = 'light'): string[] {
  return raw.palettes[id].tints[theme];
}

export const PALETTE_IDS = Object.keys(raw.palettes) as PaletteId[];
