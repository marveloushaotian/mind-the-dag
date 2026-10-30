import type { Pt } from './geometry';

/** Frame-rate independent settling, with no more than 8 screen pixels of lag. */
export function followPlacement(current: Pt, target: Pt, elapsedMs: number, zoom: number): Pt {
  const alpha = 1 - Math.exp(-Math.max(0, elapsedMs) / 24);
  const dx = (target.x - current.x) * (1 - alpha);
  const dy = (target.y - current.y) * (1 - alpha);
  const distance = Math.hypot(dx, dy);
  if (distance * zoom < 0.05) return target;
  const limit = Math.min(1, 8 / (zoom * distance));
  return { x: target.x - dx * limit, y: target.y - dy * limit };
}

/** The preview hands over its complete shape; only the final landing snaps. */
export function placementFrames(from?: Pt): Keyframe[] {
  const stages = from
    ? [[0, 1], [0.32, 1.28], [0.58, 0.92], [0.8, 1.04], [1, 1]]
    : [[0, 0.15], [0.32, 1.34], [0.58, 0.9], [0.8, 1.05], [1, 1]];
  return stages.map(([offset, scale]) => {
    const remaining = Math.max(0, 1 - offset / 0.32);
    return {
      offset,
      transform: `translate(${(from?.x ?? 0) * remaining}px, ${(from?.y ?? 0) * remaining}px) scale(${scale})`,
      opacity: from && offset < 0.32 ? 0.4 + 0.6 * offset / 0.32 : 1,
      easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)',
    };
  });
}

/** Shared connection/fusion pulse, including the decorative cover journey. */
export function stationPulseFrames(kind: 'connect' | 'merge', interruptedScale?: number): Keyframe[] {
  const stages: [number, number][] = kind === 'merge'
    ? [[0, 0.82], [0.32, 1.28], [0.62, 0.93], [0.82, 1.04], [1, 1]]
    : [[0, 0.9], [0.35, 1.2], [0.7, 0.96], [1, 1]];
  return stages.map(([offset, scale], i) => ({ offset,
    transform: `scale(${i === 0 && interruptedScale !== undefined ? interruptedScale : scale})`,
    easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' }));
}
