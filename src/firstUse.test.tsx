// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Editor from './Editor';
import { emptyDoc, type Doc } from './model';

vi.mock('./motion', async (original) => ({ ...await original<typeof import('./motion')>(), reducedMotion: () => true }));

let host: HTMLDivElement;
let root: Root;
let compact: boolean;
let mediaListeners: Set<() => void>;
let saved: ReturnType<typeof vi.fn<(doc: Doc) => void>>;
const noop = () => undefined;
const canvas = () => host.querySelector<SVGSVGElement>('svg.canvas')!;
const stations = () => [...host.querySelectorAll<SVGGElement>('svg.canvas [data-sel^="station:"]')];
const button = (name: string) => {
  const target = [...host.querySelectorAll('button')].find((el) => (el.getAttribute('aria-label') ?? el.textContent?.trim()) === name);
  if (!target) throw new Error(`Missing button: ${name}`);
  return target;
};
const click = async (name: string) => { await act(async () => button(name).click()); };
const pointer = async (element: Element, type: string, x: number, y: number, pointerType = 'touch', pointerId = 1) => {
  await act(async () => element.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId, pointerType, clientX: x, clientY: y })));
};
const tap = async (element: Element, x: number, y: number) => { await pointer(element, 'pointerdown', x, y); await pointer(element, 'pointerup', x, y); };
async function fill(input: HTMLInputElement | HTMLTextAreaElement, text: string) {
  await act(async () => {
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function mount(doc: Doc = emptyDoc()) {
  await act(async () => root.render(<Editor initial={doc} onSave={saved} onCreate={noop} onHome={noop} place={{ kind: 'local', mapId: 'fixture' }} />));
}
beforeEach(() => {
  compact = true; mediaListeners = new Set(); saved = vi.fn();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    media: query, get matches() { return query.includes('max-width') ? compact : query.includes('reduced-motion'); },
    addEventListener: (_type: string, listener: () => void) => { if (query.includes('max-width')) mediaListeners.add(listener); },
    removeEventListener: (_type: string, listener: () => void) => mediaListeners.delete(listener),
  } as unknown as MediaQueryList));
  Object.defineProperty(SVGElement.prototype, 'getBBox', { configurable: true, value: () => ({ x: 0, y: 0, width: 200, height: 100 }) });
  Object.defineProperty(Element.prototype, 'setPointerCapture', { configurable: true, value: noop });
  Object.defineProperty(Element.prototype, 'hasPointerCapture', { configurable: true, value: () => false });
  const rect = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return this.matches('svg.canvas') ? new DOMRect(0, 200, 390, 600) : rect.call(this);
  });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  Reflect.deleteProperty(SVGElement.prototype, 'getBBox');
  Reflect.deleteProperty(Element.prototype, 'setPointerCapture');
  Reflect.deleteProperty(Element.prototype, 'hasPointerCapture');
});

