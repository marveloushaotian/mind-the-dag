import { useEffect, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react';

export interface View {
  x: number;
  y: number;
  k: number;
}

/**
 * Wheel and pinch on a canvas: only the canvas zooms (never the page), around the pointer.
 * Plain wheel and two-finger scroll pan; pinch (ctrl + wheel) or ⌘/Ctrl + wheel zooms;
 * Safari's gesture events zoom too.
 */
export function usePanZoom(
  svgRef: RefObject<SVGSVGElement | null>,
  setView: Dispatch<SetStateAction<View>>,
  lastClient: MutableRefObject<{ x: number; y: number }>,
) {
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const zoomAt = (clientX: number, clientY: number, factor: number) =>
      setView((v) => {
        const r = svg.getBoundingClientRect();
        const k2 = Math.min(4, Math.max(0.25, v.k * factor));
        const mx = v.x + (clientX - r.left) / v.k;
        const my = v.y + (clientY - r.top) / v.k;
        return { k: k2, x: mx - (clientX - r.left) / k2, y: my - (clientY - r.top) / k2 };
      });
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      lastClient.current = { x: e.clientX, y: e.clientY };
      if (e.ctrlKey || e.metaKey) {
        // Trackpad pinch (reported as ctrl + wheel) or ⌘/Ctrl + wheel: zoom around the pointer.
        const dy = Math.max(-10, Math.min(10, e.deltaY * (e.deltaMode === 1 ? 16 : 1)));
        zoomAt(e.clientX, e.clientY, Math.exp(-dy * 0.02));
        return;
      }
      // Plain wheel or two-finger scroll: pan only (Shift turns vertical wheel into horizontal).
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const dx = (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * unit;
      const dy = (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * unit;
      setView((v) => ({ ...v, x: v.x + dx / v.k, y: v.y + dy / v.k }));
    };
    // Safari reports pinch as gesture events.
    let last = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      last = 1;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as Event & { scale: number; clientX?: number; clientY?: number };
      zoomAt(g.clientX ?? lastClient.current.x, g.clientY ?? lastClient.current.y, g.scale / last);
      last = g.scale;
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    svg.addEventListener('gesturestart', onGestureStart);
    svg.addEventListener('gesturechange', onGestureChange);
    return () => {
      svg.removeEventListener('wheel', onWheel);
      svg.removeEventListener('gesturestart', onGestureStart);
      svg.removeEventListener('gesturechange', onGestureChange);
    };
  }, []);

}
