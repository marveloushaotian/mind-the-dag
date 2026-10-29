import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { defaultFileBadge, emptyDoc, stationMarker, type Derived, type Station, type StationKind } from './model';
import { MetroMap } from './render';
import { reducedMotion } from './motion';
import { followPlacement } from './placement';
import type { View } from './panzoom';
import type { ThemeId } from './tokens';
import type { Pt } from './geometry';

/** Reuse the actual renderer so the placement ghost matches every station type. */
export function PlacementGhost({ point, kind, theme, view, position }: {
  point: Pt; kind: StationKind; theme: ThemeId; view: View; position: RefObject<Pt | null>;
}) {
  const node = useRef<SVGGElement>(null);
  const initial = useRef(point);
  const motion = useRef({ current: point, target: point, view, time: 0, frame: 0 });
  useLayoutEffect(() => {
    const state = motion.current;
    const paint = (p: Pt) => {
      state.current = p;
      position.current = p;
      node.current?.setAttribute('transform', `translate(${p.x} ${p.y})`);
    };
    state.target = point;
    if (state.view !== view || reducedMotion()) {
      cancelAnimationFrame(state.frame);
      state.frame = 0;
      state.view = view;
      paint(point);
      return;
    }
    paint(state.current);
    if (state.frame) return;
    state.time = performance.now();
    const tick = (time: number) => {
      const p = followPlacement(state.current, state.target, time - state.time, state.view.k);
      state.time = time;
      paint(p);
      state.frame = p === state.target ? 0 : requestAnimationFrame(tick);
    };
    state.frame = requestAnimationFrame(tick);
  }, [point, view, position]);
  useLayoutEffect(() => {
    const state = motion.current;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const settle = () => {
      if (!preference.matches) return;
      cancelAnimationFrame(state.frame);
      state.frame = 0;
      state.current = state.target;
      position.current = state.target;
      node.current?.setAttribute('transform', `translate(${state.target.x} ${state.target.y})`);
    };
    preference.addEventListener('change', settle);
    return () => {
      preference.removeEventListener('change', settle);
      cancelAnimationFrame(state.frame);
      state.frame = 0;
      position.current = null;
    };
  }, [position]);
  const ghost = useMemo(() => {
    const doc = emptyDoc();
    doc.legend.show = false;
    doc.stations = [{ id: 'placement', x: 0, y: 0, label: '', kind, axis: 'h', labelSide: 'auto',
      ...((kind === 'start' || kind === 'stop') ? { file: defaultFileBadge() } : {}) }];
    return <MetroMap doc={doc} theme={theme} exporting={kind !== 'junction'} />;
  }, [kind, theme]);
  return <g ref={node} className="placement-ghost" transform={`translate(${initial.current.x} ${initial.current.y})`}
    pointerEvents="none" aria-hidden="true">{ghost}</g>;
}

export function StationHalo({ station, derived, zoom, colour, source = false }: {
  station: Station; derived: Derived; zoom: number; colour: string; source?: boolean;
}) {
  const marker = stationMarker(derived, station);
  const rx = marker.rx + 7 / zoom;
  const ry = marker.ry + 7 / zoom;
  return (
    <g transform={`translate(${marker.x} ${marker.y})`} pointerEvents="none" aria-hidden="true">
      <g className={source ? 'connection-source' : 'connection-target'} data-snap-target={source ? undefined : station.id}>
        <rect x={-rx} y={-ry} width={rx * 2} height={ry * 2} rx={Math.min(rx, ry)}
          fill={colour} fillOpacity={source ? 0.04 : 0.09} stroke={colour} strokeOpacity={source ? 0.5 : 0.85}
          strokeWidth={source ? 1.5 : 2} vectorEffect="non-scaling-stroke" />
      </g>
    </g>
  );
}

/** A short, pinched bridge suggests adhesion while the provisional fusion is held. */
export function FusionPreview({ from, into, derived, zoom }: { from: Station; into: Station; derived: Derived; zoom: number }) {
  const dx = into.x - from.x;
  const dy = into.y - from.y;
  const distance = Math.hypot(dx, dy);
  const r = Math.min(9 / zoom, distance / 3);
  const nx = distance ? -dy / distance * r : 0;
  const ny = distance ? dx / distance * r : 0;
  const mx = (from.x + into.x) / 2;
  const my = (from.y + into.y) / 2;
  const d = `M ${from.x + nx} ${from.y + ny} Q ${mx + nx * 0.15} ${my + ny * 0.15} ${into.x + nx} ${into.y + ny}
    L ${into.x - nx} ${into.y - ny} Q ${mx - nx * 0.15} ${my - ny * 0.15} ${from.x - nx} ${from.y - ny} Z`;
  return (
    <g className="fusion-preview" pointerEvents="none" aria-hidden="true">
      {distance > 1 && <path d={d} fill="#1f6fae" fillOpacity={0.18} />}
      <StationHalo station={into} derived={derived} zoom={zoom} colour="#1f6fae" />
    </g>
  );
}