describe('independent first-map journey', () => {
  it('starts with an explicit action and does not open a keyboard or inspector automatically', async () => {
    await mount();
    expect(host.querySelector('[aria-label="Start drawing"]')).not.toBeNull();
    expect(host.querySelector('[role=dialog]')).toBeNull();
    expect(document.activeElement?.tagName).not.toBe('INPUT');
    expect(host.querySelectorAll('[aria-label="Drawing tools"]')).toHaveLength(1);
    expect(host.textContent).toContain('Saved in this browser');
    await click('Add stations');
    expect(button('Station').getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[role=dialog]')).toBeNull();
    expect(host.querySelector('select[aria-label="New station type"]')).not.toBeNull();
  });

  it('places two touch targets, offers connection, and finishes without using a keyboard', async () => {
    await mount(); await click('Add stations');
    await tap(canvas(), 80, 400); expect(stations()).toHaveLength(1);
    expect(host.textContent).toContain('Add another station');
    await tap(canvas(), 250, 400); expect(stations()).toHaveLength(2);
    await click('Connect stations');
    await tap(stations()[0], 80, 400); await tap(stations()[1], 250, 400);
    expect(host.querySelectorAll('svg.canvas [data-sel^="edge:"]')).toHaveLength(1);
    await click('Done'); expect(button('Select').getAttribute('aria-pressed')).toBe('true');
    expect(host.textContent).toContain('give it a name');
  });

  it('edits a selected station in one property panel and returns to the canvas', async () => {
    await mount(); await click('Add stations'); await tap(canvas(), 80, 400); await click('Done');
    await tap(stations()[0], 80, 400);
    expect(host.querySelector('[role=dialog]')).toBeNull();
    await click('Open properties');
    expect(host.querySelectorAll('[aria-label="Station name"]')).toHaveLength(1);
    await fill(host.querySelector('textarea')!, 'Quality control');
    await click('Back to canvas');
    expect(host.querySelector('[role=dialog]')).toBeNull();
    expect(canvas().textContent).toContain('Quality control');
    await act(async () => window.dispatchEvent(new Event('pagehide')));
    expect(saved.mock.calls.at(-1)?.[0].stations[0].label).toBe('Quality control');
  });

  it('makes an example part of the current map and supports undo back to blank', async () => {
    await mount(); await click('Use an example');
    expect(stations().length).toBeGreaterThan(2);
    expect(host.querySelector('[aria-label="Start drawing"]')).toBeNull();
    await click('Undo'); expect(stations()).toHaveLength(0);
    expect(host.querySelector('[aria-label="Start drawing"]')).not.toBeNull();
  });

  it('keeps selected properties available after a two-press rename gesture', async () => {
    await mount(); await click('Add stations'); await tap(canvas(), 80, 400); await click('Done');
    await pointer(stations()[0], 'pointerdown', 80, 400, 'mouse'); await pointer(stations()[0], 'pointerup', 80, 400, 'mouse');
    await pointer(stations()[0], 'pointerdown', 80, 400, 'mouse'); await pointer(stations()[0], 'pointerup', 80, 400, 'mouse');
    expect(host.querySelector('[role=dialog]')?.getAttribute('aria-label')).toBe('Selection properties');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Station name');
  });
});

describe('compact controls and canvas continuity', () => {
  it('offers Lines and Map properties, with one owner for every visible control', async () => {
    await mount(); await click('Lines and colours');
    expect(host.querySelector('[role=dialog]')?.getAttribute('aria-label')).toBe('Lines and colours');
    expect(host.querySelectorAll('[aria-label="Tools"]')).toHaveLength(0);
    expect(host.querySelectorAll('[aria-label="Add line"]')).toHaveLength(1);
    await click('Back to canvas'); await click('Open properties');
    expect(host.querySelector('[role=dialog]')?.getAttribute('aria-label')).toBe('Map settings');
    expect(host.textContent).toContain('Palette');
  });

  it('closes a line popover before its containing panel on Escape', async () => {
    await mount(); await click('Lines and colours'); await click('Edit Line 1');
    const input = host.querySelector<HTMLInputElement>('.popover input')!;
    input.focus();
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(host.querySelector('.popover')).toBeNull();
    expect(host.querySelector('[role=dialog]')).not.toBeNull();
  });

  it('preserves the drawing when switching from compact panels to desktop rails', async () => {
    await mount(); await click('Add stations'); await tap(canvas(), 80, 400); await click('Done'); await click('Open properties');
    await act(async () => { compact = false; for (const listener of mediaListeners) listener(); });
    expect(host.querySelector('[role=dialog]')).toBeNull();
    expect(host.querySelectorAll('[aria-label="Tools"]')).toHaveLength(1);
    expect(host.querySelector('[aria-label="Drawing tools"]')).toBeNull();
    expect(stations()).toHaveLength(1);
  });

  it('pans with a touch drag on blank canvas without altering the map or undo history', async () => {
    await mount();
    const transform = () => host.querySelector('svg.canvas > g')?.getAttribute('transform');
    const before = transform();
    await pointer(canvas(), 'pointerdown', 80, 400); await pointer(canvas(), 'pointermove', 140, 450); await pointer(canvas(), 'pointerup', 140, 450);
    expect(transform()).not.toBe(before); expect(stations()).toHaveLength(0);
    expect(button('Undo').disabled).toBe(true);
  });

  it('keeps mouse marquee selection separate from touch panning', async () => {
    compact = false; await mount();
    const before = host.querySelector('svg.canvas > g')?.getAttribute('transform');
    await pointer(canvas(), 'pointerdown', 80, 400, 'mouse'); await pointer(canvas(), 'pointermove', 140, 450, 'mouse');
    expect(canvas().classList.contains('marquee')).toBe(true);
    expect(host.querySelector('svg.canvas > g')?.getAttribute('transform')).toBe(before);
    await pointer(canvas(), 'pointerup', 140, 450, 'mouse');
  });
});

describe('honest save feedback', () => {
  it('retains edits and offers retry and download when saving fails', async () => {
    vi.useFakeTimers();
    saved.mockImplementation(() => { throw new Error('Browser storage is full.'); });
    await mount();
    await fill(host.querySelector<HTMLInputElement>('input[aria-label="Map title"]')!, 'Keep this work');
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Browser storage is full');
    expect(host.querySelector('.save-state')?.textContent).toBe('Not saved');
    expect(button('Download map file')).toBeTruthy();
    saved.mockImplementation(noop);
    await click('Retry saving');
    expect(saved.mock.lastCall?.[0].title).toBe('Keep this work');
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelector('.save-state')?.textContent).toBe('Saved in this browser');
    vi.useRealTimers();
  });
});


