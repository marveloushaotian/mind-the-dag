import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { metagenomeExample } from './examples';
import { download, ExportDialog, slug, type ExportFormat } from './exporters';
import { IFit, IHelp, ILogo, IMinus, IPlus, IRedo, IUndo } from './icons';
import { importFile } from './importers';
import { emptyDoc, snap, snapStation, uid, type Station } from './model';
import { Inspector, LeftRail, TOOLS, type Tool } from './panels';
import { MetroMap } from './render';
import { loadStored, useDocument } from './store';
import type { ThemeId } from './tokens';
import { Menu, Popover } from './ui';

type DragState =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { kind: 'stations'; ids: string[]; start: { x: number; y: number }; orig: Map<string, { x: number; y: number }>; moved: boolean }
  | { kind: 'section'; id: string; start: { x: number; y: number }; orig: { x: number; y: number }; members: Map<string, { x: number; y: number }>; moved: boolean }
  | { kind: 'resize'; id: string; start: { x: number; y: number }; orig: { w: number; h: number }; moved: boolean }
  | { kind: 'legend' | 'title'; start: { x: number; y: number }; orig: { x: number; y: number }; moved: boolean }
  | { kind: 'newSection'; start: { x: number; y: number }; cur: { x: number; y: number } };

const SHORTCUTS: [string, string][] = [
  ['V · S · C · R', 'Select · Station · Connect · Section'],
  ['Double-click', 'Rename a station'],
  ['Shift-click', 'Add to selection'],
  ['Delete', 'Delete'],
  ['Arrows', 'Nudge'],
  ['Space-drag', 'Pan'],
  ['F', 'Fit to screen'],
  ['⌘ Z · ⇧⌘ Z', 'Undo · Redo'],
  ['⌘ S · ⌘ O', 'Save · Open'],
  ['Alt-drag section', 'Move it without its stations'],
  ['Esc', 'Stop connecting · deselect'],
];

