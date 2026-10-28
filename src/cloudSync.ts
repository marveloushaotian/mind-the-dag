/**
 * Keeps an open cloud map saved: edits are written to this browser at once and to the
 * server shortly after. If someone else saved a newer version in the meantime, nothing
 * is overwritten; the editor is told so it can offer their version or a copy of yours.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { saveCloudMap, type CloudMap } from './cloud';
import type { Doc } from './model';

export type SyncState = 'saved' | 'saving' | 'offline' | 'conflict';

const KEY = (id: string) => `mind-the-dag:cloud-pending:${id}`;
interface Pending {
  doc: Doc;
  base: string;
}

/** Unsynced edits of a cloud map left in this browser (after closing the tab offline, say). */
export function pendingEdits(id: string, base: string): Doc | null {
  try {
    const raw = localStorage.getItem(KEY(id));
    const p = raw ? (JSON.parse(raw) as Pending) : null;
    return p && p.base === base ? p.doc : null;
  } catch {
    return null;
  }
}
const writePending = (id: string, p: Pending | null) => {
  try {
    if (p) localStorage.setItem(KEY(id), JSON.stringify(p));
    else localStorage.removeItem(KEY(id));
  } catch {
    /* storage full or blocked: the server copy is the fallback */
  }
};

// Saves still running after an editor closed; the start page waits for them before listing maps.
const inflight = new Set<Promise<unknown>>();
const track = <T,>(p: Promise<T>) => {
  inflight.add(p);
  void p.finally(() => inflight.delete(p));
  return p;
};
/** Resolves once saves from editors that just closed have finished (at most a few seconds). */
export async function whenSynced(maxMs = 6000): Promise<void> {
  const until = Date.now() + maxMs;
  await new Promise((r) => setTimeout(r, 0)); // let closing editors queue their last edit
  while (inflight.size && Date.now() < until) await Promise.race([...inflight, new Promise((r) => setTimeout(r, 200))]);
}

export function useCloudSync(map: CloudMap) {
  const [state, setState] = useState<SyncState>(() => (pendingEdits(map.id, map.updated) ? 'saving' : 'saved'));
  const [theirs, setTheirs] = useState<CloudMap | null>(null);
  const base = useRef(map.updated);
  const pending = useRef<Doc | null>(pendingEdits(map.id, map.updated));
  const timer = useRef<number | undefined>(undefined);
  const busy = useRef(false);
  const blocked = useRef(false);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (busy.current || blocked.current || !pending.current) return;
    const doc = pending.current;
    busy.current = true;
    try {
      const r = await saveCloudMap(map.id, doc, base.current);
      if (!r.ok) {
        blocked.current = true;
        setTheirs(r.theirs);
        setState('conflict');
        return;
      }
      base.current = r.updated;
      if (pending.current === doc) {
        pending.current = null;
        writePending(map.id, null);
        setState('saved');
      } else {
        // more edits arrived while saving
        writePending(map.id, { doc: pending.current!, base: base.current });
        timer.current = window.setTimeout(flush, 400);
      }
    } catch {
      setState('offline');
      timer.current = window.setTimeout(flush, 5000);
    } finally {
      busy.current = false;
    }
  }, [map.id]);

  const queue = useCallback(
    (doc: Doc) => {
      pending.current = doc;
      writePending(map.id, { doc, base: base.current });
      if (blocked.current) return;
      setState((s) => (s === 'offline' ? s : 'saving'));
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, 1200);
    },
    [map.id, flush],
  );

  // Edits left over from an earlier session are sent first.
  useEffect(() => {
    if (pending.current) timer.current = window.setTimeout(flush, 300);
    const now = () => void flush();
    window.addEventListener('online', now);
    window.addEventListener('pagehide', now);
    return () => {
      window.removeEventListener('online', now);
      window.removeEventListener('pagehide', now);
      // Runs after the editor's own last save (child clean-ups come first or last depending on React's order).
      track(
        new Promise<void>((resolve) =>
          setTimeout(() => {
            void (async () => {
              for (let i = 0; i < 40; i++) {
                if (blocked.current || (!busy.current && !pending.current)) break;
                if (busy.current) {
                  await new Promise((r) => setTimeout(r, 150));
                  continue;
                }
                await flush();
                if (pending.current && !busy.current) break; // failed (offline): kept in this browser for next time
              }
              resolve();
            })();
          }, 0),
        ),
      );
    };
  }, [flush]);

  /** Take their version: your unsaved edits are dropped. Returns their document. */
  const takeTheirs = useCallback((): Doc | null => {
    if (!theirs) return null;
    base.current = theirs.updated;
    pending.current = null;
    writePending(map.id, null);
    blocked.current = false;
    setTheirs(null);
    setState('saved');
    return theirs.doc;
  }, [theirs, map.id]);

  /** After your version was saved elsewhere (as a copy): stop syncing it to this map. */
  const dropMine = useCallback(() => {
    pending.current = null;
    writePending(map.id, null);
  }, [map.id]);

  return { state, theirs, queue, flush, takeTheirs, dropMine };
}