describe('phone multi-touch navigation', () => {
  const transform = () => canvas().querySelector(':scope > g')!.getAttribute('transform')!;
  const touch = (type: string, id: number, x: number, y: number, target: Element = canvas()) => pointer(target, type, x, y, 'touch', id);

  it('zooms around the finger midpoint and pans without changing the document', async () => {
    await mount(); await click('Use an example');
    const before = transform();
    const count = stations().length;
    await touch('pointerdown', 1, 100, 400);
    await touch('pointerdown', 2, 200, 400);
    await touch('pointermove', 1, 50, 400);
    await touch('pointermove', 2, 250, 400);
    expect(transform()).not.toBe(before);
    const zoom = Number(transform().match(/scale\(([^)]+)/)![1]);
    const initialZoom = Number(before.match(/scale\(([^)]+)/)![1]);
    expect(zoom).toBeCloseTo(initialZoom * 2);
    // One remaining finger cannot pick up an object or resume an old drag.
    await touch('pointerup', 2, 250, 400);
    const stopped = transform();
    await touch('pointermove', 1, 100, 450);
    expect(transform()).toBe(stopped);
    await touch('pointerup', 1, 100, 450);
    expect(stations()).toHaveLength(count);
    await click('Undo');
    expect(stations()).toHaveLength(0); // Navigation introduced no history entry.
  });

  it.each(['Station', 'Connect', 'Section'])('pinches in %s mode without placing, connecting or creating a section', async (tool) => {
    await mount(); await click('Use an example'); await click(tool);
    const count = stations().length;
    const edges = host.querySelectorAll('[data-sel^="edge:"]').length;
    const sections = host.querySelectorAll('[data-sel^="section:"]').length;
    await touch('pointerdown', 1, 80, 400);
    await touch('pointerdown', 2, 200, 400);
    await touch('pointermove', 2, 280, 450);
    await touch('pointerup', 1, 80, 400);
    await touch('pointerup', 2, 280, 450);
    expect(stations()).toHaveLength(count);
    expect(host.querySelectorAll('[data-sel^="edge:"]')).toHaveLength(edges);
    expect(host.querySelectorAll('[data-sel^="section:"]')).toHaveLength(sections);
    await click('Undo'); expect(stations()).toHaveLength(0);
  });

  it('restores an interrupted station drag when a second finger begins navigation', async () => {
    await mount(); await click('Add stations'); await tap(canvas(), 80, 400); await click('Done');
    const station = stations()[0];
    const before = station.querySelector('.station-glyph')!.parentElement!.getAttribute('transform');
    await touch('pointerdown', 1, 80, 400, station);
    await touch('pointermove', 1, 110, 420);
    await touch('pointerdown', 2, 200, 400);
    await touch('pointerup', 2, 200, 400);
    await touch('pointerup', 1, 110, 420);
    expect(stations()[0].querySelector('.station-glyph')!.parentElement!.getAttribute('transform')).toBe(before);
    await click('Undo'); expect(stations()).toHaveLength(0);
  });

  it('acquires a small station near a finger, ignores jitter, and keeps quick taps out of the keyboard', async () => {
    await mount(); await click('Add stations'); await tap(canvas(), 80, 400); await click('Done');
    const position = stations()[0].querySelector('.station-glyph')!.parentElement!.getAttribute('transform');
    await touch('pointerdown', 1, 96, 400);
    await touch('pointermove', 1, 100, 403);
    await touch('pointerup', 1, 100, 403);
    await touch('pointerdown', 1, 96, 400); await touch('pointerup', 1, 96, 400);
    expect(host.querySelector('[role=dialog]')).toBeNull();
    expect(stations()[0].querySelector('.station-glyph')!.parentElement!.getAttribute('transform')).toBe(position);
    await click('Open properties');
    expect(host.querySelector('[aria-label="Station name"]')).not.toBeNull();
    await click('Back to canvas');
    await tap(canvas(), 300, 700);
    await click('Open properties');
    expect(host.querySelector('[aria-label="Station name"]')).toBeNull();
  });

  it('does not commit a cancelled or dragged touch placement and accepts the next tap', async () => {
    await mount(); await click('Add stations');
    await touch('pointerdown', 1, 80, 400);
    await touch('pointermove', 1, 130, 400);
    await touch('pointerup', 1, 130, 400);
    expect(stations()).toHaveLength(0);
    await touch('pointerdown', 1, 80, 400);
    await touch('pointercancel', 1, 80, 400);
    await touch('pointerup', 1, 80, 400);
    expect(stations()).toHaveLength(0);
    await tap(canvas(), 80, 400); expect(stations()).toHaveLength(1);
  });

  it('keeps a pinch locked after normal capture loss and releases cleanly after cancellation', async () => {
    await mount(); await click('Add stations');
    await touch('pointerdown', 1, 80, 400);
    await touch('pointerdown', 2, 200, 400);
    await touch('pointerup', 2, 200, 400);
    await touch('lostpointercapture', 2, 200, 400);
    await touch('pointermove', 1, 90, 410);
    await touch('pointercancel', 1, 90, 410);
    expect(stations()).toHaveLength(0);
    await tap(canvas(), 80, 400); expect(stations()).toHaveLength(1);
  });
});
