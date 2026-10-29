import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import type { Doc } from './model';
import { pathTopology, reducedMotion } from './motion';

type Visual = {
  node: SVGElement; clone: SVGElement; owner: string; kind: string;
  geometry?: Record<string, string>; x?: number; y?: number; text?: string;
};
type Running = { animations: Set<Animation>; ghosts: Set<SVGElement> };
const EASE = 'cubic-bezier(0.2, 0.7, 0.3, 1)';
const ATTRS = ['x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'd'];

/** Visual-only layout feedback. Pointer targets, saved geometry and history stay immediate. */
export function useMapLayoutMotion(svg: RefObject<SVGSVGElement | null>, feedback: RefObject<SVGGElement | null>, doc: Doc, dragged: readonly string[], directManipulation: boolean) {
  const previous = useRef<Map<string, Visual> | null>(null);
  const running = useRef(new Map<string, Running>());
  const stop = useCallback((key: string) => {
    const active = running.current.get(key);
    if (!active) return;
    running.current.delete(key);
    for (const animation of active.animations) animation.cancel();
    for (const ghost of active.ghosts) ghost.remove();
  }, []);

  useLayoutEffect(() => {
    const root = svg.current?.querySelector('.metro');
    if (!root) return;
    const current = new Map<string, Visual>();
    const remember = (key: string, node: SVGElement, owner: string, kind: string, extra: Partial<Visual> = {}) => {
      current.set(key, { node, clone: node.cloneNode(true) as SVGElement, owner, kind, ...extra });
    };
    for (const station of doc.stations) {
      const group = root.querySelector<SVGGElement>(`g[data-sel="station:${CSS.escape(station.id)}"]`);
      const shape = group?.querySelector<SVGElement>('.station-glyph rect, .station-glyph circle, .station-glyph path');
      if (shape) {
        const geometry: Record<string, string> = {};
        for (const name of ATTRS) {
          const value = shape.getAttribute(name);
          if (value !== null) geometry[name] = name === 'd' ? `path("${value}")` : `${value}px`;
        }
        remember(`shape:${station.id}`, shape, station.id, `${station.kind}:${station.axis}`, { geometry });
      }
      for (const part of ['label', 'file'] as const) {
        const node = root.querySelector<SVGGraphicsElement>(`[data-station-${part}="${CSS.escape(station.id)}"]`);
        if (!node) continue;
        const box = node.getBBox();
        remember(`${part}:${station.id}`, node, station.id, part, {
          x: part === 'file' ? Number(node.getAttribute('data-layout-x')) : box.x,
          y: part === 'file' ? Number(node.getAttribute('data-layout-y')) : box.y,
          text: node.textContent ?? '',
        });
      }
    }
    for (const edge of root.querySelectorAll<SVGGElement>('[data-edge]')) {
      for (const line of edge.querySelectorAll<SVGGElement>('[data-line-stroke]')) {
        line.querySelectorAll<SVGPathElement>('path:not([data-layout-ghost])').forEach((node, index) => {
          const d = node.getAttribute('d') ?? '';
          remember(`line:${edge.dataset.edge}:${line.dataset.lineStroke}:${index}`, node, '', pathTopology(d), { geometry: { d: `path("${d}")` } });
        });
      }
    }

    const old = previous.current;
    previous.current = current;
    if (!old || reducedMotion()) {
      for (const key of running.current.keys()) stop(key);
      return;
    }
    const directPaths = directManipulation || (document.activeElement instanceof HTMLInputElement && document.activeElement.type === 'range');
    const start = (key: string, jobs: { node: SVGElement; frames: Keyframe[]; duration?: number; ghost?: boolean }[]) => {
      stop(key);
      const active: Running = { animations: new Set(), ghosts: new Set() };
      running.current.set(key, active);
      for (const job of jobs) {
        if (job.ghost) active.ghosts.add(job.node);
        const animation = job.node.animate(job.frames, { duration: job.duration ?? 180, easing: EASE });
        active.animations.add(animation);
        const finish = () => {
          if (job.ghost) job.node.remove();
          active.animations.delete(animation);
          if (!active.animations.size && running.current.get(key) === active) running.current.delete(key);
        };
        void animation.finished.then(finish, finish);
      }
    };
    const ghost = (visual: Visual, parent: Element | null = feedback.current): SVGElement | null => {
      if (!parent) return null;
      const copy = visual.clone.cloneNode(true) as SVGElement;
      copy.setAttribute('pointer-events', 'none');
      copy.setAttribute('aria-hidden', 'true');
      copy.setAttribute('data-layout-ghost', '');
      copy.removeAttribute('data-sel');
      parent.append(copy);
      return copy;
    };
    for (const [key, next] of current) {
      const was = old.get(key);
      if (dragged.includes(next.owner) || (next.owner === '' && directPaths)) { stop(key); continue; }
      if (!was) {
        // New-station badges belong to its placement handoff; existing stations
        // still fade their badge when a type/property edit enables it.
        if (key.startsWith('file:') && old.has(`shape:${next.owner}`))
          start(key, [{ node: next.node, frames: [{ opacity: 0 }, { opacity: 1 }], duration: 140 }]);
        continue;
      }
      if (was.kind !== next.kind) {
        const copy = ghost(was, next.owner ? feedback.current : next.node.parentElement);
        start(key, [
          ...(copy ? [{ node: copy, frames: [{ opacity: 1 }, { opacity: 0 }], duration: 100, ghost: true }] : []),
          { node: next.node, frames: [{ opacity: 0 }, { opacity: 1 }], duration: 160 },
        ]);
      } else if (next.geometry && was.geometry) {
        if (JSON.stringify(next.geometry) === JSON.stringify(was.geometry)) continue;
        const from = { ...was.geometry };
        if (running.current.has(key) && was.node === next.node) {
          const style = getComputedStyle(next.node);
          for (const name of Object.keys(from)) from[name] = style.getPropertyValue(name);
        }
        start(key, [{ node: next.node, frames: [from, next.geometry] }]);
      } else if (was.text === next.text && (was.x !== next.x || was.y !== next.y)) {
        const transform = running.current.has(key) && was.node === next.node ? new DOMMatrixReadOnly(getComputedStyle(next.node).transform) : new DOMMatrixReadOnly();
        const dx = was.x! - next.x! + transform.e, dy = was.y! - next.y! + transform.f;
        start(key, [{ node: next.node, frames: [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0px, 0px)' }] }]);
      }
    }
    for (const [key, was] of old) {
      if (current.has(key)) continue;
      stop(key);
      if (!key.startsWith('file:') || dragged.includes(was.owner)) continue;
      const copy = ghost(was);
      if (copy) start(key, [{ node: copy, frames: [{ opacity: 1 }, { opacity: 0 }], duration: 100, ghost: true }]);
    }
  }, [doc, dragged, directManipulation, svg, feedback, stop]);

  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const clear = () => { for (const key of running.current.keys()) stop(key); };
    const onChange = () => { if (preference.matches) clear(); };
    preference.addEventListener('change', onChange);
    return () => { preference.removeEventListener('change', onChange); clear(); };
  }, [stop]);
}
