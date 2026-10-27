import { beforeEach, describe, expect, it } from 'vitest';
import { metagenomeExample } from './examples';
import { backupAll, createMap, isBackup, listMaps, restoreBackup } from './library';

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
