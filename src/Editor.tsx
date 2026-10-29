import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { metagenomeExample } from './examples';
import { download, ExportDialog, slug, type ExportFormat } from './exporters';
import { IFit, IHelp, IMinus, IPlus, IRedo, IUndo } from './icons';
import { isBackup, restoreBackup } from './library';
import { importFile } from './importers';
import { createStation, derive, emptyDoc, mergeStations, pruneLines, snap, snapStation, uid, usedLines, type Doc, type StationKind } from './model';
import { Inspector, LeftRail, TOOLS, type Tool } from './panels';
import { edgeGeometry, MetroMap } from './render';
import { useDocument } from './store';
import { usePanZoom } from './panzoom';
import { lineStyle, tints, tokens, type ThemeId } from './tokens';
import { Menu, Wordmark } from './ui';
import { isMac, ShareDialog, ShortcutsDialog } from './dialogs';
import { MORPH } from './motion';
import { FusionPreview, PlacementGhost, StationHalo } from './CanvasFeedback';
import { connectionTarget, connectStations, previewStationMerge, snapTarget } from './interaction';
import { useStationMotion } from './useStationMotion';
import { useMapLayoutMotion } from './useMapLayoutMotion';
import { followPlacement } from './placement';
import { alignedPoint, alignAnchors, bendAtCoordinate, bendCoordinate, pointAnchors, sectionAnchors, stationAlignmentTargets,
  type AlignmentAnchor, type AlignmentGuide, type AlignmentLocks } from './alignment';
import type { Pt } from './geometry';

const NO_DRAGGED_STATIONS: readonly string[] = [];

