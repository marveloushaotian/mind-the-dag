import { useEffect, useRef, useState } from 'react';
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

export async function buildSvg(doc: Doc, theme: ThemeId, opts: { embedFonts: boolean }): Promise<BuiltSvg> {
  await document.fonts.ready;
  const markup = renderToStaticMarkup(<MetroMap doc={doc} theme={theme} exporting />);
  const b = measure(markup);
  if (!b.w || !b.h) throw new Error('the map is empty');
  const x = Math.floor(b.x - PAD);
  const y = Math.floor(b.y - PAD);
  const width = Math.ceil(b.w + 2 * PAD);
  const height = Math.ceil(b.h + 2 * PAD);
  const bg = theme === 'dark' ? `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${tokens.themes.dark.background}"/>` : '';
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
export async function buildPng(doc: Doc, theme: ThemeId, scale: number): Promise<Blob> {
  const { svg, width, height } = await buildSvg(doc, theme, { embedFonts: true });
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
export async function buildPdf(doc: Doc, theme: ThemeId): Promise<Blob> {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const { svg, width, height } = await buildSvg(doc, theme, { embedFonts: false });
  const w = width * PT_PER_PX;
  const h = height * PT_PER_PX;
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

export function ExportMenu({ doc, theme, onMessage }: { doc: Doc; theme: ThemeId; onMessage: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, []);
  useEffect(() => {
    if (!open) return;
    buildSvg(doc, theme, { embedFonts: false })
      .then((b) => setSize({ w: b.width, h: b.height }))
      .catch(() => setSize(null));
  }, [open, doc, theme]);

  const name = slug(doc.title);
  const run = async (label: string, fn: () => Promise<void> | void) => {
    setOpen(false);
    try {
      await fn();
      onMessage(`Exported ${label}`);
    } catch (err) {
      onMessage(`Export failed: ${(err as Error).message}`);
    }
  };
  const fit = size ? journalFit(size.w) : null;
  const dpiScale = (300 / 72) * PT_PER_PX;

  return (
    <div className="menu" ref={ref}>
      <button className="primary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Export ▾
      </button>
      {open && (
        <div className="menu-list" role="menu">
          {size && fit && (
            <div className={`fit${fit.fits ? '' : ' warn'}`}>
              {size.w} × {size.h} px → {fit.mm.toFixed(0)} mm wide at 1 px = 0.5 pt.{' '}
              {fit.fits ? `Fits a ${fit.fits}.` : 'Too wide for a 183 mm double column: consider an overview + detail split.'}
            </div>
          )}
          <button role="menuitem" onClick={() => run('SVG', async () => download(`${name}.svg`, new Blob([(await buildSvg(doc, theme, { embedFonts: true })).svg], { type: 'image/svg+xml' })))}>
            SVG <span className="sub">vector, Inter embedded</span>
          </button>
          <button role="menuitem" onClick={() => run('PDF', async () => download(`${name}.pdf`, await buildPdf(doc, theme)))}>
            PDF <span className="sub">vector, journal scale, Inter embedded</span>
          </button>
          <button role="menuitem" onClick={() => run('PNG', async () => download(`${name}.png`, await buildPng(doc, theme, dpiScale)))}>
            PNG <span className="sub">300 dpi at journal scale</span>
          </button>
          <button role="menuitem" onClick={() => run('PNG', async () => download(`${name}@2x.png`, await buildPng(doc, theme, 2)))}>
            PNG <span className="sub">2× for slides and web</span>
          </button>
          <div className="sep" />
          <button
            role="menuitem"
            onClick={() => run('map file', () => download(`${name}.json`, new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })))}
          >
            Map file <span className="sub">.json, opens again here</span>
          </button>
          <div className="label">Light theme exports with a transparent background.</div>
        </div>
      )}
    </div>
  );
}
