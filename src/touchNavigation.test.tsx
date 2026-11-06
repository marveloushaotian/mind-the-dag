// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Viewer from './Viewer';
import { emptyDoc } from './model';

let host: HTMLDivElement;
let root: Root;
const canvas = () => host.querySelector<SVGSVGElement>('svg.canvas')!;
const camera = () => {
  const values = canvas().querySelector('g')!.getAttribute('transform')!.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g)!.map(Number);
  return { k: values[0], x: -values[1], y: -values[2] };
};
const touch = async (type: string, id: number, x: number, y: number) => {
  await act(async () => canvas().dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'touch', pointerId: id, clientX: x, clientY: y })));
};
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.defineProperty(Element.prototype, 'setPointerCapture', { configurable: true, value: () => {} });
  Object.defineProperty(SVGElement.prototype, 'getBBox', { configurable: true, value: () => ({ x: 0, y: 0, width: 200, height: 100 }) });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 100, 390, 600));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  const doc = emptyDoc();
  await act(async () => root.render(<Viewer load={() => Promise.resolve(doc)} onHome={() => {}} onCopy={() => {}} />));
  await act(async () => new Promise(resolve => setTimeout(resolve, 40)));
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  Reflect.deleteProperty(Element.prototype, 'setPointerCapture'); Reflect.deleteProperty(SVGElement.prototype, 'getBBox');
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('shared-map touch navigation', () => {
  it('keeps the map point under the midpoint while zooming and translating both fingers', async () => {
    const before = camera();
    const anchor = { x: before.x + (170 - 20) / before.k, y: before.y + (300 - 100) / before.k };
    await touch('pointerdown', 1, 120, 300); await touch('pointerdown', 2, 220, 300);
    await touch('pointermove', 1, 100, 330); await touch('pointermove', 2, 300, 330);
    const after = camera();
    expect(after.k).toBeCloseTo(before.k * 2);
    expect(after.x + (200 - 20) / after.k).toBeCloseTo(anchor.x);
    expect(after.y + (330 - 100) / after.k).toBeCloseTo(anchor.y);
    await touch('pointerup', 2, 300, 330);
    await touch('lostpointercapture', 2, 300, 330);
    await touch('pointermove', 1, 110, 350);
    expect(camera()).toEqual(after);
    await touch('pointerup', 1, 110, 350);
  });

  it('clamps zoom, survives finger replacement, and permits a fresh pan after cancellation', async () => {
    await touch('pointerdown', 1, 100, 300); await touch('pointerdown', 2, 110, 300);
    await touch('pointermove', 2, 380, 300); expect(camera().k).toBe(4);
    await touch('pointerdown', 3, 250, 400);
    await touch('pointerup', 1, 100, 300);
    await touch('pointermove', 3, 380, 300); expect(camera().k).toBe(0.1);
    await touch('pointercancel', 2, 380, 300); await touch('pointercancel', 3, 380, 300);
    const before = camera();
    await touch('pointerdown', 4, 100, 300); await touch('pointermove', 4, 120, 320); await touch('pointerup', 4, 120, 320);
    expect(camera().x).toBeCloseTo(before.x - 20 / before.k);
    expect(camera().y).toBeCloseTo(before.y - 20 / before.k);
  });

  it('does not also apply Safari gesture zoom while touch pointers own the gesture', async () => {
    await touch('pointerdown', 1, 100, 300); await touch('pointerdown', 2, 200, 300);
    const before = camera();
    await act(async () => {
      for (const type of ['gesturestart', 'gesturechange']) {
        const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), { clientX: 150, clientY: 300, scale: 2 });
        canvas().dispatchEvent(event);
      }
    });
    expect(camera()).toEqual(before);
  });

  it('retains desktop wheel panning and resets an interrupted touch when the window loses focus', async () => {
    const before = camera();
    await act(async () => canvas().dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 30 })));
    expect(camera().y).toBeCloseTo(before.y + 30 / before.k);
    await touch('pointerdown', 1, 100, 300); await touch('pointerdown', 2, 200, 300);
    await act(async () => window.dispatchEvent(new Event('blur')));
    const reset = camera();
    await touch('pointerdown', 3, 100, 300); await touch('pointermove', 3, 130, 300); await touch('pointerup', 3, 130, 300);
    expect(camera().x).toBeCloseTo(reset.x - 30 / reset.k);
  });
});
