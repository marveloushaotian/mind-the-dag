import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { metagenomeExample } from './examples';
import { download, ExportDialog, slug, type ExportFormat } from './exporters';
import { IFit, IHelp, IMinus, IPlus, IRedo, IUndo } from './icons';
import { isBackup, restoreBackup } from './library';
import { importFile } from './importers';
import { roundedPath, routeCentre } from './geometry';
import { derive, emptyDoc, mergeStations, pruneLines, snap, snapStation, stationAt, uid, usedLines, type Doc, type Station } from './model';
import { Inspector, LeftRail, TOOLS, type Tool } from './panels';
import { edgeGeometry, MetroMap } from './render';
import { useDocument } from './store';
import { usePanZoom } from './panzoom';
import type { ThemeId } from './tokens';
import { Menu, Wordmark } from './ui';
import { ShareDialog, ShortcutsDialog } from './dialogs';
import { MORPH } from './motion';

type DragState =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { kind: 'stations'; ids: string[]; start: { x: number; y: number }; orig: Map<string, { x: number; y: number }>; moved: boolean }
  | { kind: 'section'; id: string; start: { x: number; y: number }; orig: { x: number; y: number }; members: Map<string, { x: number; y: number }>; moved: boolean }
  | { kind: 'resize'; id: string; start: { x: number; y: number }; orig: { w: number; h: number }; moved: boolean }
  | { kind: 'legend' | 'title'; start: { x: number; y: number }; orig: { x: number; y: number }; moved: boolean }
  | { kind: 'newSection'; start: { x: number; y: number }; cur: { x: number; y: number } }
  | { kind: 'bend'; id: string; A: { x: number; y: number }; B: { x: number; y: number }; axis: 'h' | 'v'; moved: boolean }
  | { kind: 'marquee'; start: { x: number; y: number }; cur: { x: number; y: number }; base: Set<string> };


/** Where the open map lives; decides the save label and what Share offers. */
export type Place = { kind: 'local'; mapId: string } | { kind: 'cloud'; mapId: string; groupId: string | null; groupName: string | null };

