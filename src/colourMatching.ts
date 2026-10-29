import { normaliseColour, type ColourPair, type CustomPalette, type ThemeId } from './tokens';

export type ColourRole = 'line' | 'fill';
type RGB = [number, number, number];
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const linear = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const encoded = (c: number) => c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
function requireColour(input: string): string {
  const hex = normaliseColour(input);
  if (!hex) throw new Error('Colour matching needs a valid hex colour.');
  return hex;
}

// Oklab matrices: https://bottosson.github.io/posts/oklab/ (public domain).
// Adjusting polar chroma at fixed hue avoids the colour shifts of RGB inversion.
function toLab(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => linear(parseInt(hex.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  };
}

function toRGB(L: number, a: number, b: number): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
}

/** Match a theme by role, retaining hue and reducing chroma into sRGB gamut. */
export function matchingColour(input: string, target: ThemeId, role: ColourRole): string {
  const hex = requireColour(input);
  const lab = toLab(hex);
  const C = Math.hypot(lab.a, lab.b);
  const hue = C < 0.00001 ? 0 : Math.atan2(lab.b, lab.a);
  const L = role === 'fill'
    ? target === 'dark' ? clamp(0.24 + (lab.L - 0.95) * 0.02) : clamp(0.96 + (lab.L - 0.25) * 0.01)
    : target === 'dark' ? clamp(0.76 + (lab.L - 0.60) * 0.08) : clamp(0.56 + (lab.L - 0.76) * 0.04);
  const desiredC = C < 0.00001 ? 0 : role === 'fill' ? Math.min(C, 0.035) : Math.min(C, 0.15);
  const rgbAt = (chroma: number) => toRGB(L, chroma * Math.cos(hue), chroma * Math.sin(hue));
  const inGamut = (rgb: RGB) => rgb.every((c) => c >= -1e-7 && c <= 1 + 1e-7);
  let rgb = rgbAt(desiredC);
  if (!inGamut(rgb)) {
    let low = 0, high = desiredC;
    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2;
      if (inGamut(rgbAt(mid))) low = mid;
      else high = mid;
    }
    rgb = rgbAt(low);
  }
  return '#' + rgb.map((c) => Math.round(clamp(encoded(clamp(c))) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** One edit produces one pair, so bidirectional matching never feeds back. */
export function editColourPair(pair: ColourPair, source: ThemeId, colour: string, role: ColourRole, matchThemes = pair.matchThemes ?? false): ColourPair {
  colour = requireColour(colour);
  const next = { ...pair, [source]: colour, matchThemes };
  if (matchThemes) next[source === 'light' ? 'dark' : 'light'] = matchingColour(colour, source === 'light' ? 'dark' : 'light', role);
  return next;
}

/** Enabling matching explicitly rematches the palette from the visible variant. */
export function matchPalette(palette: CustomPalette, source: ThemeId): CustomPalette {
  const target = source === 'light' ? 'dark' : 'light';
  return {
    ...palette, matchThemes: true,
    lines: palette.lines.map((line) => ({ ...line, [target]: matchingColour(line[source], target, 'line') })),
    tints: { ...palette.tints, [target]: palette.tints[source].map((colour) => matchingColour(colour, target, 'fill')) },
  };
}

/** A single palette edit changes only its paired slot and preserves names/styles. */
export function editPaletteColour(palette: CustomPalette, source: ThemeId, role: ColourRole, index: number, colour: string): CustomPalette {
  colour = requireColour(colour);
  const target = source === 'light' ? 'dark' : 'light';
  if (role === 'line') return { ...palette, lines: palette.lines.map((line, i) => i === index
    ? { ...line, [source]: colour, ...(palette.matchThemes ? { [target]: matchingColour(colour, target, role) } : {}) } : line) };
  return { ...palette, tints: {
    ...palette.tints,
    [source]: palette.tints[source].map((value, i) => i === index ? colour : value),
    ...(palette.matchThemes ? { [target]: palette.tints[target].map((value, i) => i === index ? matchingColour(colour, target, role) : value) } : {}),
  } };
}
