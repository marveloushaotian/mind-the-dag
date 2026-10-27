import type { ReactNode } from 'react';
import { laneToLeftOffset, roundedPath, routeCentre, type Pt } from './geometry';
import { derive, laneOffset, lanePoint, PITCH, type Derived, type Doc, type Edge, type Station } from './model';
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
  /** Station id waiting for a second click in connect mode. */
  pending?: string | null;
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
    const rel = (i - (k - 1) / 2) * PITCH;
    const o = laneToLeftOffset(centre, A.axis, rel);
    return { id, d: roundedPath(centre, o, opts), o };
  });
  return { centre, lines, width: k * PITCH, radii: opts };
}

/** Direction (+1 / -1) of flow at a terminus, from its first connected edge. */
function flowDir(doc: Doc, dv: Derived, s: Station): number {
  const e = doc.edges.find((x) => x.from === s.id) ?? doc.edges.find((x) => x.to === s.id);
  if (!e) return 1;
  const other = dv.byId.get(e.from === s.id ? e.to : e.from);
  if (!other) return 1;
  const delta = s.axis === 'h' ? other.x - s.x : other.y - s.y;
  const outward = e.from === s.id ? Math.sign(delta) : -Math.sign(delta);
  return outward === 0 ? 1 : outward;
}

/** Extent of a station marker across the flow (half-length) and along it (half-width). */
function markerExtent(s: Station, n: number) {
  const k = Math.max(n, 1);
  switch (s.kind) {
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

function fileIcon(cx: number, cy: number, ext: string, count: number, th: Theme, key: string): ReactNode {
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
  for (let i = Math.min(count, 3) - 1; i >= 1; i--) sheets.push(sheet(6 * i, -6 * i, `${key}s${i}`));
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

export function MetroMap({ doc, theme = 'light', exporting = false, selected, pending }: { doc: Doc } & RenderOptions) {
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

  // --- lines
  const edgeEls: ReactNode[] = [];
  const hitEls: ReactNode[] = [];
  for (const e of doc.edges) {
    const g = edgeGeometry(dv, e);
    if (!g) continue;
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
      const st = lineStyle(doc.palette, line.slot, theme);
      const dash = st.pattern === 'dashed' ? tokens.line.patterns.dashed.join(' ') : st.pattern === 'dotted' ? tokens.line.patterns.dotted.dash.join(' ') : undefined;
      if (line.planned) {
        const half = (W - tokens.planned.wall) / 2;
        const ctr = g.centre;
        const base = ln.o;
        for (const s of [-1, 1]) {
          edgeEls.push(
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
        edgeEls.push(
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
  }

  // --- stations, labels, files
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
    const ext = markerExtent(s, n);
    if (s.kind === 'step') {
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
    } else if (s.kind === 'merge') {
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
    } else if (s.kind === 'start' || s.kind === 'stop') {
      const H = W + PITCH * (k - 1) + 2 * tokens.terminus.overhang;
      const dir = flowDir(doc, dv, s);
      if (s.kind === 'start') {
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
      } else {
        const x0 = dir > 0 ? 0 : -6;
        glyph = h ? (
          <rect x={s.x + x0} y={s.y - H / 2} width={6} height={H} rx={2} fill={stroke} />
        ) : (
          <rect x={s.x - H / 2} y={s.y + x0} width={H} height={6} rx={2} fill={stroke} />
        );
      }
      if (s.file) {
        // Icon sits outside the terminus, 6 px clear of flag/bar (and of its banner).
        const gap = tokens.terminus.iconClearance;
        const back = s.kind === 'start' ? -dir : dir;
        const flagOuter = s.kind === 'start' ? 4.5 : 6;
        if (h) {
          const cx = s.x + back * (flagOuter + gap + 20);
          fileEls.push(fileIcon(cx, s.y, s.file.ext, s.file.count, th, `file-${s.id}`));
          if (s.file.caption)
            fileEls.push(
              <text key={`cap-${s.id}`} x={cx} y={s.y + 40} textAnchor="middle" fontSize={12} fill={th.muted}>
                {s.file.caption}
              </text>,
            );
        } else {
          const cy = s.y + back * (flagOuter + gap + 1.25 + 20);
          fileEls.push(fileIcon(s.x, cy, s.file.ext, s.file.count, th, `file-${s.id}`));
          if (s.file.caption)
            fileEls.push(
              <text key={`cap-${s.id}`} x={s.x + 30} y={cy + 4} fontSize={12} fill={th.muted}>
                {s.file.caption}
              </text>,
            );
        }
      }
    } else if (!exporting) {
      glyph = <circle cx={s.x} cy={s.y} r={5} fill="none" stroke={th.muted} strokeWidth={1} strokeDasharray="2 2" />;
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
        {sel && !exporting && (
          <rect
            x={s.x - (h ? ext.along : ext.across) - 5}
            y={s.y - (h ? ext.across : ext.along) - 5}
            width={2 * (h ? ext.along : ext.across) + 10}
            height={2 * (h ? ext.across : ext.along) + 10}
            rx={8}
            fill="none"
            stroke={ACCENT}
            strokeWidth={1.5}
          />
        )}
        {pending === s.id && !exporting && <circle cx={s.x} cy={s.y} r={16} fill="none" stroke={ACCENT} strokeWidth={2} strokeDasharray="4 3" />}
        {glyph}
      </g>,
    );

    if (s.label) {
      let side = s.labelSide;
      if (side === 'auto') side = h ? 'above' : 'right';
      const sec = sectionAt(doc, s);
      const haloColour = sec ? tintList[sec.tint % tintList.length] : exporting ? null : th.surface;
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
  if (doc.legend.show) {
    const { x, y } = doc.legend;
    const rows = doc.lines.filter((l) => usedLines.has(l.id));
    rows.forEach((l, i) => {
      const st = lineStyle(doc.palette, l.slot, theme);
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
    const kx = x + 212;
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

  const titleEls: ReactNode = doc.showTitle ? (
    <g data-sel="title:title">
      <text x={doc.titlePos.x} y={doc.titlePos.y} fontSize={24} fontWeight={700} fill={th.ink}>
        {doc.title}
      </text>
      <text x={doc.titlePos.x} y={doc.titlePos.y + 22} fontSize={12} fill={th.muted}>
        {doc.meta}
      </text>
    </g>
  ) : null;

  return (
    <g fontFamily="Inter, system-ui, sans-serif" className="metro">
      <g>{sections}</g>
      <g>{edgeEls}</g>
      <g>{hitEls}</g>
      <g>{fileEls}</g>
      <g>{stationEls}</g>
      <g>{labelEls}</g>
      <g data-sel="legend:legend">{legendEls}</g>
      {titleEls}
    </g>
  );
}
