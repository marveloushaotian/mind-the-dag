import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { metagenomeExample } from './examples';
import { emptyDoc, snap, snapStation, uid, type Doc, type Station } from './model';
import { Inspector, LinesPanel } from './panels';
import { MetroMap } from './render';
import { loadStored, useDocument } from './store';
import { ExportMenu } from './exporters';
import { importFile } from './importers';
import type { ThemeId } from './tokens';

export type Tool = 'select' | 'station' | 'connect' | 'section';

type DragState =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { kind: 'stations'; ids: string[]; start: { x: number; y: number }; orig: Map<string, { x: number; y: number }>; moved: boolean }
  | { kind: 'section'; id: string; start: { x: number; y: number }; orig: { x: number; y: number }; members: Map<string, { x: number; y: number }>; moved: boolean }
  | { kind: 'resize'; id: string; start: { x: number; y: number }; orig: { w: number; h: number }; moved: boolean }
  | { kind: 'legend' | 'title'; start: { x: number; y: number }; orig: { x: number; y: number }; moved: boolean }
  | { kind: 'newSection'; start: { x: number; y: number }; cur: { x: number; y: number } };

const TOOLS: { id: Tool; label: string; key: string; hint: string }[] = [
  { id: 'select', label: 'Select', key: 'V', hint: 'Select and drag; drag empty space to pan' },
  { id: 'station', label: 'Station', key: 'S', hint: 'Click to add a station' },
  { id: 'connect', label: 'Connect', key: 'C', hint: 'Click two stations to join them with the active line; click empty space to add and join a new station; Esc to stop' },
  { id: 'section', label: 'Section', key: 'R', hint: 'Drag to draw a section' },
];

