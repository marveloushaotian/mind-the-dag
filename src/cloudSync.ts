/**
 * Keeps an open cloud map saved: edits are written to this browser at once and to the
 * server shortly after. If someone else saved a newer version in the meantime, nothing
 * is overwritten; the editor is told so it can offer their version or a copy of yours.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { explain, saveCloudMap, type CloudMap } from './cloud';
import type { Doc } from './model';

export type SyncState = 'saved' | 'saving' | 'offline' | 'conflict' | 'error';

const KEY = (id: string) => `mind-the-dag:cloud-pending:${id}`;
interface Pending { doc: Doc; base: number | string; at?: number }
const memory = new Map<string, Pending>();
function recovered(id: string): { key: string; value: Pending; raw: string } | null {
  try {
    const prefix = KEY(id);
    const entries = Object.keys(localStorage).filter(k => k === prefix || k.startsWith(prefix + ':'))
      .flatMap(key => { try { const raw = localStorage.getItem(key)!; const value = JSON.parse(raw) as Pending; return value?.doc?.version === 1 ? [{ key, raw, value }] : []; } catch { return []; } })
      .sort((a, b) => (b.value.at ?? 0) - (a.value.at ?? 0));
    return entries[0] ?? null;
  } catch { return null; }
}
/** Recover edits even when the remote version advanced; the server resolves the conflict. */
export function pendingEdits(id: string, _base?: string): Doc | null {
  return memory.get(id)?.doc ?? recovered(id)?.value.doc ?? null;
}

// Saves still running after an editor closed; the start page waits for them before listing maps.
const inflight = new Set<Promise<unknown>>();
// A route transition can defer the editor cleanup until after sign-out starts.
const openEditors = new Set<symbol>();
const track = <T,>(p: Promise<T>) => {
  inflight.add(p);
  void p.finally(() => inflight.delete(p));
  return p;
};
/** Waits for closing editors and their final saves (at most a few seconds). */
export async function whenSynced(maxMs = 6000): Promise<void> {
  const until = Date.now() + maxMs;
  await new Promise((r) => setTimeout(r, 0)); // let closing editors queue their last edit
  while ((openEditors.size || inflight.size) && Date.now() < until)
    await Promise.race([...inflight, new Promise((r) => setTimeout(r, 200))]);
}

export function useCloudSync(map: CloudMap) {
  const initial = useRef(memory.get(map.id) ?? recovered(map.id)?.value);
  const recovery = useRef(recovered(map.id));
  const storageKey = useRef(KEY(map.id) + ':' + crypto.randomUUID());
  const [durable, setDurable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const writePending = (_id: string, value: Pending | null) => {
    try {
      if (value) { memory.set(map.id, value); localStorage.setItem(storageKey.current, JSON.stringify({ ...value, at: Date.now() })); }
      else { memory.delete(map.id); localStorage.removeItem(storageKey.current); }
      if (recovery.current && localStorage.getItem(recovery.current.key) === recovery.current.raw) localStorage.removeItem(recovery.current.key);
      recovery.current = null;
      setDurable(true); return true;
    } catch { setDurable(false); return false; }
  };
  const [state, setState] = useState<SyncState>(() => (pendingEdits(map.id, map.updated) ? 'saving' : 'saved'));
  const [theirs, setTheirs] = useState<CloudMap | null>(null);
  const base = useRef(typeof initial.current?.base === 'number' ? initial.current.base : initial.current ? -1 : map.revision);
  const pending = useRef<Doc | null>(pendingEdits(map.id, map.updated));
  const timer = useRef<number | undefined>(undefined);
  const busy = useRef(false);
  const mounted = useRef(true);
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
      base.current = r.revision;
      setError(null);
      if (pending.current === doc) {
        pending.current = null;
        writePending(map.id, null);
        setState('saved');
      } else {
        // more edits arrived while saving
        writePending(map.id, { doc: pending.current!, base: base.current });
        timer.current = window.setTimeout(flush, 400);
      }
    } catch (e) {
      setError(explain(e));
      setState(navigator.onLine === false ? 'offline' : 'error');
      if (mounted.current) timer.current = window.setTimeout(flush, 5000);
    } finally {
      busy.current = false;
    }
  }, [map.id]);

  const queue = useCallback(
    (doc: Doc) => {
      pending.current = doc;
      writePending(map.id, { doc, base: base.current });
      if (blocked.current) return;
      setState('saving');
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, 1200);
    },
    [map.id, flush],
  );

  // Edits left over from an earlier session are sent first.
  useEffect(() => {
    mounted.current = true;
    const editor = Symbol();
    openEditors.add(editor);
    if (pending.current) { writePending(map.id, { doc: pending.current, base: base.current }); timer.current = window.setTimeout(flush, 300); }
    const now = () => void flush();
    window.addEventListener('online', now);
    window.addEventListener('pagehide', now);
    return () => {
      mounted.current = false;
      window.clearTimeout(timer.current);
      openEditors.delete(editor);
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
    base.current = theirs.revision;
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

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (pending.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  return { state, durable, error, theirs, queue, flush, takeTheirs, dropMine };
}