export default function Editor({
  initial,
  onSave,
  place,
  saveState,
  banner,
  onHome,
  onCreate,
  onMoveToCloud,
}: {
  initial: Doc;
  onSave: (d: Doc) => void;
  place: Place;
  /** Replaces the default "Saved / Saving…" label (cloud maps report their own state). */
  saveState?: ReactNode;
  banner?: ReactNode;
  onHome: () => void;
  onCreate: (d: Doc) => void;
  /** Local maps, signed in: move this map into My maps. */
  onMoveToCloud?: () => Promise<void>;
}) {
  const [savedDoc, setSavedDoc] = useState<Doc>(initial);
  const store = useDocument(
    () => initial,
    (d) => {
      onSave(d);
      setSavedDoc(d);
    },
  );
  const { doc, update, preview, checkpoint, undo, redo } = store;
  const [tool, setToolState] = useState<Tool>('select');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<string | null>(null);
  const [activeLine, setActiveLine] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeId>('light');
  const [view, setView] = useState({ x: -40, y: -40, k: 1 });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const lastClient = useRef({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const space = useRef(false);
  const lastDown = useRef<{ key: string; at: number } | null>(null);

  const active = activeLine && doc.lines.some((l) => l.id === activeLine) ? activeLine : doc.lines[0]?.id ?? null;
  const setTool = (t: Tool) => {
    setToolState(t);
    setPending(null);
  };

  const toWorld = useCallback(
    (cx: number, cy: number) => {
      const r = svgRef.current!.getBoundingClientRect();
      return { x: view.x + (cx - r.left) / view.k, y: view.y + (cy - r.top) / view.k };
    },
    [view],
  );

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((cur) => (cur === m ? null : cur)), 2500);
  };

  const fit = useCallback(() => {
    const svg = svgRef.current;
    const g = svg?.querySelector('g.metro') as SVGGElement | null;
    if (!svg || !g) return;
    const b = g.getBBox();
    const r = svg.getBoundingClientRect();
    if (!b.width || !b.height) {
      setView({ x: -r.width / 2, y: -r.height / 2, k: 1 });
      return;
    }
    const k = Math.min(1.5, Math.max(0.25, Math.min((r.width - 96) / b.width, (r.height - 96) / b.height)));
    setView({ k, x: b.x - (r.width / k - b.width) / 2, y: b.y - (r.height / k - b.height) / 2 });
  }, []);

  const zoomBy = (f: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const k2 = Math.min(4, Math.max(0.25, view.k * f));
    const cx = view.x + r.width / 2 / view.k;
    const cy = view.y + r.height / 2 / view.k;
    setView({ k: k2, x: cx - r.width / 2 / k2, y: cy - r.height / 2 / k2 });
  };

  // Fit before the first paint, so a page transition shows the map already in place.
  useLayoutEffect(() => {
    fit();
  }, [fit]);
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!initial.stations.length && !initial.sections.length) {
        setToolState('line');
        titleRef.current?.select();
      }
    }, 50);
    return () => window.clearTimeout(t);
  }, [fit, initial]);

  // ---------------------------------------------------------------- file actions
  const newMap = () => onCreate(emptyDoc());
  const openExample = () => onCreate(metagenomeExample());
  const downloadMapFile = () => download(`${slug(doc.title)}.json`, new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }));
  const openFile = async (f: File) => {
    try {
      // A drafts backup restores into the library and returns to the start page.
      try {
        const parsed = JSON.parse(await f.text());
        if (isBackup(parsed)) {
          restoreBackup(parsed);
          onHome();
          return;
        }
      } catch {
        /* not JSON: an .mmd file, handled below */
      }
      onCreate(await importFile(f));
    } catch (err) {
      flash(`Couldn't open ${f.name}: ${(err as Error).message}`);
    }
  };

  // ---------------------------------------------------------------- editing
  const deleteSelection = useCallback(() => {
    if (!selected.size) return;
    update((d) => {
      const before = usedLines(d);
      const st = new Set([...selected].filter((s) => s.startsWith('station:')).map((s) => s.slice(8)));
      const ed = new Set([...selected].filter((s) => s.startsWith('edge:')).map((s) => s.slice(5)));
      const se = new Set([...selected].filter((s) => s.startsWith('section:')).map((s) => s.slice(8)));
      d.stations = d.stations.filter((s) => !st.has(s.id));
      d.edges = d.edges.filter((e) => !ed.has(e.id) && !st.has(e.from) && !st.has(e.to));
      d.sections = d.sections.filter((s) => !se.has(s.id));
      pruneLines(d, before);
    });
    setSelected(new Set());
  }, [selected, update]);

  const newStation = (p: { x: number; y: number }): Station => {
    const pos = snapStation(p, 'h');
    return { id: uid('s'), x: pos.x, y: pos.y, label: '', kind: 'step', axis: 'h', labelSide: 'auto' };
  };

  // ---------------------------------------------------------------- clipboard
  const pasteCount = useRef(0);
  const clipFromSelection = () => {
    const ids = new Set([...selected].filter((k) => k.startsWith('station:')).map((k) => k.slice(8)));
    const secIds = new Set([...selected].filter((k) => k.startsWith('section:')).map((k) => k.slice(8)));
    const stations = doc.stations.filter((s) => ids.has(s.id));
    const sections = doc.sections.filter((s) => secIds.has(s.id));
    if (!stations.length && !sections.length) return null;
    const edges = doc.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
    const used = new Set(edges.flatMap((e) => e.lines));
    return { mindTheDag: 1, stations, sections, edges, lines: doc.lines.filter((l) => used.has(l.id)) };
  };
  type Clip = NonNullable<ReturnType<typeof clipFromSelection>>;
  const clipboard = useRef<Clip | null>(null);
  const pasteClip = (clip: Clip) => {
    pasteCount.current += 1;
    const off = 24 * pasteCount.current;
    const idMap = new Map<string, string>();
    const sel = new Set<string>();
    update((d) => {
      for (const l of clip.lines) if (!d.lines.some((x) => x.id === l.id)) d.lines.push({ ...l });
      for (const s of clip.stations) {
        const id = uid('s');
        idMap.set(s.id, id);
        d.stations.push({ ...structuredClone(s), id, x: s.x + off, y: s.y + off });
        sel.add(`station:${id}`);
      }
      for (const e of clip.edges) d.edges.push({ ...structuredClone(e), id: uid('e'), from: idMap.get(e.from)!, to: idMap.get(e.to)! });
      for (const s of clip.sections) {
        const id = uid('sec');
        d.sections.push({ ...structuredClone(s), id, x: s.x + off, y: s.y + off });
        sel.add(`section:${id}`);
      }
    });
    setSelected(sel);
  };
  const selectAll = () => setSelected(new Set([...doc.stations.map((s) => `station:${s.id}`), ...doc.sections.map((s) => `section:${s.id}`)]));

  useEffect(() => {
    const editingText = () => {
      const a = document.activeElement as HTMLElement | null;
      return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
    };
    const onCopy = (e: ClipboardEvent, cut = false) => {
      if (editingText()) return;
      const clip = clipFromSelection();
      if (!clip) return;
      e.preventDefault();
      clipboard.current = clip;
      pasteCount.current = 0;
      e.clipboardData?.setData('text/plain', JSON.stringify(clip));
      if (cut) deleteSelection();
    };
    const onCut = (e: ClipboardEvent) => onCopy(e, true);
    const onPaste = (e: ClipboardEvent) => {
      if (editingText()) return;
      let clip = clipboard.current;
      try {
        const parsed = JSON.parse(e.clipboardData?.getData('text/plain') ?? '');
        if (parsed && parsed.mindTheDag === 1) clip = parsed as Clip;
      } catch {
        /* not ours: fall back to the in-app clipboard */
      }
      if (!clip) return;
      e.preventDefault();
      pasteClip(clip);
    };
    const copyHandler = (e: Event) => onCopy(e as ClipboardEvent);
    window.addEventListener('copy', copyHandler);
    window.addEventListener('cut', onCut);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('copy', copyHandler);
      window.removeEventListener('cut', onCut);
      window.removeEventListener('paste', onPaste);
    };
  });

  const connect = (from: string, to: string) => {
    if (from === to || !active) return;
    update((d) => {
      const before = usedLines(d);
      const e = d.edges.find((x) => (x.from === from && x.to === to) || (x.from === to && x.to === from));
      if (e) {
        if (e.lines.includes(active)) {
          if (e.lines.length > 1) e.lines = e.lines.filter((l) => l !== active);
        } else e.lines.push(active);
      } else d.edges.push({ id: uid('e'), from, to, lines: [active], bend: 0.5 });
      pruneLines(d, before);
    });
  };

  // ---------------------------------------------------------------- keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 's') {
        // Maps save themselves; ⌘S just confirms it.
        e.preventDefault();
        flash('All changes are saved in this browser');
        return;
      }
      if (!typing && !mod && e.key === '?') {
        setHelp(true);
        return;
      }
      if (mod && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        fileInput.current?.click();
        return;
      }
      if (typing || exporting || help || sharing) return;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        selectAll();
        return;
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const clip = clipFromSelection();
        if (clip) {
          pasteCount.current = 0;
          pasteClip(clip);
        }
        return;
      }
      if (mod) return;
      if (e.key === ' ') space.current = true;
      if (e.key === 'Escape') {
        setPending(null);
        setCursor(null);
        setSelected(new Set());
      }
      if (e.key === 'Enter') {
        const only = [...selected];
        if (only.length === 1 && only[0].startsWith('station:')) {
          e.preventDefault();
          setEditing(only[0].slice(8));
        }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelection();
      }
      const toolKey = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
      if (toolKey) setTool(toolKey.id);
      if (e.key === 'f' || e.key === 'F') fit();
      if (e.key === '+' || e.key === '=') zoomBy(1.25);
      if (e.key === '-' || e.key === '_') zoomBy(1 / 1.25);
      if (e.key === '0') zoomBy(1 / view.k);
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (arrows[e.key]) {
        const ids = [...selected].filter((s) => s.startsWith('station:')).map((s) => s.slice(8));
        if (!ids.length) return;
        e.preventDefault();
        const [dx, dy] = arrows[e.key];
        update((d) => {
          for (const s of d.stations)
            if (ids.includes(s.id)) {
              // One grid step along the flow, half a lane across it.
              s.x += dx * (s.axis === 'h' ? 8 : 6);
              s.y += dy * (s.axis === 'h' ? 6 : 8);
            }
        });
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === ' ') space.current = false;
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onUp);
    };
  });

  // ---------------------------------------------------------------- pointer
  const hit = (target: EventTarget | null): { kind: string; id: string } | null => {
    const el = (target as Element | null)?.closest?.('[data-sel]');
    if (!el) return null;
    const [kind, id] = el.getAttribute('data-sel')!.split(':');
    return { kind, id };
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    // Keep focus where we put it (e.g. the inline name editor) and close any field being typed in.
    e.preventDefault();
    // Clicking the canvas commits an open name editor (via blur) and carries on.
    (document.activeElement as HTMLElement | null)?.blur?.();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const w = toWorld(e.clientX, e.clientY);
    if (e.button === 1 || space.current) {
      setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y });
      return;
    }
    const h = hit(e.target);
    const handle = (e.target as Element).getAttribute?.('data-handle');

    const bendHandle = (e.target as Element).getAttribute?.('data-bend');
    if (bendHandle && bendInfo) {
      setDrag({ kind: 'bend', id: bendHandle, A: bendInfo.A, B: bendInfo.B, axis: bendInfo.axis, moved: false });
      return;
    }
    if (handle) {
      const s = doc.sections.find((x) => x.id === handle);
      if (s) setDrag({ kind: 'resize', id: s.id, start: w, orig: { w: s.w, h: s.h }, moved: false });
      return;
    }

    if (tool === 'line' && (!h || h.kind === 'station' || h.kind === 'section')) {
      if (h?.kind === 'station') {
        if (pending && pending !== h.id) connect(pending, h.id);
        setPending(h.id);
        setSelected(new Set([`station:${h.id}`]));
      } else if (!h || h.kind === 'section') {
        const s = newStation(w);
        update((d) => {
          d.stations.push(s);
          if (pending && active) d.edges.push({ id: uid('e'), from: pending, to: s.id, lines: [active], bend: 0.5 });
        });
        setPending(s.id);
        setSelected(new Set([`station:${s.id}`]));
        setEditing(s.id);
      }
      return;
    }

    if (tool === 'section' && (!h || h.kind === 'section')) {
      const p = { x: snap(w.x), y: snap(w.y) };
      setDrag({ kind: 'newSection', start: p, cur: p });
      return;
    }

    if (!h) {
      // Drag on empty canvas draws a selection box (Shift adds to the selection).
      const base = e.shiftKey ? new Set(selected) : new Set<string>();
      setSelected(base);
      setDrag({ kind: 'marquee', start: w, cur: w, base });
      return;
    }

    const key = `${h.kind}:${h.id}`;
    // Double-click (two presses on the same station within 400 ms) renames it.
    const now = performance.now();
    if (h.kind === 'station' && lastDown.current && lastDown.current.key === key && now - lastDown.current.at < 400) {
      lastDown.current = null;
      setSelected(new Set([key]));
      setEditing(h.id);
      return;
    }
    lastDown.current = { key, at: now };
    let sel = selected;
    if (e.shiftKey) {
      sel = new Set(selected);
      if (sel.has(key)) sel.delete(key);
      else sel.add(key);
    } else if (!selected.has(key)) sel = new Set([key]);
    setSelected(sel);

    if (h.kind === 'station') {
      const ids = [...sel].filter((s) => s.startsWith('station:')).map((s) => s.slice(8));
      const orig = new Map(doc.stations.filter((s) => ids.includes(s.id)).map((s) => [s.id, { x: s.x, y: s.y }]));
      setDrag({ kind: 'stations', ids: [h.id, ...ids.filter((i) => i !== h.id)], start: w, orig, moved: false });
    } else if (h.kind === 'section') {
      const s = doc.sections.find((x) => x.id === h.id)!;
      const members = new Map<string, { x: number; y: number }>();
      if (e.altKey)
        for (const st of doc.stations) if (st.x >= s.x && st.x <= s.x + s.w && st.y >= s.y && st.y <= s.y + s.h) members.set(st.id, { x: st.x, y: st.y });
      setDrag({ kind: 'section', id: s.id, start: w, orig: { x: s.x, y: s.y }, members, moved: false });
    } else if (h.kind === 'legend') {
      const g = svgRef.current?.querySelector('[data-legend-origin]');
      const ox = Number(g?.getAttribute('data-x') ?? doc.legend.x);
      const oy = Number(g?.getAttribute('data-y') ?? doc.legend.y);
      setDrag({ kind: 'legend', start: w, orig: { x: ox, y: oy }, moved: false });
    } else if (h.kind === 'title') {
      const g = svgRef.current?.querySelector('[data-title-origin]');
      const ox = Number(g?.getAttribute('data-x') ?? doc.titlePos.x);
      const oy = Number(g?.getAttribute('data-y') ?? doc.titlePos.y);
      setDrag({ kind: 'title', start: w, orig: { x: ox, y: oy }, moved: false });
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    lastClient.current = { x: e.clientX, y: e.clientY };
    if (tool === 'line' && pending && !drag) setCursor(toWorld(e.clientX, e.clientY));
    if (!drag) return;
    if (drag.kind === 'pan') {
      setView((v) => ({ ...v, x: drag.vx - (e.clientX - drag.sx) / v.k, y: drag.vy - (e.clientY - drag.sy) / v.k }));
      return;
    }
    const w = toWorld(e.clientX, e.clientY);
    if (drag.kind === 'newSection') {
      setDrag({ ...drag, cur: { x: snap(w.x), y: snap(w.y) } });
      return;
    }
    if (drag.kind === 'bend') {
      if (!drag.moved) {
        checkpoint();
        setDrag({ ...drag, moved: true });
      }
      const u = drag.axis === 'h' ? w.x : w.y;
      const a = drag.axis === 'h' ? drag.A.x : drag.A.y;
      const du = (drag.axis === 'h' ? drag.B.x : drag.B.y) - a;
      const dv = Math.abs((drag.axis === 'h' ? drag.B.y : drag.B.x) - (drag.axis === 'h' ? drag.A.y : drag.A.x));
      let bend: number;
      if (Math.abs(du) >= dv) bend = (Math.sign(du) * (u - a) - dv / 2) / Math.max(1, Math.abs(du) - dv);
      else bend = (u - a) / du;
      bend = Math.min(1, Math.max(0, Math.round(bend * 100) / 100));
      preview((d) => {
        const ed = d.edges.find((x) => x.id === drag.id);
        if (ed) ed.bend = bend;
      });
      return;
    }
    if (drag.kind === 'marquee') {
      const x0 = Math.min(drag.start.x, w.x);
      const x1 = Math.max(drag.start.x, w.x);
      const y0 = Math.min(drag.start.y, w.y);
      const y1 = Math.max(drag.start.y, w.y);
      const sel = new Set(drag.base);
      for (const s of doc.stations) if (s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1) sel.add(`station:${s.id}`);
      for (const s of doc.sections) if (s.x >= x0 && s.x + s.w <= x1 && s.y >= y0 && s.y + s.h <= y1) sel.add(`section:${s.id}`);
      setSelected(sel);
      setDrag({ ...drag, cur: w });
      return;
    }
    const dx = w.x - drag.start.x;
    const dy = w.y - drag.start.y;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) * view.k < 3) return;
      checkpoint();
      setDrag({ ...drag, moved: true });
      // Once the layout is being rearranged, the legend and title block stay where they are.
      if (drag.kind === 'stations' || drag.kind === 'section' || drag.kind === 'resize') {
        const lg = svgRef.current?.querySelector('[data-legend-origin]');
        const tl = svgRef.current?.querySelector('[data-title-origin]');
        if ((doc.legend.auto && lg) || (doc.titleAuto && tl))
          preview((d) => {
            if (d.legend.auto && lg) {
              d.legend.x = Number(lg.getAttribute('data-x'));
              d.legend.y = Number(lg.getAttribute('data-y'));
              d.legend.auto = false;
            }
            if (d.titleAuto && tl) {
              d.titlePos = { x: Number(tl.getAttribute('data-x')), y: Number(tl.getAttribute('data-y')) };
              d.titleAuto = false;
            }
          });
      }
    }
    if (drag.kind === 'stations') {
      const lead = doc.stations.find((s) => s.id === drag.ids[0]);
      const o = drag.orig.get(drag.ids[0]);
      if (!lead || !o) return;
      const p = snapStation({ x: o.x + dx, y: o.y + dy }, lead.axis);
      const ddx = p.x - o.x;
      const ddy = p.y - o.y;
      preview((d) => {
        for (const s of d.stations) {
          const q = drag.orig.get(s.id);
          if (q) {
            s.x = q.x + ddx;
            s.y = q.y + ddy;
          }
        }
      });
    } else if (drag.kind === 'section') {
      // 8 px across, 24 px down (common multiple of the 8 px grid and the 6 px half-lane).
      const ddx = snap(dx, 8);
      const ddy = snap(dy, 24);
      preview((d) => {
        const s = d.sections.find((x) => x.id === drag.id);
        if (!s) return;
        s.x = drag.orig.x + ddx;
        s.y = drag.orig.y + ddy;
        for (const st of d.stations) {
          const q = drag.members.get(st.id);
          if (q) {
            st.x = q.x + ddx;
            st.y = q.y + ddy;
          }
        }
      });
    } else if (drag.kind === 'resize') {
      preview((d) => {
        const s = d.sections.find((x) => x.id === drag.id);
        if (!s) return;
        s.w = Math.max(96, snap(drag.orig.w + dx));
        s.h = Math.max(64, snap(drag.orig.h + dy));
      });
    } else if (drag.kind === 'legend' || drag.kind === 'title') {
      const p = { x: snap(drag.orig.x + dx), y: snap(drag.orig.y + dy) };
      preview((d) => {
        if (drag.kind === 'legend') {
          d.legend.x = p.x;
          d.legend.y = p.y;
          d.legend.auto = false;
        } else {
          d.titlePos = p;
          d.titleAuto = false;
        }
      });
    }
  };

  // A single station dropped onto another one merges into it (the drag's checkpoint makes it one undo step).
  const mergeTarget = useMemo(() => {
    if (drag?.kind !== 'stations' || !drag.moved || drag.ids.length !== 1) return null;
    const lead = doc.stations.find((s) => s.id === drag.ids[0]);
    return lead ? (stationAt(doc, lead, new Set(drag.ids)) ?? null) : null;
  }, [drag, doc]);

  const onPointerUp = () => {
    if (drag?.kind === 'stations' && mergeTarget) {
      const from = drag.ids[0];
      const into = mergeTarget;
      preview((d) => mergeStations(d, from, into.id));
      setSelected(new Set([`station:${into.id}`]));
      flash(`Merged into ${into.label || 'the station there'}. Undo to separate them again.`);
    }
    if (drag?.kind === 'newSection') {
      const x = Math.min(drag.start.x, drag.cur.x);
      const y = Math.min(drag.start.y, drag.cur.y);
      const w = Math.abs(drag.cur.x - drag.start.x);
      const h = Math.abs(drag.cur.y - drag.start.y);
      if (w >= 64 && h >= 48) {
        const id = uid('sec');
        update((d) => void d.sections.push({ id, name: `Section ${d.sections.length + 1}`, x, y, w, h, tint: d.sections.length % 4 }));
        setSelected(new Set([`section:${id}`]));
        setTool('select');
      }
    }
    setDrag(null);
  };

  usePanZoom(svgRef, setView, lastClient);

  // ---------------------------------------------------------------- inline label editor
  const editStation = editing ? doc.stations.find((s) => s.id === editing) : null;
  const finishEdit = (value: string | null) => {
    if (editStation && value !== null && value !== editStation.label) {
      update((d) => {
        const s = d.stations.find((x) => x.id === editStation.id);
        if (s) s.label = value.trim();
      });
    }
    setEditing(null);
  };

  const pendingStation = pending ? doc.stations.find((s) => s.id === pending) ?? null : null;
  // A selected connection with a diagonal (or a cross-over step) gets a handle to slide it along.
  const bendInfo = useMemo(() => {
    const keys = [...selected];
    if (keys.length !== 1 || !keys[0].startsWith('edge:')) return null;
    const e = doc.edges.find((x) => x.id === keys[0].slice(5));
    if (!e) return null;
    const dv = derive(doc);
    const g = edgeGeometry(dv, e);
    const A = dv.byId.get(e.from);
    const B = dv.byId.get(e.to);
    if (!g || !A || !B || A.axis !== B.axis || g.centre.length !== 4) return null;
    const [, p1, p2] = g.centre;
    return { id: e.id, A: g.centre[0], B: g.centre[3], axis: A.axis, at: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } };
  }, [selected, doc]);
  const selectedSections = useMemo(() => doc.sections.filter((s) => selected.has(`section:${s.id}`)), [doc.sections, selected]);
  const empty = doc.stations.length === 0 && doc.sections.length === 0;
  const dark = theme === 'dark';

  return (
    <div className={`app${dark ? ' dark' : ''}`}>
      <header className="topbar">
        <button className="brand-btn" onClick={onHome} title="All maps" aria-label="mind-the-dag: all maps">
          <Wordmark />
        </button>
        <span className="divider" aria-hidden="true" />
        <input ref={titleRef} className="doc-title" value={doc.title} onChange={(e) => update((d) => void (d.title = e.target.value), 'title')} aria-label="Map title" spellCheck={false} />
        {place.kind === 'cloud' && place.groupName && (
          <span
            className="place-pill"
            title="Everyone in this group can edit this map. If two people edit it at the same time, the later save is held back and you choose which version to keep."
          >
            {place.groupName}
          </span>
        )}
        {saveState ?? (
          <span key={savedDoc === doc ? 'saved' : 'saving'} className="save-state" title="Maps are saved automatically in this browser">
            {savedDoc === doc ? 'Saved' : 'Saving…'}
          </span>
        )}
        <div className="group">
          <button className="icon" onClick={undo} disabled={!store.canUndo} title="Undo (⌘Z)" aria-label="Undo">
            <IUndo />
          </button>
          <button className="icon" onClick={redo} disabled={!store.canRedo} title="Redo (⇧⌘Z)" aria-label="Redo">
            <IRedo />
          </button>
        </div>
        <div className="spacer" />
        <div className="group">
          <button onClick={newMap} title="New map">
            <IPlus size={16} />
            New
          </button>
          <Menu
            label="Open"
            items={[
              { label: 'Open file…', hint: '⌘O', onSelect: () => fileInput.current?.click() },
              { label: 'Example map', onSelect: openExample },
            ]}
          />
          <button onClick={() => setSharing(true)} title="Share with your group or by link">
            Share
          </button>
          <Menu
            label="Export"
            primary
            items={[
              { label: 'SVG', onSelect: () => setExporting('svg') },
              { label: 'PDF', onSelect: () => setExporting('pdf') },
              { label: 'PNG', onSelect: () => setExporting('png') },
              { label: 'Map file (.json)', hint: 'editable', onSelect: downloadMapFile },
            ]}
          />
          <input
            ref={fileInput}
            type="file"
            accept=".json,.mmd,.txt,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void openFile(f);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      {banner}
      <div className="body">
        <aside className="panel left">
          <LeftRail doc={doc} update={update} tool={tool} setTool={setTool} active={active} setActive={setActiveLine} theme={theme} />
        </aside>

        <main
          className="stage"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) void openFile(f);
          }}
        >
          <svg
            ref={svgRef}
            className={`canvas tool-${tool}${drag?.kind === 'pan' ? ' panning' : ''}`}
            style={{ viewTransitionName: MORPH }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <defs>
              <pattern id="grid" width={16 * view.k} height={16 * view.k} patternUnits="userSpaceOnUse" x={-view.x * view.k} y={-view.y * view.k}>
                <circle cx={0.75} cy={0.75} r={0.75} fill={dark ? '#2B3036' : '#D5D9DD'} />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
            <g transform={`scale(${view.k}) translate(${-view.x} ${-view.y})`}>
              <MetroMap doc={doc} theme={theme} selected={selected} />
              {tool === 'line' && pendingStation && cursor && !drag && (
                <g className="rubber" pointerEvents="none">
                  <path d={roundedPath(routeCentre(pendingStation, pendingStation.axis, snapStation(cursor, 'h'), 'h', 0.5), 0, { r45: 40, r90: 32 })} />
                  <circle cx={snapStation(cursor, 'h').x} cy={snapStation(cursor, 'h').y} r={9} />
                </g>
              )}
              {selectedSections.map((s) => (
                <rect key={`h-${s.id}`} data-handle={s.id} className="handle" x={s.x + s.w - 6} y={s.y + s.h - 6} width={12} height={12} rx={3} />
              ))}
              {mergeTarget && <circle className="merge-target" cx={mergeTarget.x} cy={mergeTarget.y} r={18} />}
              {bendInfo && (
                <circle className="bend-handle" data-bend={bendInfo.id} cx={bendInfo.at.x} cy={bendInfo.at.y} r={7 / Math.max(view.k, 0.5)} />
              )}
              {drag?.kind === 'marquee' && (
                <rect
                  className="marquee"
                  x={Math.min(drag.start.x, drag.cur.x)}
                  y={Math.min(drag.start.y, drag.cur.y)}
                  width={Math.abs(drag.cur.x - drag.start.x)}
                  height={Math.abs(drag.cur.y - drag.start.y)}
                  strokeWidth={1 / view.k}
                />
              )}
              {drag?.kind === 'newSection' && (
                <rect
                  x={Math.min(drag.start.x, drag.cur.x)}
                  y={Math.min(drag.start.y, drag.cur.y)}
                  width={Math.abs(drag.cur.x - drag.start.x)}
                  height={Math.abs(drag.cur.y - drag.start.y)}
                  rx={16}
                  className="ghost"
                />
              )}
            </g>
          </svg>

          {empty && (
            <div className="empty">
              {tool === 'line' ? 'Click to place the first station' : (
                <>
                  Press <kbd>L</kbd> and click to start a line
                </>
              )}
            </div>
          )}

          {editStation && (
            <textarea
              key={editStation.id}
              className="inline-edit"
              style={{
                left: (editStation.x - view.x) * view.k,
                top: (editStation.y - view.y) * view.k - 44 - 16 * (editStation.label.split('\n').length - 1),
                width: Math.min(480, Math.max(200, 32 + 7.6 * Math.max(...editStation.label.split('\n').map((r) => r.length)))),
              }}
              defaultValue={editStation.label}
              rows={editStation.label.split('\n').length}
              onInput={(e) => {
                const t = e.currentTarget;
                t.rows = t.value.split('\n').length;
                t.style.width = `${Math.min(480, Math.max(200, 32 + 7.6 * Math.max(...t.value.split('\n').map((r) => r.length))))}px`;
              }}
              placeholder="Name"
              autoFocus
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                // Enter commits; Shift+Enter adds a detail line.
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  finishEdit((e.target as HTMLTextAreaElement).value);
                }
                if (e.key === 'Escape') finishEdit(null);
                e.stopPropagation();
              }}
              onBlur={(e) => finishEdit(e.target.value)}
            />
          )}

          <div className="float left-bottom">
            <button className="bare" onClick={() => setHelp(true)} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
              <IHelp />
            </button>
          </div>
          <div className="float right-bottom zoom">
            <button className="icon" onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out" title="Zoom out">
              <IMinus size={16} />
            </button>
            <span>{Math.round(view.k * 100)}%</span>
            <button className="icon" onClick={() => zoomBy(1.25)} aria-label="Zoom in" title="Zoom in">
              <IPlus size={16} />
            </button>
            <button className="icon" onClick={fit} aria-label="Fit to screen" title="Fit (F)">
              <IFit size={16} />
            </button>
          </div>
          {toast && (
            <div className="toast" role="status">
              {toast}
            </div>
          )}
        </main>

        <aside className="panel right">
          <Inspector doc={doc} update={update} selected={selected} theme={theme} setTheme={setTheme} onDelete={deleteSelection} />
        </aside>
      </div>

      {help && <ShortcutsDialog onClose={() => setHelp(false)} />}
      {sharing && <ShareDialog doc={doc} place={place} onMoveToCloud={onMoveToCloud} onClose={() => setSharing(false)} />}
      {exporting && <ExportDialog doc={doc} theme={theme} format={exporting} onClose={() => setExporting(null)} onDone={flash} />}
    </div>
  );
}
