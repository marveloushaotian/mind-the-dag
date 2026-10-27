/**
 * Import a subset of nf-metro's Mermaid dialect (.mmd) into a mind-the-dag Doc.
 *
 * Understood: `%%metro title|line|file|files|dir|marker|grid|direction`,
 * `graph LR|TB`, `subgraph id [Name] … end`, nodes `id[Label]`, `id([Label])`,
 * `id["Label"]`, bare `id` (ids starting with `_` become junctions), and edges
 * `a -->|l1,l2| b`. Everything else is ignored.
 *
 * nf-metro lays maps out automatically; mind-the-dag does not (yet), so the
 * import places stations with a simple layered layout per section and puts
 * sections on nf-metro's grid. Expect to drag things into shape afterwards.
 */
import type { Doc, Line, Section, Station } from './model';
import { emptyDoc } from './model';
import { paletteLines, type PaletteId } from './tokens';

interface RawNode {
  id: string;
  label: string;
  section: string | null;
  empty: boolean;
}
interface RawEdge {
  from: string;
  to: string;
  lines: string[];
}
interface RawSection {
  id: string;
  name: string;
  dir: 'LR' | 'TB' | null;
}

const STEP = 128; // along the flow, a multiple of 8
const LANE = 48; // across the flow, a multiple of both 6 and 8
const PAD_X = 72;
const PAD_TOP = 96;
const PAD_BOTTOM = 56;
const GAP = 48;

