/**
 * Motion: page changes run as view transitions (a short cross-fade, and the map you open
 * grows out of its card); without browser support, or with "reduce motion" switched on,
 * changes are instant.
 */
import { flushSync } from 'react-dom';

type VT = { finished: Promise<void>; ready: Promise<void>; updateCallbackDone: Promise<void> };
type DocVT = Document & { startViewTransition?: (cb: () => void | Promise<void>) => VT };

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Arc flags switch discretely; incompatible turns must fade rather than flip mid-morph. */
export function pathTopology(d: string): string {
  return [...d.matchAll(/([A-Za-z])([^A-Za-z]*)/g)].map(([, command, values]) => {
    if (command.toUpperCase() !== 'A') return command;
    const args = values.trim().split(/[\s,]+/);
    return `${command}${args[3]}${args[4]}`;
  }).join('');
}

/** The shared element name the opened map's thumbnail and the editor canvas both carry. */
export const MORPH = 'map-morph';

/** Id of the map the editor has open, so the start page can shrink the canvas back into its card. */
let openMapId: string | null = null;
export const setOpenMap = (id: string | null) => {
  openMapId = id;
};

function clearMorph() {
  document.querySelectorAll<HTMLElement>('.thumb').forEach((e) => {
    if (e.style.viewTransitionName === MORPH) e.style.viewTransitionName = '';
  });
}

/** Run a state change as a view transition. `update` must change the DOM synchronously. */
export function transition(update: () => void): void {
  const d = document as DocVT;
  if (!d.startViewTransition || reducedMotion() || document.visibilityState !== 'visible') {
    update();
    return;
  }
  try {
    const vt = d.startViewTransition(() => {
      flushSync(update);
      // Back on a list: the card of the map that was open takes over the canvas.
      if (openMapId) {
        const t = document.querySelector<HTMLElement>(`[data-map-id="${CSS.escape(openMapId)}"] .thumb`);
        if (t && !document.querySelector('.canvas')) t.style.viewTransitionName = MORPH;
      }
    });
    // A newer transition skips this one (its update still runs): nothing to report.
    vt.ready.catch(() => undefined);
    vt.updateCallbackDone.catch(() => undefined);
    void vt.finished.finally(clearMorph);
  } catch {
    update();
  }
}

/** Before opening a map from a card: its thumbnail is the element that grows into the editor. */
export function markOpening(card: HTMLElement | null, id: string) {
  clearMorph();
  openMapId = id;
  const t = card?.querySelector<HTMLElement>('.thumb');
  if (t) t.style.viewTransitionName = MORPH;
}
