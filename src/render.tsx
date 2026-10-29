import { useId, type ReactNode } from 'react';
import { hollowPath, laneToLeftOffset, offsetFitsCorners, offsetPolyline, roundedPath, routeCentre, type Pt } from './geometry';
import { derive, laneOffset, lanePoint, stationMarker, PITCH, type Derived, type Doc, type Edge, type LabelSide, type Line, type Station } from './model';
import { linePaint, tints, tokens, type PaletteId, type ThemeId } from './tokens';

/**
 * Pure SVG rendering of a Doc in the mind-the-dag style. Interactive editors
 * read `data-sel="kind:id"` attributes on the elements for hit-testing.
 */

export interface RenderOptions {
  theme?: ThemeId;
  /** Export mode: no editor hints, halos only inside sections. */
  exporting?: boolean;
  selected?: ReadonlySet<string>;
  /** Editor-only candidate; its geometry is identical to the committed connection. */
  previewConnection?: { edgeId: string; lineId: string };
}

const W = tokens.line.width;
const R45 = tokens.line.radius45;
const R90 = tokens.line.radius90;
const ACCENT = '#1F6FAE';

interface Theme {
  ink: string;
  surface: string;
  muted: string;
  inactive: string;
}

function themeColours(theme: ThemeId): Theme {
  const t = tokens.themes[theme];
  return { ink: t.ink, surface: t.surface, muted: t.muted, inactive: t.inactive };
}

export interface EdgeGeometry {
  centre: Pt[];
  /** Curved middle of the visible bundle, used for selection and hit testing. */
  d: string;
  /** Each lane references either the original route or its own joining/leaving route. */
  lines: { id: string; d: string; o: number; centre: Pt[] }[];
  width: number;
  radii: { r45: number; r90: number };
}

export function edgeGeometry(dv: Derived, e: Edge): EdgeGeometry | null {
  const A = dv.byId.get(e.from);
  const B = dv.byId.get(e.to);
  if (!A || !B) return null;
  const ls = e.lines.filter((l) => dv.lineOrder.has(l)).sort((a, b) => dv.lineOrder.get(a)! - dv.lineOrder.get(b)!);
  if (!ls.length) return null;
  // Edge.lines retains connection order. Route the original line first, so adding
  // a parallel line cannot move its corners or change its radii.
  const anchorId = e.lines.find((id) => dv.lineOrder.has(id))!;
  const a0 = e.route?.from ?? laneOffset(dv, A.id, anchorId);
  const b0 = e.route?.to ?? laneOffset(dv, B.id, anchorId);
  const reference = routeCentre(lanePoint(A, a0), A.axis, lanePoint(B, b0), B.axis, e.bend);
  const opts = { r45: R45, r90: R90 };
  if (reference.length < 2) return { centre: reference, d: '', lines: [], width: W, radii: opts };
  const close = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y) < 0.01;
  const lines = ls.map((id) => {
    const PA = lanePoint(A, laneOffset(dv, A.id, id));
    const PB = lanePoint(B, laneOffset(dv, B.id, id));
    const o = laneToLeftOffset(reference, A.axis, laneOffset(dv, A.id, id) - a0);
    const parallel = offsetPolyline(reference, o);
    // A joining/leaving lane may have different ports at the two ends. A very
    // wide inner lane may also exhaust the original corner radius. Give only
    // that lane its own rounded route; keep the established line unchanged.
    const fits = close(parallel[0], PA) && close(parallel.at(-1)!, PB) && offsetFitsCorners(reference, o, opts);
    const centre = fits ? reference : routeCentre(PA, A.axis, PB, B.axis, e.bend);
    const offset = fits ? o : 0;
    return { id, d: roundedPath(centre, offset, opts), o: offset, centre };
  });
  const span = (s: Station) => {
    const offsets = ls.map((id) => laneOffset(dv, s.id, id));
    const min = Math.min(...offsets), max = Math.max(...offsets);
    return { mid: (min + max) / 2, width: max - min + W };
  };
  const sa = span(A), sb = span(B);
  const shared = lines.every((line) => line.centre === reference);
  const mid = shared ? (Math.min(...lines.map((l) => l.o)) + Math.max(...lines.map((l) => l.o))) / 2 : 0;
  const centre = shared ? offsetPolyline(reference, mid) : routeCentre(lanePoint(A, sa.mid), A.axis, lanePoint(B, sb.mid), B.axis, e.bend);
  const d = shared ? roundedPath(reference, mid, opts) : roundedPath(centre, 0, opts);
  return { centre, d, lines, width: Math.max(sa.width, sb.width), radii: opts };
}

/**
 * Which sides of a station (along its flow axis) its connections leave from.
 */
function lineSides(doc: Doc, dv: Derived, s: Station) {
  let neg = false;
  let pos = false;
  for (const e of doc.edges) {
    if (e.from !== s.id && e.to !== s.id) continue;
    const other = dv.byId.get(e.from === s.id ? e.to : e.from);
    if (!other) continue;
    const delta = s.axis === 'h' ? other.x - s.x : other.y - s.y;
    if (delta > 0) pos = true;
    else if (delta < 0) neg = true;
  }
  return { neg, pos, toLine: pos ? 1 : neg ? -1 : 1, middle: neg && pos };
}

