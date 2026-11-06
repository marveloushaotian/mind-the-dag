import { beforeEach, describe, expect, it } from 'vitest';
import { metagenomeExample } from './examples';
import { backupAll, createMap, deleteMap, goneTo, isBackup, listMaps, loadMap, restoreBackup, retireMap, saveMap } from './library';

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

describe('draft backup', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
  });
  it('round-trips every draft through one backup file', () => {
    const a = metagenomeExample();
    createMap(a);
    createMap({ ...a, title: 'second' });
    const b = JSON.parse(JSON.stringify(backupAll()));
    expect(isBackup(b)).toBe(true);
    expect(b.maps).toHaveLength(2);
    (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
    expect(restoreBackup(b)).toBe(2);
    expect(listMaps().map((m) => m.title).sort()).toEqual(['mag-lite', 'second']);
  });
});

describe('drafts that left this browser', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
  });
  it('an editor still open in another tab cannot save a moved draft back', () => {
    const a = metagenomeExample();
    const id = createMap(a);
    retireMap(id, 'cloud123');
    expect(() => saveMap(id, { ...a, title: 'late edit' })).toThrow('moved or deleted');
    expect(listMaps()).toHaveLength(0);
    expect(loadMap(id)).toBeNull();
    expect(goneTo(id)).toBe('cloud123');
  });
  it('nor a deleted one', () => {
    const id = createMap(metagenomeExample());
    deleteMap(id);
    expect(() => saveMap(id, metagenomeExample())).toThrow('moved or deleted');
    expect(listMaps()).toHaveLength(0);
    expect(goneTo(id)).toBeNull();
  });
});

describe('save failures and recently deleted', () => {
  beforeEach(() => { (globalThis as { localStorage?: unknown }).localStorage = new MemStorage(); });
  it('reports failed writes instead of pretending the map was saved', () => {
    const doc = metagenomeExample();
    const id = createMap(doc);
    localStorage.setItem = () => { throw new Error('Quota exceeded'); };
    expect(() => saveMap(id, { ...doc, title: 'Unsaved title' })).toThrow('Could not save');
    expect(loadMap(id)?.title).toBe(doc.title);
  });
  it('reports an index failure even when the document write succeeded', () => {
    const original = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (key, value) => { if (key.endsWith(':index')) throw new Error('Full'); original(key, value); };
    expect(() => createMap(metagenomeExample())).toThrow('map list');
  });
  it('restores the same map and contents without creating a duplicate', async () => {
    const { listDeletedMaps, restoreMap } = await import('./library');
    const doc = metagenomeExample(); const id = createMap(doc);
    deleteMap(id);
    expect(listMaps()).toHaveLength(0);
    expect(loadMap(id)).toBeNull();
    expect(listDeletedMaps().map(m => m.id)).toEqual([id]);
    expect(() => saveMap(id, { ...doc, title: 'Stale tab' })).toThrow('moved or deleted');
    restoreMap(id);
    expect(listMaps().map(m => m.id)).toEqual([id]);
    expect(loadMap(id)).toEqual(doc);
    expect(listDeletedMaps()).toHaveLength(0);
  });
  it('does not delete a map when storage is unavailable', async () => {
    const id = createMap(metagenomeExample());
    localStorage.setItem = () => { throw new Error('Blocked'); };
    expect(() => deleteMap(id)).toThrow('Recently deleted');
    expect(listMaps()).toHaveLength(1);
  });
});