export function parseMmd(text: string, palette: PaletteId = 'forest'): Doc {
  const doc = emptyDoc();
  doc.palette = palette;
  doc.lines = [];
  const nodes = new Map<string, RawNode>();
  const edges: RawEdge[] = [];
  const sections: RawSection[] = [];
  const lineDefs: { id: string; name: string; color: string; style: string }[] = [];
  const files = new Map<string, { ext: string; count: 1 | 2 | 3; caption?: string }>();
  const open = new Set<string>();
  const grid = new Map<string, { col: number; row: number }>();
  let globalDir: 'LR' | 'TB' = 'LR';
  let current: RawSection | null = null;

  const touch = (id: string, label?: string) => {
    let n = nodes.get(id);
    if (!n) {
      n = { id, label: id.startsWith('_') ? '' : id, section: current?.id ?? null, empty: false };
      nodes.set(id, n);
    }
    if (label !== undefined) {
      const clean = label.replace(/^"|"$/g, '').split('\\n')[0].trim();
      n.label = clean;
      n.empty = clean === '';
      if (current && !n.section) n.section = current.id;
    }
    return n;
  };

  const NODE = /^([A-Za-z_][\w-]*)\s*(?:\(\[(.*?)\]\)|\[(.*?)\]|\((.*?)\))?$/;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const meta = line.match(/^%%metro\s+([a-z_]+)\s*:\s*(.*)$/i);
    if (meta) {
      const [, key, value] = meta;
      const parts = value.split('|').map((s) => s.trim());
      switch (key.toLowerCase()) {
        case 'title':
          doc.title = value.trim();
          break;
        case 'line':
          lineDefs.push({ id: parts[0], name: parts[1] ?? parts[0], color: (parts[2] ?? '').toLowerCase(), style: (parts[3] ?? '').toLowerCase() });
          break;
        case 'file':
        case 'files':
        case 'dir':
          files.set(parts[0], { ext: (parts[1] || (key === 'dir' ? 'dir' : 'file')).toLowerCase(), count: key === 'file' ? 1 : 2, caption: parts[2] || undefined });
          break;
        case 'marker':
          if (/open/i.test(parts[1] ?? '')) open.add(parts[0]);
          break;
        case 'grid': {
          const [col, row] = (parts[1] ?? '').split(',').map((v) => parseInt(v, 10));
          if (Number.isFinite(col) && Number.isFinite(row)) grid.set(parts[0], { col, row });
          break;
        }
        case 'direction':
          if (current) current.dir = /TB|TD|BT/i.test(value) ? 'TB' : 'LR';
          break;
      }
      continue;
    }
    if (line.startsWith('%%')) continue;
    const g = line.match(/^(?:graph|flowchart)\s+(\w+)/i);
    if (g) {
      globalDir = /TB|TD|BT/i.test(g[1]) ? 'TB' : 'LR';
      continue;
    }
    const sg = line.match(/^subgraph\s+([\w-]+)\s*(?:\[(.*)\])?/i);
    if (sg) {
      current = { id: sg[1], name: (sg[2] ?? sg[1]).replace(/^"|"$/g, ''), dir: null };
      sections.push(current);
      continue;
    }
    if (/^end$/i.test(line)) {
      current = null;
      continue;
    }
    const ed = line.match(/^(.+?)\s*-->\s*(?:\|([^|]*)\|)?\s*(.+)$/);
    if (ed) {
      const a = ed[1].trim().match(NODE);
      const b = ed[3].trim().match(NODE);
      if (!a || !b) continue;
      touch(a[1], a[2] ?? a[3] ?? a[4]);
      touch(b[1], b[2] ?? b[3] ?? b[4]);
      const ls = (ed[2] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      edges.push({ from: a[1], to: b[1], lines: ls.length ? ls : ['default'] });
      continue;
    }
    const nd = line.match(NODE);
    if (nd) touch(nd[1], nd[2] ?? nd[3] ?? nd[4]);
  }

  // ---- lines: one palette slot per distinct colour, in order of first use
  const slots = paletteLines(palette).length;
  const colourSlot = new Map<string, number>();
  const used = new Set(edges.flatMap((e) => e.lines));
  for (const d of lineDefs) {
    const key = d.color || d.id;
    if (!colourSlot.has(key)) colourSlot.set(key, colourSlot.size % slots);
    const l: Line = { id: d.id, name: d.name, slot: colourSlot.get(key)! };
    if (d.style === 'dotted') l.pattern = 'dotted';
    if (d.style === 'dashed') l.planned = true;
    doc.lines.push(l);
  }
  for (const id of used) {
    if (!doc.lines.some((l) => l.id === id)) doc.lines.push({ id, name: id, slot: doc.lines.length % slots });
  }

  // ---- stations per section, layered by longest path inside the section
  const secOf = (id: string) => nodes.get(id)?.section ?? '__loose';
  const groups = new Map<string, string[]>();
  for (const n of nodes.values()) {
    const k = n.section ?? '__loose';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(n.id);
  }
  const indeg = new Map<string, number>();
  const outdeg = new Map<string, number>();
  for (const e of edges) {
    outdeg.set(e.from, (outdeg.get(e.from) ?? 0) + 1);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }

  interface Box {
    id: string;
    name: string;
    w: number;
    h: number;
    vertical: boolean;
    local: Map<string, { x: number; y: number }>;
  }
  const boxes: Box[] = [];
  const order = [...sections.map((s) => s.id), ...(groups.has('__loose') ? ['__loose'] : [])];
  for (const sid of order) {
    const ids = groups.get(sid) ?? [];
    if (!ids.length) continue;
    const sec = sections.find((s) => s.id === sid);
    const vertical = (sec?.dir ?? globalDir) === 'TB';
    const inside = edges.filter((e) => secOf(e.from) === sid && secOf(e.to) === sid);
    const layer = new Map(ids.map((id) => [id, 0]));
    for (let pass = 0; pass < ids.length; pass++) {
      let changed = false;
      for (const e of inside) {
        const want = layer.get(e.from)! + 1;
        if (want > layer.get(e.to)! && want < ids.length) {
          layer.set(e.to, want);
          changed = true;
        }
      }
      if (!changed) break;
    }
    const byLayer = new Map<number, string[]>();
    for (const id of ids) {
      const l = layer.get(id)!;
      if (!byLayer.has(l)) byLayer.set(l, []);
      byLayer.get(l)!.push(id);
    }
    const layers = Math.max(...byLayer.keys()) + 1;
    const across = Math.max(...[...byLayer.values()].map((v) => v.length));
    const local = new Map<string, { x: number; y: number }>();
    for (const [l, list] of byLayer) {
      list.forEach((id, i) => {
        const a = l * STEP;
        const c = (i - (list.length - 1) / 2 + (across - 1) / 2) * LANE;
        local.set(id, vertical ? { x: c, y: a } : { x: a, y: c });
      });
    }
    const spanAlong = (layers - 1) * STEP;
    const spanAcross = (across - 1) * LANE;
    const w = 2 * PAD_X + (vertical ? spanAcross : spanAlong);
    const h = PAD_TOP + PAD_BOTTOM + (vertical ? spanAlong : spanAcross);
    boxes.push({ id: sid, name: sec?.name ?? 'Other', w: Math.max(w, 224), h: Math.max(h, 144), vertical, local });
  }

  // ---- sections on nf-metro's grid (or one row, in order)
  const pos = new Map<string, { col: number; row: number }>();
  boxes.forEach((b, i) => pos.set(b.id, grid.get(b.id) ?? { col: i, row: grid.size ? Math.max(0, ...[...grid.values()].map((g) => g.row)) + 1 : 0 }));
  const colW = new Map<number, number>();
  const rowH = new Map<number, number>();
  for (const b of boxes) {
    const p = pos.get(b.id)!;
    colW.set(p.col, Math.max(colW.get(p.col) ?? 0, b.w));
    rowH.set(p.row, Math.max(rowH.get(p.row) ?? 0, b.h));
  }
  const offset = (m: Map<number, number>, k: number) => {
    let s = 0;
    for (const key of [...m.keys()].sort((a, b) => a - b)) {
      if (key >= k) break;
      s += m.get(key)! + GAP;
    }
    return s;
  };
  const r24 = (v: number) => Math.round(v / 24) * 24;

  const stations: Station[] = [];
  const secs: Section[] = [];
  boxes.forEach((b, i) => {
    const p = pos.get(b.id)!;
    const x0 = r24(32 + offset(colW, p.col));
    const y0 = r24(96 + offset(rowH, p.row));
    if (b.id !== '__loose') secs.push({ id: b.id, name: b.name, x: x0, y: y0, w: Math.ceil(b.w / 8) * 8, h: Math.ceil(b.h / 8) * 8, tint: i % 4 });
    for (const [id, q] of b.local) {
      const n = nodes.get(id)!;
      const f = files.get(id);
      const isFile = !!f || n.empty;
      const kind: Station['kind'] = id.startsWith('_')
        ? 'junction'
        : isFile
          ? (indeg.get(id) ?? 0) === 0
            ? 'start'
            : (outdeg.get(id) ?? 0) === 0
              ? 'stop'
              : 'step'
          : 'step';
      stations.push({
        id,
        x: x0 + PAD_X + q.x,
        y: y0 + PAD_TOP + q.y,
        label: kind === 'start' || kind === 'stop' ? '' : n.label,
        kind,
        axis: b.vertical ? 'v' : 'h',
        labelSide: 'auto',
        optional: open.has(id) || undefined,
        file: (kind === 'start' || kind === 'stop') && f ? f : undefined,
      });
    }
  });

  doc.stations = stations;
  doc.sections = secs;
  doc.edges = edges.map((e, i) => ({ id: `e${i + 1}`, from: e.from, to: e.to, lines: [...new Set(e.lines)], bend: 0.5 }));
  if (!doc.lines.length) doc.lines.push({ id: 'default', name: 'Line 1', slot: 0 });
  const bottom = Math.max(0, ...secs.map((s) => s.y + s.h), ...stations.map((s) => s.y + 40));
  doc.legend = { x: 32, y: r24(bottom + 72), show: true, auto: true };
  doc.titlePos = { x: 32, y: 48 };
  doc.titleAuto = true;
  doc.showTitle = !!doc.title;
  doc.meta = 'Imported from nf-metro .mmd';
  return doc;
}