const LABEL_LINE = 16;

/** Where a station's label goes, and the box it roughly covers (Inter 600, 13 px). */
function labelPlacement(s: Station, dv: Derived, decided?: LabelSide) {
  const ext = stationMarker(dv, s);
  const h = s.axis === 'h';
  let side = decided ?? s.labelSide;
  if (side === 'auto') side = h ? 'above' : 'right';
  const across = h ? ext.across : ext.along;
  const along = h ? ext.along : ext.across;
  // Multi-line labels: the first line is the name (600 · 13), further lines are details (400 · 12).
  const rows = s.label.split('\n');
  const extra = (rows.length - 1) * LABEL_LINE;
  let x = ext.x;
  let y = ext.y;
  let anchor: 'start' | 'middle' | 'end' = 'middle';
  if (side === 'above') y = ext.y - across - 10 - extra;
  else if (side === 'below') y = ext.y + across + 10 + 9.5;
  else if (side === 'right') {
    x = ext.x + along + 10;
    y = ext.y + 4.5 - extra / 2;
    anchor = 'start';
  } else {
    x = ext.x - along - 10;
    y = ext.y + 4.5 - extra / 2;
    anchor = 'end';
  }
  const w = Math.max(...rows.map((r, i) => r.length * (i === 0 ? 7.6 : 6.6)));
  const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'start' ? x : x - w;
  return { x, y, anchor, box: { x0, y0: y - 11, x1: x0 + w, y1: y + extra + 3 } };
}

function sectionAt(doc: Doc, p: Pt) {
  return doc.sections.find((s) => p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h);
}

/** Bounding box of a file icon stack relative to the front sheet's centre. */
export function fileFootprint(count: number, sx: number, sy: number) {
  const n = Math.min(Math.max(count, 1), 3) - 1;
  const ox = 6 * n * sx;
  const oy = 6 * n * sy;
  const s = 1.25; // half the outline
  return {
    x0: Math.min(-20, -16 - s + Math.min(0, ox)),
    x1: Math.max(20, 16 + s + Math.max(0, ox)),
    y0: -20 - s + Math.min(0, oy),
    y1: 20 + s + Math.max(0, oy),
  };
}

