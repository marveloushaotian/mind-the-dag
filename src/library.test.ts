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
    saveMap(id, { ...a, title: 'late edit' });
    expect(listMaps()).toHaveLength(0);
    expect(loadMap(id)).toBeNull();
    expect(goneTo(id)).toBe('cloud123');
  });
  it('nor a deleted one', () => {
    const id = createMap(metagenomeExample());
    deleteMap(id);
    saveMap(id, metagenomeExample());
    expect(listMaps()).toHaveLength(0);
    expect(goneTo(id)).toBeNull();
  });
});
