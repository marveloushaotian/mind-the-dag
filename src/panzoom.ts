import { useEffect, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react';

export interface View {
  x: number;
  y: number;
  k: number;
}

/**
 * Wheel and pinch on a canvas: only the canvas zooms (never the page), around the pointer.
 * Plain wheel and two-finger scroll pan; pinch (ctrl + wheel) or ⌘/Ctrl + wheel zooms;
 * Safari's gesture events zoom too. While the canvas is mounted, pinching over the panels
 * does nothing, so the page itself never zooms.
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
    // Pinch anywhere else on the page (panels, top bar) must not zoom the page either.
    const onWindowWheel = (e: WheelEvent) => {
      if ((e.ctrlKey || e.metaKey) && !svg.contains(e.target as Node)) e.preventDefault();
    };
    // Safari reports pinch as gesture events, on whatever is under the fingers.
    let last = 1;
    let overCanvas = false;
    const inside = (x: number, y: number) => {
      const r = svg.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      last = 1;
      const g = e as Event & { clientX?: number; clientY?: number };
      overCanvas = inside(g.clientX ?? lastClient.current.x, g.clientY ?? lastClient.current.y);
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as Event & { scale: number; clientX?: number; clientY?: number };
      if (overCanvas) zoomAt(g.clientX ?? lastClient.current.x, g.clientY ?? lastClient.current.y, g.scale / last);
      last = g.scale;
    };
    const onGestureEnd = (e: Event) => e.preventDefault();
    svg.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('wheel', onWindowWheel, { passive: false });
    document.addEventListener('gesturestart', onGestureStart, { passive: false });
    document.addEventListener('gesturechange', onGestureChange, { passive: false });
    document.addEventListener('gestureend', onGestureEnd, { passive: false });
    return () => {
      svg.removeEventListener('wheel', onWheel);
      window.removeEventListener('wheel', onWindowWheel);
      document.removeEventListener('gesturestart', onGestureStart);
      document.removeEventListener('gesturechange', onGestureChange);
      document.removeEventListener('gestureend', onGestureEnd);
    };
  }, []);

}
