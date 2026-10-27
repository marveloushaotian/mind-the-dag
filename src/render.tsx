import { useId, type ReactNode } from 'react';
import { laneToLeftOffset, roundedPath, routeCentre, type Pt } from './geometry';
import { derive, laneOffset, lanePoint, PITCH, type Derived, type Doc, type Edge, type LabelSide, type Station } from './model';
import { lineStyle, tints, tokens, type ThemeId } from './tokens';

/**
 * Pure SVG rendering of a Doc in the mind-the-dag style. Interactive editors
 * read `data-sel="kind:id"` attributes on the elements for hit-testing.
 */

export interface RenderOptions {
  theme?: ThemeId;
  /** Export mode: no editor hints, halos only inside sections. */
  exporting?: boolean;
  selected?: ReadonlySet<string>;
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

function withPattern<T extends { pattern: string | null }>(st: T, override?: 'dashed' | 'dotted'): T {
  return override ? { ...st, pattern: override } : st;
}

function themeColours(theme: ThemeId): Theme {
  const t = tokens.themes[theme];
  return { ink: t.ink, surface: t.surface, muted: t.muted, inactive: t.inactive };
}

export interface EdgeGeometry {
  centre: Pt[];
  lines: { id: string; d: string; o: number }[];
  width: number;
  radii: { r45: number; r90: number };
}

export function edgeGeometry(dv: Derived, e: Edge): EdgeGeometry | null {
  const A = dv.byId.get(e.from);
  const B = dv.byId.get(e.to);
  if (!A || !B) return null;
  const ls = e.lines.filter((l) => dv.lineOrder.has(l)).sort((a, b) => dv.lineOrder.get(a)! - dv.lineOrder.get(b)!);
  if (!ls.length) return null;
  const k = ls.length;
  const mean = (s: Station) => ls.reduce((acc, l) => acc + laneOffset(dv, s.id, l), 0) / k;
  const PA = lanePoint(A, mean(A));
  const PB = lanePoint(B, mean(B));
  const centre = routeCentre(PA, A.axis, PB, B.axis, e.bend);
  const half = ((k - 1) / 2) * PITCH;
  const opts = { r45: Math.max(R45, half + 8), r90: Math.max(R90, half + 8) };
  if (centre.length < 2) return { centre, lines: [], width: k * PITCH, radii: opts };
  const lines = ls.map((id, i) => {
    const rel = (dv.sigma.get(A.id) ?? 1) * (i - (k - 1) / 2) * PITCH;
    const o = laneToLeftOffset(centre, A.axis, rel);
    return { id, d: roundedPath(centre, o, opts), o };
  });
  return { centre, lines, width: k * PITCH, radii: opts };
}

/**
 * Which sides of a station (along its flow axis) its connections leave from.
 * A start or stop with connections on both sides is drawn as an ordinary step.
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

/** Where a station's label goes, and the box it roughly covers (Inter 600, 13 px). */
function labelPlacement(s: Station, kind: Station['kind'], n: number, decided?: LabelSide) {
  const ext = markerExtent(kind, n);
  const h = s.axis === 'h';
  let side = decided ?? s.labelSide;
  if (side === 'auto') side = h ? 'above' : 'right';
  const across = h ? ext.across : ext.along;
  const along = h ? ext.along : ext.across;
  let x = s.x;
  let y = s.y;
  let anchor: 'start' | 'middle' | 'end' = 'middle';
  if (side === 'above') y = s.y - across - 10;
  else if (side === 'below') y = s.y + across + 10 + 9.5;
  else if (side === 'right') {
    x = s.x + along + 10;
    y = s.y + 4.5;
    anchor = 'start';
  } else {
    x = s.x - along - 10;
    y = s.y + 4.5;
    anchor = 'end';
  }
  const w = s.label.length * 7.6;
  const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'start' ? x : x - w;
  return { x, y, anchor, box: { x0, y0: y - 11, x1: x0 + w, y1: y + 3 } };
}

/** The glyph a station is drawn with: termini in the middle of a line become steps. */
function drawnKind(doc: Doc, dv: Derived, s: Station): Station['kind'] {
  if ((s.kind === 'start' || s.kind === 'stop') && lineSides(doc, dv, s).middle) return 'step';
  return s.kind;
}

/** Extent of a station marker across the flow (half-length) and along it (half-width). */
function markerExtent(kind: Station['kind'], n: number) {
  const k = Math.max(n, 1);
  switch (kind) {
    case 'merge':
      return { across: (22 + PITCH * (k - 1)) / 2 + 1.5, along: 11 + 1.5 };
    case 'junction':
      return { across: (W + PITCH * (k - 1)) / 2, along: 0 };
    case 'start':
    case 'stop':
      return { across: (W + PITCH * (k - 1)) / 2 + 6, along: 6 };
    default:
      return { across: (18 + PITCH * (k - 1)) / 2 + 1.5, along: 9 + 1.5 };
  }
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
  for (const s of doc.stations) {
    const pad = s.file ? 72 : 40;
    xs.push(s.x - pad, s.x + pad);
    ys.push(s.y - 40, s.y + 44);
  }
  for (const s of doc.sections) {
    xs.push(s.x, s.x + s.w);
    ys.push(s.y, s.y + s.h);
  }
  if (!xs.length) return null;
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
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
    const rows = Math.max(1, doc.lines.filter((l) => used.has(l.id)).length, 3);
    const p = doc.legend.auto ? autoLegendPos(c) : doc.legend;
    b.x0 = Math.min(b.x0, p.x);
    b.x1 = Math.max(b.x1, p.x + 360);
    b.y0 = Math.min(b.y0, p.y - 16);
    b.y1 = Math.max(b.y1, p.y + rows * 36);
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
  const drawnWidth = (g: EdgeGeometry) => (g.lines.length - 1) * PITCH + W;
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

export function MetroMap({ doc, theme = 'light', exporting = false, selected }: { doc: Doc } & RenderOptions) {
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
    const n = dv.stationLines.get(s.id)?.length ?? 0;
    const e = markerExtent(drawnKind(doc, dv, s), n);
    const [ax, ay] = s.axis === 'h' ? [e.along, e.across] : [e.across, e.along];
    return { id: s.id, box: { x0: s.x - ax, y0: s.y - ay, x1: s.x + ax, y1: s.y + ay } };
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
      const dCentre = roundedPath(g.centre, 0, { r45: R45, r90: R90 });
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
      const st = withPattern(lineStyle(doc.palette, line.slot, theme), line.pattern);
      const dash = st.pattern === 'dashed' ? tokens.line.patterns.dashed.join(' ') : st.pattern === 'dotted' ? tokens.line.patterns.dotted.dash.join(' ') : undefined;
      if (line.planned) {
        const half = (W - tokens.planned.wall) / 2;
        const ctr = g.centre;
        const base = ln.o;
        for (const s of [-1, 1]) {
          ownEls.push(
            <path
              key={`${e.id}-${ln.id}-w${s}`}
              d={roundedPath(ctr, base + s * half, g.radii)}
              fill="none"
              stroke={st.color}
              strokeWidth={tokens.planned.wall}
              strokeLinejoin="round"
            />,
          );
        }
      } else {
        ownEls.push(
          <path
            key={`${e.id}-${ln.id}`}
            d={ln.d}
            fill="none"
            stroke={st.color}
            strokeWidth={W}
            strokeLinejoin="round"
            strokeDasharray={dash}
            strokeLinecap={st.pattern === 'dotted' ? 'round' : 'butt'}
          />,
        );
      }
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
        <g key={`g-${e.id}`} clipPath={`url(#${id})`}>
          {ownEls}
        </g>,
      );
    } else edgeEls.push(<g key={`g-${e.id}`}>{ownEls}</g>);
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
    const kindOf = (s: Station) => drawnKind(doc, dv, s);
    const nOf = (s: Station) => dv.stationLines.get(s.id)?.length ?? 0;
    // Text over text is unreadable, so another label weighs most; a line passing behind (with its halo) least.
    const weight = (id: string) => (id.startsWith('label-') ? 20 : id.startsWith('edge-') ? 1 : 5);
    const hits = (sid: string, box: Box) => obstacles.reduce((acc, ob) => (ob.id !== sid && overlaps(box, ob.box, 2) ? acc + weight(ob.id) : acc), 0);
    // Labels with a fixed side go down first.
    for (const s of doc.stations)
      if (s.label && s.labelSide !== 'auto') obstacles.push({ id: `label-${s.id}`, box: labelPlacement(s, kindOf(s), nOf(s)).box });
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
        const score = members.reduce((acc, s) => acc + hits(s.id, labelPlacement(s, kindOf(s), nOf(s), side).box), 0);
        if (score < bestScore) {
          best = side;
          bestScore = score;
        }
        if (score === 0) break;
      }
      for (const s of members) {
        sideOf.set(s.id, best);
        obstacles.push({ id: `label-${s.id}`, box: labelPlacement(s, kindOf(s), nOf(s), best).box });
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
    const kind = drawnKind(doc, dv, s);
    const sides = lineSides(doc, dv, s);
    const ext = markerExtent(kind, n);
    if (kind === 'step') {
      if (k === 1) {
        glyph = <circle cx={s.x} cy={s.y} r={9} fill={th.surface} stroke={stroke} strokeWidth={3} strokeDasharray={dash} />;
      } else {
        const L = 18 + PITCH * (k - 1);
        glyph = (
          <rect
            x={h ? s.x - 9 : s.x - L / 2}
            y={h ? s.y - L / 2 : s.y - 9}
            width={h ? 18 : L}
            height={h ? L : 18}
            rx={9}
            fill={th.surface}
            stroke={stroke}
            strokeWidth={3}
            strokeDasharray={dash}
          />
        );
      }
    } else if (kind === 'merge') {
      const L = 22 + PITCH * (k - 1);
      glyph = (
        <rect
          x={h ? s.x - 11 : s.x - L / 2}
          y={h ? s.y - L / 2 : s.y - 11}
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
        const toXY = ([u, v]: [number, number]) => (h ? [s.x + dir * u, s.y + v] : [s.x + v, s.y + dir * u]);
        const d = 'M ' + pts.map((q) => toXY(q).join(' ')).join(' L ') + ' Z';
        glyph = <path d={d} fill={stroke} stroke={stroke} strokeWidth={3} strokeLinejoin="round" />;
      } else if (kind === 'stop') {
        const x0 = dir > 0 ? 0 : -6;
        glyph = h ? (
          <rect x={s.x + x0} y={s.y - H / 2} width={6} height={H} rx={2} fill={stroke} />
        ) : (
          <rect x={s.x - H / 2} y={s.y + x0} width={H} height={6} rx={2} fill={stroke} />
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
          const cx = h ? s.x + cu : s.x + cv;
          const cy = h ? s.y + cv : s.y + cu;
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
        fileEls.push(fileIcon(pick.cx, pick.cy, s.file.ext, count, pick.sx, pick.sy, th, `file-${s.id}`));
        if (pick.caption)
          fileEls.push(
            <text key={`cap-${s.id}`} x={pick.caption.x} y={pick.caption.y} textAnchor={pick.caption.anchor} fontSize={12} fill={th.muted}>
              {s.file.caption}
            </text>,
          );
      }
    }
    if (kind === 'junction' && !exporting) {
      // Branch points have no marker on the map; the editor shows a small dot so they can be picked.
      glyph = <circle cx={s.x} cy={s.y} r={3.5} fill={th.surface} stroke={th.muted} strokeWidth={1.5} />;
    }

    stationEls.push(
      <g key={key} data-sel={`station:${s.id}`}>
        {!exporting && (
          <rect
            x={s.x - (h ? ext.along : ext.across) - 6}
            y={s.y - (h ? ext.across : ext.along) - 6}
            width={2 * (h ? ext.along : ext.across) + 12}
            height={2 * (h ? ext.across : ext.along) + 12}
            fill="transparent"
          />
        )}
        {sel && !exporting && (() => {
          // One selection frame whose size depends only on how many lines pass, not on the type.
          const along = 16;
          const across = 16 + (PITCH / 2) * (k - 1);
          const [hx, hy] = h ? [along, across] : [across, along];
          return <rect x={s.x - hx} y={s.y - hy} width={2 * hx} height={2 * hy} rx={10} fill="none" stroke={ACCENT} strokeWidth={1.5} />;
        })()}
        {glyph}
      </g>,
    );

    if (s.label) {
      const sec = sectionAt(doc, s);
      const haloColour = sec ? tintList[sec.tint % tintList.length] : exporting ? null : th.surface;
      const { x, y, anchor } = labelAt.get(s.id) ?? labelPlacement(s, kind, n, sideOf.get(s.id));
      const common = { x, y, textAnchor: anchor, fontSize: 13, fontWeight: 600 } as const;
      // The halo is a separate stroked copy underneath (paint-order is not portable to PDF).
      if (haloColour)
        labelEls.push(
          <text key={`hl-${s.id}`} {...common} fill={haloColour} stroke={haloColour} strokeWidth={4} strokeLinejoin="round" aria-hidden="true">
            {s.label}
          </text>,
        );
      labelEls.push(
        <text key={`lb-${s.id}`} data-sel={`station:${s.id}`} {...common} fill={s.optional || s.inactive ? th.muted : th.ink}>
          {s.label}
        </text>,
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
    rows.forEach((l, i) => {
      const st = withPattern(lineStyle(doc.palette, l.slot, theme), l.pattern);
      const ry = y + i * 36;
      const dash = st.pattern === 'dashed' ? '12 8' : st.pattern === 'dotted' ? '2 10' : undefined;
      if (l.planned) {
        legendEls.push(
          <g key={`lg-${l.id}`}>
            <path d={`M ${x} ${ry - 3.5} H ${x + 32}`} stroke={st.color} strokeWidth={3} />
            <path d={`M ${x} ${ry + 3.5} H ${x + 32}`} stroke={st.color} strokeWidth={3} />
          </g>,
        );
      } else {
        legendEls.push(
          <path key={`lg-${l.id}`} d={`M ${x} ${ry} H ${x + 32}`} stroke={st.color} strokeWidth={W} strokeDasharray={dash} strokeLinecap={st.pattern === 'dotted' ? 'round' : 'butt'} />,
        );
      }
      legendEls.push(
        <text key={`lgt-${l.id}`} x={x + 42} y={ry + 4} fontSize={12} fill={th.ink}>
          {l.name}
        </text>,
      );
    });
    // Shape key: only glyphs that appear on the map.
    const kinds: string[] = [];
    const hasCapsule = doc.stations.some((s) => s.kind === 'step' && (dv.stationLines.get(s.id)?.length ?? 0) > 1);
    if (doc.stations.some((s) => s.kind === 'step' && (dv.stationLines.get(s.id)?.length ?? 0) <= 1)) kinds.push('step');
    if (hasCapsule) kinds.push('shared step');
    if (doc.stations.some((s) => s.kind === 'merge')) kinds.push('merge');
    if (doc.stations.some((s) => s.optional)) kinds.push('optional');
    // Shape key starts after the longest line name (Inter 12 px ≈ 6.6 px per character).
    const longest = Math.max(0, ...rows.map((l) => l.name.length));
    const kx = x + Math.max(212, 42 + Math.ceil((longest * 6.6) / 8) * 8 + 40);
    kinds.forEach((kd, i) => {
      const ry = y + i * 36;
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