function fileIcon(cx: number, cy: number, ext: string, count: number, sx: number, sy: number, th: Theme, key: string): ReactNode {
  const x = cx - 16;
  const y = cy - 20;
  const sheet = (dx: number, dy: number, k: string) => (
    <g key={k}>
      <path
        d={`M ${x + 3 + dx} ${y + dy} H ${x + 22 + dx} L ${x + 32 + dx} ${y + 10 + dy} V ${y + 37 + dy} Q ${x + 32 + dx} ${y + 40 + dy} ${x + 29 + dx} ${y + 40 + dy} H ${x + 3 + dx} Q ${x + dx} ${y + 40 + dy} ${x + dx} ${y + 37 + dy} V ${y + 3 + dy} Q ${x + dx} ${y + dy} ${x + 3 + dx} ${y + dy} Z`}
        fill={th.surface}
        stroke={th.ink}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <path
        d={`M ${x + 22 + dx} ${y + dy} V ${y + 8 + dy} Q ${x + 22 + dx} ${y + 10 + dy} ${x + 24 + dx} ${y + 10 + dy} H ${x + 32 + dx} Z`}
        fill={th.ink}
        stroke={th.ink}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
    </g>
  );
  const sheets: ReactNode[] = [];
  // Back sheets first, stepping away from the line.
  for (let i = Math.min(count, 3) - 1; i >= 1; i--) sheets.push(sheet(6 * i * sx, 6 * i * sy, `${key}s${i}`));
  sheets.push(sheet(0, 0, `${key}s0`));
  return (
    <g key={key}>
      {sheets}
      <rect x={cx - 20} y={y + 19} width={40} height={14} rx={3} fill={th.ink} />
      <text x={cx} y={y + 30} textAnchor="middle" fontSize={10} fontWeight={700} fill={th.surface}>
        {ext}
      </text>
    </g>
  );
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const overlaps = (a: Box, b: Box, m: number) => a.x0 < b.x1 + m && b.x0 < a.x1 + m && a.y0 < b.y1 + m && b.y0 < a.y1 + m;


// ------------------------------------------------------------------ bounds and auto placement
export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Extent of stations (with room for labels and icons) and sections. */
export function contentBounds(doc: Doc): Bounds | null {
  const xs: number[] = [];
  const ys: number[] = [];
  const dv = derive(doc);
  for (const s of doc.stations) {
    const pad = s.file ? 72 : 40;
    const m = stationMarker(dv, s);
    xs.push(m.x0 - pad, m.x1 + pad);
    ys.push(m.y0 - 40, m.y1 + 44);
  }
  for (const s of doc.sections) {
    xs.push(s.x, s.x + s.w);
    ys.push(s.y, s.y + s.h);
  }
  if (!xs.length) return null;
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}


const LEGEND_ROW = 36;
const LEGEND_LINE_WIDTH = tokens.legend.lineSampleWidth;
const LEGEND_LABEL_OFFSET = LEGEND_LINE_WIDTH + 10;

/** Where each legend entry goes: line key wrapped into columns, then the shape key. */
export function legendLayout(doc: Doc, lineNames: string[], kinds: string[]) {
  const cols = Math.max(1, Math.min(4, doc.legend.cols ?? 1));
  const perCol = Math.max(1, Math.ceil(lineNames.length / cols));
  const lines: { dx: number; dy: number }[] = [];
  let dx = 0;
  for (let c = 0; c * perCol < lineNames.length; c++) {
    const chunk = lineNames.slice(c * perCol, (c + 1) * perCol);
    chunk.forEach((_, i) => lines.push({ dx, dy: i * LEGEND_ROW }));
    const longest = Math.max(0, ...chunk.map((n) => n.length));
    // Inter 12 px is about 6.6 px per character.
    dx += Math.max(cols > 1 ? 0 : 212, LEGEND_LABEL_OFFSET + Math.ceil((longest * 6.6) / 8) * 8 + 40);
  }
  const keyRows = cols > 1 ? Math.max(perCol, 1) : Math.max(kinds.length, 1);
  const shapes: { dx: number; dy: number }[] = [];
  kinds.forEach((_, i) => {
    const c = Math.floor(i / keyRows);
    shapes.push({ dx: dx + c * 136, dy: (i % keyRows) * LEGEND_ROW });
  });
  const keyCols = kinds.length ? Math.ceil(kinds.length / keyRows) : 0;
  const width = dx + keyCols * 136;
  const rows = Math.max(Math.min(perCol, lineNames.length), kinds.length ? Math.min(keyRows, kinds.length) : 0, 1);
  return { lines, shapes, width, height: (rows - 1) * LEGEND_ROW + 16 };
}

/** Shape-key entries: only glyphs that appear on the map. */
export function legendKinds(doc: Doc, dv: Derived): string[] {
  const kinds: string[] = [];
  if (doc.stations.some((s) => s.kind === 'step' && (dv.stationLines.get(s.id)?.length ?? 0) <= 1)) kinds.push('step');
  if (doc.stations.some((s) => s.kind === 'step' && (dv.stationLines.get(s.id)?.length ?? 0) > 1)) kinds.push('shared step');
  if (doc.stations.some((s) => s.kind === 'merge')) kinds.push('merge');
  if (doc.stations.some((s) => s.optional)) kinds.push('optional');
  return kinds;
}

const r8 = (v: number) => Math.round(v / 8) * 8;
export const autoLegendPos = (b: Bounds) => ({ x: r8(b.x0), y: r8(b.y1 + 48) });
export const autoTitlePos = (b: Bounds) => ({ x: r8(b.x0), y: r8(b.y0 - 48) });

/** Everything drawn, including legend and title block (for thumbnails). */
export function docBounds(doc: Doc): Bounds | null {
  const c = contentBounds(doc);
  if (!c) return null;
  const b = { ...c };
  if (doc.legend.show) {
    const used = new Set(doc.edges.flatMap((e) => e.lines));
    const names = doc.lines.filter((l) => used.has(l.id)).map((l) => l.name);
    const lay = legendLayout(doc, names, legendKinds(doc, derive(doc)));
    const p = doc.legend.auto ? autoLegendPos(c) : doc.legend;
    b.x0 = Math.min(b.x0, p.x - 16);
    b.x1 = Math.max(b.x1, p.x + lay.width);
    b.y0 = Math.min(b.y0, p.y - 16);
    b.y1 = Math.max(b.y1, p.y + lay.height + 8);
  }
  if (doc.showTitle) {
    const p = doc.titleAuto ? autoTitlePos(c) : doc.titlePos;
    b.x0 = Math.min(b.x0, p.x);
    b.y0 = Math.min(b.y0, p.y - 28);
    b.x1 = Math.max(b.x1, p.x + doc.title.length * 14);
  }
  return b;
}

// ------------------------------------------------------------------ crossings (spec §8)
interface Crossing {
  under: string;
  poly: Pt[];
}

/**
 * Find where connections cross and cut a 4 px gap into the one that goes underneath.
 * The connection carrying more lines stays on top; on a tie, the horizontal or vertical
 * one; then the later one. Connections that share a station never count as crossing.
 */
export function findCrossings(doc: Doc, geoms: Map<string, EdgeGeometry>): Crossing[] {
  const out: Crossing[] = [];
  const list = doc.edges.filter((e) => geoms.has(e.id));
  const drawnWidth = (g: EdgeGeometry) => g.width;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const A = list[i];
      const B = list[j];
      if (A.from === B.from || A.from === B.to || A.to === B.from || A.to === B.to) continue;
      const ga = geoms.get(A.id)!;
      const gb = geoms.get(B.id)!;
      for (let p = 1; p < ga.centre.length; p++) {
        for (let q = 1; q < gb.centre.length; q++) {
          const a0 = ga.centre[p - 1];
          const a1 = ga.centre[p];
          const b0 = gb.centre[q - 1];
          const b1 = gb.centre[q];
          const r = { x: a1.x - a0.x, y: a1.y - a0.y };
          const s = { x: b1.x - b0.x, y: b1.y - b0.y };
          const den = r.x * s.y - r.y * s.x;
          const la = Math.hypot(r.x, r.y);
          const lb = Math.hypot(s.x, s.y);
          if (!la || !lb) continue;
          const sin = Math.abs(den) / (la * lb);
          if (sin < 0.2) continue;
          const t = ((b0.x - a0.x) * s.y - (b0.y - a0.y) * s.x) / den;
          const u = ((b0.x - a0.x) * r.y - (b0.y - a0.y) * r.x) / den;
          if (t <= 0.02 || t >= 0.98 || u <= 0.02 || u >= 0.98) continue;
          const P = { x: a0.x + t * r.x, y: a0.y + t * r.y };
          const axisA = Math.abs(r.x) < 1e-6 || Math.abs(r.y) < 1e-6;
          const axisB = Math.abs(s.x) < 1e-6 || Math.abs(s.y) < 1e-6;
          const aOnTop =
            ga.lines.length !== gb.lines.length ? ga.lines.length > gb.lines.length : axisA !== axisB ? axisA : false;
          const [topDir, topW, underW, under] = aOnTop
            ? [{ x: r.x / la, y: r.y / la }, drawnWidth(ga), drawnWidth(gb), B.id]
            : [{ x: s.x / lb, y: s.y / lb }, drawnWidth(gb), drawnWidth(ga), A.id];
          const n = { x: -topDir.y, y: topDir.x };
          const halfW = topW / 2 + 4;
          const cot = Math.sqrt(Math.max(0, 1 - sin * sin)) / sin;
          const halfL = underW / (2 * sin) + halfW * cot + 4;
          const c = (su: number, sn: number) => ({ x: P.x + su * halfL * topDir.x + sn * halfW * n.x, y: P.y + su * halfL * topDir.y + sn * halfW * n.y });
          out.push({ under, poly: [c(-1, -1), c(1, -1), c(1, 1), c(-1, 1)] });
        }
      }
    }
  }
  return out;
}