export default function App() {
  const store = useDocument(() => loadStored() ?? metagenomeExample());
  const { doc, update, preview, checkpoint, undo, redo, replace } = store;
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

  useEffect(() => {
    const t = window.setTimeout(fit, 50);
    return () => window.clearTimeout(t);
  }, [fit]);

  // ---------------------------------------------------------------- file actions
  const newMap = () => {
    replace(emptyDoc());
    setSelected(new Set());
    setEditing(null);
    setTool('station');
    window.setTimeout(() => {
      fit();
      titleRef.current?.select();
    }, 30);
  };
  const openExample = () => {
    replace(metagenomeExample());
    setSelected(new Set());
    window.setTimeout(fit, 30);
  };
  const save = () => download(`${slug(doc.title)}.json`, new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }));
  const openFile = async (f: File) => {
    try {
      const d = await importFile(f);
      replace(d);
      setSelected(new Set());
      setPending(null);
      window.setTimeout(fit, 30);
      flash(`Opened ${f.name}`);
    } catch (err) {
      flash(`Couldn't open ${f.name}: ${(err as Error).message}`);
    }
  };

  // ---------------------------------------------------------------- editing
  const deleteSelection = useCallback(() => {
    if (!selected.size) return;
    update((d) => {
      const st = new Set([...selected].filter((s) => s.startsWith('station:')).map((s) => s.slice(8)));
      const ed = new Set([...selected].filter((s) => s.startsWith('edge:')).map((s) => s.slice(5)));
      const se = new Set([...selected].filter((s) => s.startsWith('section:')).map((s) => s.slice(8)));
      d.stations = d.stations.filter((s) => !st.has(s.id));
      d.edges = d.edges.filter((e) => !ed.has(e.id) && !st.has(e.from) && !st.has(e.to));
      d.sections = d.sections.filter((s) => !se.has(s.id));
    });
    setSelected(new Set());
  }, [selected, update]);

  const newStation = (p: { x: number; y: number }): Station => {
    const pos = snapStation(p, 'h');
    return { id: uid('s'), x: pos.x, y: pos.y, label: '', kind: 'step', axis: 'h', labelSide: 'auto' };
  };

  const connect = (from: string, to: string) => {
    if (from === to || !active) return;
    update((d) => {
      const e = d.edges.find((x) => (x.from === from && x.to === to) || (x.from === to && x.to === from));
      if (e) {
        if (e.lines.includes(active)) {
          if (e.lines.length > 1) e.lines = e.lines.filter((l) => l !== active);
        } else e.lines.push(active);
      } else d.edges.push({ id: uid('e'), from, to, lines: [active], bend: 0.5 });
    });
  };

  // ---------------------------------------------------------------- keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
        return;
      }
      if (mod && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        fileInput.current?.click();
        return;
      }
      if (typing || exporting) return;
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
      if (mod) return;
      if (e.key === ' ') space.current = true;
      if (e.key === 'Escape') {
        setPending(null);
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
    if (editing) {
      (document.activeElement as HTMLElement | null)?.blur();
      return;
    }
    (document.activeElement as HTMLElement | null)?.blur?.();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const w = toWorld(e.clientX, e.clientY);
    if (e.button === 1 || space.current) {
      setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y });
      return;
    }
    const h = hit(e.target);
    const handle = (e.target as Element).getAttribute?.('data-handle');

    if (handle) {
      const s = doc.sections.find((x) => x.id === handle);
      if (s) setDrag({ kind: 'resize', id: s.id, start: w, orig: { w: s.w, h: s.h }, moved: false });
      return;
    }

    if (tool === 'connect') {
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

    if (tool === 'station' && (!h || h.kind === 'section')) {
      const s = newStation(w);
      update((d) => void d.stations.push(s));
      setSelected(new Set([`station:${s.id}`]));
      setEditing(s.id);
      return;
    }

    if (tool === 'section' && (!h || h.kind === 'section')) {
      const p = { x: snap(w.x), y: snap(w.y) };
      setDrag({ kind: 'newSection', start: p, cur: p });
      return;
    }

    if (!h) {
      setSelected(new Set());
      setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y });
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
      if (!e.altKey)
        for (const st of doc.stations) if (st.x >= s.x && st.x <= s.x + s.w && st.y >= s.y && st.y <= s.y + s.h) members.set(st.id, { x: st.x, y: st.y });
      setDrag({ kind: 'section', id: s.id, start: w, orig: { x: s.x, y: s.y }, members, moved: false });
    } else if (h.kind === 'legend') {
      const g = svgRef.current?.querySelector('[data-legend-origin]');
      const ox = Number(g?.getAttribute('data-x') ?? doc.legend.x);
      const oy = Number(g?.getAttribute('data-y') ?? doc.legend.y);
      setDrag({ kind: 'legend', start: w, orig: { x: ox, y: oy }, moved: false });
    } else if (h.kind === 'title') {
      setDrag({ kind: 'title', start: w, orig: { ...doc.titlePos }, moved: false });
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
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
    const dx = w.x - drag.start.x;
    const dy = w.y - drag.start.y;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) * view.k < 3) return;
      checkpoint();
      setDrag({ ...drag, moved: true });
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
        } else d.titlePos = p;
      });
    }
  };

  const onPointerUp = () => {
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

  const onWheel = (e: React.WheelEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    const k2 = Math.min(4, Math.max(0.25, view.k * Math.exp(-e.deltaY * 0.0015)));
    const mx = view.x + (e.clientX - r.left) / view.k;
    const my = view.y + (e.clientY - r.top) / view.k;
    setView({ k: k2, x: mx - (e.clientX - r.left) / k2, y: my - (e.clientY - r.top) / k2 });
  };

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

  const selectedSections = useMemo(() => doc.sections.filter((s) => selected.has(`section:${s.id}`)), [doc.sections, selected]);
  const empty = doc.stations.length === 0 && doc.sections.length === 0;
  const dark = theme === 'dark';

  return (
    <div className={`app${dark ? ' dark' : ''}`}>
      <header className="topbar">
        <span className="logo" aria-hidden="true">
          <ILogo size={22} />
        </span>
        <input ref={titleRef} className="doc-title" value={doc.title} onChange={(e) => update((d) => void (d.title = e.target.value), 'title')} aria-label="Map title" spellCheck={false} />
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
          <button onClick={save} title="Save as .json (⌘S)">
            Save
          </button>
          <Menu
            label="Export"
            primary
            items={[
              { label: 'SVG', onSelect: () => setExporting('svg') },
              { label: 'PDF', onSelect: () => setExporting('pdf') },
              { label: 'PNG', onSelect: () => setExporting('png') },
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
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onWheel={onWheel}
          >
            <defs>
              <pattern id="grid" width={16 * view.k} height={16 * view.k} patternUnits="userSpaceOnUse" x={-view.x * view.k} y={-view.y * view.k}>
                <circle cx={0.75} cy={0.75} r={0.75} fill={dark ? '#2B3036' : '#D5D9DD'} />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
            <g transform={`scale(${view.k}) translate(${-view.x} ${-view.y})`}>
              <MetroMap doc={doc} theme={theme} selected={selected} pending={pending} />
              {selectedSections.map((s) => (
                <rect key={`h-${s.id}`} data-handle={s.id} className="handle" x={s.x + s.w - 6} y={s.y + s.h - 6} width={12} height={12} rx={3} />
              ))}
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
              {tool === 'station' || tool === 'connect' ? 'Click to place a station' : (
                <>
                  Press <kbd>S</kbd> and click to place a station
                </>
              )}
            </div>
          )}

          {editStation && (
            <input
              key={editStation.id}
              className="inline-edit"
              style={{ left: (editStation.x - view.x) * view.k, top: (editStation.y - view.y) * view.k - 44 }}
              defaultValue={editStation.label}
              placeholder="Name"
              autoFocus
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') finishEdit((e.target as HTMLInputElement).value);
                if (e.key === 'Escape') finishEdit(null);
                e.stopPropagation();
              }}
              onBlur={(e) => finishEdit(e.target.value)}
            />
          )}

          <div className="float left-bottom">
            <Popover label="Keyboard shortcuts" trigger={<IHelp />} placement="top">
              <dl className="keys">
                {SHORTCUTS.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </Popover>
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

      {exporting && <ExportDialog doc={doc} theme={theme} format={exporting} onClose={() => setExporting(null)} onDone={flash} />}
    </div>
  );
}