export default function App() {
  const store = useDocument(() => loadStored() ?? metagenomeExample());
  const { doc, update, preview, checkpoint, undo, redo, replace } = store;
  const [tool, setTool] = useState<Tool>('select');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<string | null>(null);
  const [activeLine, setActiveLine] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeId>('light');
  const [view, setView] = useState({ x: -40, y: -40, k: 1 });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const space = useRef(false);

  const active = activeLine && doc.lines.some((l) => l.id === activeLine) ? activeLine : doc.lines[0]?.id ?? null;

  const toWorld = useCallback(
    (cx: number, cy: number) => {
      const r = svgRef.current!.getBoundingClientRect();
      return { x: view.x + (cx - r.left) / view.k, y: view.y + (cy - r.top) / view.k };
    },
    [view],
  );

  const flash = (m: string) => {
    setMessage(m);
    window.setTimeout(() => setMessage((cur) => (cur === m ? null : cur)), 3500);
  };

  const fit = useCallback(() => {
    const svg = svgRef.current;
    const g = svg?.querySelector('g.metro') as SVGGElement | null;
    if (!svg || !g) return;
    const b = g.getBBox();
    const r = svg.getBoundingClientRect();
    if (!b.width || !b.height) return;
    const k = Math.min(2, Math.max(0.25, Math.min((r.width - 80) / b.width, (r.height - 80) / b.height)));
    setView({ k, x: b.x - (r.width / k - b.width) / 2, y: b.y - (r.height / k - b.height) / 2 });
  }, []);

  useEffect(() => {
    const t = window.setTimeout(fit, 50);
    return () => window.clearTimeout(t);
  }, [fit]);

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

  const addStation = (p: { x: number; y: number }): Station => {
    const n = doc.stations.length + 1;
    const pos = snapStation(p, 'h');
    return { id: uid('s'), x: pos.x, y: pos.y, label: `Step ${n}`, kind: 'step', axis: 'h', labelSide: 'auto' };
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
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
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
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelection();
      }
      const toolKey = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
      if (toolKey) {
        setTool(toolKey.id);
        setPending(null);
      }
      if (e.key === 'f' || e.key === 'F') fit();
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -6], ArrowDown: [0, 6] };
      if (arrows[e.key]) {
        const ids = [...selected].filter((s) => s.startsWith('station:')).map((s) => s.slice(8));
        if (!ids.length) return;
        e.preventDefault();
        const [dx, dy] = arrows[e.key];
        update((d) => {
          for (const s of d.stations) if (ids.includes(s.id)) {
            s.x += s.axis === 'h' ? dx : dx === 0 ? 0 : Math.sign(dx) * 6;
            s.y += s.axis === 'h' ? dy : dy === 0 ? 0 : Math.sign(dy) * 8;
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
  }, [undo, redo, deleteSelection, selected, update, fit]);

  // ---------------------------------------------------------------- pointer
  const hit = (target: EventTarget | null): { kind: string; id: string } | null => {
    const el = (target as Element | null)?.closest?.('[data-sel]');
    if (!el) return null;
    const [kind, id] = el.getAttribute('data-sel')!.split(':');
    return { kind, id };
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
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
      } else if (!h || h.kind === 'section') {
        const s = addStation(w);
        update((d) => {
          d.stations.push(s);
          if (pending && active) d.edges.push({ id: uid('e'), from: pending, to: s.id, lines: [active], bend: 0.5 });
        });
        setPending(s.id);
        setSelected(new Set([`station:${s.id}`]));
      }
      return;
    }

    if (tool === 'station' && (!h || h.kind === 'section')) {
      const s = addStation(w);
      update((d) => void d.stations.push(s));
      setSelected(new Set([`station:${s.id}`]));
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
        for (const st of doc.stations)
          if (st.x >= s.x && st.x <= s.x + s.w && st.y >= s.y && st.y <= s.y + s.h) members.set(st.id, { x: st.x, y: st.y });
      setDrag({ kind: 'section', id: s.id, start: w, orig: { x: s.x, y: s.y }, members, moved: false });
    } else if (h.kind === 'legend') {
      setDrag({ kind: 'legend', start: w, orig: { ...doc.legend }, moved: false });
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
      // Move by multiples of 24 vertically (lcm of 8 and 6) and 8 horizontally so members stay on their grids.
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

  // ---------------------------------------------------------------- files
  const fileInput = useRef<HTMLInputElement>(null);
  const openFile = async (f: File) => {
    try {
      const d = await importFile(f);
      replace(d);
      setSelected(new Set());
      setPending(null);
      window.setTimeout(fit, 30);
      flash(`Opened ${f.name}`);
    } catch (err) {
      flash(`Could not open ${f.name}: ${(err as Error).message}`);
    }
  };

  const selectedSections = useMemo(() => doc.sections.filter((s) => selected.has(`section:${s.id}`)), [doc.sections, selected]);
  const dark = theme === 'dark';
  const toolHint = TOOLS.find((t) => t.id === tool)!.hint;

  return (
    <div className={`app${dark ? ' dark' : ''}`}>
      <header className="topbar">
        <span className="brand">mind-the-dag</span>
        <div className="group" role="toolbar" aria-label="Tools">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              className={tool === t.id ? 'on' : ''}
              title={`${t.hint} (${t.key})`}
              onClick={() => {
                setTool(t.id);
                setPending(null);
              }}
            >
              {t.label} <kbd>{t.key}</kbd>
            </button>
          ))}
        </div>
        <div className="group">
          <button onClick={undo} disabled={!store.canUndo} title="Undo (Ctrl/⌘ Z)">
            Undo
          </button>
          <button onClick={redo} disabled={!store.canRedo} title="Redo (Ctrl/⌘ Shift Z)">
            Redo
          </button>
          <button onClick={fit} title="Fit to screen (F)">
            Fit
          </button>
        </div>
        <div className="spacer" />
        <div className="group">
          <button
            onClick={() => {
              replace(emptyDoc());
              setSelected(new Set());
            }}
          >
            New
          </button>
          <button
            onClick={() => {
              replace(metagenomeExample());
              setSelected(new Set());
              window.setTimeout(fit, 30);
            }}
          >
            Example
          </button>
          <button onClick={() => fileInput.current?.click()} title="Open a .json map or an nf-metro .mmd file">
            Open…
          </button>
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
          <ExportMenu doc={doc} theme={theme} onMessage={flash} />
        </div>
      </header>
      <div className="body">
        <aside className="panel left">
          <LinesPanel doc={doc} update={update} active={active} setActive={setActiveLine} theme={theme} setTheme={setTheme} />
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
                <rect
                  key={`h-${s.id}`}
                  data-handle={s.id}
                  className="handle"
                  x={s.x + s.w - 6}
                  y={s.y + s.h - 6}
                  width={12}
                  height={12}
                  rx={3}
                />
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
          <div className="statusbar">
            <span>{toolHint}</span>
            <span className="spacer" />
            {message && <span className="message">{message}</span>}
            <span>{Math.round(view.k * 100)}%</span>
          </div>
        </main>
        <aside className="panel right">
          <Inspector doc={doc} update={update} selected={selected} theme={theme} />
        </aside>
      </div>
    </div>
  );
}

export type { Doc };