/** Shared line styling for the map and target previews, including planned lines. */
export function LineStroke({ geometry, path, line, palette, theme, preview = false }: {
  geometry: EdgeGeometry;
  path: EdgeGeometry['lines'][number];
  line: Line;
  palette: PaletteId;
  theme: ThemeId;
  preview?: boolean;
}) {
  const paint = linePaint(palette, line.slot, theme, line.pattern);
  const stroke = { stroke: paint.color, strokeDasharray: paint.dash, strokeLinecap: paint.cap };
  return (
    <g opacity={preview ? 0.55 : undefined} data-line-stroke={line.id} data-line-pattern={paint.pattern} data-connection-preview={preview ? '' : undefined}>
      {paint.pattern === 'hollow' ? (
        <path d={hollowPath(path.centre, path.o, geometry.radii, W, tokens.planned.wall)}
          fill="none" {...stroke} strokeWidth={tokens.planned.wall} strokeLinejoin="round" />
      ) : line.planned ? [-1, 1].map((side) => (
        <path key={side} d={roundedPath(path.centre, path.o + side * (W - tokens.planned.wall) / 2, geometry.radii)}
          fill="none" {...stroke} strokeWidth={tokens.planned.wall} strokeLinejoin="round" />
      )) : (
        <path d={path.d} fill="none" {...stroke} strokeWidth={W} strokeLinejoin="round" />
      )}
    </g>
  );
}