type DragState =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { kind: 'stations'; ids: string[]; start: { x: number; y: number }; orig: Map<string, { x: number; y: number }>; moved: boolean }
  | { kind: 'section'; id: string; start: { x: number; y: number }; orig: { x: number; y: number }; members: Map<string, { x: number; y: number }>; moved: boolean }
  | { kind: 'resize'; id: string; start: { x: number; y: number }; orig: { w: number; h: number }; moved: boolean }
  | { kind: 'legend' | 'title'; start: { x: number; y: number }; orig: { x: number; y: number }; moved: boolean }
  | { kind: 'newSection'; start: { x: number; y: number }; cur: { x: number; y: number } }
  | { kind: 'bend'; id: string; A: Pt; B: Pt; at: Pt; grab: number; axis: 'h' | 'v'; moved: boolean }
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
  checkTitle,
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
  /** Cloud maps: the title to use instead of `title` if another map in the same place has it. */
  checkTitle?: (title: string) => Promise<string>;
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
  const { doc, update, preview, checkpoint, undo, redo, replace } = store;
  const [tool, setToolState] = useState<Tool>('select');
  const [stationKind, setStationKind] = useState<StationKind>('step');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<string | null>(null);
  const [activeLine, setActiveLine] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeId>('light');
  const [view, setView] = useState({ x: -40, y: -40, k: 1 });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
  const mergeTargetRef = useRef<string | null>(null);
  const cancelDragRef = useRef<(() => void) | null>(null);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const [previewId] = useState(() => uid('preview'));
  const lastClient = useRef({ x: 0, y: 0 });
  const lastCamera = useRef(view);
  const svgRef = useRef<SVGSVGElement>(null);
  const feedbackRef = useRef<SVGGElement>(null);
  const placementPosition = useRef<{ x: number; y: number } | null>(null);
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([]);
  const alignmentLocks = useRef<AlignmentLocks>({});
  const dragTargets = useRef<AlignmentAnchor[]>([]);
  const placementTargets = useMemo(() => tool === 'station' ? stationAlignmentTargets(doc) : [], [doc, tool]);
  const titleRef = useRef<HTMLInputElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const space = useRef(false);
  const lastDown = useRef<{ key: string; at: number } | null>(null);
  const stationMotion = useStationMotion(svgRef, feedbackRef, doc);
  const derived = useMemo(() => derive(doc), [doc]);

  const setHovered = (id: string | null) => {
    hoveredRef.current = id;
    setHoveredId(id);
  };
  const clearAlignment = () => {
    alignmentLocks.current = {};
    setAlignmentGuides([]);
  };
  const align = (moving: AlignmentAnchor[], targets: AlignmentAnchor[], bypass = false) => {
    const result = alignAnchors(moving, targets, view.k, alignmentLocks.current, bypass);
    alignmentLocks.current = result.locks;
    setAlignmentGuides(result.guides);
    return result;
  };
  const clearPointer = () => {
    setCursor(null);
    setHovered(null);
    if (!drag) clearAlignment();
  };
  const setSpace = (held: boolean) => {
    space.current = held;
    // Cursor feedback must be immediate even when no React state changes.
    svgRef.current?.classList.toggle('pan-ready', held);
    if (held) clearPointer();
  };
  const cancelConnection = () => {
    setPending(null);
    clearPointer();
  };
  const clearDrag = () => {
    cancelDragRef.current = null;
    setDrag(null);
    setMergeTargetId(null);
    mergeTargetRef.current = null;
    dragTargets.current = [];
    clearAlignment();
  };
  const cancelGesture = () => {
    cancelDragRef.current?.();
    clearDrag();
    cancelConnection();
  };
  const undoEdit = () => { stationMotion.cancel(); clearDrag(); cancelConnection(); undo(); };
  const redoEdit = () => { stationMotion.cancel(); cancelGesture(); redo(); };

  const active = activeLine && doc.lines.some((l) => l.id === activeLine) ? activeLine : doc.lines[0]?.id ?? null;
  const setTool = (t: Tool) => {
    setToolState(t);
    if (t === 'station') setStationKind('step');
    cancelConnection();
    setSelected(new Set());
    lastDown.current = null;
  };
  const selectLine = (id: string) => {
    cancelConnection();
    setActiveLine(id);
  };

  const toWorld = useCallback(
    (cx: number, cy: number) => {
      const r = svgRef.current!.getBoundingClientRect();
      return { x: view.x + (cx - r.left) / view.k, y: view.y + (cy - r.top) / view.k };
    },
    [view],
  );

  useLayoutEffect(() => {
    if (lastCamera.current === view) return;
    lastCamera.current = view;
    if (!cursor || (tool !== 'line' && tool !== 'station')) return;
    const point = toWorld(lastClient.current.x, lastClient.current.y);
    clearAlignment();
    setCursor(point);
    const target = snapTarget(doc, derived, point, view.k, hoveredRef.current, tool === 'line' ? pending : null);
    hoveredRef.current = target?.id ?? null;
    setHoveredId(target?.id ?? null);
  }, [view, cursor, tool, pending, doc, derived, toWorld]);

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
        setToolState('station');
        titleRef.current?.select();
      }
    }, 50);
    return () => window.clearTimeout(t);
  }, [fit, initial]);

  // ---------------------------------------------------------------- file actions
  // Finishing a rename: a title another map here already has gets the next free number.
  const titleAtFocus = useRef<string | null>(null);
  const commitTitle = async () => {
    const typed = doc.title;
    if (!checkTitle || typed === titleAtFocus.current) return;
    titleAtFocus.current = typed;
    try {
      const free = await checkTitle(typed);
      if (free !== typed) {
        update((d) => {
          if (d.title === typed) d.title = free;
        });
        titleAtFocus.current = free;
        flash(`Renamed to “${free}”: another map here is called “${typed.trim()}”.`);
      }
    } catch {
      /* offline: keep the name as typed */
    }
  };
  useEffect(() => {
    titleAtFocus.current = doc.title;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
    if (!active) return;
    const change = connectStations(doc, from, to, active, uid('e'));
    if (change) {
      const line = doc.lines.find((l) => l.id === active)!;
      const colour = lineStyle(doc, line.slot, theme, line.colour).color;
      stationMotion.request({ kind: 'connect', id: to, edgeId: change.edgeId, lineId: active, colour });
      replace(change.doc);
    }
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
        if (e.shiftKey) redoEdit();
        else undoEdit();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redoEdit();
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
      if (e.key === ' ') {
        // Space still activates a focused toolbar button using native keyboard behaviour.
        if ((e.target as Element | null)?.closest?.('button, [role="button"]')) return;
        e.preventDefault();
        setSpace(true);
        return;
      }
      if (e.key === 'Escape') {
        if (drag) cancelGesture();
        cancelConnection();
        setSelected(new Set());
        if (tool === 'station') setToolState('select');
      }
      if (e.key === 'Enter') {
        const only = [...selected];
        if (only.length === 1 && only[0].startsWith('station:')) {
          e.preventDefault();
          setRenameTarget(only[0].slice(8));
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
      if (e.key === ' ') setSpace(false);
    };
    const onBlur = () => {
      setSpace(false);
      if (drag) cancelGesture();
      else clearPointer();
    };
    const onVisibility = () => { if (document.hidden) onBlur(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
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
    if (e.button !== 0 && e.button !== 1) return;
    lastClient.current = { x: e.clientX, y: e.clientY };
    // Keep focus where we put it (e.g. the inline name editor) and close any field being typed in.
    e.preventDefault();
    // Clicking the canvas commits an open name editor (via blur) and carries on.
    (document.activeElement as HTMLElement | null)?.blur?.();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const w = toWorld(e.clientX, e.clientY);
    if (e.button === 1 || space.current) {
      clearPointer();
      setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y });
      return;
    }
    const h = hit(e.target);
    setMergeTargetId(null);
    mergeTargetRef.current = null;

    if (tool === 'line') {
      const target = connectionTarget(doc, derived, w, view.k, {
        hitId: h?.kind === 'station' ? h.id : null, hoverId: hoveredRef.current, sourceId: pending, pointerType: e.pointerType,
      });
      setCursor(w);
      setHovered(null);
      if (!target || !active || target.id === pending) {
        setPending(null);
      } else {
        if (pending) connect(pending, target.id);
        setPending(target.id);
        setSelected(new Set());
      }
      return;
    }

    if (tool === 'station' && (!h || h.kind === 'section' || h.kind === 'edge')) {
      // A nearby existing marker blocks placement; Station never connects it.
      const occupied = snapTarget(doc, derived, w, view.k, null);
      if (occupied) {
        setToolState('select');
        clearPointer();
        setSelected(new Set([`station:${occupied.id}`]));
        return;
      }
      const alignment = align(pointAnchors('placement', w), placementTargets, e.metaKey || e.ctrlKey);
      const s = createStation(w, stationKind);
      Object.assign(s, alignedPoint(w, s, alignment));
      // A move and click can arrive before the next frame. Keep that handoff
      // close to the pointer instead of flying in from a stale painted position.
      const origin = e.pointerType === 'mouse' && placementPosition.current
        ? followPlacement(placementPosition.current, w, 0, view.k) : undefined;
      stationMotion.request({ kind: 'place', id: s.id, colour: tokens.themes[theme].muted,
        from: origin });
      update((d) => { d.stations.push(s); });
      setHovered(s.id);
      setCursor(w);
      setSelected(new Set());
      clearAlignment();
      return;
    }

    if (tool === 'station' && h?.kind === 'station') {
      setToolState('select');
      clearPointer();
    }

    clearAlignment();

    const handle = (e.target as Element).getAttribute?.('data-handle');

    const bendHandle = (e.target as Element).getAttribute?.('data-bend');
    if (bendHandle && bendInfo) {
      dragTargets.current = stationAlignmentTargets(doc, [], bendHandle, true);
      setDrag({ kind: 'bend', id: bendHandle, A: bendInfo.A, B: bendInfo.B, at: bendInfo.at,
        grab: bendInfo.axis === 'h' ? w.x - bendInfo.at.x : w.y - bendInfo.at.y, axis: bendInfo.axis, moved: false });
      return;
    }
    if (handle) {
      const s = doc.sections.find((x) => x.id === handle);
      if (s) {
        dragTargets.current = doc.sections.filter((other) => other.id !== s.id).flatMap(sectionAnchors);
        setDrag({ kind: 'resize', id: s.id, start: w, orig: { w: s.w, h: s.h }, moved: false });
      }
      return;
    }

    if (tool === 'section' && (!h || h.kind === 'section')) {
      dragTargets.current = doc.sections.flatMap(sectionAnchors);
      const alignment = align(pointAnchors('corner', w), dragTargets.current, e.metaKey || e.ctrlKey);
      const p = alignedPoint(w, { x: snap(w.x), y: snap(w.y) }, alignment);
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
      setRenameTarget(h.id);
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
      dragTargets.current = stationAlignmentTargets(doc, ids);
      setDrag({ kind: 'stations', ids: [h.id, ...ids.filter((i) => i !== h.id)], start: w, orig, moved: false });
    } else if (h.kind === 'section') {
      const s = doc.sections.find((x) => x.id === h.id)!;
      const members = new Map<string, { x: number; y: number }>();
      if (e.altKey)
        for (const st of doc.stations) if (st.x >= s.x && st.x <= s.x + s.w && st.y >= s.y && st.y <= s.y + s.h) members.set(st.id, { x: st.x, y: st.y });
      dragTargets.current = doc.sections.filter((other) => other.id !== s.id).flatMap(sectionAnchors);
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
    if ((tool === 'line' || tool === 'station') && !drag && !space.current) {
      const point = toWorld(e.clientX, e.clientY);
      const h = hit(e.target);
      const exclude = tool === 'line' ? pending : null;
      const direct = h?.kind === 'station' && h.id !== exclude ? derived.byId.get(h.id) : null;
      const hovered = direct ?? snapTarget(doc, derived, point, view.k, tool === 'line' ? hoveredRef.current : null, exclude);
      setHovered(hovered?.id ?? null);
      if (tool === 'station' && !hovered) {
        const alignment = align(pointAnchors('placement', point), placementTargets, e.metaKey || e.ctrlKey);
        setCursor(alignedPoint(point, point, alignment));
      } else {
        clearAlignment();
        setCursor((current) => tool === 'station' ? point : current ?? point);
      }
    }
    if (!drag) return;
    if (drag.kind === 'pan') {
      setView((v) => ({ ...v, x: drag.vx - (e.clientX - drag.sx) / v.k, y: drag.vy - (e.clientY - drag.sy) / v.k }));
      return;
    }
    const w = toWorld(e.clientX, e.clientY);
    const bypass = e.metaKey || e.ctrlKey;
    if (drag.kind === 'newSection') {
      const alignment = align(pointAnchors('corner', w), dragTargets.current, bypass);
      setDrag({ ...drag, cur: alignedPoint(w, { x: snap(w.x), y: snap(w.y) }, alignment) });
      return;
    }
    if (drag.kind === 'bend') {
      if (!drag.moved) {
        const distance = (drag.axis === 'h' ? w.x - drag.at.x : w.y - drag.at.y) - drag.grab;
        if (Math.abs(distance) * view.k < 3) return;
        cancelDragRef.current = checkpoint();
        setDrag({ ...drag, moved: true });
      }
      const axis = drag.axis === 'h' ? 'x' : 'y';
      const point = { ...drag.at, [axis]: w[axis] - drag.grab };
      const end = [bendCoordinate(drag.A, drag.B, drag.axis, 0), bendCoordinate(drag.A, drag.B, drag.axis, 1)];
      const targets = dragTargets.current.filter((t) => t.axis === axis && t.value >= Math.min(...end) && t.value <= Math.max(...end));
      const alignment = align(pointAnchors('bend', point), targets, bypass);
      const p = alignedPoint(point, point, alignment);
      let bend = bendAtCoordinate(drag.A, drag.B, drag.axis, p[axis]);
      if (!alignment.locks[axis]) bend = Math.round(bend * 100) / 100;
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
      cancelDragRef.current = checkpoint();
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
      const raw = { x: o.x + dx, y: o.y + dy };
      const target = drag.ids.length === 1 ? snapTarget(doc, derived, raw, view.k, mergeTargetRef.current, lead.id) : null;
      const moving = [...drag.orig].flatMap(([id, p]) => pointAnchors(`station:${id}`, { x: p.x + dx, y: p.y + dy }));
      const alignment = align(moving, dragTargets.current, bypass || !!target);
      const p = alignedPoint(raw, snapStation(raw, lead.axis), alignment);
      mergeTargetRef.current = target?.id ?? null;
      setMergeTargetId(target?.id ?? null);
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
      const section = doc.sections.find((s) => s.id === drag.id);
      if (!section) return;
      const raw = { x: drag.orig.x + dx, y: drag.orig.y + dy };
      const alignment = align(sectionAnchors({ ...section, ...raw }), dragTargets.current, bypass);
      const p = alignedPoint(raw, { x: drag.orig.x + snap(dx, 8), y: drag.orig.y + snap(dy, 24) }, alignment);
      const ddx = p.x - drag.orig.x;
      const ddy = p.y - drag.orig.y;
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
      const section = doc.sections.find((s) => s.id === drag.id);
      if (!section) return;
      const raw = { x: section.x + Math.max(96, drag.orig.w + dx), y: section.y + Math.max(64, drag.orig.h + dy) };
      const targets = dragTargets.current.filter((t) => t.value >= (t.axis === 'x' ? section.x + 96 : section.y + 64));
      const alignment = align(pointAnchors('corner', raw), targets, bypass);
      const p = alignedPoint(raw, { x: section.x + Math.max(96, snap(drag.orig.w + dx)), y: section.y + Math.max(64, snap(drag.orig.h + dy)) }, alignment);
      preview((d) => {
        const s = d.sections.find((x) => x.id === drag.id);
        if (!s) return;
        s.w = p.x - s.x;
        s.h = p.y - s.y;
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

  // The drag owns one checkpoint, including fusion; previews are derived views only.
  const mergingStation = drag?.kind === 'stations' && drag.moved && drag.ids.length === 1 ? derived.byId.get(drag.ids[0]) : null;
  const mergeTarget = mergingStation && mergeTargetId ? derived.byId.get(mergeTargetId) : null;
  const mergePreview = useMemo(() => mergingStation && mergeTarget
    ? previewStationMerge(doc, mergingStation.id, mergeTarget.id) : null, [doc, mergingStation, mergeTarget]);

  const onPointerUp = () => {
    if (drag?.kind === 'stations' && mergeTarget) {
      const from = drag.ids[0];
      const into = mergeTarget;
      stationMotion.request({ kind: 'merge', id: into.id });
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
        update((d) => void d.sections.push({ id, name: `Section ${d.sections.length + 1}`, x, y, w, h, tint: d.sections.length % tints(d, theme).length }));
        setTool('select');
        setSelected(new Set([`section:${id}`]));
      }
    }
    clearDrag();
  };

  usePanZoom(svgRef, setView, lastClient);

  // Rename and property edits share one field in the inspector.
  useLayoutEffect(() => {
    if (!renameTarget) return;
    if (selected.has(`station:${renameTarget}`)) {
      const field = inspectorRef.current?.querySelector<HTMLTextAreaElement>('[aria-label="Station name"]');
      field?.focus();
      field?.select();
    }
    setRenameTarget(null);
  }, [renameTarget, selected]);

  const pendingStation = pending ? derived.byId.get(pending) ?? null : null;
  const hoveredStation = hoveredId ? derived.byId.get(hoveredId) ?? null : null;
  const canPreview = cursor !== null && drag === null;
  // Geometry changes only when the target changes, never on every pointer move.
  const candidate = useMemo(() => {
    if (tool !== 'line' || !pending || !hoveredId || !active || !canPreview) return null;
    return connectStations(doc, pending, hoveredId, active, previewId);
  }, [doc, tool, pending, hoveredId, active, previewId, canPreview]);
  const displayDoc = mergePreview ?? candidate?.doc ?? doc;
  const directlyMoved = useMemo(() => drag?.kind === 'stations' && drag.moved ? drag.ids
    : drag?.kind === 'section' && drag.moved ? [...drag.members.keys()] : NO_DRAGGED_STATIONS, [drag]);
  useMapLayoutMotion(svgRef, feedbackRef, displayDoc, directlyMoved, Boolean(drag && 'moved' in drag && drag.moved));
  const displayDerived = useMemo(() => displayDoc === doc ? derived : derive(displayDoc), [displayDoc, doc, derived]);
  const mapView = useMemo(() => (
    <MetroMap doc={displayDoc} theme={theme} selected={selected}
      previewConnection={candidate && active ? { edgeId: candidate.edgeId, lineId: active } : undefined} />
  ), [displayDoc, theme, selected, candidate, active]);
  const activeDefinition = doc.lines.find((l) => l.id === active);
  const activeStyle = activeDefinition ? lineStyle(doc, activeDefinition.slot, theme, activeDefinition.colour) : null;
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
        <input
          ref={titleRef}
          className="doc-title"
          value={doc.title}
          onChange={(e) => update((d) => void (d.title = e.target.value), 'title')}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          onBlur={() => void commitTitle()}
          aria-label="Map title"
          spellCheck={false}
        />
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
          <button className="icon" onClick={undoEdit} disabled={!store.canUndo} title="Undo (⌘Z)" aria-label="Undo">
            <IUndo />
          </button>
          <button className="icon" onClick={redoEdit} disabled={!store.canRedo} title="Redo (⇧⌘Z)" aria-label="Redo">
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
          <LeftRail doc={doc} update={update} tool={tool} setTool={setTool} active={active} setActive={selectLine} theme={theme} />
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
            className={`canvas tool-${tool}${space.current ? ' pan-ready' : ''}${drag?.kind === 'pan' ? ' panning'
              : drag?.kind === 'resize' ? ' resizing' : drag?.kind === 'marquee' ? ' marquee'
                : drag && ['stations', 'section', 'legend', 'title', 'bend'].includes(drag.kind) ? ' dragging' : ''}`}
            style={{ viewTransitionName: MORPH }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={clearPointer}
            onPointerCancel={cancelGesture}
            onLostPointerCapture={() => { if (cancelDragRef.current) cancelGesture(); }}
          >
            <defs>
              <pattern id="grid" width={16 * view.k} height={16 * view.k} patternUnits="userSpaceOnUse" x={-view.x * view.k} y={-view.y * view.k}>
                <circle cx={0.75} cy={0.75} r={0.75} fill={dark ? '#2B3036' : '#D5D9DD'} />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
            <g transform={`scale(${view.k}) translate(${-view.x} ${-view.y})`}>
              {mapView}
              {tool === 'station' && cursor && !hoveredStation && !drag && <PlacementGhost
                point={cursor} kind={stationKind} theme={theme} view={view} position={placementPosition} />}
              {alignmentGuides.length > 0 && <g className="alignment-guides" data-alignment-guides pointerEvents="none" aria-hidden="true">
                {alignmentGuides.map((guide) => <line key={guide.axis} data-alignment-axis={guide.axis}
                  x1={guide.axis === 'x' ? guide.value : guide.from - 12 / view.k}
                  y1={guide.axis === 'y' ? guide.value : guide.from - 12 / view.k}
                  x2={guide.axis === 'x' ? guide.value : guide.to + 12 / view.k}
                  y2={guide.axis === 'y' ? guide.value : guide.to + 12 / view.k}
                  vectorEffect="non-scaling-stroke" />)}
              </g>}
              {tool === 'line' && pendingStation && activeStyle && <StationHalo station={pendingStation}
                derived={displayDerived} zoom={view.k} colour={activeStyle.color} source />}
              {(tool === 'line' || tool === 'station') && hoveredStation && !drag && <StationHalo key={hoveredStation.id} station={hoveredStation}
                derived={displayDerived} zoom={view.k} colour={tool === 'line' && activeStyle ? activeStyle.color : tokens.themes[theme].muted} />}
              {selectedSections.map((s) => (
                <rect key={`h-${s.id}`} data-handle={s.id} className="handle" x={s.x + s.w - 6} y={s.y + s.h - 6} width={12} height={12} rx={3} />
              ))}
              {mergeTarget && mergingStation && <FusionPreview from={mergingStation} into={mergeTarget}
                derived={displayDerived} zoom={view.k} />}
              <g ref={feedbackRef} className="station-feedback" pointerEvents="none" aria-hidden="true" />
              {bendInfo && (
                <circle className="bend-handle" data-bend={bendInfo.id} cx={bendInfo.at.x} cy={bendInfo.at.y} r={7 / Math.max(view.k, 0.5)} />
              )}
              {drag?.kind === 'marquee' && (
                <rect
                  className="selection-marquee"
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
              {tool === 'station' ? 'Click to place stations. Connect them when you’re ready.' : (
                <>
                  Press <kbd>S</kbd> and click to place stations
                </>
              )}
            </div>
          )}

          {mergeTarget && <div className="canvas-hint" role="status">Release to merge into {mergeTarget.label || 'this station'}</div>}
          {drag && alignmentGuides.length > 0 && !mergeTarget && <div className="canvas-hint">
            <span>Aligned</span><span className="hint-key">Hold {isMac ? '⌘' : 'Ctrl'} to skip alignment</span>
          </div>}

          {!empty && (tool === 'station' || tool === 'line') && (
            <div className="canvas-hint">
              <span>{tool === 'station' ? 'Click to place a station' : pendingStation ? hoveredStation ? candidate ? 'Click to connect' : 'Already connected · Click to continue' : 'Approach another station to preview' : 'Click a station to start'}</span>
              <span className="hint-key">Esc {tool === 'station' ? 'to select' : 'to finish'}</span>
              {alignmentGuides.length > 0 && <span className="hint-key">Hold {isMac ? '⌘' : 'Ctrl'} to skip alignment</span>}
            </div>
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

        <aside className={`panel right${tool === 'station' || selected.size ? ' contextual' : ''}`} ref={inspectorRef}>
          <button className="inspector-dismiss" onClick={() => setTool('select')} aria-label="Close properties">Close</button>
          <Inspector doc={doc} update={update} selected={selected} theme={theme} setTheme={setTheme} onDelete={deleteSelection}
            placement={tool === 'station' ? { kind: stationKind, setKind: setStationKind } : undefined} />
        </aside>
      </div>

      {help && <ShortcutsDialog onClose={() => setHelp(false)} />}
      {sharing && <ShareDialog doc={doc} place={place} onMoveToCloud={onMoveToCloud} onClose={() => setSharing(false)} />}
      {exporting && <ExportDialog doc={doc} theme={theme} format={exporting} onClose={() => setExporting(null)} onDone={flash} />}
    </div>
  );
}
