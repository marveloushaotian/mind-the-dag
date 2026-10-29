import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PlacementGhost } from './CanvasFeedback';
import { followPlacement, placementFrames } from './placement';

describe('continuous placement preview', () => {
  it.each([0.25, 1, 4])('limits lag in screen space at %s× zoom', (zoom) => {
    const target = { x: 1000, y: -600 };
    const p = followPlacement({ x: 0, y: 0 }, target, 16, zoom);
    expect(Math.hypot(target.x - p.x, target.y - p.y) * zoom).toBeCloseTo(8);
  });

  it('settles equally over one full frame or two half frames', () => {
    const start = { x: 0, y: 0 }, target = { x: 4, y: 3 };
    const full = followPlacement(start, target, 16, 1);
    const half = followPlacement(followPlacement(start, target, 8, 1), target, 8, 1);
    expect(full.x).toBeCloseTo(half.x);
    expect(full.y).toBeCloseTo(half.y);
  });

  it('bounds a move-and-click handoff even before an animation frame has run', () => {
    const p = followPlacement({ x: 0, y: 0 }, { x: 200, y: 0 }, 0, 2);
    expect(p).toEqual({ x: 196, y: 0 });
  });

  it.each([30, 60, 120])('finishes exactly at the pointer at %s fps', (fps) => {
    const target = { x: 100, y: 40 };
    let p = { x: 0, y: 0 };
    for (let i = 0; i < fps; i++) p = followPlacement(p, target, 1000 / fps, 1);
    expect(p).toBe(target);
  });

  it('renders the preview at the continuous pointer position rather than a grid intersection', () => {
    const markup = renderToStaticMarkup(<PlacementGhost point={{ x: 13.25, y: 17.75 }} kind="step" theme="light"
      view={{ x: 0, y: 0, k: 1 }} position={{ current: null }} />);
    expect(markup).toContain('transform="translate(13.25 17.75)"');
    expect(markup).toContain('pointer-events="none" aria-hidden="true"');
  });
});

describe('placement handoff', () => {
  it('starts at the painted preview position, opacity and full size, then lands on the snapped station', () => {
    const frames = placementFrames({ x: 3.25, y: -2 });
    expect(frames[0]).toMatchObject({ transform: 'translate(3.25px, -2px) scale(1)', opacity: 0.4 });
    expect(frames.at(-1)).toMatchObject({ transform: 'translate(0px, 0px) scale(1)', opacity: 1 });
    expect(frames[1]).toMatchObject({ transform: 'translate(0px, 0px) scale(1.28)' });
    expect(frames.every((frame) => /scale\([\d.]+\)$/.test(String(frame.transform)))).toBe(true);
  });

  it('retains the small arrival for touch or placement without a visible preview', () => {
    expect(placementFrames()[0].transform).toBe('translate(0px, 0px) scale(0.15)');
  });
});