export function MetroMap({ doc, theme = 'light', exporting = false, selected, previewConnection }: { doc: Doc } & RenderOptions) {
  const th = themeColours(theme);
  const dv = derive(doc);
  const tintList = tints(doc.palette, theme);
  const isSel = (k: string) => selected?.has(k) ?? false;
  const usedLines = new Set(doc.edges.flatMap((e) => e.lines));

  // --- sections
  const sections = doc.sections.map((s, i) => (
    <g key={s.id} data-sel={`section:${s.id}`}>
      <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={16} fill={tintList[s.tint % tintList.length]} />
      {!exporting && isSel(`section:${s.id}`) && (
        <rect x={s.x - 2} y={s.y - 2} width={s.w + 4} height={s.h + 4} rx={18} fill="none" stroke={ACCENT} strokeWidth={1.5} strokeDasharray="6 4" />
      )}
      <circle cx={s.x + 26} cy={s.y + 26} r={10} fill={th.ink} />
      <text x={s.x + 26} y={s.y + 30} textAnchor="middle" fontSize={11} fontWeight={700} fill={th.surface}>
        {i + 1}
      </text>
      <text x={s.x + 44} y={s.y + 31} fontSize={14} fontWeight={700} fill={th.ink}>
        {s.name}
      </text>
    </g>
  ));

  const obstacles: { id: string; box: Box }[] = doc.stations.map((s) => {
    return { id: s.id, box: stationMarker(dv, s) };
  });
  for (const sec of doc.sections)
    obstacles.push({ id: `sec-${sec.id}`, box: { x0: sec.x + 12, y0: sec.y + 12, x1: sec.x + 44 + sec.name.length * 8.4, y1: sec.y + 40 } });

  // --- lines
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const geoms = new Map<string, EdgeGeometry>();
  for (const e of doc.edges) {
    const g = edgeGeometry(dv, e);
    if (g) geoms.set(e.id, g);
  }
  const gaps = new Map<string, Pt[][]>();
  for (const c of findCrossings(doc, geoms)) gaps.set(c.under, [...(gaps.get(c.under) ?? []), c.poly]);
  const clipDefs: ReactNode[] = [];
  const edgeEls: ReactNode[] = [];
  const hitEls: ReactNode[] = [];
  for (const e of doc.edges) {
    const g = geoms.get(e.id);
    if (!g) continue;
    const ownEls: ReactNode[] = [];
    // Lines are obstacles for file icons: sample the centreline every 8 px.
    for (let i = 1; i < g.centre.length; i++) {
      const a = g.centre[i - 1];
      const b = g.centre[i];
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 8));
      for (let j = 0; j <= n; j++) {
        const px = a.x + ((b.x - a.x) * j) / n;
        const py = a.y + ((b.y - a.y) * j) / n;
        const r = g.width / 2;
        obstacles.push({ id: `edge-${e.id}`, box: { x0: px - r, y0: py - r, x1: px + r, y1: py + r } });
      }
    }
    if (!exporting) {
      const dCentre = g.d;
      hitEls.push(
        <path key={`hit-${e.id}`} data-sel={`edge:${e.id}`} d={dCentre} fill="none" stroke="transparent" strokeWidth={g.width + 8} />,
      );
      if (isSel(`edge:${e.id}`)) {
        edgeEls.push(
          <path key={`sel-${e.id}`} d={dCentre} fill="none" stroke={ACCENT} strokeOpacity={0.25} strokeWidth={g.width + 10} strokeLinejoin="round" />,
        );
      }
    }
    for (const ln of g.lines) {
      const line = doc.lines.find((l) => l.id === ln.id)!;
      ownEls.push(
        <LineStroke key={`${e.id}-${ln.id}`} geometry={g} path={ln} line={line} palette={doc.palette} theme={theme}
          preview={!exporting && previewConnection?.edgeId === e.id && previewConnection.lineId === ln.id} />,
      );
    }
    const cut = gaps.get(e.id);
    if (cut) {
      const id = `${uid}-gap-${e.id}`;
      const d = 'M -100000 -100000 H 100000 V 100000 H -100000 Z ' + cut.map((poly) => 'M ' + poly.map((q) => `${q.x.toFixed(2)} ${q.y.toFixed(2)}`).join(' L ') + ' Z').join(' ');
      clipDefs.push(
        <clipPath key={id} id={id}>
          <path d={d} clipRule="evenodd" />
        </clipPath>,
      );
      edgeEls.push(
        <g key={`g-${e.id}`} data-edge={!exporting ? e.id : undefined} clipPath={`url(#${id})`}>
          {ownEls}
        </g>,
      );
    } else edgeEls.push(<g key={`g-${e.id}`} data-edge={!exporting ? e.id : undefined}>{ownEls}</g>);
  }


  // --- label sides (spec §7): one side per straight run, chosen to avoid what is already drawn
  const sideOf = new Map<string, LabelSide>();
  {
    const parent = new Map(doc.stations.map((s) => [s.id, s.id]));
    const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
    for (const e of doc.edges) {
      const g = geoms.get(e.id);
      const A = dv.byId.get(e.from);
      const B = dv.byId.get(e.to);
      if (g && A && B && A.axis === B.axis && g.centre.length === 2) parent.set(find(A.id), find(B.id));
    }
    // Text over text is unreadable, so another label weighs most; a line passing behind (with its halo) least.
    const weight = (id: string) => (id.startsWith('label-') ? 20 : id.startsWith('edge-') ? 1 : 5);
    const hits = (sid: string, box: Box) => obstacles.reduce((acc, ob) => (ob.id !== sid && overlaps(box, ob.box, 2) ? acc + weight(ob.id) : acc), 0);
    // Labels with a fixed side go down first.
    for (const s of doc.stations)
      if (s.label && s.labelSide !== 'auto') obstacles.push({ id: `label-${s.id}`, box: labelPlacement(s, dv).box });
    const groups = new Map<string, Station[]>();
    for (const s of doc.stations) {
      if (!s.label || s.labelSide !== 'auto') continue;
      const r = find(s.id);
      groups.set(r, [...(groups.get(r) ?? []), s]);
    }
    for (const members of groups.values()) {
      // Above/below for horizontal runs (left/right for vertical); the cross sides only as a last resort.
      const sides: LabelSide[] = members[0].axis === 'h' ? ['above', 'below', 'right', 'left'] : ['right', 'left', 'above', 'below'];
      let best = sides[0];
      let bestScore = Infinity;
      for (const side of sides) {
        const score = members.reduce((acc, s) => acc + hits(s.id, labelPlacement(s, dv, side).box), 0);
        if (score < bestScore) {
          best = side;
          bestScore = score;
        }
        if (score === 0) break;
      }
      for (const s of members) {
        sideOf.set(s.id, best);
        obstacles.push({ id: `label-${s.id}`, box: labelPlacement(s, dv, best).box });
      }
    }
  }

  // --- stations, labels, files
  const labelAt = new Map<string, { x: number; y: number; anchor: 'start' | 'middle' | 'end' }>();
  const stationEls: ReactNode[] = [];
  const labelEls: ReactNode[] = [];
  const fileEls: ReactNode[] = [];
  for (const s of doc.stations) {
    const n = dv.stationLines.get(s.id)?.length ?? 0;
    const k = Math.max(n, 1);
    const stroke = s.inactive ? th.inactive : th.ink;
    const dash = s.optional ? tokens.station.optional.dash.join(' ') : undefined;
    const sel = isSel(`station:${s.id}`);
    const h = s.axis === 'h';
    const key = `st-${s.id}`;
    let glyph: ReactNode = null;
    const kind = s.kind;
    const sides = lineSides(doc, dv, s);
    const ext = stationMarker(dv, s);
    const { x: cx, y: cy } = ext;
    if (kind === 'step') {
      const L = 18 + PITCH * (k - 1);
      glyph = (
        <rect
          x={h ? cx - 9 : cx - L / 2}
          y={h ? cy - L / 2 : cy - 9}
          width={h ? 18 : L}
          height={h ? L : 18}
          rx={9}
          fill={th.surface}
          stroke={stroke}
          strokeWidth={3}
          strokeDasharray={dash}
        />
      );
    } else if (kind === 'merge') {
      const L = 22 + PITCH * (k - 1);
      glyph = (
        <rect
          x={h ? cx - 11 : cx - L / 2}
          y={h ? cy - L / 2 : cy - 11}
          width={h ? 22 : L}
          height={h ? L : 22}
          rx={5}
          fill={s.inactive ? th.inactive : th.ink}
          stroke={stroke}
          strokeWidth={3}
        />
      );
    }
    if (s.kind === 'start' || s.kind === 'stop') {
      const H = W + PITCH * (k - 1) + 2 * tokens.terminus.overhang;
      // The flag points at the line; the bar and icons sit on the open side.
      const dir = s.kind === 'start' ? sides.toLine : -sides.toLine;
      if (kind === 'start') {
        const p = Math.round(H * 0.33);
        const a = H / 2 - 1.5;
        // Local frame: u along the flow, v across it.
        const pts: [number, number][] = [
          [-3, -a],
          [3, -a],
          [3 + p, 0],
          [3, a],
          [-3, a],
        ];
        const toXY = ([u, v]: [number, number]) => (h ? [cx + dir * u, cy + v] : [cx + v, cy + dir * u]);
        const d = 'M ' + pts.map((q) => toXY(q).join(' ')).join(' L ') + ' Z';
        glyph = <path d={d} fill={stroke} stroke={stroke} strokeWidth={3} strokeLinejoin="round" />;
      } else if (kind === 'stop') {
        const x0 = dir > 0 ? 0 : -6;
        glyph = h ? (
          <rect x={cx + x0} y={cy - H / 2} width={6} height={H} rx={2} fill={stroke} />
        ) : (
          <rect x={cx - H / 2} y={cy + x0} width={H} height={6} rx={2} fill={stroke} />
        );
      }
    }
    if (s.file && kind !== 'junction') {
      {
        const H = W + PITCH * (k - 1) + 2 * tokens.terminus.overhang;
        // The icon sits beyond the terminus, 6 px clear of the flag or bar. Extra sheets step
        // away from the line. If that spot collides with another station or icon, try above,
        // then below the terminus.
        const gap = tokens.terminus.iconClearance;
        const back = -sides.toLine;
        const termOuter = kind === 'start' ? 4.5 : kind === 'stop' ? 6 : 10.5;
        const half = kind === 'start' || kind === 'stop' ? H / 2 : ext.across;
        // Only a start or stop at the end of a line has an open end for its icon.
        const openEnd = (kind === 'start' || kind === 'stop') && !sides.middle && (sides.neg || sides.pos);
        const count = s.file.count;
        const tryPlace = (where: 'out' | 'before' | 'after') => {
          // Work in flow (u) / across (v) coordinates, then map to x/y.
          let su: number;
          let sv: number;
          let cu: number;
          let cv: number;
          // Extra sheets always stack towards the upper right.
          const fp = () => fileFootprint(count, 1, -1);
          if (where === 'out') {
            su = h ? 1 : -1;
            sv = h ? -1 : 1;
            const f = fp();
            const nearU = h ? (back < 0 ? f.x1 : -f.x0) : back < 0 ? f.y1 : -f.y0;
            cu = back * (termOuter + gap + nearU);
            cv = 0;
          } else {
            const side = where === 'before' ? -1 : 1;
            su = h ? 1 : -1;
            sv = h ? -1 : 1;
            const f = fp();
            const nearV = h ? (side < 0 ? f.y1 : -f.y0) : side < 0 ? f.x1 : -f.x0;
            cu = 0;
            cv = side * (half + gap + nearV);
          }
          const cx = h ? ext.x + cu : ext.x + cv;
          const cy = h ? ext.y + cv : ext.y + cu;
          const sx = h ? su : sv;
          const sy = h ? sv : su;
          const f = fileFootprint(count, sx, sy);
          const icon = { x0: cx + f.x0, y0: cy + f.y0, x1: cx + f.x1, y1: cy + f.y1 };
          // Caption goes on the icon's outer side, across the flow where possible.
          const cap = s.file!.caption;
          const cw = cap ? cap.length * 6.6 : 0;
          let caption: { x: number; y: number; anchor: 'start' | 'middle' | 'end' } | null = null;
          let box = icon;
          if (cap) {
            const midX = (icon.x0 + icon.x1) / 2;
            const midY = (icon.y0 + icon.y1) / 2;
            let side: 'below' | 'above' | 'left' | 'right';
            if (where === 'out') side = h ? 'below' : 'right';
            else if (h) side = where === 'before' ? 'above' : 'below';
            else side = where === 'before' ? 'left' : 'right';
            if (side === 'below') {
              caption = { x: midX, y: icon.y1 + 16, anchor: 'middle' };
              box = { ...icon, x0: Math.min(icon.x0, midX - cw / 2), x1: Math.max(icon.x1, midX + cw / 2), y1: icon.y1 + 20 };
            } else if (side === 'above') {
              caption = { x: midX, y: icon.y0 - 8, anchor: 'middle' };
              box = { ...icon, x0: Math.min(icon.x0, midX - cw / 2), x1: Math.max(icon.x1, midX + cw / 2), y0: icon.y0 - 22 };
            } else if (side === 'right') {
              caption = { x: icon.x1 + 8, y: midY + 4, anchor: 'start' };
              box = { ...icon, x1: icon.x1 + 8 + cw };
            } else {
              caption = { x: icon.x0 - 8, y: midY + 4, anchor: 'end' };
              box = { ...icon, x0: icon.x0 - 8 - cw };
            }
          }
          return { cx, cy, sx, sy, box, caption };
        };
        // A terminus in the middle of a line has no open end: put the icon above or below it.
        const options = ((openEnd ? ['out', 'before', 'after'] : ['before', 'after']) as ('out' | 'before' | 'after')[]).map(tryPlace);
        // Own connections only leave on the line side, so they never block the open end.
        const own = new Set(doc.edges.filter((e) => e.from === s.id || e.to === s.id).map((e) => `edge-${e.id}`));
        // A start or stop names its file group: its label moves above the icon, so it is not an obstacle here.
        const isTerminus = kind === 'start' || kind === 'stop';
        if (isTerminus && s.label) own.add(`label-${s.id}`);
        const free = options.find((o) => !obstacles.some((ob) => ob.id !== s.id && !own.has(ob.id) && overlaps(o.box, ob.box, gap)));
        const pick = free ?? options[0];
        obstacles.push({ id: `file-${s.id}`, box: pick.box });
        if (isTerminus && s.label) {
          const top = pick.caption && pick.caption.y < pick.cy ? pick.box.y0 : pick.cy + fileFootprint(count, 1, -1).y0;
          labelAt.set(s.id, { x: pick.cx, y: top - 8, anchor: 'middle' });
        }
        fileEls.push(
          <g key={`file-${s.id}`} data-station-file={s.id} data-layout-x={pick.cx} data-layout-y={pick.cy}>
            {fileIcon(pick.cx, pick.cy, s.file.ext, count, pick.sx, pick.sy, th, `file-${s.id}`)}
            {pick.caption && <text x={pick.caption.x} y={pick.caption.y} textAnchor={pick.caption.anchor} fontSize={12} fill={th.muted}>
              {s.file.caption}
            </text>}
          </g>,
        );
      }
    }
    if (kind === 'junction' && !exporting) {
      // Branch points have no marker on the map; the editor shows a small dot so they can be picked.
      glyph = <circle cx={cx} cy={cy} r={3.5} fill={th.surface} stroke={th.muted} strokeWidth={1.5} />;
    }

    stationEls.push(
      <g key={key} data-sel={`station:${s.id}`} data-station-kind={kind}>
        {!exporting && (
          <rect
            x={cx - (h ? ext.along : ext.across) - 6}
            y={cy - (h ? ext.across : ext.along) - 6}
            width={2 * (h ? ext.along : ext.across) + 12}
            height={2 * (h ? ext.across : ext.along) + 12}
            fill="transparent"
          />
        )}
        {sel && !exporting && (() => {
          // Enclose the complete marker, including a wide terminal flag.
          const along = Math.max(16, ext.along + 5);
          const across = 16 + (PITCH / 2) * (k - 1);
          const [hx, hy] = h ? [along, across] : [across, along];
          return <rect x={cx - hx} y={cy - hy} width={2 * hx} height={2 * hy} rx={10} fill="none" stroke={ACCENT} strokeWidth={1.5} />;
        })()}
        {exporting ? glyph : (
          <g transform={`translate(${cx} ${cy})`}>
            <g className="station-glyph">
              <g transform={`translate(${-cx} ${-cy})`}>{glyph}</g>
            </g>
          </g>
        )}
      </g>,
    );

    if (s.label) {
      const sec = sectionAt(doc, s);
      const haloColour = sec ? tintList[sec.tint % tintList.length] : exporting ? null : th.surface;
      const { x, y, anchor } = labelAt.get(s.id) ?? labelPlacement(s, dv, sideOf.get(s.id));
      const common = { x, y, textAnchor: anchor, fontSize: 13, fontWeight: 600 } as const;
      // The halo is a separate stroked copy underneath (paint-order is not portable to PDF).
      const rows = s.label.split('\n');
      const body = (detailFill: string) =>
        rows.map((r, i) =>
          i === 0 ? (
            r
          ) : (
            <tspan key={i} x={x} dy={LABEL_LINE} fontSize={12} fontWeight={400} fill={detailFill}>
              {r}
            </tspan>
          ),
        );
      labelEls.push(
        <g key={`label-${s.id}`} data-station-label={s.id}>
          {haloColour && <text {...common} fill={haloColour} stroke={haloColour} strokeWidth={4} strokeLinejoin="round" aria-hidden="true">
            {body(haloColour)}
          </text>}
          <text data-sel={`station:${s.id}`} {...common} fill={s.optional || s.inactive ? th.muted : th.ink}>
            {body(th.muted)}
          </text>
        </g>,
      );
    }
  }

  // --- legend and shape key
  const legendEls: ReactNode[] = [];
  const content = contentBounds(doc);
  let legendOrigin = { x: doc.legend.x, y: doc.legend.y };
  if (doc.legend.auto && content) legendOrigin = autoLegendPos(content);
  if (doc.legend.show) {
    const { x, y } = legendOrigin;
    const rows = doc.lines.filter((l) => usedLines.has(l.id));
    const kinds = legendKinds(doc, dv);
    const lay = legendLayout(doc, rows.map((l) => l.name), kinds);
    rows.forEach((l, i) => {
      const paint = linePaint(doc.palette, l.slot, theme, l.pattern);
      const stroke = { stroke: paint.color, strokeDasharray: paint.dash, strokeLinecap: paint.cap };
      const lx = x + lay.lines[i].dx;
      const ry = y + lay.lines[i].dy;
      if (paint.pattern === 'hollow') {
        legendEls.push(
          <path key={`lg-${l.id}`} d={hollowPath([{ x: lx, y: ry }, { x: lx + LEGEND_LINE_WIDTH, y: ry }], 0, { r45: 0, r90: 0 }, W, tokens.planned.wall)}
            fill="none" {...stroke} strokeWidth={tokens.planned.wall} strokeLinejoin="round" />,
        );
      } else if (l.planned) {
        legendEls.push(
          <g key={`lg-${l.id}`}>
            <path d={`M ${lx} ${ry - 3.5} H ${lx + LEGEND_LINE_WIDTH}`} {...stroke} strokeWidth={3} />
            <path d={`M ${lx} ${ry + 3.5} H ${lx + LEGEND_LINE_WIDTH}`} {...stroke} strokeWidth={3} />
          </g>,
        );
      } else {
        legendEls.push(
          <path key={`lg-${l.id}`} d={`M ${lx} ${ry} H ${lx + LEGEND_LINE_WIDTH}`} {...stroke} strokeWidth={W} />,
        );
      }
      legendEls.push(
        <text key={`lgt-${l.id}`} x={lx + LEGEND_LABEL_OFFSET} y={ry + 4} fontSize={12} fill={th.ink}>
          {l.name}
        </text>,
      );
    });
    kinds.forEach((kd, i) => {
      const kx = x + lay.shapes[i].dx;
      const ry = y + lay.shapes[i].dy;
      const gx = kx + 10;
      let gl: ReactNode;
      if (kd === 'step') gl = <circle cx={gx} cy={ry} r={9} fill={th.surface} stroke={th.ink} strokeWidth={3} />;
      else if (kd === 'shared step') gl = <rect x={gx - 9} y={ry - 15} width={18} height={30} rx={9} fill={th.surface} stroke={th.ink} strokeWidth={3} />;
      else if (kd === 'merge') gl = <rect x={gx - 11} y={ry - 11} width={22} height={22} rx={5} fill={th.ink} stroke={th.ink} strokeWidth={3} />;
      else gl = <circle cx={gx} cy={ry} r={9} fill={th.surface} stroke={th.ink} strokeWidth={3} strokeDasharray={tokens.station.optional.dash.join(' ')} />;
      legendEls.push(
        <g key={`kd-${kd}`}>
          {gl}
          <text x={kx + 32} y={ry + 4} fontSize={12} fill={th.ink}>
            {kd}
          </text>
        </g>,
      );
    });
  }

  const titleAt = doc.titleAuto && content ? autoTitlePos(content) : doc.titlePos;
  const titleEls: ReactNode = doc.showTitle ? (
    <g data-sel="title:title" data-title-origin="" data-x={titleAt.x} data-y={titleAt.y}>
      <text x={titleAt.x} y={titleAt.y} fontSize={24} fontWeight={700} fill={th.ink}>
        {doc.title}
      </text>
      <text x={titleAt.x} y={titleAt.y + 22} fontSize={12} fill={th.muted}>
        {doc.meta}
      </text>
    </g>
  ) : null;

  return (
    <g fontFamily="Inter, system-ui, sans-serif" className="metro">
      {clipDefs.length > 0 && <defs>{clipDefs}</defs>}
      <g>{sections}</g>
      <g>{edgeEls}</g>
      <g>{hitEls}</g>
      <g>{fileEls}</g>
      <g>{stationEls}</g>
      <g>{labelEls}</g>
      <g data-sel="legend:legend" data-legend-origin="" data-x={legendOrigin.x} data-y={legendOrigin.y}>
        {legendEls}
      </g>
      {titleEls}
    </g>
  );
}
