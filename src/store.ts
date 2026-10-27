import { useCallback, useEffect, useRef, useState } from 'react';
import type { Doc } from './model';

const STORAGE_KEY = 'mind-the-dag:doc';
const LIMIT = 200;

export function loadStored(): Doc | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && d.version === 1 ? (d as Doc) : null;
  } catch {
    return null;
  }
}

function saveStored(doc: Doc) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
  } catch {
    /* storage unavailable: the in-memory document still works */
  }
}

/**
 * Document state with undo/redo. `update(fn)` records a history step;
 * `preview(fn)` changes the document without one (for drags) and the step is
 * recorded by the `checkpoint()` taken when the drag began.
 */
export function useDocument(initial: () => Doc) {
  const [doc, setDoc] = useState<Doc>(initial);
  const past = useRef<Doc[]>([]);
  const future = useRef<Doc[]>([]);
  const [, bump] = useState(0);
  const docRef = useRef(doc);
  docRef.current = doc;

  useEffect(() => {
    const t = setTimeout(() => saveStored(doc), 300);
    return () => clearTimeout(t);
  }, [doc]);

  const push = (d: Doc) => {
    past.current.push(d);
    if (past.current.length > LIMIT) past.current.shift();
    future.current = [];
  };

  const lastKey = useRef<{ key: string; at: number } | null>(null);

  /** `key` coalesces rapid edits of one field (typing) into a single undo step. */
  const update = useCallback((fn: (d: Doc) => void, key?: string) => {
    const next = structuredClone(docRef.current);
    fn(next);
    const now = Date.now();
    const same = key && lastKey.current && lastKey.current.key === key && now - lastKey.current.at < 1500;
    lastKey.current = key ? { key, at: now } : null;
    if (!same) push(docRef.current);
    docRef.current = next;
    setDoc(next);
    bump((n) => n + 1);
  }, []);

  const checkpoint = useCallback(() => {
    push(docRef.current);
    bump((n) => n + 1);
  }, []);

  const preview = useCallback((fn: (d: Doc) => void) => {
    const next = structuredClone(docRef.current);
    fn(next);
    docRef.current = next;
    setDoc(next);
  }, []);

  const replace = useCallback((d: Doc) => {
    push(docRef.current);
    docRef.current = d;
    setDoc(d);
    bump((n) => n + 1);
  }, []);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(docRef.current);
    docRef.current = prev;
    setDoc(prev);
    bump((n) => n + 1);
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(docRef.current);
    docRef.current = next;
    setDoc(next);
    bump((n) => n + 1);
  }, []);

  return {
    doc,
    update,
    preview,
    checkpoint,
    replace,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
