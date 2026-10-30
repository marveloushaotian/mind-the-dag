import { useEffect, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Doc } from './model';
import { MetroMap } from './render';
import { tokens, type ThemeId } from './tokens';

/** Journal export: 1 px = 0.5 pt (spec §12). */
export const PT_PER_PX = tokens.export.journal.pxToPt;
const MM_PER_PT = 25.4 / 72;
const PAD = 24;
const WEIGHTS = [400, 600, 700] as const;

export function download(name: string, data: Blob) {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slug(s: string) {
  return (s || 'map').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'map';
}

// ------------------------------------------------------------------ fonts
const fontCache = new Map<number, ArrayBuffer>();
async function fontBytes(w: number): Promise<ArrayBuffer> {
  const hit = fontCache.get(w);
  if (hit) return hit;
  const res = await fetch(`${import.meta.env.BASE_URL}fonts/Inter-${w}.ttf`);
  if (!res.ok) throw new Error(`font Inter ${w} not found`);
  const buf = await res.arrayBuffer();
  fontCache.set(w, buf);
  return buf;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function fontFaceCss(): Promise<string> {
  const faces = await Promise.all(
    WEIGHTS.map(async (w) => `@font-face{font-family:Inter;font-weight:${w};font-style:normal;src:url(data:font/ttf;base64,${toBase64(await fontBytes(w))}) format('truetype');}`),
  );
  return faces.join('');
}

// ------------------------------------------------------------------ svg
export interface BuiltSvg {
  svg: string;
  width: number;
  height: number;
}

/** Measure the map's bounding box by rendering it into a hidden SVG. */
function measure(markup: string): { x: number; y: number; w: number; h: number } {
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;';
  host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">${markup}</svg>`;
  document.body.appendChild(host);
  try {
    const g = host.querySelector('g.metro') as SVGGElement;
    const b = g.getBBox();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  } finally {
    host.remove();
  }
}

export type Background = 'transparent' | 'white';

export async function buildSvg(doc: Doc, theme: ThemeId, opts: { embedFonts: boolean; background?: Background }): Promise<BuiltSvg> {
  await document.fonts.ready;
  const markup = renderToStaticMarkup(<MetroMap doc={doc} theme={theme} exporting />);
  const b = measure(markup);
  if (!b.w || !b.h) throw new Error('the map is empty');
  const x = Math.floor(b.x - PAD);
  const y = Math.floor(b.y - PAD);
  const width = Math.ceil(b.w + 2 * PAD);
  const height = Math.ceil(b.h + 2 * PAD);
  const fill = theme === 'dark' ? tokens.themes.dark.background : opts.background === 'white' ? '#FFFFFF' : null;
  const bg = fill ? `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"/>` : '';
  const style = opts.embedFonts ? `<defs><style>${await fontFaceCss()}</style></defs>` : '';
  const title = `<title>${escapeXml(doc.title)}</title>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}">` +
    `${title}${style}${bg}${markup}</svg>`;
  return { svg, width, height };
}

function escapeXml(s: string) {
  return s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
}

// ------------------------------------------------------------------ png
export async function buildPng(doc: Doc, theme: ThemeId, scale: number, background: Background = 'transparent'): Promise<Blob> {
  const { svg, width, height } = await buildSvg(doc, theme, { embedFonts: true, background });
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((ok, fail) => {
      img.onload = () => ok();
      img.onerror = () => fail(new Error('could not rasterise the SVG'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('PNG encoding failed'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ------------------------------------------------------------------ pdf
export async function buildPdf(doc: Doc, theme: ThemeId, ptPerPx = PT_PER_PX, background: Background = 'transparent'): Promise<Blob> {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const { svg, width, height } = await buildSvg(doc, theme, { embedFonts: false, background });
  const w = width * ptPerPx;
  const h = height * ptPerPx;
  const pdf = new jsPDF({ unit: 'pt', format: [w, h], orientation: w > h ? 'landscape' : 'portrait', compress: true });
  for (const wt of WEIGHTS) {
    const file = `Inter-${wt}.ttf`;
    pdf.addFileToVFS(file, toBase64(await fontBytes(wt)));
    // svg2pdf asks jsPDF for 'normal' (400), 'bold' (700) and, for other weights,
    // 'normal600' or '600normal' depending on the jsPDF version it detects.
    const styles = wt === 400 ? ['normal'] : wt === 700 ? ['bold'] : [`normal${wt}`, `${wt}normal`];
    for (const st of styles) pdf.addFont(file, 'Inter', st);
  }
  pdf.setProperties({ title: doc.title, creator: 'mind-the-dag' });
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;';
  host.innerHTML = svg;
  document.body.appendChild(host);
  try {
    await svg2pdf(host.querySelector('svg')!, pdf, { x: 0, y: 0, width: w, height: h });
  } finally {
    host.remove();
  }
  return pdf.output('blob');
}

// ------------------------------------------------------------------ journal fit
export function journalFit(widthPx: number) {
  const mm = widthPx * PT_PER_PX * MM_PER_PT;
  const cols = tokens.export.journal.columnsMm;
  const fits = mm <= cols.single ? 'single column (89 mm)' : mm <= cols.oneAndHalf[1] ? '1.5 columns (120–136 mm)' : mm <= cols.double ? 'double column (183 mm)' : null;
  return { mm, fits };
}

export type ExportFormat = 'svg' | 'pdf' | 'png';

/** Keep export failures visible, including the common stale-tab chunk error. */
export function exportError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message))
    return 'The export tools could not be loaded. Reload this page and try exporting again.';
  if (message === 'the map is empty')
    return 'There is nothing to export yet. Add a station or section, or turn on the legend.';
  if (/^font Inter \d+ not found$/.test(message))
    return `An export font could not be loaded. Check your connection and try again. (${message})`;
  return `Export failed: ${message}`;
}

export function ExportDialog({ doc, theme, format, onClose, onDone }: { doc: Doc; theme: ThemeId; format: ExportFormat; onClose: () => void; onDone: (m: string) => void }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [scale, setScale] = useState<'journal' | 'screen'>('journal');
  const [pngScale, setPngScale] = useState<'300' | '2x' | '1x'>('300');
  const [background, setBackground] = useState<Background>('transparent');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setSize(null);
    setError(null);
    buildSvg(doc, theme, { embedFonts: false })
      .then((b) => { if (live) setSize({ w: b.width, h: b.height }); })
      .catch((err: unknown) => { if (live) setError(exportError(err)); });
    return () => { live = false; };
  }, [doc, theme]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const ptPerPx = scale === 'journal' ? PT_PER_PX : 0.75;
  const pngFactor = pngScale === '300' ? (300 / 72) * PT_PER_PX : pngScale === '2x' ? 2 : 1;
  const name = slug(doc.title);
  let summary = '';
  if (size) {
    if (format === 'png') summary = `${Math.round(size.w * pngFactor)} × ${Math.round(size.h * pngFactor)} px`;
    else {
      const mmW = size.w * ptPerPx * MM_PER_PT;
      const mmH = size.h * ptPerPx * MM_PER_PT;
      summary = `${mmW.toFixed(0)} × ${mmH.toFixed(0)} mm`;
    }
  }
  const fit = size && (format === 'pdf' ? scale === 'journal' : format === 'png' ? pngScale === '300' : false) ? journalFit(size.w) : null;

  const go = async () => {
    if (busy || !size) return;
    setError(null);
    setBusy(true);
    try {
      if (format === 'svg') download(`${name}.svg`, new Blob([(await buildSvg(doc, theme, { embedFonts: true, background })).svg], { type: 'image/svg+xml' }));
      if (format === 'pdf') download(`${name}.pdf`, await buildPdf(doc, theme, ptPerPx, background));
      if (format === 'png') download(`${name}${pngScale === '2x' ? '@2x' : ''}.png`, await buildPng(doc, theme, pngFactor, background));
      onDone(`Exported ${format.toUpperCase()}`);
      onClose();
    } catch (err) {
      setError(exportError(err));
      setBusy(false);
    }
  };

  const Seg = <T extends string>({ value, set, options }: { value: T; set: (v: T) => void; options: [T, string][] }) => (
    <div className="seg">
      {options.map(([v, l]) => (
        <button key={v} className={value === v ? 'on' : ''} onClick={() => set(v)}>
          {l}
        </button>
      ))}
    </div>
  );

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Export ${format.toUpperCase()}`}>
        <h2>Export {format.toUpperCase()}</h2>
        {format === 'pdf' && (
          <div className="field">
            <span>Scale</span>
            <Seg value={scale} set={setScale} options={[['journal', 'Journal'], ['screen', 'Screen']]} />
          </div>
        )}
        {format === 'png' && (
          <div className="field">
            <span>Resolution</span>
            <Seg value={pngScale} set={setPngScale} options={[['300', '300 dpi'], ['2x', '2×'], ['1x', '1×']]} />
          </div>
        )}
        {theme === 'light' && (
          <div className="field">
            <span>Background</span>
            <Seg value={background} set={setBackground} options={[['transparent', 'Transparent'], ['white', 'White']]} />
          </div>
        )}
        {summary && (
          <p className="summary">
            {summary}
            {fit?.fits && ` · fits a ${fit.fits}`}
          </p>
        )}
        {fit && !fit.fits && <p className="note">Larger than a journal double column (183 mm). This does not prevent export.</p>}
        {error && <p className="note warn" role="alert">{error}</p>}
        <div className="actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={go} disabled={busy || !size}>
            {busy ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
}
