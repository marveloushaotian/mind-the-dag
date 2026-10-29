import { useCallback, useEffect, useRef, useState } from 'react';
import { preserveSurvivingPorts, type Doc } from './model';

const LIMIT = 200;

/**
 * Document state with undo/redo. `update(fn)` records a history step;
 * `preview(fn)` changes the document without one (for drags) and the step is
 * recorded by the `checkpoint()` taken when the drag began.
 */
export function useDocument(initial: () => Doc, onSave?: (d: Doc) => void) {
  const [doc, setDoc] = useState<Doc>(initial);
  const past = useRef<Doc[]>([]);
  const future = useRef<Doc[]>([]);
  const [, bump] = useState(0);
  const docRef = useRef(doc);
  docRef.current = doc;

  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  useEffect(() => {
    const t = setTimeout(() => saveRef.current?.(doc), 300);
    return () => clearTimeout(t);
  }, [doc]);
  // Flush the latest state when the editor closes or the page goes away.
  useEffect(() => {
    const flush = () => saveRef.current?.(docRef.current);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

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
    preserveSurvivingPorts(docRef.current, next);
    const now = Date.now();
    const same = key && lastKey.current && lastKey.current.key === key && now - lastKey.current.at < 1500;
    lastKey.current = key ? { key, at: now } : null;
    if (!same) push(docRef.current);
    docRef.current = next;
    setDoc(next);
    bump((n) => n + 1);
  }, []);

  const checkpoint = useCallback(() => {
    const before = { doc: docRef.current, past: [...past.current], future: [...future.current], lastKey: lastKey.current };
    push(docRef.current);
    bump((n) => n + 1);
    // Cancelling a gesture restores its history too, including an existing redo chain.
    return () => {
      docRef.current = before.doc;
      past.current = before.past;
      future.current = before.future;
      lastKey.current = before.lastKey;
      setDoc(before.doc);
      bump((n) => n + 1);
    };
  }, []);

  const preview = useCallback((fn: (d: Doc) => void) => {
    const next = structuredClone(docRef.current);
    fn(next);
    preserveSurvivingPorts(docRef.current, next);
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
