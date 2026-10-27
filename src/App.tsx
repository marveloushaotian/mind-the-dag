import { useRef, useState } from 'react';
import { metagenomeExample } from './examples';
import { MetroMap } from './render';

export default function App() {
  const [doc] = useState(metagenomeExample);
  const [view, setView] = useState({ x: -40, y: -40, k: 1 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const onWheel = (e: React.WheelEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    const k2 = Math.min(4, Math.max(0.25, view.k * Math.exp(-e.deltaY * 0.0015)));
    const mx = view.x + (e.clientX - r.left) / view.k;
    const my = view.y + (e.clientY - r.top) / view.k;
    setView({ k: k2, x: mx - (e.clientX - r.left) / k2, y: my - (e.clientY - r.top) / k2 });
  };

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">mind-the-dag</span>
        <span className="hint">Preview · drag to pan, scroll to zoom</span>
      </header>
      <main className="stage">
        <svg
          ref={svgRef}
          className="canvas"
          onWheel={onWheel}
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, y: e.clientY };
            (e.target as Element).setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const dx = (e.clientX - drag.current.x) / view.k;
            const dy = (e.clientY - drag.current.y) / view.k;
            drag.current = { x: e.clientX, y: e.clientY };
            setView((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
          }}
          onPointerUp={() => (drag.current = null)}
        >
          <g transform={`scale(${view.k}) translate(${-view.x} ${-view.y})`}>
            <MetroMap doc={doc} exporting />
          </g>
        </svg>
      </main>
    </div>
  );
}
