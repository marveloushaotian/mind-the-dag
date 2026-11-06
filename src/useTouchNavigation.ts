import { useCallback, useRef, type Dispatch, type PointerEvent, type SetStateAction } from 'react';
import { MAX_ZOOM, MIN_ZOOM, type View } from './panzoom';

type Point = { x: number; y: number };
type Pinch = { distance: number; anchor: Point; view: View };

/** Two fingers own the camera until every finger lifts; they never edit the document. */
export function useTouchNavigation(view: View, setView: Dispatch<SetStateAction<View>>, cancelEdit: () => void) {
  const points = useRef(new Map<number, Point>());
  const pinch = useRef<Pinch | null>(null);
  const locked = useRef(false);
  const active = useCallback(() => points.current.size > 0, []);
  const reset = () => { points.current.clear(); pinch.current = null; locked.current = false; };
  const pair = () => [...points.current.values()].slice(0, 2);
  const start = (svg: SVGSVGElement) => {
    const [a, b] = pair();
    const r = svg.getBoundingClientRect();
    pinch.current = { distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), view,
      anchor: { x: view.x + ((a.x + b.x) / 2 - r.left) / view.k, y: view.y + ((a.y + b.y) / 2 - r.top) / view.k } };
  };
  return {
    active, reset,
    down(e: PointerEvent<SVGSVGElement>) {
      if (e.pointerType !== 'touch') return false;
      points.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (points.current.size >= 2) {
        e.preventDefault();
        if (!locked.current) cancelEdit();
        locked.current = true;
        start(e.currentTarget);
      }
      return locked.current;
    },
    move(e: PointerEvent<SVGSVGElement>) {
      if (e.pointerType !== 'touch' || !points.current.has(e.pointerId)) return false;
      points.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!locked.current) return false;
      e.preventDefault();
      if (points.current.size >= 2 && pinch.current) {
        const [a, b] = pair();
        const p = pinch.current;
        const r = e.currentTarget.getBoundingClientRect();
        const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, p.view.k * Math.hypot(b.x - a.x, b.y - a.y) / p.distance));
        setView({ k, x: p.anchor.x - ((a.x + b.x) / 2 - r.left) / k, y: p.anchor.y - ((a.y + b.y) / 2 - r.top) / k });
      }
      return true;
    },
    up(e: PointerEvent<SVGSVGElement>) {
      if (e.pointerType !== 'touch' || !points.current.has(e.pointerId)) return false;
      const consumed = locked.current;
      points.current.delete(e.pointerId);
      if (points.current.size >= 2) start(e.currentTarget);
      else pinch.current = null;
      if (!points.current.size) locked.current = false;
      return consumed;
    },
  };
}
