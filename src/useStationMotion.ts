import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, type RefObject } from 'react';
import { derive, stationMarker, type Doc } from './model';
import { reducedMotion } from './motion';
import { placementFrames } from './placement';
import type { Pt } from './geometry';

type MotionRequest = { kind: 'place' | 'connect' | 'merge'; id: string; colour?: string; edgeId?: string; lineId?: string; from?: Pt };
const EASE = 'cubic-bezier(0.2, 0.7, 0.3, 1)';
const SVG_NS = 'http://www.w3.org/2000/svg';

/** Uniform scale preserves each glyph's identity; hit targets and lines stay put. */
function frames(kind: 'connect' | 'merge', interruptedScale?: number): Keyframe[] {
  const stages: [number, number][] = kind === 'merge'
      ? [[0, 0.82], [0.32, 1.28], [0.62, 0.93], [0.82, 1.04], [1, 1]]
      : [[0, 0.9], [0.35, 1.2], [0.7, 0.96], [1, 1]];
  return stages.map(([offset, scale], i) => ({ offset, transform: `scale(${i === 0 && interruptedScale !== undefined ? interruptedScale : scale})`, easing: EASE }));
}

/** Ephemeral feedback, requested by gestures rather than inferred from document diffs. */
export function useStationMotion(svg: RefObject<SVGSVGElement | null>, feedback: RefObject<SVGGElement | null>, doc: Doc) {
  const queue = useRef<MotionRequest[]>([]);
  const running = useRef(new Map<string, Set<Animation>>());
  const roles = useRef(new Map<string, string>());
  const [revision, requestRender] = useReducer((n: number) => n + 1, 0);
  const request = useCallback((event: MotionRequest) => {
    queue.current.push(event);
    requestRender();
  }, []);
  const cancel = useCallback(() => {
    queue.current = [];
    for (const animations of running.current.values()) for (const a of animations) a.cancel();
    running.current.clear();
  }, []);

  useLayoutEffect(() => {
    const dv = derive(doc);
    for (const [id, animations] of running.current) {
      const station = dv.byId.get(id);
      if (!station || roles.current.get(id) !== `${station.kind}:${station.axis}`) {
        for (const a of animations) a.cancel();
        running.current.delete(id);
      }
    }
    roles.current = new Map(doc.stations.map((s) => [s.id, `${s.kind}:${s.axis}`]));
    for (const event of queue.current) {
      const station = dv.byId.get(event.id);
      const glyph = svg.current?.querySelector<SVGGElement>(`[data-sel="station:${CSS.escape(event.id)}"] .station-glyph`);
      if (!station || !glyph || reducedMotion()) continue;
      const interruptedScale = running.current.has(event.id) ? new DOMMatrixReadOnly(getComputedStyle(glyph).transform).a : undefined;
      for (const a of running.current.get(event.id) ?? []) a.cancel();
      const animations = new Set<Animation>();
      running.current.set(event.id, animations);
      const track = (a: Animation, dispose?: () => void) => {
        animations.add(a);
        const finish = () => {
          dispose?.();
          animations.delete(a);
          if (!animations.size && running.current.get(event.id) === animations) running.current.delete(event.id);
        };
        void a.finished.then(finish, finish);
      };
      const offset = event.from ? { x: event.from.x - station.x, y: event.from.y - station.y } : undefined;
      track(glyph.animate(event.kind === 'place' ? placementFrames(offset) : frames(event.kind, interruptedScale),
        { duration: event.kind === 'connect' ? 340 : 440, easing: 'linear' }));
      if (event.kind === 'place') {
        const file = svg.current?.querySelector<SVGGElement>(`[data-station-file="${CSS.escape(event.id)}"]`);
        if (file) track(file.animate([
          { transform: `translate(${offset?.x ?? 0}px, ${offset?.y ?? 0}px)`, opacity: offset ? 0.4 : 0 },
          { transform: 'translate(0px, 0px)', opacity: 1 },
        ], { duration: 160, easing: EASE }));
      }

      if (event.edgeId && event.lineId) {
        const stroke = svg.current?.querySelector<SVGGElement>(`[data-edge="${CSS.escape(event.edgeId)}"] [data-line-stroke="${CSS.escape(event.lineId)}"]`);
        if (stroke) track(stroke.animate([{ opacity: 0.55 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' }));
      }

      if (feedback.current) {
        const ext = stationMarker(dv, station);
        const ring = document.createElementNS(SVG_NS, 'ellipse');
        ring.setAttribute('rx', String((station.axis === 'h' ? ext.along : ext.across) + 4));
        ring.setAttribute('ry', String((station.axis === 'h' ? ext.across : ext.along) + 4));
        ring.setAttribute('fill', 'none');
        ring.setAttribute('stroke', event.colour ?? '#1f6fae');
        ring.setAttribute('stroke-width', '2');
        ring.setAttribute('vector-effect', 'non-scaling-stroke');
        const host = document.createElementNS(SVG_NS, 'g');
        host.setAttribute('transform', `translate(${ext.x} ${ext.y})`);
        host.append(ring);
        feedback.current.append(host);
        track(ring.animate([
          { transform: 'scale(0.7)', opacity: 0.5 },
          { transform: 'scale(1.9)', opacity: 0 },
        ], { duration: 400, easing: 'ease-out' }), () => host.remove());
      }
    }
    queue.current = [];
  }, [doc, revision, svg, feedback]);

  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => { if (preference.matches) cancel(); };
    preference.addEventListener('change', onChange);
    return () => {
      preference.removeEventListener('change', onChange);
      cancel();
    };
  }, [cancel]);

  return { request, cancel };
}
