/**
 * Map library kept in this browser's localStorage: an index of maps plus one
 * entry per map. Every read and write is guarded, so the editor still works
 * (without persistence) when storage is unavailable.
 */
import type { Doc } from './model';

const INDEX = 'mind-the-dag:index';
const MAP = (id: string) => `mind-the-dag:map:${id}`;
const LEGACY = 'mind-the-dag:doc';
/** Left behind when a draft is moved to the cloud or deleted, so an editor still open in another tab can't save it back. */
const GONE = (id: string) => `mind-the-dag:gone:${id}`;

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
  return [...idx].filter((e) => goneTo(e.id) === undefined).sort((a, b) => b.updated - a.updated);
}

export function loadMap(id: string): Doc | null {
  if (goneTo(id) !== undefined) return null;
  const d = read<Doc>(MAP(id));
  return d && d.version === 1 ? d : null;
}

export function saveMap(id: string, doc: Doc): void {
  if (goneTo(id) !== undefined) throw new Error('This map was moved or deleted in another tab. Download your changes to keep them.');
  if (!write(MAP(id), doc)) throw new Error("Could not save in this browser. Download a map file to keep your changes.");
  const idx = (read<MapEntry[]>(INDEX) ?? []).filter((e) => e.id !== id);
  idx.push({ id, title: doc.title, updated: Date.now() });
  if (!write(INDEX, idx)) throw new Error("Could not update the map list. Download a map file to keep your changes.");
}

export function createMap(doc: Doc): string {
  const id = newId();
  saveMap(id, doc);
  return id;
}

/** Where a draft went: the cloud map's id, null if it was deleted, undefined if it is still here. */
export function goneTo(id: string): string | null | undefined {
  const g = read<{ to: string | null }>(GONE(id));
  return g ? g.to : undefined;
}
/** The storage key that marks `id` as gone (for listening to other tabs). */
export const goneKey = GONE;

/** Remove a draft for good, remembering where it went. */
export function retireMap(id: string, to: string | null): void {
  if (!write(GONE(id), { to, at: Date.now() })) throw new Error('Could not update browser storage.');
  remove(MAP(id));
  write(INDEX, (read<MapEntry[]>(INDEX) ?? []).filter((e) => e.id !== id));
}

/** Retain the document and index; the tombstone hides it from active maps. */
export function deleteMap(id: string): void {
  if (!write(GONE(id), { to: null, at: Date.now() })) throw new Error('Could not move this map to Recently deleted.');
}

export function listDeletedMaps(): MapEntry[] {
  return (read<MapEntry[]>(INDEX) ?? []).filter((e) => goneTo(e.id) === null && !!read<Doc>(MAP(e.id)));
}
export function restoreMap(id: string): void {
  if (!read<Doc>(MAP(id))) throw new Error('This map is no longer available.');
  localStorage.removeItem(GONE(id));
  if (goneTo(id) !== undefined) throw new Error('Could not restore this map.');
}

export function duplicateMap(id: string): string | null {
  const d = loadMap(id);
  if (!d) return null;
  return createMap({ ...structuredClone(d), title: `${d.title} copy` });
}

// ------------------------------------------------------------------ backup
export interface Backup {
  mindTheDagBackup: 1;
  created: string;
  maps: { title: string; updated: number; doc: Doc }[];
}

export function isBackup(x: unknown): x is Backup {
  return !!x && (x as Backup).mindTheDagBackup === 1 && Array.isArray((x as Backup).maps);
}

/** Every draft in one object, newest first. */
export function backupAll(): Backup {
  const maps = listMaps()
    .map((e) => ({ title: e.title, updated: e.updated, doc: loadMap(e.id) }))
    .filter((m): m is { title: string; updated: number; doc: Doc } => !!m.doc);
  return { mindTheDagBackup: 1, created: new Date().toISOString(), maps };
}

/** Add the maps in a backup as new drafts (never overwrites). Returns how many were added. */
export function restoreBackup(b: Backup): number {
  let n = 0;
  for (const m of [...b.maps].reverse()) {
    if (!m.doc || m.doc.version !== 1) continue;
    createMap(m.doc);
    n += 1;
  }
  return n;
}

/** Ask the browser not to evict our storage under pressure (best effort, silent). */
export function requestPersistence(): void {
  try {
    void navigator.storage?.persist?.();
  } catch {
    /* not supported */
  }
}
