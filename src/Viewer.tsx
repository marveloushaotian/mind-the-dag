import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { IFit, IMinus, IPlus } from './icons';
import type { Doc } from './model';
import { usePanZoom, type View } from './panzoom';
import { MetroMap } from './render';
import { Wordmark } from './ui';
import { MORPH } from './motion';

/** Read-only view of a shared map (by link or from the group library), with a way to save one's own copy. */
export default function Viewer({
  load,
  onHome,
  onCopy,
  byline,
  actions,
  errorText = 'This link is incomplete or damaged.',
}: {
  load: () => Promise<Doc>;
  onHome: () => void;
  onCopy: (d: Doc) => void;
  byline?: string;
  actions?: ReactNode;
  errorText?: string;
}) {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [error, setError] = useState(false);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const svgRef = useRef<SVGSVGElement>(null);
  const lastClient = useRef({ x: 0, y: 0 });
  usePanZoom(svgRef, setView, lastClient);

  useEffect(() => {
    load().then(setDoc).catch(() => setError(true));
  }, [load]);

  const fit = useCallback(() => {
    const svg = svgRef.current;
    const g = svg?.querySelector('g.metro') as SVGGElement | null;
    if (!svg || !g) return;
    const b = g.getBBox();
    const r = svg.getBoundingClientRect();
    if (!b.width) return;
    const k = Math.min(1.5, Math.max(0.25, Math.min((r.width - 96) / b.width, (r.height - 96) / b.height)));
    setView({ k, x: b.x - (r.width / k - b.width) / 2, y: b.y - (r.height / k - b.height) / 2 });
  }, []);
  useEffect(() => {
    if (doc) window.setTimeout(fit, 30);
  }, [doc, fit]);
  const zoomBy = (f: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const k2 = Math.min(4, Math.max(0.25, view.k * f));
    const cx = view.x + r.width / 2 / view.k;
    const cy = view.y + r.height / 2 / view.k;
    setView({ k: k2, x: cx - r.width / 2 / k2, y: cy - r.height / 2 / k2 });
  };
  const drag = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null);

  return (
    <div className="viewer">
      <header className="topbar">
        <button className="brand-btn" onClick={onHome} aria-label="mind-the-dag: all maps">
          <Wordmark />
        </button>
        <span className="divider" aria-hidden="true" />
        <span className="view-title">{doc?.title ?? ''}</span>
        <span className="badge">View only</span>
        {byline && <span className="view-byline">{byline}</span>}
        <div className="spacer" />
        {actions}
        <button className="primary" disabled={!doc} onClick={() => doc && onCopy(doc)}>
          Make a copy
        </button>
      </header>
      <main className="stage">
        {error ? (
          <div className="empty">{errorText}</div>
        ) : (
          <svg
            ref={svgRef}
            className="canvas"
            style={{ viewTransitionName: MORPH }}
            onPointerDown={(e) => {
              (e.currentTarget as Element).setPointerCapture(e.pointerId);
              drag.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
            }}
            onPointerMove={(e) => {
              lastClient.current = { x: e.clientX, y: e.clientY };
              const d = drag.current;
              if (d) setView((v) => ({ ...v, x: d.vx - (e.clientX - d.sx) / v.k, y: d.vy - (e.clientY - d.sy) / v.k }));
            }}
            onPointerUp={() => (drag.current = null)}
          >
            <g transform={`scale(${view.k}) translate(${-view.x} ${-view.y})`}>{doc && <MetroMap doc={doc} exporting />}</g>
          </svg>
        )}
        <div className="float right-bottom zoom">
          <button className="icon" onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">
            <IMinus size={16} />
          </button>
          <span>{Math.round(view.k * 100)}%</span>
          <button className="icon" onClick={() => zoomBy(1.25)} aria-label="Zoom in">
            <IPlus size={16} />
          </button>
          <button className="icon" onClick={fit} aria-label="Fit to screen">
            <IFit size={16} />
          </button>
        </div>
      </main>
    </div>
  );
}
