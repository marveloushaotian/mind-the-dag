/**
 * Map library kept in this browser's localStorage: an index of maps plus one
 * entry per map. Every read and write is guarded, so the editor still works
 * (without persistence) when storage is unavailable.
 */
import type { Doc } from './model';

const INDEX = 'mind-the-dag:index';
const MAP = (id: string) => `mind-the-dag:map:${id}`;
const LEGACY = 'mind-the-dag:doc';

export interface MapEntry {
  id: string;
  title: string;
  updated: number;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function newId(): string {
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Move a map saved by the single-document version into the library. */
function migrate(): void {
  const legacy = read<Doc>(LEGACY);
  if (!legacy || legacy.version !== 1) return;
  const id = newId();
  if (write(MAP(id), legacy)) {
    write(INDEX, [...(read<MapEntry[]>(INDEX) ?? []), { id, title: legacy.title, updated: Date.now() }]);
    remove(LEGACY);
  }
}

export function listMaps(): MapEntry[] {
  migrate();
  const idx = read<MapEntry[]>(INDEX) ?? [];
  return [...idx].sort((a, b) => b.updated - a.updated);
}

export function loadMap(id: string): Doc | null {
  const d = read<Doc>(MAP(id));
  return d && d.version === 1 ? d : null;
}

export function saveMap(id: string, doc: Doc): void {
  write(MAP(id), doc);
  const idx = (read<MapEntry[]>(INDEX) ?? []).filter((e) => e.id !== id);
  idx.push({ id, title: doc.title, updated: Date.now() });
  write(INDEX, idx);
}

export function createMap(doc: Doc): string {
  const id = newId();
  saveMap(id, doc);
  return id;
}

export function deleteMap(id: string): void {
  remove(MAP(id));
  write(
    INDEX,
    (read<MapEntry[]>(INDEX) ?? []).filter((e) => e.id !== id),
  );
}

export function duplicateMap(id: string): string | null {
  const d = loadMap(id);
  if (!d) return null;
  return createMap({ ...structuredClone(d), title: `${d.title} copy` });
}
